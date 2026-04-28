#!/usr/bin/env node
import { SCENARIOS, runScenario } from '../src/scenarios.js';

const selected = process.argv[2];
const ids = selected ? [selected] : SCENARIOS.map((s) => s.id);

console.log('\nSATS-402 v0.3 Christopher Demo');
console.log('CLTV-safe, preimage-locked atomic delivery for AI-agent commerce over Lightning.\n');

for (const id of ids) {
  const result = await runScenario(id);
  console.log(`=== ${id}: ${result.headline} ===`);
  console.log(result.investor_takeaway);
  for (const item of result.timeline) {
    console.log(` - [${item.status}] ${item.name}: ${item.detail}`);
  }
  console.log(` Receipt: ${result.receipt?.receipt_id || 'none'}`);
  console.log(` Credit extended: ${result.metrics.credit_extended}`);
  console.log(` Same-hash bridge: ${result.metrics.same_hash_bridge}`);
  console.log('');
}
