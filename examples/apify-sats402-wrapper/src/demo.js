#!/usr/bin/env node
import { MissingApifyTokenError } from './apify-client.js';
import { runApifySats402Wrapper } from './apify-sats402-wrapper.js';

function parseArgs(argv) {
  const options = {
    fixture: false,
    actorId: 'apify/rag-web-browser',
    query: 'bitcoin lightning agent payments',
    inputJson: null,
    prefix: 'REGTEST',
    envFile: '.env.regtest'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fixture') options.fixture = true;
    else if (arg === '--actor') options.actorId = argv[++i];
    else if (arg === '--query') options.query = argv[++i];
    else if (arg === '--input-json') options.inputJson = argv[++i];
    else if (arg === '--prefix') options.prefix = argv[++i];
    else if (arg === '--env-file') options.envFile = argv[++i];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function help() {
  return [
    'Usage:',
    '  node src/demo.js --fixture',
    '  node src/demo.js --actor apify/rag-web-browser --query "bitcoin lightning agent payments"',
    '',
    'Real mode requires APIFY_TOKEN, or APIFY_API_TOKEN as an alias, and uses local regtest LND by default.'
  ].join('\n');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(help());
    process.exit(0);
  }

  if (options.fixture) {
    console.error('Apify wrapper fixture mode: no APIFY_TOKEN is required.');
  } else {
    console.error(`Apify upstream action: run Actor ${options.actorId} with Authorization bearer token from APIFY_TOKEN or APIFY_API_TOKEN.`);
  }
  console.error(`SATS-402 bridge action: local ${options.prefix} LND same-hash hold-invoice bridge via ${options.envFile}.`);

  const result = await runApifySats402Wrapper(options);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok && result.response_decrypted_locally && result.receipt_issued ? 0 : 1);
} catch (err) {
  if (err instanceof MissingApifyTokenError || err.message === 'Missing APIFY_TOKEN. Run fixture mode or export APIFY_TOKEN.') {
    console.error('Missing APIFY_TOKEN. Run fixture mode or export APIFY_TOKEN.');
  } else {
    console.error(JSON.stringify({
      ok: false,
      target: 'apify',
      scenario: 'apify_sats402_wrapper',
      error: err.message,
      code: err.code,
      next_steps: err.next_steps || ['Run npm run demo:real, then retry the Apify wrapper demo.']
    }, null, 2));
  }
  process.exit(1);
}
