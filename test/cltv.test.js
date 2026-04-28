import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCltvSafe, calculateIncomingExpiry, preflightBridge } from '../src/core/cltv.js';

test('CLTV invariant accepts asymmetric safe expiry', () => {
  const currentHeight = 840000;
  const outgoing = currentHeight + 42;
  const incoming = outgoing + 18;
  const result = assertCltvSafe({ incomingExpiry: incoming, outgoingFirstHopExpiry: outgoing, bridgeSafetyDelta: 18 });
  assert.equal(result.safe, true);
});

test('CLTV invariant rejects unsafe same-expiry bridge', () => {
  const currentHeight = 840000;
  const outgoing = currentHeight + 42;
  const incoming = outgoing;
  const result = assertCltvSafe({ incomingExpiry: incoming, outgoingFirstHopExpiry: outgoing, bridgeSafetyDelta: 18 });
  assert.equal(result.safe, false);
  assert.equal(result.error, 'UNSAFE_CLTV_ASYMMETRY');
});

test('preflight calculates incoming expiry from route total CLTV plus safety delta', () => {
  const incoming = calculateIncomingExpiry({ currentHeight: 840000, outgoingTotalCltvDelta: 42, bridgeSafetyDelta: 18 });
  assert.equal(incoming, 840060);
});

test('preflight rejects requested incoming expiry that is too short', () => {
  const result = preflightBridge({
    currentHeight: 840000,
    route: { totalCltvDelta: 42 },
    merchantInvoice: { finalCltvDelta: 40 },
    requestedIncomingExpiry: 840030,
    bridgeSafetyDelta: 18
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'asymmetric_cltv_invariant');
});
