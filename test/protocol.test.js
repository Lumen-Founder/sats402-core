import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenario } from '../src/scenarios.js';

test('happy path settles with same-hash bridge and no credit', async () => {
  const result = await runScenario('happy_path');
  assert.equal(result.receipt.payment.same_hash_bridge, true);
  assert.equal(result.receipt.facilitator.credit_extended, false);
  assert.equal(result.receipt.facilitator.custody, false);
  assert.equal(result.schema.ok, true);
});

test('CLTV attack scenario is rejected before bridge settlement', async () => {
  const result = await runScenario('cltv_attack_rejected');
  assert.equal(result.receipt.payment.state, 'BRIDGE_REJECTED');
  assert.equal(result.receipt.facilitator.credit_extended, false);
});

test('semantic garbage scenario decrypts but fails schema validation', async () => {
  const result = await runScenario('semantic_garbage_boundary');
  assert.equal(result.receipt.response.decryptable_by_agent, true);
  assert.equal(result.schema.ok, false);
});
