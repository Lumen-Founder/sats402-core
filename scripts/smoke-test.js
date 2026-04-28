#!/usr/bin/env node
import { runScenario } from '../src/scenarios.js';

try {
  const result = await runScenario('happy_path');
  if (!result?.receipt?.payment?.same_hash_bridge) {
    console.error('Smoke test failed: same-hash bridge not present.');
    process.exit(1);
  }
  console.log('Smoke test OK:', result.headline);
} catch (err) {
  console.error(`Smoke test failed: ${err.message}`);
  process.exit(1);
}
