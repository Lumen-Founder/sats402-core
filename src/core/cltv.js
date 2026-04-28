import { CONFIG } from '../config.js';

export function calculateIncomingExpiry({ currentHeight = CONFIG.currentBlockHeight, outgoingTotalCltvDelta, bridgeSafetyDelta = CONFIG.bridgeSafetyDelta }) {
  if (!Number.isFinite(outgoingTotalCltvDelta) || outgoingTotalCltvDelta <= 0) {
    throw new Error('OUTGOING_TOTAL_CLTV_DELTA_REQUIRED');
  }
  return currentHeight + outgoingTotalCltvDelta + bridgeSafetyDelta;
}

export function assertCltvSafe({ incomingExpiry, outgoingFirstHopExpiry, bridgeSafetyDelta = CONFIG.bridgeSafetyDelta }) {
  const required = outgoingFirstHopExpiry + bridgeSafetyDelta;
  const safe = incomingExpiry >= required;
  return {
    safe,
    incomingExpiry,
    outgoingFirstHopExpiry,
    bridgeSafetyDelta,
    requiredIncomingExpiry: required,
    marginBlocks: incomingExpiry - outgoingFirstHopExpiry,
    error: safe ? null : 'UNSAFE_CLTV_ASYMMETRY'
  };
}

export function preflightBridge({
  currentHeight = CONFIG.currentBlockHeight,
  route,
  merchantInvoice,
  requestedIncomingExpiry = null,
  bridgeSafetyDelta = CONFIG.bridgeSafetyDelta,
  policy = CONFIG.cltvPolicy
}) {
  const checks = [];

  if (!route || !Number.isFinite(route.totalCltvDelta)) {
    return { ok: false, error: 'ROUTE_PREFLIGHT_REQUIRED', checks };
  }

  const outgoingFirstHopExpiry = currentHeight + route.totalCltvDelta;
  const requiredIncomingExpiry = calculateIncomingExpiry({ currentHeight, outgoingTotalCltvDelta: route.totalCltvDelta, bridgeSafetyDelta });
  const incomingExpiry = requestedIncomingExpiry ?? requiredIncomingExpiry;

  checks.push({ name: 'route_total_cltv_known', ok: true, value: route.totalCltvDelta });
  checks.push({ name: 'bridge_safety_delta', ok: bridgeSafetyDelta >= policy.minBridgeSafetyDelta, value: bridgeSafetyDelta, minimum: policy.minBridgeSafetyDelta });
  checks.push({ name: 'merchant_final_cltv_delta_max', ok: merchantInvoice.finalCltvDelta <= policy.maxMerchantFinalCltvDelta, value: merchantInvoice.finalCltvDelta, maximum: policy.maxMerchantFinalCltvDelta });
  checks.push({ name: 'route_total_cltv_delta_max', ok: route.totalCltvDelta <= policy.maxBridgeTotalCltvDelta, value: route.totalCltvDelta, maximum: policy.maxBridgeTotalCltvDelta });

  const cltv = assertCltvSafe({ incomingExpiry, outgoingFirstHopExpiry, bridgeSafetyDelta });
  checks.push({ name: 'asymmetric_cltv_invariant', ok: cltv.safe, value: cltv.marginBlocks, required: bridgeSafetyDelta });

  const failed = checks.find((check) => !check.ok);
  return {
    ok: !failed,
    error: failed ? failed.name : null,
    currentHeight,
    incomingExpiry,
    outgoingFirstHopExpiry,
    requiredIncomingExpiry,
    bridgeSafetyDelta,
    cltv,
    checks
  };
}
