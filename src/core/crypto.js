import crypto from 'node:crypto';
import { CONFIG } from '../config.js';

export function toBuffer(value, encoding = 'utf8') {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, encoding);
  return Buffer.from(JSON.stringify(value), encoding);
}

export function b64url(input) {
  return toBuffer(input).toString('base64url');
}

export function fromB64url(input) {
  return Buffer.from(input, 'base64url');
}

export function randomBytesB64url(size = 32) {
  return crypto.randomBytes(size).toString('base64url');
}

export function randomId(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}

export function sha256(input) {
  return crypto.createHash('sha256').update(toBuffer(input)).digest();
}

export function sha256Hex(input) {
  return sha256(input).toString('hex');
}

export function sha256B64url(input) {
  return sha256(input).toString('base64url');
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function generateEcdhKeypair() {
  const ecdh = crypto.createECDH(CONFIG.crypto.curve);
  ecdh.generateKeys();
  return {
    curve: CONFIG.crypto.curve,
    privateKey: ecdh.getPrivateKey().toString('base64url'),
    publicKey: ecdh.getPublicKey('base64url', 'compressed')
  };
}

export function computeSharedSecret(privateKeyB64url, peerPublicKeyB64url) {
  const ecdh = crypto.createECDH(CONFIG.crypto.curve);
  ecdh.setPrivateKey(Buffer.from(privateKeyB64url, 'base64url'));
  return ecdh.computeSecret(Buffer.from(peerPublicKeyB64url, 'base64url'));
}

export function deriveResponseKey({ preimageB64url, sharedSecret, saltInput, info = CONFIG.crypto.info }) {
  const preimage = fromB64url(preimageB64url);
  const ikm = Buffer.concat([preimage, toBuffer(sharedSecret)]);
  const salt = sha256(saltInput || 'sats402-empty-salt');
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from(info), 32));
}

export function encryptJson({ payload, key, aad = '' }) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(toBuffer(aad));
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'AES-256-GCM',
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    ciphertextHash: sha256B64url(ciphertext),
    plaintextBytes: plaintext.length,
    ciphertextBytes: ciphertext.length
  };
}

export function decryptJson({ encrypted, key, aad = '' }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, fromB64url(encrypted.iv));
  if (aad) decipher.setAAD(toBuffer(aad));
  decipher.setAuthTag(fromB64url(encrypted.tag));
  const plaintext = Buffer.concat([
    decipher.update(fromB64url(encrypted.ciphertext)),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

export function signJson({ object, secret = 'sats402-demo-facilitator-secret' }) {
  const body = stableStringify(object);
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

export function verifyPaymentHash({ preimageB64url, paymentHashB64url }) {
  return sha256B64url(fromB64url(preimageB64url)) === paymentHashB64url;
}
