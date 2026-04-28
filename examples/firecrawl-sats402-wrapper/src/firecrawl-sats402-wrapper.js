import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scrapeWithFirecrawl } from './firecrawl-client.js';
import { fixtureFirecrawlScrape } from './fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function loadLiveBridge() {
  const candidates = [
    path.resolve(__dirname, '../../../src/core/mutinynet/live-bridge.js'),
    path.resolve(__dirname, '../vendor/sats402/src/core/mutinynet/live-bridge.js')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return import(pathToFileURL(candidate).href);
  }

  throw new Error('Could not find SATS-402 live bridge. Run inside the SATS-402 repo or include vendor/sats402/src.');
}

export function buildFirecrawlPayload({ scrape, fixture }) {
  const markdownBytes = Buffer.byteLength(scrape.markdown, 'utf8');
  return {
    symbol: 'FIRECRAWL',
    signal: fixture ? 'firecrawl-sats402-fixture-paid-delivery' : 'firecrawl-sats402-upstream-paid-delivery',
    confidence: 1,
    generated_at: new Date().toISOString(),
    thesis: 'SATS-402 can wrap Firecrawl output in preimage-locked paid delivery without bypassing Firecrawl auth or billing.',
    investor_takeaway: 'Firecrawl remains the upstream data producer; SATS-402 controls local response delivery after a real Lightning preimage is observed.',
    firecrawl: {
      upstream_mode: scrape.mode,
      endpoint: scrape.endpoint,
      url: scrape.url,
      formats: scrape.request.formats,
      onlyMainContent: scrape.request.onlyMainContent,
      markdown: scrape.markdown,
      markdown_sha256: sha256Hex(scrape.markdown),
      markdown_bytes: markdownBytes,
      metadata: scrape.metadata
    },
    proof_constraints: {
      unofficial_wrapper: true,
      firecrawl_auth_bypassed: false,
      firecrawl_billing_bypassed: false,
      firecrawl_usage_limits_bypassed: false,
      requires_firecrawl_api_key_in_real_mode: !fixture
    }
  };
}

export async function runFirecrawlSats402Wrapper({
  url = 'https://tvp.fund/philosophy/',
  fixture = false,
  prefix = 'REGTEST',
  envFile = '.env.regtest',
  networkLabel = null,
  liveBridgeRunner = null,
  scrape = null
} = {}) {
  const firecrawlScrape = scrape || (fixture
    ? fixtureFirecrawlScrape({ url })
    : await scrapeWithFirecrawl({ url }));
  const payload = buildFirecrawlPayload({ scrape: firecrawlScrape, fixture });
  const bridge = liveBridgeRunner || (await loadLiveBridge()).runLiveAtomicBridge;
  const scenarioLabel = `firecrawl_sats402_wrapper_${fixture ? 'fixture' : 'real'}_${String(prefix).toLowerCase()}`;

  const bridgeResult = await bridge({
    prefix,
    envFile,
    networkLabel: networkLabel || `${String(prefix).toLowerCase()}-firecrawl-${fixture ? 'fixture' : 'upstream'}`,
    payloadOverride: payload,
    scenarioLabel
  });

  const custody = Boolean(bridgeResult.receipt?.facilitator?.custody);
  const creditExtended = Boolean(bridgeResult.receipt?.facilitator?.credit_extended);

  return {
    ...bridgeResult,
    scenario: scenarioLabel,
    firecrawl: {
      mode: firecrawlScrape.mode,
      url: firecrawlScrape.url,
      endpoint: firecrawlScrape.endpoint,
      formats: firecrawlScrape.request.formats,
      onlyMainContent: firecrawlScrape.request.onlyMainContent,
      markdown_sha256: payload.firecrawl.markdown_sha256,
      markdown_bytes: payload.firecrawl.markdown_bytes,
      api_key_used: !fixture
    },
    same_hash_bridge: Boolean(bridgeResult.same_hash_bridge),
    cltv_safety_check: bridgeResult.cltv_safety_check,
    preimage_observed: Boolean(bridgeResult.preimage_observed),
    response_decrypted_locally: Boolean(bridgeResult.response_decrypted_locally),
    receipt_issued: Boolean(bridgeResult.receipt),
    custody,
    credit_extended: creditExtended,
    proof: {
      same_hash_bridge: Boolean(bridgeResult.same_hash_bridge),
      cltv_safety_check: bridgeResult.cltv_safety_check,
      preimage_observed: Boolean(bridgeResult.preimage_observed),
      response_decrypted_locally: Boolean(bridgeResult.response_decrypted_locally),
      receipt_issued: Boolean(bridgeResult.receipt),
      custody,
      credit_extended: creditExtended,
      firecrawl_auth_bypassed: false,
      firecrawl_billing_bypassed: false,
      firecrawl_usage_limits_bypassed: false
    }
  };
}

export function readmeProofMarkdown() {
  return [
    '## Firecrawl SATS-402 Wrapper Proof',
    '',
    'This repository includes an unofficial Firecrawl SATS-402 wrapper that demonstrates Bitcoin-native paid delivery for Firecrawl MCP/API responses.',
    '',
    'It does not bypass Firecrawl authentication, billing, API keys, rate limits, or usage limits. Real upstream mode calls `POST https://api.firecrawl.dev/v2/scrape` with `Authorization: Bearer <FIRECRAWL_API_KEY>` and requests markdown only-main-content output.',
    '',
    '```bash',
    'npm run demo:real',
    'npm run firecrawl:demo:fixture',
    'export FIRECRAWL_API_KEY=...',
    'npm run firecrawl:demo -- --url https://tvp.fund/philosophy/',
    '```'
  ].join('\n');
}
