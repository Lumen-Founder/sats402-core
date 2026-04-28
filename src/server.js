import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';
import { SCENARIOS, runScenario, wellKnown } from './scenarios.js';
import { mutinynetDoctor, runMutinynetLiveAtomicBridge } from './core/mutinynet/live-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function json(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*'
  });
  res.end(payload);
}

async function staticFile(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) {
    json(res, 403, { error: 'FORBIDDEN' });
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'NOT_FOUND', path: pathname });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, {
        ok: true,
        name: 'sats402-mutinynet-live-demo',
        version: CONFIG.protocolVersion,
        time: new Date().toISOString(),
        lightning_backend: CONFIG.lightningBackend,
        demo_mode: CONFIG.demoMode
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/scenarios') {
      json(res, 200, { scenarios: SCENARIOS });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/demo/run') {
      const scenario = url.searchParams.get('scenario') || 'happy_path';
      const result = await runScenario(scenario);
      json(res, 200, result);
      return;
    }


    if (req.method === 'GET' && url.pathname === '/api/mutinynet/doctor') {
      try {
        const result = await mutinynetDoctor();
        json(res, result.ok ? 200 : 503, result);
      } catch (err) {
        json(res, 503, { ok: false, error: err.message, hint: 'Set .env.mutinynet and provide three LND REST endpoints/macaroons.' });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/mutinynet/run') {
      try {
        const amountSats = url.searchParams.get('amount_sats') ? Number(url.searchParams.get('amount_sats')) : undefined;
        const result = await runMutinynetLiveAtomicBridge({ amountSats });
        json(res, 200, result);
      } catch (err) {
        json(res, 503, {
          ok: false,
          scenario: 'mutinynet_live_atomic_bridge',
          error: err.message,
          hint: 'Live mode requires funded/channelled Mutinynet LND nodes. Run npm run mutinynet:doctor first.'
        });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/.well-known/sats402.json') {
      json(res, 200, wellKnown());
      return;
    }

    if (req.method === 'GET') {
      await staticFile(res, url.pathname);
      return;
    }

    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    json(res, 500, {
      error: 'INTERNAL_ERROR',
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
});

server.listen(CONFIG.port, () => {
  console.log(`SATS-402 Mutinynet live demo running at http://localhost:${CONFIG.port}`);
  console.log('Open the dashboard, or run: npm run demo');
});
