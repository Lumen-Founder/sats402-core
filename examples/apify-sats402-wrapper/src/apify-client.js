const APIFY_API_BASE = 'https://api.apify.com/v2';
const DEFAULT_TIMEOUT_SECONDS = 60;
const DEFAULT_POLL_INTERVAL_MS = 2500;
const DEFAULT_POLL_TIMEOUT_MS = 120000;

export class MissingApifyTokenError extends Error {
  constructor() {
    super('Missing APIFY_TOKEN. Run fixture mode or export APIFY_TOKEN.');
    this.name = 'MissingApifyTokenError';
  }
}

export function getApifyToken(env = process.env) {
  return env.APIFY_TOKEN || env.APIFY_API_TOKEN || '';
}

export function normalizeActorId(actorId) {
  const trimmed = String(actorId || '').trim();
  if (!trimmed) throw new Error('Apify Actor ID is required.');
  return encodeURIComponent(trimmed.replace('/', '~'));
}

export function buildActorInput({ actorId, query, inputJson }) {
  if (inputJson) {
    const parsed = JSON.parse(inputJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Apify --input-json must be a JSON object.');
    }
    return parsed;
  }

  if (String(actorId).includes('rag-web-browser')) {
    return {
      query,
      maxResults: 3
    };
  }

  return {
    query,
    maxItems: 3
  };
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorSnippet(body) {
  if (!body) return '';
  if (typeof body === 'string') return ` ${body.replace(/\s+/g, ' ').slice(0, 300)}`;
  return ` ${JSON.stringify(body).replace(/\s+/g, ' ').slice(0, 300)}`;
}

async function apifyFetch({ fetchImpl, url, token, method = 'GET', body = null }) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const parsed = await readJsonOrText(response);
  if (!response.ok) {
    const err = new Error(`Apify API failed: HTTP ${response.status} ${response.statusText || ''}${errorSnippet(parsed)}`);
    err.status = response.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

function extractItems(syncResponse) {
  if (Array.isArray(syncResponse)) return syncResponse;
  if (Array.isArray(syncResponse?.data)) return syncResponse.data;
  if (Array.isArray(syncResponse?.items)) return syncResponse.items;
  return [];
}

function terminalRunStatus(status) {
  return ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(String(status || '').toUpperCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runApifyActor({
  actorId = 'apify/rag-web-browser',
  query = 'bitcoin lightning agent payments',
  input = null,
  inputJson = null,
  token = getApifyToken(),
  fetchImpl = globalThis.fetch,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS
} = {}) {
  if (!token) throw new MissingApifyTokenError();
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available.');

  const normalizedActorId = normalizeActorId(actorId);
  const actorInput = input || buildActorInput({ actorId, query, inputJson });
  const syncUrl = new URL(`${APIFY_API_BASE}/acts/${normalizedActorId}/run-sync-get-dataset-items`);
  syncUrl.searchParams.set('timeout', String(timeoutSeconds));
  syncUrl.searchParams.set('clean', 'true');
  syncUrl.searchParams.set('format', 'json');

  try {
    const syncResponse = await apifyFetch({
      fetchImpl,
      url: syncUrl.toString(),
      token,
      method: 'POST',
      body: actorInput
    });
    const items = extractItems(syncResponse);
    return {
      mode: 'real',
      upstream_called: true,
      actor_id: actorId,
      run_id: null,
      dataset_id: null,
      items,
      input: actorInput,
      endpoint: syncUrl.origin + syncUrl.pathname,
      sync: true
    };
  } catch (err) {
    const maybeTimeout = err.status === 408 || /timeout|timed.out|operation-timed-out/i.test(`${err.message} ${JSON.stringify(err.body || {})}`);
    if (!maybeTimeout) throw err;
  }

  const runUrl = `${APIFY_API_BASE}/acts/${normalizedActorId}/runs`;
  const runResponse = await apifyFetch({
    fetchImpl,
    url: runUrl,
    token,
    method: 'POST',
    body: actorInput
  });
  let run = runResponse?.data || runResponse;
  if (!run?.id) throw new Error('Apify async run response did not include a run id.');

  const deadline = Date.now() + pollTimeoutMs;
  while (!terminalRunStatus(run.status)) {
    if (Date.now() > deadline) throw new Error(`Apify async run polling timed out for run ${run.id}.`);
    await sleep(pollIntervalMs);
    const pollResponse = await apifyFetch({
      fetchImpl,
      url: `${APIFY_API_BASE}/actor-runs/${encodeURIComponent(run.id)}`,
      token
    });
    run = pollResponse?.data || pollResponse;
  }

  if (String(run.status).toUpperCase() !== 'SUCCEEDED') {
    throw new Error(`Apify Actor run finished with status ${run.status}.`);
  }

  const datasetId = run.defaultDatasetId;
  if (!datasetId) throw new Error('Apify Actor run did not include defaultDatasetId.');
  const datasetUrl = new URL(`${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items`);
  datasetUrl.searchParams.set('format', 'json');
  datasetUrl.searchParams.set('clean', 'true');
  datasetUrl.searchParams.set('limit', '25');
  const datasetItems = await apifyFetch({
    fetchImpl,
    url: datasetUrl.toString(),
    token
  });

  return {
    mode: 'real',
    upstream_called: true,
    actor_id: actorId,
    run_id: run.id,
    dataset_id: datasetId,
    items: Array.isArray(datasetItems) ? datasetItems : extractItems(datasetItems),
    input: actorInput,
    endpoint: runUrl,
    sync: false
  };
}

export { APIFY_API_BASE };
