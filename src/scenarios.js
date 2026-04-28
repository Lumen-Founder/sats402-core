import { CONFIG } from './config.js';
import { LightningSim } from './core/lightning-sim.js';
import { Sats402Gateway } from './core/gateway.js';
import { encodeEnvelope, requestHash } from './core/envelope.js';
import { issueReceipt } from './core/receipt.js';
import { AgentSdk } from './sdk/agent-sdk.js';
import { MerchantSdk } from './sdk/merchant-sdk.js';

function demoPayload({ scenarioOptions = {} } = {}) {
  if (scenarioOptions.garbagePayload) {
    return {
      result: 'lorem ipsum',
      confidence: -1,
      error: 'semantic payload intentionally invalid for oracle-boundary demo'
    };
  }
  return {
    symbol: 'BTC',
    signal: 'agentic-commerce-settlement-layer',
    confidence: 0.97,
    generated_at: new Date().toISOString(),
    thesis: 'SATS-402 turns Lightning preimages into cryptographic delivery keys for paid API responses.',
    investor_takeaway: 'This is not a credit gateway. It is a CLTV-safe atomic delivery layer.'
  };
}

function createWorld() {
  const lightning = new LightningSim({ currentHeight: CONFIG.currentBlockHeight });
  const gateway = new Sats402Gateway({ lightning });
  const agent = new AgentSdk({ maxPriceUsd: '0.01' });
  const merchant = new MerchantSdk({ lightning, gateway, priceUsd: '0.002', amountSats: 350 });
  return { lightning, gateway, agent, merchant };
}

function step(name, status, detail, data = undefined) {
  return { name, status, detail, data };
}

