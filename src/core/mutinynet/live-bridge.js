import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../../config.js';
import {
  computeSharedSecret,
  decryptJson,
  deriveResponseKey,
  encryptJson,
  generateEcdhKeypair,
  randomBytesB64url,
  randomId,
  sha256B64url,
  stableStringify,
  verifyPaymentHash
} from '../crypto.js';
import { createRequestEnvelope, requestHash } from '../envelope.js';
import { preflightBridge } from '../cltv.js';
import { issueReceipt } from '../receipt.js';
import { validateDemoPayload } from '../validator.js';
import { conversions, LndRestClient } from './lnd-rest-client.js';

const ROLES = ['agent', 'gateway', 'merchant'];

const NETWORKS = {
  MUTINYNET: {
    slug: 'mutinynet',
    label: 'Mutinynet',
    configKey: 'mutinynet',
    envFile: '.env.mutinynet',
    scenario: 'mutinynet_live_atomic_bridge',
    paymentType: 'SATS402_PAYMENT_REQUIRED_MUTINYNET_LIVE',
    deliveryMode: 'atomic_bridge_mutinynet_live',
    channelNextStep: 'Run npm run nodes:addresses, fund Agent/Gateway with the Mutinynet faucet at https://faucet.mutinynet.com/, then run npm run nodes:connect.',
    bootstrapStep: 'Run npm run nodes:bootstrap or npm run nodes:export.',
    initStep: 'Run npm run nodes:init to initialize or unlock local LND wallets.',
    statusStep: 'Run npm run nodes:status and confirm all three wallets are unlocked.',
    unsyncedStep: 'Wait for Mutinynet chain sync, then run npm run nodes:status.',
    warning: 'Mutinynet live mode needs local .env.mutinynet credentials and exported LND secret files.'
  },
  REGTEST: {
    slug: 'regtest',
    label: 'local regtest',
    configKey: 'regtest',
    envFile: '.env.regtest',
    scenario: 'regtest_live_atomic_bridge',
    paymentType: 'SATS402_PAYMENT_REQUIRED_REGTEST_LIVE',
    deliveryMode: 'atomic_bridge_regtest_live',
    channelNextStep: 'Run npm run regtest:bootstrap to mine funds and open Agent->Gateway and Gateway->Merchant channels.',
    bootstrapStep: 'Run npm run regtest:bootstrap.',
    initStep: 'Run npm run regtest:bootstrap to initialize or unlock local regtest LND wallets.',
    statusStep: 'Run npm run regtest:status and confirm all three wallets are unlocked.',
    unsyncedStep: 'Run npm run regtest:bootstrap to mine regtest blocks and resync LND.',
    warning: 'Regtest live mode needs .env.regtest and exported local LND secret files from npm run regtest:bootstrap.'
  }
};

function normalizePrefix(prefix = 'MUTINYNET') {
  const normalized = String(prefix || 'MUTINYNET').trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (!NETWORKS[normalized]) throw new Error(`UNKNOWN_LIVE_NETWORK_PREFIX:${prefix}`);
  return normalized;
}

function networkMeta(prefix = 'MUTINYNET') {
  const normalized = normalizePrefix(prefix);
  const meta = NETWORKS[normalized];
  return { ...meta, prefix: normalized, settings: CONFIG[meta.configKey] };
}

function roleEnv(role, key, prefix = 'MUTINYNET') {
  return process.env[`${normalizePrefix(prefix)}_${role.toUpperCase()}_${key}`];
}

function roleVar(role, key, prefix = 'MUTINYNET') {
  return `${normalizePrefix(prefix)}_${role.toUpperCase()}_${key}`;
}

function fileExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath));
  } catch {
    return false;
  }
}

function loadSimpleEnvFile(envFile) {
  if (!envFile) return { loaded: false };
  const filePath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(filePath)) return { loaded: false, path: filePath };
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trimStart() : line;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = normalized.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  return { loaded: true, path: filePath };
}

