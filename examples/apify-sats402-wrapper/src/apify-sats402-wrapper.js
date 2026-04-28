import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runApifyActor } from './apify-client.js';
import { fixtureApifyActorResult } from './fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function previewItems(items) {
  const first = items?.[0] || {};
  const title = first.title || first.name || first.url || 'Apify Actor result';
  const summary = first.summary || first.text || first.description || JSON.stringify(first).slice(0, 180);
  return `${title}: ${String(summary).replace(/\s+/g, ' ').slice(0, 220)}`;
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

export function buildApifyPayload({ actorResult, fixture }) {
  const serializedItems = JSON.stringify(actorResult.items || []);
  return {
    symbol: 'APIFY',
    signal: fixture ? 'apify-sats402-fixture-paid-actor-delivery' : 'apify-sats402-upstream-paid-actor-delivery',
    confidence: 1,
    generated_at: new Date().toISOString(),
    thesis: 'SATS-402 can complement Apify x402/Skyfire by adding Bitcoin-native preimage-locked paid delivery for Actor results.',
    investor_takeaway: 'Apify remains the upstream Actor platform; SATS-402 controls local response delivery after a real Lightning preimage is observed.',
    apify: {
      upstream_mode: actorResult.mode,
      upstream_called: Boolean(actorResult.upstream_called),
      actor_id: actorResult.actor_id,
      run_id: actorResult.run_id || null,
      dataset_id: actorResult.dataset_id || null,
      dataset_items: Array.isArray(actorResult.items) ? actorResult.items.length : 0,
      dataset_sha256: sha256Hex(serializedItems),
      dataset_preview: previewItems(actorResult.items),
      items: actorResult.items,
      input: actorResult.input,
      endpoint: actorResult.endpoint,
      sync: Boolean(actorResult.sync)
    },
    proof_constraints: {
      unofficial_wrapper: true,
      apify_auth_bypassed: false,
      apify_billing_bypassed: false,
      apify_usage_limits_bypassed: false,
      apify_rate_limits_bypassed: false,
      requires_apify_token_in_real_mode: !fixture
    }
  };
}

export async function runApifySats402Wrapper({
  actorId = 'apify/rag-web-browser',
  query = 'bitcoin lightning agent payments',
  inputJson = null,
  fixture = false,
  prefix = 'REGTEST',
  envFile = '.env.regtest',
  networkLabel = null,
  liveBridgeRunner = null,
  actorResult = null
} = {}) {
  const apifyResult = actorResult || (fixture
    ? fixtureApifyActorResult({ actorId, query })
    : await runApifyActor({ actorId, query, inputJson }));
  const payload = buildApifyPayload({ actorResult: apifyResult, fixture });
  const bridge = liveBridgeRunner || (await loadLiveBridge()).runLiveAtomicBridge;
  const scenarioLabel = `apify_sats402_wrapper_${fixture ? 'fixture' : 'real'}_${String(prefix).toLowerCase()}`;

  const bridgeResult = await bridge({
    prefix,
    envFile,
    networkLabel: networkLabel || `${String(prefix).toLowerCase()}-apify-${fixture ? 'fixture' : 'upstream'}`,
    payloadOverride: payload,
    scenarioLabel
  });

  const custody = Boolean(bridgeResult.receipt?.facilitator?.custody);
  const creditExtended = Boolean(bridgeResult.receipt?.facilitator?.credit_extended);
  const receiptId = bridgeResult.receipt?.receipt_id || null;

  return {
    ...bridgeResult,
    target: 'apify',
    mode: fixture ? 'fixture' : 'real',
    scenario: scenarioLabel,
    actor_id: apifyResult.actor_id,
    same_hash_bridge: Boolean(bridgeResult.same_hash_bridge),
    cltv_safety_check: bridgeResult.cltv_safety_check,
    preimage_observed: Boolean(bridgeResult.preimage_observed),
    response_decrypted_locally: Boolean(bridgeResult.response_decrypted_locally),
    receipt_issued: Boolean(bridgeResult.receipt),
    custody,
    credit_extended: creditExtended,
    apify: {
      upstream_called: Boolean(apifyResult.upstream_called),
      actor_id: apifyResult.actor_id,
      dataset_items: Array.isArray(apifyResult.items) ? apifyResult.items.length : 0,
      run_id: apifyResult.run_id || undefined,
      dataset_sha256: payload.apify.dataset_sha256,
      api_token_used: !fixture
    },
    decrypted_preview: payload.apify.dataset_preview,
    receipt_id: receiptId,
    proof: {
      same_hash_bridge: Boolean(bridgeResult.same_hash_bridge),
      cltv_safety_check: bridgeResult.cltv_safety_check,
      preimage_observed: Boolean(bridgeResult.preimage_observed),
      response_decrypted_locally: Boolean(bridgeResult.response_decrypted_locally),
      receipt_issued: Boolean(bridgeResult.receipt),
      custody,
      credit_extended: creditExtended,
      apify_auth_bypassed: false,
      apify_billing_bypassed: false,
      apify_usage_limits_bypassed: false,
      apify_rate_limits_bypassed: false
    }
  };
}
