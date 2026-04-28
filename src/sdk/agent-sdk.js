import { CONFIG } from '../config.js';
import { computeSharedSecret, decryptJson, deriveResponseKey, stableStringify } from '../core/crypto.js';
import { createRequestEnvelope, encodeEnvelope, requestHash } from '../core/envelope.js';
import { validateDemoPayload } from '../core/validator.js';

export class AgentSdk {
  constructor({ maxPriceUsd = CONFIG.defaultMaxPriceUsd } = {}) {
    this.maxPriceUsd = maxPriceUsd;
  }

  buildRequest({ method = 'GET', url, body = null }) {
    const reqHash = requestHash({ method, url, body });
    const { envelope, keys } = createRequestEnvelope({ method, url, body, maxPriceUsd: this.maxPriceUsd });
    return {
      request: { method, url, body, request_hash: reqHash },
      envelope,
      keys,
      header: encodeEnvelope(envelope)
    };
  }

  async payAndDecrypt({ gateway, merchantResult, scenarioOptions = {} }) {
    const bridgeSettlement = gateway.executeBridge({
      bridge: merchantResult.bridge,
      merchantInvoice: merchantResult.merchantInvoice,
      preimageB64url: merchantResult.preimage.preimageB64url,
      revealDelayMs: scenarioOptions.revealDelayMs || 0
    });

    if (!bridgeSettlement.ok) {
      return {
        ok: false,
        bridgeSettlement,
        decryptedPayload: null,
        schema: { ok: false, errors: ['payment did not settle; response key unavailable'] }
      };
    }

    const agentPrivateKey = scenarioOptions.agentPrivateKey || merchantResult.agentPrivateKey;
    const sharedSecret = computeSharedSecret(agentPrivateKey, merchantResult.challenge.merchant_eph_pk);
    const saltInput = `${merchantResult.envelope.request_hash}:${merchantResult.envelope.payment_id}:${merchantResult.challenge.payment_hash}`;
    const key = deriveResponseKey({ preimageB64url: bridgeSettlement.preimageB64url, sharedSecret, saltInput });
    const payload = decryptJson({ encrypted: merchantResult.encrypted, key, aad: merchantResult.aad });
    const schema = validateDemoPayload(payload);

    return {
      ok: schema.ok,
      bridgeSettlement,
      decryptedPayload: payload,
      schema,
      derivedKeyContext: {
        kdf: CONFIG.crypto.kdf,
        saltInputHash: merchantResult.challenge.payment_hash,
        aad: stableStringify({ payment_id: merchantResult.envelope.payment_id, request_hash: merchantResult.envelope.request_hash, payment_hash: merchantResult.challenge.payment_hash })
      }
    };
  }
}
