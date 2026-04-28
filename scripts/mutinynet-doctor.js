#!/usr/bin/env node
import { loadMutinynetEnv, MISSING_MUTINYNET_ENV_MESSAGE } from './lib/load-env.js';

try {
  const env = loadMutinynetEnv();
  if (!env.ok) {
    console.error(JSON.stringify({
      ok: false,
      error: MISSING_MUTINYNET_ENV_MESSAGE,
      next_steps: ['Run npm run nodes:bootstrap or npm run nodes:export.']
    }, null, 2));
    process.exit(1);
  }

  const { mutinynetDoctor } = await import('../src/core/mutinynet/live-bridge.js');
  const result = await mutinynetDoctor();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    error: err.message,
    next_steps: err.next_steps || ['Run npm run nodes:status and inspect the role-specific error above.']
  }, null, 2));
  process.exit(1);
}
