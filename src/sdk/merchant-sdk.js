import { CONFIG } from '../config.js';
import { computeSharedSecret, deriveResponseKey, encryptJson, generateEcdhKeypair, randomId, sha256B64url, stableStringify } from '../core/crypto.js';
import { decodeEnvelope, missingEnvelopeResponse, validateEnvelope } from '../core/envelope.js';

export class MerchantSdk {
  constructor({ merchantId = 'merchant-premium-mcp-001', lightning, gateway, priceUsd = '0.002', amountSats = 350 } = {}) {
    this.merchantId = merchantId;
    this.lightning = lightning;
    this.gateway = gateway;
    this.priceUsd = priceUsd;
    this.amountSats = amountSats;
    this.cache = new Map();
  }

  async handlePaidRequest({ request, sats402Header, payloadFactory, deliveryMode = 'atomic_bridge', scenarioOptions = {} }) {
    if (!sats402Header) {
      return { kind: 'missing_envelope', response: missingEnvelopeResponse() };
    }

    const envelope = decodeEnvelope(sats402Header);
    const validation = validateEnvelope(envelope, request.request_hash);
    if (!validation.ok) {
      return { kind: 'invalid_envelope', status: 400, errors: validation.errors };
    }

    const cacheKey = `${envelope.payment_id}:${envelope.request_hash}`;
    if (this.cache.has(cacheKey)) {
      return { kind: 'challenge', ...this.cache.get(cacheKey), cached: true };
    }

    const preimage = this.lightning.createPreimage();
    const merchantKeys = generateEcdhKeypair();
    const sharedSecret = computeSharedSecret(merchantKeys.privateKey, envelope.buyer_eph_pk);
    const saltInput = `${envelope.request_hash}:${envelope.payment_id}:${preimage.paymentHashB64url}`;
    const responseKey = deriveResponseKey({ preimageB64url: preimage.preimageB64url, sharedSecret, saltInput });

    const payload = await payloadFactory({ envelope, request, scenarioOptions });
    const aad = stableStringify({ payment_id: envelope.payment_id, request_hash: envelope.request_hash, payment_hash: preimage.paymentHashB64url });
    const encrypted = encryptJson({ payload, key: responseKey, aad });

    const merchantInvoice = this.lightning.createInvoice({
      owner: this.merchantId,
      amountSats: this.amountSats,
      paymentHashB64url: preimage.paymentHashB64url,
      finalCltvDelta: scenarioOptions.merchantFinalCltvDelta ?? 40,
      memo: 'SATS-402 merchant invoice locked to response preimage'
    });

    const bridge = this.gateway.prepareBridge({
      merchantId: this.merchantId,
      merchantInvoice,
      amountSats: this.amountSats,
      requestedIncomingExpiry: scenarioOptions.requestedIncomingExpiry,
      routeMode: scenarioOptions.routeMode || 'controlled_direct',
      forceRouteFailure: Boolean(scenarioOptions.forceRouteFailure)
    });

    const challenge = {
      v: CONFIG.protocolVersion,
      type: 'SATS402_PAYMENT_REQUIRED',
      delivery_mode: deliveryMode,
      price: { display: `${this.priceUsd} USD`, amount_sats: this.amountSats },
      payment_hash: preimage.paymentHashB64url,
      merchant_eph_pk: merchantKeys.publicKey,
      request_hash: envelope.request_hash,
      payment_id: envelope.payment_id,
      kdf: CONFIG.crypto.kdf,
      encryption: CONFIG.crypto.aead,
      ciphertext_hash: encrypted.ciphertextHash,
      merchant_invoice_id: merchantInvoice.id,
      gateway_invoice_id: bridge?.gatewayInvoice?.id || null,
      cltv_policy: bridge?.preflight || null,
      merchant_signature: randomId('merchant_sig_demo')
    };

    const result = {
      envelope,
      merchantKeys: { publicKey: merchantKeys.publicKey },
      preimage,
      merchantInvoice,
      bridge,
      encrypted,
      challenge,
      aad
    };

    this.cache.set(cacheKey, result);
    return { kind: 'challenge', ...result, cached: false };
  }
}
