#!/usr/bin/env node
import { MissingFirecrawlApiKeyError } from './firecrawl-client.js';
import { readmeProofMarkdown, runFirecrawlSats402Wrapper } from './firecrawl-sats402-wrapper.js';

function parseArgs(argv) {
  const options = {
    fixture: false,
    url: 'https://tvp.fund/philosophy/',
    prefix: 'REGTEST',
    envFile: '.env.regtest',
    printReadmeProof: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fixture') options.fixture = true;
    else if (arg === '--print-readme-proof') options.printReadmeProof = true;
    else if (arg === '--url') options.url = argv[++i];
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
    '  node src/demo.js --url https://tvp.fund/philosophy/',
    '',
    'Real mode requires FIRECRAWL_API_KEY and uses local regtest LND by default.'
  ].join('\n');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(help());
    process.exit(0);
  }

  if (options.printReadmeProof) {
    console.log(readmeProofMarkdown());
    process.exit(0);
  }

  if (options.fixture) {
    console.error('Firecrawl wrapper fixture mode: no FIRECRAWL_API_KEY is required.');
  } else {
    console.error('Firecrawl upstream action: POST https://api.firecrawl.dev/v2/scrape with Authorization bearer token from FIRECRAWL_API_KEY.');
  }
  console.error(`SATS-402 bridge action: local ${options.prefix} LND same-hash hold-invoice bridge via ${options.envFile}.`);

  const result = await runFirecrawlSats402Wrapper(options);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok && result.proof?.response_decrypted_locally ? 0 : 1);
} catch (err) {
  if (err instanceof MissingFirecrawlApiKeyError || err.message === 'Missing FIRECRAWL_API_KEY. Run fixture mode or export FIRECRAWL_API_KEY.') {
    console.error('Missing FIRECRAWL_API_KEY. Run fixture mode or export FIRECRAWL_API_KEY.');
  } else {
    console.error(JSON.stringify({
      ok: false,
      scenario: 'firecrawl_sats402_wrapper',
      error: err.message,
      code: err.code,
      next_steps: err.next_steps || ['Run npm run demo:real, then retry the Firecrawl wrapper demo.']
    }, null, 2));
  }
  process.exit(1);
}
