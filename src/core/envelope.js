import { b64url, fromB64url, generateEcdhKeypair, randomBytesB64url, randomId, sha256B64url, stableStringify } from './crypto.js';
import { CONFIG } from '../config.js';

export function canonicalRequest({ method = 'GET', url, body = null }) {
  return {
    method: method.toUpperCase(),
    url,
    bodyHash: body == null ? sha256B64url('') : sha256B64url(typeof body === 'string' ? body : stableStringify(body))
  };
}

export function requestHash(request) {
  return sha256B64url(stableStringify(canonicalRequest(request)));
}

export function createRequestEnvelope({ method = 'GET', url, body = null, maxPriceUsd = CONFIG.defaultMaxPriceUsd, modes = ['atomic_response', 'atomic_bridge'], walletCaps = {} }) {
  const keys = generateEcdhKeypair();
  const envelope = {
    v: CONFIG.protocolVersion,
    mode: modes,
    buyer_eph_pk: keys.publicKey,
    buyer_nonce: randomBytesB64url(16),
    payment_id: randomId('pay'),
    request_hash: requestHash({ method, url, body }),
    max_price_usd: maxPriceUsd,
    wallet_caps: {
      lightning: true,
      preimage_return: true,
      hold_invoice: true,
      ...walletCaps
    },
    accept: {
      encryption: ['aes-256-gcm'],
      kdf: ['hkdf-sha256'],
      delivery: ['ciphertext-in-402', 'paid-retry']
    }
  };
  return { envelope, keys };
}

export function encodeEnvelope(envelope) {
  return b64url(Buffer.from(JSON.stringify(envelope), 'utf8'));
}

export function decodeEnvelope(headerValue) {
  if (!headerValue) throw new Error('SATS402_REQUEST_MISSING');
  return JSON.parse(fromB64url(headerValue).toString('utf8'));
}

export function validateEnvelope(envelope, expectedRequestHash) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object') errors.push('envelope is not an object');
  if (envelope?.v !== CONFIG.protocolVersion) errors.push(`unsupported protocol version ${envelope?.v}`);
  if (!Array.isArray(envelope?.mode) || envelope.mode.length === 0) errors.push('mode is required');
  if (!envelope?.buyer_eph_pk) errors.push('buyer_eph_pk is required');
  if (!envelope?.payment_id) errors.push('payment_id is required');
  if (!envelope?.request_hash) errors.push('request_hash is required');
  if (expectedRequestHash && envelope?.request_hash !== expectedRequestHash) errors.push('request_hash mismatch');
  if (!envelope?.wallet_caps?.preimage_return) errors.push('wallet must return Lightning preimage');
  return { ok: errors.length === 0, errors };
}

export function missingEnvelopeResponse() {
  return {
    status: 402,
    error: 'SATS402_ENVELOPE_REQUIRED',
    required_headers: ['SATS402-REQUEST'],
    supported_modes: ['atomic_response', 'atomic_bridge', 'hold_compute', 'paid_retry'],
    sdk_hint: 'Use @sats402/fetch or sats402-python. The SDK inserts buyer_eph_pk and payment_id before the first request.',
    well_known: '/.well-known/sats402.json'
  };
}