async function runBaseAtomic({ scenario = 'happy_path', scenarioOptions = {}, missingEnvelopeFirst = false } = {}) {
  const { lightning, gateway, agent, merchant } = createWorld();
  const url = 'https://merchant.example/mcp/premium-signal?asset=BTC';
  const agentRequest = agent.buildRequest({ method: 'GET', url });
  const timeline = [];

  timeline.push(step('Agent request envelope', 'OK', 'SDK generated buyer ephemeral public key, payment_id, request_hash, and wallet capabilities before the first HTTP request.', {
    header: 'SATS402-REQUEST',
    payment_id: agentRequest.envelope.payment_id,
    request_hash: agentRequest.envelope.request_hash,
    buyer_eph_pk_preview: `${agentRequest.envelope.buyer_eph_pk.slice(0, 18)}...`
  }));

  if (missingEnvelopeFirst) {
    const missing = await merchant.handlePaidRequest({
      request: agentRequest.request,
      sats402Header: null,
      payloadFactory: demoPayload,
      scenarioOptions
    });
    timeline.push(step('Missing envelope fallback', 'EXPECTED_402', 'A non-SATS402-aware client gets a 402 capability response. The SDK auto-retries with the preemptive envelope.', missing.response));
  }

  const merchantResult = await merchant.handlePaidRequest({
    request: agentRequest.request,
    sats402Header: encodeEnvelope(agentRequest.envelope),
    payloadFactory: demoPayload,
    deliveryMode: 'atomic_bridge',
    scenarioOptions
  });
  merchantResult.agentPrivateKey = agentRequest.keys.privateKey;

  if (merchantResult.kind !== 'challenge') {
    timeline.push(step('Merchant challenge', 'ERROR', 'Merchant did not create a valid payment challenge.', merchantResult));
    return finalize({ scenario, headline: 'Challenge failed', timeline, lightning });
  }

  if (!merchantResult.bridge.ok) {
    timeline.push(step('CLTV / route preflight', 'REJECTED', 'Gateway refused to open the bridge. No credit was extended and the API response remains locked.', merchantResult.bridge));
    const receipt = issueReceipt({
      deliveryMode: 'atomic_bridge',
      paymentState: 'BRIDGE_REJECTED',
      responseState: 'RESPONSE_LOCKED',
      requestEnvelope: agentRequest.envelope,
      challenge: merchantResult.challenge,
      payment: { paymentHashB64url: merchantResult.challenge.payment_hash, sameHashBridge: false, cltv: merchantResult.bridge.preflight?.cltv || null },
      response: merchantResult.encrypted,
      creditExtended: false,
      schemaValid: false,
      notes: ['Gateway rejected the bridge before any HTLC exposure.']
    });
    return finalize({ scenario, headline: 'Bridge rejected safely', timeline, lightning, merchantResult, receipt });
  }

  timeline.push(step('Merchant 402 challenge', 'OK', 'Merchant returned encrypted response bytes, Lightning payment hash, merchant ephemeral public key, and CLTV policy in the 402 response.', {
    status: 402,
    challenge: merchantResult.challenge,
    encrypted_response_bytes: merchantResult.encrypted.ciphertextBytes
  }));

  timeline.push(step('Asymmetric CLTV preflight', 'OK', 'Gateway enforced E_agent_to_gateway >= E_gateway_to_merchant_first_hop + Δbridge_safety before issuing the incoming hold invoice.', merchantResult.bridge.preflight));

  const decrypt = await agent.payAndDecrypt({ gateway, merchantResult, scenarioOptions });

  if (!decrypt.bridgeSettlement.ok) {
    timeline.push(step('Bridge settlement', 'FAILED', 'Payment did not settle; preimage unavailable; response remains encrypted.', decrypt.bridgeSettlement));
  } else {
    timeline.push(step('Same-hash HTLC bridge', 'SETTLED', 'Merchant revealed S. Gateway used the same S to settle the agent-side hold invoice. No facilitator credit was extended.', {
      same_hash_bridge: decrypt.bridgeSettlement.sameHashBridge,
      payment_hash: merchantResult.challenge.payment_hash,
      route: decrypt.bridgeSettlement.route,
      fallback_used: decrypt.bridgeSettlement.fallbackUsed,
      state: decrypt.bridgeSettlement.state,
      credit_extended: decrypt.bridgeSettlement.creditExtended
    }));
  }

  if (decrypt.decryptedPayload) {
    timeline.push(step('Response-locked decryption', decrypt.schema.ok ? 'OK' : 'SCHEMA_FAILED', 'Agent derived the response key from Lightning preimage S + ECDH shared secret and decrypted the payload locally.', {
      schema: decrypt.schema,
      payload: decrypt.decryptedPayload
    }));
  }

  const receipt = issueReceipt({
    deliveryMode: 'atomic_bridge',
    paymentState: decrypt.bridgeSettlement.ok ? 'SETTLED' : 'FAILED',
    responseState: decrypt.decryptedPayload ? 'RESPONSE_DECRYPTABLE' : 'RESPONSE_LOCKED',
    requestEnvelope: agentRequest.envelope,
    challenge: merchantResult.challenge,
    payment: {
      paymentHashB64url: merchantResult.challenge.payment_hash,
      preimageB64url: decrypt.bridgeSettlement.preimageB64url,
      sameHashBridge: decrypt.bridgeSettlement.sameHashBridge,
      cltv: decrypt.bridgeSettlement.cltv
    },
    response: merchantResult.encrypted,
    creditExtended: false,
    schemaValid: decrypt.schema.ok,
    notes: scenarioOptions.revealDelayMs > CONFIG.cltvPolicy.lateRevealMs
      ? ['Merchant revealed preimage late; gateway marks merchant risk without losing funds.']
      : ['Atomic delivery completed without facilitator balance-sheet exposure.']
  });

  return finalize({
    scenario,
    headline: decrypt.schema.ok ? 'Atomic delivery settled' : 'Cryptographic delivery succeeded; schema guard caught bad payload',
    timeline,
    lightning,
    merchantResult,
    decryptedPayload: decrypt.decryptedPayload,
    schema: decrypt.schema,
    receipt,
    merchantRisk: decrypt.bridgeSettlement.merchantRisk
  });
}

