#!/usr/bin/env node
import { loadRegtestEnv, MISSING_REGTEST_ENV_MESSAGE } from './lib/load-env.js';

try {
  const env = loadRegtestEnv();
  if (!env.ok) {
    console.error(JSON.stringify({
      ok: false,
      network: 'regtest',
      scenario: 'regtest_live_atomic_bridge',
      error: MISSING_REGTEST_ENV_MESSAGE,
      next_steps: ['Run npm run regtest:bootstrap.']
    }, null, 2));
    process.exit(1);
  }

  const { runRegtestLiveAtomicBridge } = await import('../src/core/mutinynet/live-bridge.js');
  const result = await runRegtestLiveAtomicBridge();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok && result.preimage_observed ? 0 : 1);
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    network: 'regtest',
    scenario: 'regtest_live_atomic_bridge',
    error: err.message,
    code: err.code,
    next_steps: err.next_steps || ['Run npm run regtest:doctor, then npm run regtest:status.']
  }, null, 2));
  process.exit(1);
}
