import test from 'node:test';
import assert from 'node:assert/strict';
import { scrapeWithFirecrawl } from '../src/firecrawl-client.js';
import { buildFirecrawlPayload, runFirecrawlSats402Wrapper } from '../src/firecrawl-sats402-wrapper.js';
import { fixtureFirecrawlScrape } from '../src/fixture.js';

test('fixture scrape works without a Firecrawl API key', () => {
  const previous = process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
  const scrape = fixtureFirecrawlScrape({ url: 'https://tvp.fund/philosophy/' });
  const payload = buildFirecrawlPayload({ scrape, fixture: true });
  assert.equal(payload.proof_constraints.requires_firecrawl_api_key_in_real_mode, false);
  assert.equal(payload.proof_constraints.firecrawl_auth_bypassed, false);
  assert.equal(payload.firecrawl.onlyMainContent, true);
  assert.match(payload.firecrawl.markdown, /deterministic fixture/);
  if (previous === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = previous;
});

test('real Firecrawl mode fails clearly without FIRECRAWL_API_KEY', async () => {
  await assert.rejects(
    scrapeWithFirecrawl({ url: 'https://tvp.fund/philosophy/', apiKey: '' }),
    /Missing FIRECRAWL_API_KEY\. Run fixture mode or export FIRECRAWL_API_KEY\./
  );
});

test('wrapper passes Firecrawl markdown into the SATS-402 bridge payload', async () => {
  let bridgeOptions = null;
  const fakeBridge = async (options) => {
    bridgeOptions = options;
    assert.equal(options.prefix, 'REGTEST');
    assert.equal(options.envFile, '.env.regtest');
    assert.match(options.scenarioLabel, /firecrawl_sats402_wrapper_fixture_regtest/);
    assert.match(options.payloadOverride.firecrawl.markdown, /deterministic fixture/);
    return {
      ok: true,
      network: 'regtest-firecrawl-fixture',
      same_hash_bridge: true,
      cltv_safety_check: 'passed',
      preimage_observed: true,
      response_decrypted_locally: true,
      receipt: {
        facilitator: {
          custody: false,
          credit_extended: false
        }
      },
      metrics: {
        custody: false,
        credit_extended: false
      }
    };
  };

  const result = await runFirecrawlSats402Wrapper({
    fixture: true,
    liveBridgeRunner: fakeBridge
  });

  assert.ok(bridgeOptions);
  assert.equal(result.proof.same_hash_bridge, true);
  assert.equal(result.proof.cltv_safety_check, 'passed');
  assert.equal(result.proof.preimage_observed, true);
  assert.equal(result.proof.response_decrypted_locally, true);
  assert.equal(result.proof.receipt_issued, true);
  assert.equal(result.proof.custody, false);
  assert.equal(result.proof.credit_extended, false);
});
