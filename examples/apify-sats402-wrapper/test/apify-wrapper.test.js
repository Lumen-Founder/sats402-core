import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActorInput, getApifyToken, normalizeActorId, runApifyActor } from '../src/apify-client.js';
import { buildApifyPayload, runApifySats402Wrapper } from '../src/apify-sats402-wrapper.js';
import { fixtureApifyActorResult } from '../src/fixture.js';

test('fixture Actor result works without an Apify token', () => {
  const previous = process.env.APIFY_TOKEN;
  const previousAlias = process.env.APIFY_API_TOKEN;
  delete process.env.APIFY_TOKEN;
  delete process.env.APIFY_API_TOKEN;
  const result = fixtureApifyActorResult({ actorId: 'apify/rag-web-browser' });
  const payload = buildApifyPayload({ actorResult: result, fixture: true });
  assert.equal(payload.proof_constraints.requires_apify_token_in_real_mode, false);
  assert.equal(payload.proof_constraints.apify_auth_bypassed, false);
  assert.equal(payload.apify.upstream_called, true);
  assert.equal(payload.apify.dataset_items, 2);
  if (previous === undefined) delete process.env.APIFY_TOKEN;
  else process.env.APIFY_TOKEN = previous;
  if (previousAlias === undefined) delete process.env.APIFY_API_TOKEN;
  else process.env.APIFY_API_TOKEN = previousAlias;
});

test('token lookup prefers APIFY_TOKEN and accepts APIFY_API_TOKEN alias', () => {
  assert.equal(getApifyToken({ APIFY_TOKEN: 'primary', APIFY_API_TOKEN: 'alias' }), 'primary');
  assert.equal(getApifyToken({ APIFY_API_TOKEN: 'alias' }), 'alias');
});

test('real Apify mode fails clearly without a token', async () => {
  await assert.rejects(
    runApifyActor({ actorId: 'apify/rag-web-browser', token: '' }),
    /Missing APIFY_TOKEN\. Run fixture mode or export APIFY_TOKEN\./
  );
});

test('Apify client uses bearer auth and sync dataset endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.method, 'POST');
    return new Response(JSON.stringify([{ title: 'ok' }]), { status: 200 });
  };

  const result = await runApifyActor({
    actorId: 'apify/rag-web-browser',
    query: 'bitcoin lightning agent payments',
    token: 'test-token',
    fetchImpl
  });

  assert.match(calls[0].url, /\/acts\/apify~rag-web-browser\/run-sync-get-dataset-items/);
  assert.equal(result.items.length, 1);
  assert.equal(result.sync, true);
});

test('wrapper passes Apify dataset into the SATS-402 bridge payload', async () => {
  let bridgeOptions = null;
  const fakeBridge = async (options) => {
    bridgeOptions = options;
    assert.equal(options.prefix, 'REGTEST');
    assert.equal(options.envFile, '.env.regtest');
    assert.match(options.scenarioLabel, /apify_sats402_wrapper_fixture_regtest/);
    assert.equal(options.payloadOverride.apify.dataset_items, 2);
    return {
      ok: true,
      network: 'regtest-apify-fixture',
      same_hash_bridge: true,
      cltv_safety_check: 'passed',
      preimage_observed: true,
      response_decrypted_locally: true,
      receipt: {
        receipt_id: 'rcpt_test',
        facilitator: {
          custody: false,
          credit_extended: false
        }
      }
    };
  };

  const result = await runApifySats402Wrapper({
    fixture: true,
    liveBridgeRunner: fakeBridge
  });

  assert.ok(bridgeOptions);
  assert.equal(result.ok, true);
  assert.equal(result.target, 'apify');
  assert.equal(result.mode, 'fixture');
  assert.equal(result.actor_id, 'apify/rag-web-browser');
  assert.equal(result.same_hash_bridge, true);
  assert.equal(result.cltv_safety_check, 'passed');
  assert.equal(result.preimage_observed, true);
  assert.equal(result.response_decrypted_locally, true);
  assert.equal(result.receipt_issued, true);
  assert.equal(result.custody, false);
  assert.equal(result.credit_extended, false);
  assert.equal(result.apify.upstream_called, true);
  assert.equal(result.apify.dataset_items, 2);
  assert.equal(result.receipt_id, 'rcpt_test');
});

test('actor helpers normalize ids and build simple inputs', () => {
  assert.equal(normalizeActorId('apify/rag-web-browser'), 'apify~rag-web-browser');
  assert.deepEqual(buildActorInput({ actorId: 'apify/rag-web-browser', query: 'q' }), { query: 'q', maxResults: 3 });
  assert.deepEqual(buildActorInput({ actorId: 'owner/actor', inputJson: '{"foo":1}' }), { foo: 1 });
});
