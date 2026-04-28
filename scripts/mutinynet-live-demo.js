#!/usr/bin/env node
import { loadMutinynetEnv, MISSING_MUTINYNET_ENV_MESSAGE } from './lib/load-env.js';

try {
  const env = loadMutinynetEnv();
  if (!env.ok) {
    console.error(JSON.stringify({
      ok: false,
      scenario: 'mutinynet_live_atomic_bridge',
      error: MISSING_MUTINYNET_ENV_MESSAGE,
      next_steps: ['Run npm run nodes:bootstrap or npm run nodes:export.']
    }, null, 2));
    process.exit(1);
  }

  const { runMutinynetLiveAtomicBridge } = await import('../src/core/mutinynet/live-bridge.js');
  const result = await runMutinynetLiveAtomicBridge();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.metrics?.preimage_observed ? 0 : 1);
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    scenario: 'mutinynet_live_atomic_bridge',
    error: err.message,
    code: err.code,
    next_steps: err.next_steps || ['Run npm run mutinynet:doctor, then npm run nodes:status.']
  }, null, 2));
  process.exit(1);
}
