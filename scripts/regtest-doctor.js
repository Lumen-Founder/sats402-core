#!/usr/bin/env node
import { loadRegtestEnv, MISSING_REGTEST_ENV_MESSAGE } from './lib/load-env.js';

try {
  const env = loadRegtestEnv();
  if (!env.ok) {
    console.error(JSON.stringify({
      ok: false,
      network: 'regtest',
      live_ready: false,
      error: MISSING_REGTEST_ENV_MESSAGE,
      next_steps: ['Run npm run regtest:bootstrap.']
    }, null, 2));
    process.exit(1);
  }

  const { regtestDoctor } = await import('../src/core/mutinynet/live-bridge.js');
  const result = await regtestDoctor();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.live_ready ? 0 : 1);
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    network: 'regtest',
    live_ready: false,
    error: err.message,
    next_steps: err.next_steps || ['Run npm run regtest:status, then npm run regtest:bootstrap.']
  }, null, 2));
  process.exit(1);
}
