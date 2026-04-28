import { CONFIG } from '../config.js';
import { randomId, signJson } from './crypto.js';

export function issueReceipt({
  deliveryMode,
  paymentState,
  responseState,
  requestEnvelope,
  challenge,
  payment,
  response,
  facilitatorRole = 'HTLC_BRIDGE',
  creditExtended = false,
  schemaValid = true,
  notes = []
}) {
  const receipt = {
    receipt_id: randomId('rcpt'),
    sats402_version: CONFIG.protocolVersion,
    issued_at: new Date().toISOString(),
    delivery_mode: deliveryMode,
    payment: {
      rail: payment?.rail || 'LIGHTNING_SIMULATED',
      payment_hash: payment?.paymentHashB64url || challenge?.payment_hash,
      state: paymentState,
      same_hash_bridge: Boolean(payment?.sameHashBridge),
      preimage_observed: Boolean(payment?.preimageB64url),
      cltv: payment?.cltv || null
    },
    response: {
      state: responseState,
      ciphertext_hash: response?.ciphertextHash || null,
      schema_valid: schemaValid,
      decryptable_by_agent: responseState === 'RESPONSE_DECRYPTABLE'
    },
    authorization: {
      payment_id: requestEnvelope?.payment_id,
      request_hash: requestEnvelope?.request_hash,
      agent_id: 'research-agent-01',
      max_per_call_usd: requestEnvelope?.max_price_usd
    },
    facilitator: {
      id: 'sats402-gateway-us-1',
      role: facilitatorRole,
      custody: false,
      credit_extended: creditExtended
    },
    notes
  };
  receipt.signature = signJson({ object: receipt });
  return receipt;
}
