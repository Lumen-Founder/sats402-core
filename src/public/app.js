const scenarioButtons = document.getElementById('scenarioButtons');
const resultSummary = document.getElementById('resultSummary');
const metrics = document.getElementById('metrics');
const timeline = document.getElementById('timeline');
const receipt = document.getElementById('receipt');
const payload = document.getElementById('payload');
const takeaway = document.getElementById('takeaway');
const runDefault = document.getElementById('runDefault');
const runDoctor = document.getElementById('runDoctor');
const runMutinynet = document.getElementById('runMutinynet');
const backendStatus = document.getElementById('backendStatus');

function pretty(value) { return JSON.stringify(value ?? {}, null, 2); }
function metric(label, value) { return `<div class="metric"><strong>${label}</strong><span>${String(value)}</span></div>`; }

function timelineItem(item) {
  return `<article class="timeline-item ${item.status}">
    <div class="timeline-head"><div>${item.name}</div><span class="badge">${item.status}</span></div>
    <p>${item.detail}</p>
    ${item.data ? `<pre class="json-block">${pretty(item.data)}</pre>` : ''}
  </article>`;
}

function renderResult(data) {
  resultSummary.innerHTML = `<strong>${data.headline || data.error || 'Result'}</strong><p>${data.architecture_claim || data.investor_takeaway || data.hint || ''}</p>`;
  const m = data.metrics || {};
  metrics.innerHTML = [
    metric('Protocol/live', m.protocol_version || (m.live_lnd ? 'LND REST' : 'n/a')),
    metric('Credit extended', m.credit_extended ?? false),
    metric('Custody', m.custody ?? false),
    metric('Same-hash bridge', m.same_hash_bridge ?? false),
    metric('Preimage observed', m.preimage_observed ?? false),
    metric('Ciphertext bytes', m.ciphertext_bytes ?? 0),
    metric('LN events', m.simulated_lightning_events ?? (m.live_lnd ? 'real LND' : 0))
  ].join('');
  timeline.innerHTML = Array.isArray(data.timeline) ? data.timeline.map(timelineItem).join('') : `<article class="timeline-item ERROR"><div class="timeline-head"><div>Error</div><span class="badge">ERROR</span></div><p>${data.error || data.hint || 'No timeline'}</p></article>`;
  receipt.textContent = pretty(data.receipt || data.live || data.results || data);
  payload.textContent = pretty(data.decryptedPayload || data.schema || data.results || {});
  takeaway.textContent = data.investor_takeaway || 'SATS-402 turns Lightning preimages into cryptographic response delivery keys.';
}

async function loadHealth() {
  const res = await fetch('/health');
  const data = await res.json();
  backendStatus.textContent = `${data.lightning_backend} / ${data.demo_mode}`;
}

async function loadScenarios() {
  const res = await fetch('/api/scenarios');
  const data = await res.json();
  scenarioButtons.innerHTML = data.scenarios.map(s => `<button class="scenario-card" data-id="${s.id}">${s.label}<span>${s.description}</span></button>`).join('');
  scenarioButtons.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => runScenario(btn.dataset.id)));
}

async function runScenario(id = 'happy_path') {
  resultSummary.textContent = 'Running controlled scenario...';
  const res = await fetch(`/api/demo/run?scenario=${encodeURIComponent(id)}`);
  const data = await res.json();
  renderResult(data);
}

async function runMutinynetDoctor() {
  resultSummary.textContent = 'Checking Mutinynet LND nodes...';
  const res = await fetch('/api/mutinynet/doctor');
  const data = await res.json();
  renderResult({
    headline: data.ok ? 'Mutinynet LND nodes reachable' : 'Mutinynet LND nodes not ready',
    investor_takeaway: data.ok ? 'Three real LND nodes are online and ready for the live atomic bridge.' : data.hint || data.warnings?.join(' '),
    metrics: { live_lnd: true, credit_extended: false, custody: false, same_hash_bridge: false, preimage_observed: false, ciphertext_bytes: 0 },
    timeline: Object.entries(data.results || {}).map(([role, result]) => ({
      name: `${role} LND`, status: result.ok ? 'OK' : 'ERROR', detail: result.ok ? `${result.alias || role} at height ${result.block_height}` : result.error, data: result
    })),
    receipt: data,
    results: data.results
  });
}

async function runMutinynetLive() {
  resultSummary.textContent = 'Running live Mutinynet atomic bridge...';
  const res = await fetch('/api/mutinynet/run');
  const data = await res.json();
  renderResult(data);
}

runDefault.addEventListener('click', () => runScenario('happy_path'));
runDoctor.addEventListener('click', runMutinynetDoctor);
runMutinynet.addEventListener('click', runMutinynetLive);
loadHealth();
loadScenarios().then(() => runScenario('happy_path'));