function finalize({ scenario, headline, timeline, lightning, merchantResult = null, decryptedPayload = null, schema = null, receipt = null, merchantRisk = null }) {
  const metrics = {
    protocol_version: CONFIG.protocolVersion,
    credit_extended: Boolean(receipt?.facilitator?.credit_extended),
    custody: Boolean(receipt?.facilitator?.custody),
    same_hash_bridge: Boolean(receipt?.payment?.same_hash_bridge),
    preimage_observed: Boolean(receipt?.payment?.preimage_observed),
    ciphertext_bytes: merchantResult?.encrypted?.ciphertextBytes || 0,
    simulated_lightning_events: lightning.events.length
  };

  return {
    scenario,
    headline,
    investor_takeaway: 'SATS-402 is not merely a Bitcoin payment adapter for x402. It is a CLTV-safe, preimage-locked atomic delivery layer for AI-agent commerce over Lightning.',
    architecture_claim: 'Raw Lightning routing is assumed imperfect; SATS-402 turns that imperfection into a managed facilitator, CLTV safety, and atomic delivery layer.',
    timeline,
    decryptedPayload,
    schema,
    receipt,
    merchantRisk,
    lightningEvents: lightning.events,
    metrics
  };
}

export const SCENARIOS = [
  {
    id: 'happy_path',
    label: 'Happy path: CLTV-safe atomic bridge',
    description: 'Controlled route, same-hash HTLC bridge, preimage-locked response decryption.'
  },
  {
    id: 'missing_envelope',
    label: 'Missing envelope auto-retry',
    description: 'Shows how SDK hides the first-request buyer_eph_pk requirement.'
  },
  {
    id: 'route_failure_fallback',
    label: 'Public route failure → gateway fallback',
    description: 'Public route fails; Gateway falls back to controlled relay without exposing credit.'
  },
  {
    id: 'cltv_attack_rejected',
    label: 'CLTV griefing attempt rejected',
    description: 'Gateway refuses unsafe asymmetric CLTV; no HTLC is opened.'
  },
  {
    id: 'late_reveal_watchlist',
    label: 'Late preimage reveal → merchant watchlist',
    description: 'Merchant reveals late; Gateway settles safely but marks risk.'
  },
  {
    id: 'semantic_garbage_boundary',
    label: 'Oracle boundary: garbage payload caught by schema',
    description: 'Cryptographic delivery works, but schema validation catches bad merchant output.'
  }
];

export async function runScenario(id = 'happy_path') {
  switch (id) {
    case 'happy_path':
      return runBaseAtomic({ scenario: id });
    case 'missing_envelope':
      return runBaseAtomic({ scenario: id, missingEnvelopeFirst: true });
    case 'route_failure_fallback':
      return runBaseAtomic({ scenario: id, scenarioOptions: { routeMode: 'public_multi_hop', forceRouteFailure: true } });
    case 'cltv_attack_rejected': {
      const unsafeIncomingExpiry = CONFIG.currentBlockHeight + 20;
      return runBaseAtomic({ scenario: id, scenarioOptions: { routeMode: 'gateway_relay', requestedIncomingExpiry: unsafeIncomingExpiry } });
    }
    case 'late_reveal_watchlist':
      return runBaseAtomic({ scenario: id, scenarioOptions: { revealDelayMs: 5_000 } });
    case 'semantic_garbage_boundary':
      return runBaseAtomic({ scenario: id, scenarioOptions: { garbagePayload: true } });
    default:
      return runBaseAtomic({ scenario: 'happy_path' });
  }
}

export function wellKnown() {
  return {
    sats402: CONFIG.protocolVersion,
    modes: ['atomic_response', 'atomic_bridge', 'mutinynet_live_atomic_bridge', 'hold_compute', 'paid_retry'],
    encryption: ['aes-256-gcm'],
    kdf: ['hkdf-sha256'],
    wallet_requirements: {
      preimage_return: true,
      lightning: true
    },
    max_ciphertext_in_402_bytes: CONFIG.maxResponseBytes,
    headers: {
      request: 'SATS402-REQUEST',
      challenge: 'SATS402-CHALLENGE'
    },
    production_note: 'Controlled fault scenarios use a deterministic Lightning harness. Mutinynet live mode uses real LND REST endpoints for AddInvoice, AddHoldInvoice, QueryRoutes, SendPaymentV2, LookupInvoice, and SettleInvoice.'
  };
}
