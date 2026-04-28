import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { LndRestClient, conversions } from '../src/core/mutinynet/lnd-rest-client.js';

function startMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('LND REST client creates hold invoice body with base64 hash and macaroon header', async () => {
  const paymentHashB64url = Buffer.alloc(32, 7).toString('base64url');
  const seen = {};
  const { server, url } = await startMockServer((req, res) => {
    seen.path = req.url;
    seen.macaroon = req.headers['grpc-metadata-macaroon'];
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen.body = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ payment_request: 'lntbs...', add_index: '12', payment_addr: Buffer.alloc(32, 1).toString('base64') }));
    });
  });

  const client = new LndRestClient({ name: 'gateway', restUrl: url, macaroonHex: '00ff' });
  const invoice = await client.addHoldInvoice({ paymentHashB64url, amountSats: 350, cltvExpiry: 64, memo: 'test' });

  assert.equal(seen.path, '/v2/invoices/hodl');
  assert.equal(seen.macaroon, '00ff');
  assert.equal(seen.body.hash, conversions.b64urlToB64(paymentHashB64url));
  assert.equal(seen.body.value, '350');
  assert.equal(seen.body.cltv_expiry, '64');
  assert.equal(invoice.paymentHashB64url, paymentHashB64url);
  server.close();
});

test('LND REST client parses SendPaymentV2 stream frames', async () => {
  const preimage = Buffer.alloc(32, 9).toString('base64');
  const { server, url } = await startMockServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify({ result: { status: 'IN_FLIGHT' } }) + '\n');
    res.write(JSON.stringify({ result: { status: 'SUCCEEDED', payment_preimage: preimage, fee_sat: '1' } }) + '\n');
    res.end();
  });

  const client = new LndRestClient({ name: 'agent', restUrl: url, macaroonHex: '00ff' });
  const result = await client.sendPaymentV2({ paymentRequest: 'lntbs...', feeLimitSat: 2, timeoutSeconds: 1 });

  assert.equal(result.final.status, 'SUCCEEDED');
  assert.equal(result.final.preimageB64url, Buffer.from(preimage, 'base64').toString('base64url'));
  assert.equal(result.updates.length, 2);
  server.close();
});
