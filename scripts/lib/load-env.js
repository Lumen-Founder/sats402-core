import fs from 'node:fs';
import path from 'node:path';

export const MISSING_MUTINYNET_ENV_MESSAGE = 'Missing .env.mutinynet. Run npm run nodes:bootstrap or npm run nodes:export.';
export const MISSING_REGTEST_ENV_MESSAGE = 'Missing .env.regtest. Run npm run regtest:bootstrap.';

function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if ((ch === '"' || ch === "'") && value[i - 1] !== '\\') {
      quote = quote === ch ? null : quote || ch;
    }
    if (ch === '#' && !quote && /\s/.test(value[i - 1] || ' ')) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function unquote(value) {
  const trimmed = stripInlineComment(value.trim());
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvFile(text) {
  const parsed = {};
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trimStart() : line;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    parsed[key] = unquote(normalized.slice(eq + 1));
  }
  return parsed;
}

export function missingEnvMessage(fileName) {
  if (fileName === '.env.regtest') return MISSING_REGTEST_ENV_MESSAGE;
  if (fileName === '.env.mutinynet') return MISSING_MUTINYNET_ENV_MESSAGE;
  return `Missing ${fileName}.`;
}

export function loadEnvFile(fileName = '.env.mutinynet', { override = false, cwd = process.cwd() } = {}) {
  const filePath = path.resolve(cwd, fileName);
  if (!fs.existsSync(filePath)) {
    return { ok: false, loaded: false, path: filePath, error: missingEnvMessage(fileName) };
  }

  const values = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
  return { ok: true, loaded: true, path: filePath, keys: Object.keys(values) };
}

export function loadMutinynetEnv(options = {}) {
  return loadEnvFile('.env.mutinynet', options);
}

export function loadRegtestEnv(options = {}) {
  return loadEnvFile('.env.regtest', options);
}
