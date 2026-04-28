#!/usr/bin/env node
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

process.env.MSYS_NO_PATHCONV = '1';
process.env.MSYS2_ARG_CONV_EXCL = '*';

const DEFAULT_PASSWORD = 'sats402-regtest-demo-password';
const MAX_WAIT_MS = Number(process.env.SATS402_LND_INIT_TIMEOUT_MS || 180_000);
const roles = [
  { role: 'agent', port: 8181, container: 'sats402-lnd-agent-regtest' },
  { role: 'gateway', port: 8182, container: 'sats402-lnd-gateway-regtest' },
  { role: 'merchant', port: 8183, container: 'sats402-lnd-merchant-regtest' }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function secretsDir(role) {
  return path.join(process.cwd(), 'secrets-regtest', role);
}

function secretPath(role, name) {
  return path.join(secretsDir(role), name);
}

function readTrimmed(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

function ensureRoleSecretDir(role) {
  fs.mkdirSync(secretsDir(role), { recursive: true });
}

function loadPassword(role) {
  const envPassword = process.env.SATS402_REGTEST_LND_WALLET_PASSWORD || process.env.SATS402_LND_WALLET_PASSWORD;
  const passwordPath = secretPath(role, 'wallet-password.txt');
  const password = envPassword || readTrimmed(passwordPath) || DEFAULT_PASSWORD;
  fs.writeFileSync(passwordPath, `${password}\n`, { mode: 0o600 });
  return password;
}

function loadSeed(role) {
  const seed = readTrimmed(secretPath(role, 'seed.txt'));
  return seed ? seed.split(/\s+/).filter(Boolean) : null;
}

function saveSeed(role, mnemonic) {
  fs.writeFileSync(secretPath(role, 'seed.txt'), `${mnemonic.join(' ')}\n`, { mode: 0o600 });
}

function normalizeResponse(json) {
  return json?.result && typeof json.result === 'object' ? json.result : json;
}

function request(port, method, pathname, body = null) {
  const payload = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      rejectUnauthorized: false,
      timeout: 5000,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      } : undefined
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(normalizeResponse(json));
          return;
        }
        const err = new Error(`HTTP_${res.statusCode}:${text}`);
        err.statusCode = res.statusCode;
        err.body = text;
        reject(err);
      });
    });
    req.on('timeout', () => req.destroy(new Error('REQUEST_TIMEOUT')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function errorText(err) {
  return String(err?.stderr || err?.body || err?.message || err).replace(/\s+/g, ' ').slice(0, 500);
}

function isAlreadyUnlocked(err) {
  return /already unlocked|wallet already unlocked|unlocker service.*not.*active|unknown service lnrpc\.WalletUnlocker/i.test(errorText(err));
}

function isWalletMissing(err) {
  return /wallet not found|wallet does not exist|not found|create a wallet|unable to open wallet|wallet not created/i.test(errorText(err));
}

function isWalletExists(err) {
  return /wallet already exists|wallet exists|already.*initialized/i.test(errorText(err));
}

function isBadPassword(err) {
  return /invalid pass|wrong password|unable to decrypt|invalid password|password/i.test(errorText(err)) && !isWalletMissing(err);
}

function isLocked(err) {
  return /wallet is encrypted|wallet locked|unlock it|please unlock/i.test(errorText(err));
}

function lncliGetInfo(roleConfig) {
  const stdout = execFileSync('docker', [
    'exec',
    roleConfig.container,
    'lncli',
    '--network=regtest',
    'getinfo'
  ], {
    encoding: 'utf8',
    timeout: 10_000,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return JSON.parse(stdout);
}

async function waitForUnlocker(roleConfig) {
  const started = Date.now();
  const probePassword = Buffer.from('sats402-probe-password', 'utf8').toString('base64');
  let delay = 1000;
  let lastError = null;

  while (Date.now() - started < MAX_WAIT_MS) {
    try {
      await request(roleConfig.port, 'POST', '/v1/unlockwallet', { wallet_password: probePassword });
      return;
    } catch (err) {
      if (err.statusCode) return;
      lastError = err;
    }
    await sleep(delay);
    delay = Math.min(delay + 500, 5000);
  }

  throw new Error(`LND REST wallet unlocker not reachable for ${roleConfig.role}: ${errorText(lastError)}`);
}

async function waitForLncliActive(roleConfig, password = null) {
  const started = Date.now();
  let delay = 1000;
  let lastError = null;

  while (Date.now() - started < MAX_WAIT_MS) {
    try {
      const info = lncliGetInfo(roleConfig);
      return info;
    } catch (err) {
      lastError = err;
      if (password && isLocked(err)) {
        try {
          await waitForUnlocker(roleConfig);
          await unlockWallet(roleConfig, password);
        } catch (unlockErr) {
          if (isBadPassword(unlockErr)) throw unlockErr;
          lastError = unlockErr;
        }
      }
    }
    await sleep(delay);
    delay = Math.min(delay + 500, 5000);
  }

  throw new Error(`LND wallet did not become active for ${roleConfig.role}: ${errorText(lastError)}`);
}

async function generateSeed(roleConfig) {
  const seed = await request(roleConfig.port, 'GET', '/v1/genseed');
  const mnemonic = seed.cipher_seed_mnemonic || seed.cipherSeedMnemonic;
  if (!Array.isArray(mnemonic) || mnemonic.length === 0) {
    throw new Error('genseed returned no mnemonic');
  }
  return mnemonic;
}

async function initWallet(roleConfig, password) {
  let mnemonic = loadSeed(roleConfig.role);
  if (!mnemonic) {
    mnemonic = await generateSeed(roleConfig);
    saveSeed(roleConfig.role, mnemonic);
  }

  await request(roleConfig.port, 'POST', '/v1/initwallet', {
    wallet_password: Buffer.from(password, 'utf8').toString('base64'),
    cipher_seed_mnemonic: mnemonic
  });
}

async function unlockWallet(roleConfig, password) {
  await request(roleConfig.port, 'POST', '/v1/unlockwallet', {
    wallet_password: Buffer.from(password, 'utf8').toString('base64')
  });
}

async function initRole(roleConfig) {
  const { role } = roleConfig;
  ensureRoleSecretDir(role);
  const password = loadPassword(role);

  try {
    const info = lncliGetInfo(roleConfig);
    return { role, ok: true, status: 'already_unlocked', alias: info.alias };
  } catch {
    // Continue through WalletUnlocker.
  }

  await waitForUnlocker(roleConfig);

  try {
    await unlockWallet(roleConfig, password);
    const info = await waitForLncliActive(roleConfig, password);
    return { role, ok: true, status: 'unlocked', alias: info.alias };
  } catch (err) {
    if (isAlreadyUnlocked(err)) {
      const info = await waitForLncliActive(roleConfig, password);
      return { role, ok: true, status: 'already_unlocked', alias: info.alias };
    }
    if (isBadPassword(err)) throw err;
    if (!isWalletMissing(err)) {
      try {
        await initWallet(roleConfig, password);
        const info = await waitForLncliActive(roleConfig, password);
        return { role, ok: true, status: 'initialized', alias: info.alias };
      } catch (initErr) {
        if (!isWalletExists(initErr)) throw initErr;
      }
    }
  }

  try {
    await initWallet(roleConfig, password);
  } catch (err) {
    if (!isWalletExists(err)) throw err;
    await unlockWallet(roleConfig, password);
  }

  const info = await waitForLncliActive(roleConfig, password);
  return { role, ok: true, status: 'initialized_or_unlocked', alias: info.alias };
}

const results = [];
for (const roleConfig of roles) {
  const { role } = roleConfig;
  process.stdout.write(`[${role}] initializing/unlocking regtest wallet... `);
  try {
    const result = await initRole(roleConfig);
    results.push(result);
    console.log(`OK (${result.status})`);
  } catch (err) {
    const result = { role, ok: false, status: 'failed', error: errorText(err) };
    results.push(result);
    console.log('FAIL');
    console.error(`[${role}] ${result.error}`);
  }
}

console.log('\n[SATS-402] Regtest LND wallet init summary');
for (const result of results) {
  console.log(`- ${result.role}: ${result.ok ? `OK (${result.status})` : `FAIL (${result.error})`}`);
}

if (results.some((result) => !result.ok)) {
  console.error('\nNext: npm run regtest:status, then rerun npm run regtest:bootstrap.');
  process.exit(1);
}