export function inspectLiveEnv({ prefix = 'MUTINYNET' } = {}) {
  const meta = networkMeta(prefix);
  const roles = {};
  const missingVars = [];
  const missingFiles = [];

  for (const role of ROLES) {
    const restVar = roleVar(role, 'LND_REST', meta.prefix);
    const macaroonPathVar = roleVar(role, 'MACAROON_PATH', meta.prefix);
    const macaroonHexVar = roleVar(role, 'MACAROON_HEX', meta.prefix);
    const tlsPathVar = roleVar(role, 'TLS_CERT_PATH', meta.prefix);
    const restUrl = process.env[restVar];
    const macaroonPath = process.env[macaroonPathVar];
    const macaroonHex = process.env[macaroonHexVar];
    const tlsCertPath = process.env[tlsPathVar];
    const roleMissingVars = [];
    const roleMissingFiles = [];

    if (!restUrl) roleMissingVars.push(restVar);
    if (!macaroonPath && !macaroonHex) roleMissingVars.push(macaroonPathVar);
    if (!tlsCertPath) roleMissingVars.push(tlsPathVar);
    if (macaroonPath && !fileExists(macaroonPath)) roleMissingFiles.push(macaroonPath);
    if (tlsCertPath && !fileExists(tlsCertPath)) roleMissingFiles.push(tlsCertPath);

    missingVars.push(...roleMissingVars);
    missingFiles.push(...roleMissingFiles);
    roles[role] = {
      rest_url: restUrl || null,
      macaroon: macaroonHex ? 'env_hex' : (macaroonPath || null),
      tls_cert: tlsCertPath || null,
      ok: roleMissingVars.length === 0 && roleMissingFiles.length === 0,
      missing_vars: roleMissingVars,
      missing_files: roleMissingFiles
    };
  }

  return {
    ok: missingVars.length === 0 && missingFiles.length === 0,
    roles,
    missing_vars: missingVars,
    missing_files: missingFiles,
    next_steps: missingVars.length || missingFiles.length ? [meta.bootstrapStep] : []
  };
}

export function inspectMutinynetEnv() {
  return inspectLiveEnv({ prefix: 'MUTINYNET' });
}

export function inspectRegtestEnv() {
  return inspectLiveEnv({ prefix: 'REGTEST' });
}

export function buildLndClientsFromEnv({ prefix = 'MUTINYNET', rejectUnauthorized = null } = {}) {
  const meta = networkMeta(prefix);
  const tlsRejectUnauthorized = rejectUnauthorized ?? meta.settings.tlsRejectUnauthorized;
  return {
    agent: new LndRestClient({
      name: 'agent',
      restUrl: roleEnv('agent', 'LND_REST', meta.prefix),
      macaroonPath: roleEnv('agent', 'MACAROON_PATH', meta.prefix),
      macaroonHex: roleEnv('agent', 'MACAROON_HEX', meta.prefix),
      tlsCertPath: roleEnv('agent', 'TLS_CERT_PATH', meta.prefix),
      rejectUnauthorized: tlsRejectUnauthorized
    }),
    gateway: new LndRestClient({
      name: 'gateway',
      restUrl: roleEnv('gateway', 'LND_REST', meta.prefix),
      macaroonPath: roleEnv('gateway', 'MACAROON_PATH', meta.prefix),
      macaroonHex: roleEnv('gateway', 'MACAROON_HEX', meta.prefix),
      tlsCertPath: roleEnv('gateway', 'TLS_CERT_PATH', meta.prefix),
      rejectUnauthorized: tlsRejectUnauthorized
    }),
    merchant: new LndRestClient({
      name: 'merchant',
      restUrl: roleEnv('merchant', 'LND_REST', meta.prefix),
      macaroonPath: roleEnv('merchant', 'MACAROON_PATH', meta.prefix),
      macaroonHex: roleEnv('merchant', 'MACAROON_HEX', meta.prefix),
      tlsCertPath: roleEnv('merchant', 'TLS_CERT_PATH', meta.prefix),
      rejectUnauthorized: tlsRejectUnauthorized
    })
  };
}

export function buildMutinynetClientsFromEnv(options = {}) {
  return buildLndClientsFromEnv({ ...options, prefix: 'MUTINYNET' });
}

