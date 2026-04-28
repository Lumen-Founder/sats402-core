import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSharedSecret, decryptJson, deriveResponseKey, encryptJson, generateEcdhKeypair, randomBytesB64url, sha256B64url } from '../src/core/crypto.js';

test('ECDH + preimage-derived response key decrypts payload', () => {
  const agent = generateEcdhKeypair();
  const merchant = generateEcdhKeypair();
  const aSecret = computeSharedSecret(agent.privateKey, merchant.publicKey);
  const mSecret = computeSharedSecret(merchant.privateKey, agent.publicKey);
  assert.equal(aSecret.toString('hex'), mSecret.toString('hex'));

  const preimageB64url = randomBytesB64url(32);
  const saltInput = `request:payment:${sha256B64url(Buffer.from(preimageB64url, 'base64url'))}`;
  const aKey = deriveResponseKey({ preimageB64url, sharedSecret: aSecret, saltInput });
  const mKey = deriveResponseKey({ preimageB64url, sharedSecret: mSecret, saltInput });
  assert.equal(aKey.toString('hex'), mKey.toString('hex'));

  const encrypted = encryptJson({ payload: { ok: true, value: 402 }, key: mKey, aad: 'demo' });
  const decrypted = decryptJson({ encrypted, key: aKey, aad: 'demo' });
  assert.deepEqual(decrypted, { ok: true, value: 402 });
});