export function buildRegtestClientsFromEnv(options = {}) {
  return buildLndClientsFromEnv({ ...options, prefix: 'REGTEST' });
}

function summarizeChannels(channelsResult) {
  const channels = Array.isArray(channelsResult?.channels) ? channelsResult.channels : [];
  return channels.map((channel) => ({
    active: Boolean(channel.active),
    remote_pubkey: channel.remote_pubkey,
    channel_point: channel.channel_point,
    capacity: Number(channel.capacity || 0),
    local_balance: Number(channel.local_balance || 0),
    remote_balance: Number(channel.remote_balance || 0)
  }));
}

function hasActiveChannelTo(channels, remotePubkey) {
  return channels.some((channel) => channel.remote_pubkey === remotePubkey && channel.active);
}

function maybeSat(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function summarizeBalances(results) {
  const balances = {};
  for (const role of ROLES) {
    const wallet = results[role]?.wallet_balance || {};
    const channel = results[role]?.channel_balance || {};
    balances[role] = {
      wallet_confirmed_sats: maybeSat(wallet.confirmed_balance ?? wallet.total_balance),
      wallet_total_sats: maybeSat(wallet.total_balance ?? wallet.confirmed_balance),
      channel_local_sats: maybeSat(channel.local_balance?.sat ?? channel.local_balance),
      channel_remote_sats: maybeSat(channel.remote_balance?.sat ?? channel.remote_balance)
    };
  }
  return balances;
}

function buildDoctorNextSteps({ prefix, results, topology, allReachable }) {
  const meta = networkMeta(prefix);
  const steps = [];
  if (!allReachable) steps.push(meta.bootstrapStep);

  const locked = ROLES.filter((role) => /locked|unlock/i.test(results[role]?.error || ''));
  if (locked.length) steps.push(meta.initStep);

  const unsynced = ROLES.filter((role) => results[role]?.ok && !results[role]?.synced_to_chain);
  if (unsynced.length) steps.push(meta.unsyncedStep);

  const agentBalance = maybeSat(results.agent?.wallet_balance?.confirmed_balance ?? results.agent?.wallet_balance?.total_balance);
  const gatewayBalance = maybeSat(results.gateway?.wallet_balance?.confirmed_balance ?? results.gateway?.wallet_balance?.total_balance);
  if (allReachable && (agentBalance === 0 || gatewayBalance === 0) && meta.prefix === 'MUTINYNET') {
    steps.push('Run npm run nodes:addresses and fund Agent/Gateway from https://faucet.mutinynet.com/.');
  }

  if (allReachable && topology && !topology.live_ready) steps.push(meta.channelNextStep);
  return [...new Set(steps)];
}

function setupError(message, code, nextSteps) {
  const err = new Error(message);
  err.code = code;
  err.next_steps = nextSteps;
  return err;
}

function conciseError(err) {
  return String(err?.message || err).replace(/\s+/g, ' ').slice(0, 500);
}

export async function doctor({ prefix = 'MUTINYNET', envFile = null, networkLabel = null, clients = null } = {}) {
  const meta = networkMeta(prefix);
  if (envFile) loadSimpleEnvFile(envFile);
  const env = clients ? { ok: true, roles: {}, missing_vars: [], missing_files: [], next_steps: [] } : inspectLiveEnv({ prefix: meta.prefix });
  const network = networkLabel || meta.settings.network;
  if (!env.ok) {
    return {
      ok: false,
      live_ready: false,
      network,
      env,
      results: {},
      balances: {},
      channels: {},
      topology: null,
      warnings: [meta.warning],
      next_steps: env.next_steps
    };
  }

  let lnd;
  try {
    lnd = clients || buildLndClientsFromEnv({ prefix: meta.prefix });
  } catch (err) {
    return {
      ok: false,
      live_ready: false,
      network,
      env,
      results: {},
      balances: {},
      channels: {},
      topology: null,
      warnings: [`Could not build LND REST clients from ${meta.envFile}.`],
      next_steps: [meta.bootstrapStep],
      error: conciseError(err)
    };
  }

  const results = {};
  for (const role of ROLES) {
    try {
      const [info, wallet, channelBalance, channels] = await Promise.all([
        lnd[role].getInfo(),
        lnd[role].walletBalance().catch((err) => ({ error: err.message })),
        lnd[role].channelBalance().catch((err) => ({ error: err.message })),
        lnd[role].listChannels().catch((err) => ({ error: err.message }))
      ]);
      results[role] = {
        ok: true,
        reachable: true,
        alias: info.alias,
        identity_pubkey: info.identity_pubkey,
        block_height: Number(info.block_height),
        synced_to_chain: Boolean(info.synced_to_chain),
        synced_to_graph: Boolean(info.synced_to_graph),
        wallet_synced: info.wallet_synced === undefined ? Boolean(info.synced_to_chain) : Boolean(info.wallet_synced),
        chains: info.chains,
        wallet_balance: wallet,
        channel_balance: channelBalance,
        open_channels: Array.isArray(channels.channels) ? channels.channels.length : null,
        channels: summarizeChannels(channels)
      };
    } catch (err) {
      results[role] = { ok: false, reachable: false, error: conciseError(err) };
    }
  }

  const allReachable = ROLES.every((role) => results[role].ok);
  const topology = allReachable ? {
    agent_gateway_active: hasActiveChannelTo(results.agent.channels, results.gateway.identity_pubkey),
    gateway_merchant_active: hasActiveChannelTo(results.gateway.channels, results.merchant.identity_pubkey),
    pending_or_missing_hint: meta.channelNextStep
  } : null;
  if (topology) topology.live_ready = topology.agent_gateway_active && topology.gateway_merchant_active;

  const channels = topology ? {
    agent_gateway: {
      from: 'agent',
      to: 'gateway',
      active: topology.agent_gateway_active,
      from_pubkey: results.agent.identity_pubkey,
      to_pubkey: results.gateway.identity_pubkey
    },
    gateway_merchant: {
      from: 'gateway',
      to: 'merchant',
      active: topology.gateway_merchant_active,
      from_pubkey: results.gateway.identity_pubkey,
      to_pubkey: results.merchant.identity_pubkey
    }
  } : {};

  const synced = allReachable && ROLES.every((role) => results[role].synced_to_chain);
  const liveReady = Boolean(allReachable && synced && topology?.live_ready);
  const doctorOk = meta.prefix === 'REGTEST' ? liveReady : allReachable;
  const nextSteps = buildDoctorNextSteps({ prefix: meta.prefix, results, topology, allReachable });
  const warnings = [];
  if (!allReachable) warnings.push(`${meta.label} live mode needs three reachable LND REST endpoints with admin macaroons.`);
  if (allReachable && !synced) warnings.push(`At least one ${meta.label} LND node is not synced to chain yet.`);
  if (allReachable && !topology?.live_ready) warnings.push('Live demo needs active Agent->Gateway and Gateway->Merchant channels.');

  const response = {
    ok: doctorOk,
    live_ready: liveReady,
    network,
    env,
    results,
    balances: summarizeBalances(results),
    channels,
    topology,
    warnings,
    next_steps: nextSteps
  };

  if (meta.prefix === 'MUTINYNET') {
    response.expected = {
      block_target_seconds: CONFIG.mutinynet.blockTargetSeconds,
      signet_challenge: CONFIG.mutinynet.signetChallenge,
      seed_node: CONFIG.mutinynet.seedNode,
      faucet_lightning_node: CONFIG.mutinynet.faucetLightningNode
    };
  }

  return response;
}

export function mutinynetDoctor(options = {}) {
  return doctor({ ...options, prefix: 'MUTINYNET' });
}

export function regtestDoctor(options = {}) {
  return doctor({ ...options, prefix: 'REGTEST' });
}

function demoPayload({ networkLabel }) {
  return {
    symbol: 'BTC',
    signal: `${networkLabel}-backed-agentic-commerce-settlement-layer`,
    confidence: 0.97,
    generated_at: new Date().toISOString(),
    thesis: 'SATS-402 turns a real Lightning preimage into the local decryption key for a paid API response.',
    investor_takeaway: `This path uses real LND invoices, a real incoming hold invoice, a real outgoing payment, and real preimage settlement on ${networkLabel}.`
  };
}

function step(name, status, detail, data = undefined) {
  return { name, status, detail, data };
}

function routeToCltvDelta({ route, currentHeight, decodedPayReq }) {
  const firstRoute = route?.routes?.[0] || route?.route || route;
  if (firstRoute?.total_time_lock) {
    const delta = Number(firstRoute.total_time_lock) - Number(currentHeight);
    if (Number.isFinite(delta) && delta > 0) return delta;
  }
  const totalCltvDelta = Number(firstRoute?.total_cltv_delta || firstRoute?.totalCltvDelta);
  if (Number.isFinite(totalCltvDelta) && totalCltvDelta > 0) return totalCltvDelta;
  const invoiceDelta = Number(decodedPayReq?.cltv_expiry || 40);
  return invoiceDelta + CONFIG.bridgeSafetyDelta;
}

function ensurePreimageFromPayment(payment) {
  const observed = payment?.final?.preimageB64url || payment?.updates?.find((u) => u.preimageB64url)?.preimageB64url || null;
  if (observed) return observed;
  throw new Error('PAYMENT_PREIMAGE_NOT_OBSERVED_FROM_GATEWAY_OUTGOING_PAYMENT');
}

export async function runLiveAtomicBridge({
  prefix = 'MUTINYNET',
  envFile = null,
  networkLabel = null,
  clients = null,
  amountSats = null,
  payloadOverride = null,
  scenarioLabel = null
} = {}) {
  const meta = networkMeta(prefix);
  if (envFile) loadSimpleEnvFile(envFile);
  const network = networkLabel || meta.settings.network;
  const amount = amountSats ?? meta.settings.liveAmountSats;
  const scenario = scenarioLabel || meta.scenario;

  if (!clients) {
    const env = inspectLiveEnv({ prefix: meta.prefix });
    if (!env.ok) {
      throw setupError(
        `${meta.label} credentials are incomplete. ${meta.bootstrapStep}`,
        `${meta.prefix}_ENV_INCOMPLETE`,
        env.next_steps
      );
    }
  }

  const lnd = clients || buildLndClientsFromEnv({ prefix: meta.prefix });
  const timeline = [];
  const runId = randomId(`${meta.slug}_live`);
  const url = `https://merchant.example/mcp/premium-signal?asset=BTC&network=${meta.slug}&run=${runId}`;
  const body = null;
  const method = 'GET';
  const reqHash = requestHash({ method, url, body });
  const { envelope, keys: agentKeys } = createRequestEnvelope({ method, url, body, maxPriceUsd: '0.01' });
  envelope.request_hash = reqHash;

  timeline.push(step('Agent request envelope', 'OK', 'SDK generated a SATS402-REQUEST envelope before the first 402 negotiation.', {
    payment_id: envelope.payment_id,
    request_hash: envelope.request_hash,
    buyer_eph_pk_preview: `${envelope.buyer_eph_pk.slice(0, 18)}...`
  }));

  const [agentInfo, gatewayInfo, merchantInfo] = await Promise.all([lnd.agent.getInfo(), lnd.gateway.getInfo(), lnd.merchant.getInfo()]);
  const currentHeight = Number(gatewayInfo.block_height);
  timeline.push(step(`${meta.label} LND nodes online`, 'OK', 'Three actual LND nodes responded over REST.', {
    agent: { alias: agentInfo.alias, pubkey: agentInfo.identity_pubkey, height: Number(agentInfo.block_height) },
    gateway: { alias: gatewayInfo.alias, pubkey: gatewayInfo.identity_pubkey, height: currentHeight },
    merchant: { alias: merchantInfo.alias, pubkey: merchantInfo.identity_pubkey, height: Number(merchantInfo.block_height) }
  }));

  let agentChannels;
  let gatewayChannels;
  try {
    const [agentChannelResult, gatewayChannelResult] = await Promise.all([
      lnd.agent.listChannels(),
      lnd.gateway.listChannels()
    ]);
    agentChannels = summarizeChannels(agentChannelResult);
    gatewayChannels = summarizeChannels(gatewayChannelResult);
  } catch (err) {
    throw setupError(
      `Unable to inspect live channels: ${conciseError(err)}`,
      `${meta.prefix}_CHANNEL_STATUS_FAILED`,
      [meta.statusStep]
    );
  }

  const agentGatewayActive = hasActiveChannelTo(agentChannels, gatewayInfo.identity_pubkey);
  const gatewayMerchantActive = hasActiveChannelTo(gatewayChannels, merchantInfo.identity_pubkey);
  if (!agentGatewayActive || !gatewayMerchantActive) {
    throw setupError(
      `No active Agent->Gateway and Gateway->Merchant channels. ${meta.channelNextStep}`,
      `${meta.prefix}_CHANNELS_NOT_READY`,
      [meta.channelNextStep]
    );
  }

  const preimageB64url = randomBytesB64url(32);
  const paymentHashB64url = sha256B64url(Buffer.from(preimageB64url, 'base64url'));
  const merchantKeys = generateEcdhKeypair();
  const sharedSecretAtMerchant = computeSharedSecret(merchantKeys.privateKey, envelope.buyer_eph_pk);
  const saltInput = `${envelope.request_hash}:${envelope.payment_id}:${paymentHashB64url}`;
  const responseKey = deriveResponseKey({ preimageB64url, sharedSecret: sharedSecretAtMerchant, saltInput });
  const aad = stableStringify({ payment_id: envelope.payment_id, request_hash: envelope.request_hash, payment_hash: paymentHashB64url });
  const payload = typeof payloadOverride === 'function'
    ? await payloadOverride({
      networkLabel: network,
      envelope,
      paymentHashB64url,
      request: { method, url, body },
      runId,
      amountSats: amount
    })
    : (payloadOverride ?? demoPayload({ networkLabel: network }));
  const encrypted = encryptJson({ payload, key: responseKey, aad });

  timeline.push(step('Response locked before payment', 'OK', 'Merchant encrypted the API payload using HKDF(preimage || ECDH shared secret). The Gateway cannot decrypt it.', {
    payment_hash: paymentHashB64url,
    ciphertext_hash: encrypted.ciphertextHash,
    ciphertext_bytes: encrypted.ciphertextBytes
  }));

  const merchantInvoice = await lnd.merchant.addInvoiceWithPreimage({
    preimageB64url,
    amountSats: amount,
    memo: `SATS-402 merchant invoice ${runId}`,
    expirySeconds: meta.settings.invoiceExpirySeconds,
    cltvExpiry: 40
  });

  const decodedMerchant = await lnd.gateway.decodePayReq(merchantInvoice.payment_request);
  if (decodedMerchant.payment_hash !== Buffer.from(paymentHashB64url, 'base64url').toString('hex')) {
    throw new Error('MERCHANT_INVOICE_PAYMENT_HASH_MISMATCH');
  }

  let routes;
  try {
    routes = await lnd.gateway.queryRoutes({
      pubKey: decodedMerchant.destination,
      amountSats: amount,
      finalCltvDelta: Number(decodedMerchant.cltv_expiry || 40),
      feeLimitSat: meta.settings.feeLimitSat
    });
  } catch (err) {
    throw setupError(
      `Route query failed: ${conciseError(err)}`,
      `${meta.prefix}_ROUTE_QUERY_FAILED`,
      [meta.channelNextStep]
    );
  }
  if (!Array.isArray(routes?.routes) || routes.routes.length === 0) {
    throw setupError(
      'Route query failed: no route from Gateway to Merchant.',
      `${meta.prefix}_ROUTE_NOT_FOUND`,
      [meta.channelNextStep]
    );
  }

  const outgoingTotalCltvDelta = routeToCltvDelta({ route: routes, currentHeight, decodedPayReq: decodedMerchant });
  const preflight = preflightBridge({
    currentHeight,
    route: { totalCltvDelta: outgoingTotalCltvDelta },
    merchantInvoice: { finalCltvDelta: Number(decodedMerchant.cltv_expiry || 40) },
    bridgeSafetyDelta: CONFIG.bridgeSafetyDelta,
    policy: CONFIG.cltvPolicy
  });
  if (!preflight.ok) {
    return {
      ok: false,
      network,
      scenario,
      headline: `Live ${meta.label} bridge rejected safely`,
      timeline: [...timeline, step('Asymmetric CLTV preflight', 'REJECTED', 'Gateway refused to open the live bridge before HTLC exposure.', preflight)],
      receipt: null,
      metrics: { live_lnd: true, settled: false }
    };
  }

  timeline.push(step('Asymmetric CLTV preflight', 'OK', 'Gateway calculated incoming hold-invoice CLTV from the real outgoing route total_time_lock and enforced the safety delta.', preflight));

  const incomingCltvDelta = preflight.incomingExpiry - currentHeight;
  const gatewayHold = await lnd.gateway.addHoldInvoice({
    paymentHashB64url,
    amountSats: amount,
    memo: `SATS-402 gateway hold invoice ${runId}`,
    expirySeconds: meta.settings.invoiceExpirySeconds,
    cltvExpiry: incomingCltvDelta
  });

  timeline.push(step('Gateway hold invoice created', 'OK', 'Gateway created a real LND hold invoice locked to the same payment hash as the merchant invoice.', {
    same_hash_bridge: gatewayHold.paymentHashB64url === paymentHashB64url,
    gateway_payment_request_preview: `${gatewayHold.payment_request.slice(0, 32)}...`,
    incoming_cltv_delta: incomingCltvDelta
  }));

  const agentPaymentPromise = lnd.agent.sendPaymentV2({
    paymentRequest: gatewayHold.payment_request,
    feeLimitSat: meta.settings.feeLimitSat,
    timeoutSeconds: meta.settings.paymentTimeoutSeconds
  });

  await lnd.gateway.waitForInvoiceState({
    paymentHashB64url,
    states: ['ACCEPTED', 'SETTLED'],
    timeoutMs: meta.settings.pollTimeoutMs,
    pollIntervalMs: meta.settings.pollIntervalMs
  });

  timeline.push(step('Agent HTLC accepted by Gateway', 'OK', 'Agent payment is locked in the Gateway hold invoice. Gateway still has not extended credit or settled the agent side.', { gateway_hold_invoice_state: 'ACCEPTED_OR_SETTLED' }));

  const gatewayOutgoing = await lnd.gateway.sendPaymentV2({
    paymentRequest: merchantInvoice.payment_request,
    feeLimitSat: meta.settings.feeLimitSat,
    timeoutSeconds: meta.settings.paymentTimeoutSeconds
  });
  if (gatewayOutgoing.final?.status !== 'SUCCEEDED') {
    await lnd.gateway.cancelInvoice({ paymentHashB64url }).catch(() => null);
    throw new Error(`GATEWAY_OUTGOING_PAYMENT_FAILED:${gatewayOutgoing.final?.status || 'UNKNOWN'}`);
  }

  const observedPreimage = ensurePreimageFromPayment(gatewayOutgoing);
  if (!verifyPaymentHash({ preimageB64url: observedPreimage, paymentHashB64url })) throw new Error('OBSERVED_PREIMAGE_DOES_NOT_MATCH_PAYMENT_HASH');

  timeline.push(step('Gateway outgoing payment settled', 'OK', 'Gateway paid the merchant invoice and observed the real Lightning preimage from the outgoing payment result.', {
    status: gatewayOutgoing.final.status,
    payment_hash: paymentHashB64url,
    preimage_observed: Boolean(observedPreimage),
    fee_sat: gatewayOutgoing.final.feeSat
  }));

  await lnd.gateway.settleHoldInvoice({ preimageB64url: observedPreimage });
  const agentPayment = await agentPaymentPromise;
  if (agentPayment.final?.status !== 'SUCCEEDED') throw new Error(`AGENT_PAYMENT_NOT_SETTLED:${agentPayment.final?.status || 'UNKNOWN'}`);

  timeline.push(step('Agent-side hold invoice settled', 'OK', 'Gateway settled the incoming hold invoice with the same preimage. The agent now has S and can decrypt locally.', {
    agent_payment_status: agentPayment.final.status,
    same_preimage_path: true,
    credit_extended: false
  }));

  const agentSharedSecret = computeSharedSecret(agentKeys.privateKey, merchantKeys.publicKey);
  const agentResponseKey = deriveResponseKey({ preimageB64url: observedPreimage, sharedSecret: agentSharedSecret, saltInput });
  const decryptedPayload = decryptJson({ encrypted, key: agentResponseKey, aad });
  const schema = validateDemoPayload(decryptedPayload);

  timeline.push(step('Response decrypted with real preimage', schema.ok ? 'OK' : 'SCHEMA_FAILED', 'Agent derived the response key from the real Lightning preimage plus ECDH shared secret.', { schema, payload: decryptedPayload }));

  const challenge = {
    v: CONFIG.protocolVersion,
    type: meta.paymentType,
    delivery_mode: 'atomic_bridge',
    price: { display: `${amount} sats on ${network}`, amount_sats: amount },
    payment_hash: paymentHashB64url,
    merchant_eph_pk: merchantKeys.publicKey,
    request_hash: envelope.request_hash,
    payment_id: envelope.payment_id,
    kdf: CONFIG.crypto.kdf,
    encryption: CONFIG.crypto.aead,
    ciphertext_hash: encrypted.ciphertextHash,
    merchant_invoice_id: merchantInvoice.id,
    gateway_invoice_id: gatewayHold.id,
    cltv_policy: preflight,
    merchant_signature: randomId(`merchant_sig_${meta.slug}`)
  };

  const receipt = issueReceipt({
    deliveryMode: meta.deliveryMode,
    paymentState: 'SETTLED',
    responseState: 'RESPONSE_DECRYPTABLE',
    requestEnvelope: envelope,
    challenge,
    payment: {
      rail: meta.prefix === 'REGTEST' ? 'LIGHTNING_LND_REGTEST' : 'LIGHTNING_LND_MUTINYNET',
      paymentHashB64url,
      preimageB64url: observedPreimage,
      sameHashBridge: true,
      cltv: preflight.cltv
    },
    response: encrypted,
    creditExtended: false,
    schemaValid: schema.ok,
    notes: [`Live ${network} LND path completed: hold invoice accepted, outgoing merchant payment settled, incoming hold invoice settled with observed preimage.`]
  });

  return {
    ok: true,
    network,
    scenario,
    headline: `Live ${meta.label} atomic delivery settled`,
    investor_takeaway: `The core path uses actual LND REST calls on ${network} while preserving CLTV-safe same-hash HTLC bridging.`,
    same_hash_bridge: true,
    cltv_safety_check: 'passed',
    preimage_observed: true,
    response_decrypted_locally: true,
    receipt_issued: true,
    timeline,
    decryptedPayload,
    schema,
    receipt,
    live: {
      network,
      amount_sats: amount,
      lnd_nodes: { agent: agentInfo.identity_pubkey, gateway: gatewayInfo.identity_pubkey, merchant: merchantInfo.identity_pubkey },
      payment_hash_hex: conversions.b64urlToHex(paymentHashB64url),
      current_height: currentHeight
    },
    metrics: {
      live_lnd: true,
      credit_extended: false,
      custody: false,
      payment_hash: paymentHashB64url,
      same_hash_bridge: true,
      preimage_observed: true,
      cltv_safety_check: 'passed',
      response_decrypted_locally: true,
      receipt_issued: true,
      ciphertext_bytes: encrypted.ciphertextBytes
    }
  };
}

export function runMutinynetLiveAtomicBridge(options = {}) {
  return runLiveAtomicBridge({ ...options, prefix: 'MUTINYNET' });
}

export function runRegtestLiveAtomicBridge(options = {}) {
  return runLiveAtomicBridge({ ...options, prefix: 'REGTEST' });
}
