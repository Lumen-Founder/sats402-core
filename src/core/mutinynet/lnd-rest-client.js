import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export function b64urlToB64(value) {
  return Buffer.from(value, 'base64url').toString('base64');
}

export function b64ToB64url(value) {
  return Buffer.from(value, 'base64').toString('base64url');
}

export function b64urlToHex(value) {
  return Buffer.from(value, 'base64url').toString('hex');
}

export function hexToB64url(value) {
  return Buffer.from(value, 'hex').toString('base64url');
}

function normalizeBaseUrl(restUrl) {
  if (!restUrl) throw new Error('LND_REST_URL_REQUIRED');
  return restUrl.endsWith('/') ? restUrl.slice(0, -1) : restUrl;
}

function readMaybe(path) {
  if (!path) return null;
  return fs.readFileSync(path);
}

function loadMacaroonHex({ macaroonHex, macaroonPath }) {
  if (macaroonHex) return macaroonHex.trim();
  if (macaroonPath) return fs.readFileSync(macaroonPath).toString('hex');
  throw new Error('LND_MACAROON_REQUIRED');
}

function parseJsonSafe(text) {
  if (!text) return {};
  return JSON.parse(text);
}

function extractResult(obj) {
  if (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, 'result')) return obj.result;
  return obj;
}

function extractError(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.error) return obj.error;
  if (obj.message && obj.code) return obj;
  return null;
}

export class LndRestClient {
  constructor({ name, restUrl, macaroonPath, macaroonHex, tlsCertPath, rejectUnauthorized = false } = {}) {
    this.name = name || 'lnd';
    this.baseUrl = normalizeBaseUrl(restUrl);
    this.macaroonHex = loadMacaroonHex({ macaroonHex, macaroonPath });
    this.tlsCert = readMaybe(tlsCertPath);
    this.rejectUnauthorized = Boolean(rejectUnauthorized);
  }

  async getInfo() { return this.request('GET', '/v1/getinfo'); }
  async walletBalance() { return this.request('GET', '/v1/balance/blockchain'); }
  async channelBalance() { return this.request('GET', '/v1/balance/channels'); }
  async listChannels() { return this.request('GET', '/v1/channels'); }
  async decodePayReq(paymentRequest) { return this.request('GET', `/v1/payreq/${encodeURIComponent(paymentRequest)}`); }

  async queryRoutes({ pubKey, amountSats, finalCltvDelta, feeLimitSat = 25 }) {
    const qs = new URLSearchParams();
    if (finalCltvDelta !== undefined) qs.set('final_cltv_delta', String(finalCltvDelta));
    qs.set('fee_limit.fixed', String(feeLimitSat));
    qs.set('use_mission_control', 'true');
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request('GET', `/v1/graph/routes/${pubKey}/${amountSats}${suffix}`);
  }

  async addInvoiceWithPreimage({ preimageB64url, amountSats, memo, expirySeconds = 180, cltvExpiry = 40, privateInvoice = false }) {
    const invoice = await this.request('POST', '/v1/invoices', {
      memo,
      r_preimage: b64urlToB64(preimageB64url),
      value: String(amountSats),
      expiry: String(expirySeconds),
      cltv_expiry: String(cltvExpiry),
      private: Boolean(privateInvoice)
    });
    return this.normalizeInvoice(invoice, { owner: this.name, kind: 'regular', amountSats, finalCltvDelta: cltvExpiry });
  }

  async addHoldInvoice({ paymentHashB64url, amountSats, memo, expirySeconds = 180, cltvExpiry = 80, privateInvoice = false }) {
    const invoice = await this.request('POST', '/v2/invoices/hodl', {
      memo,
      hash: b64urlToB64(paymentHashB64url),
      value: String(amountSats),
      expiry: String(expirySeconds),
      cltv_expiry: String(cltvExpiry),
      private: Boolean(privateInvoice)
    });
    return this.normalizeInvoice(invoice, { owner: this.name, kind: 'hold', amountSats, finalCltvDelta: cltvExpiry, paymentHashB64url });
  }

  async settleHoldInvoice({ preimageB64url }) {
    return this.request('POST', '/v2/invoices/settle', { preimage: b64urlToB64(preimageB64url) });
  }

  async cancelInvoice({ paymentHashB64url }) {
    return this.request('POST', '/v2/invoices/cancel', { payment_hash: b64urlToB64(paymentHashB64url) });
  }

  async sendPaymentV2({ paymentRequest, feeLimitSat = 25, timeoutSeconds = 45 }) {
    const body = { payment_request: paymentRequest, fee_limit_sat: String(feeLimitSat), timeout_seconds: Number(timeoutSeconds) };
    const updates = [];
    let final = null;
    for await (const update of this.stream('POST', '/v2/router/send', body)) {
      const normalized = normalizePaymentUpdate(update);
      updates.push(normalized);
      if (isFinalPaymentState(normalized.status)) {
        final = normalized;
        break;
      }
    }
    if (!final && updates.length > 0) final = updates.at(-1);
    return { final, updates };
  }

  async waitForInvoiceState({ paymentHashB64url, states = ['ACCEPTED', 'SETTLED'], timeoutMs = 120000, pollIntervalMs = 500 }) {
    const wanted = new Set(states);
    const started = Date.now();
    const paymentHashHex = b64urlToHex(paymentHashB64url);
    let last = null;
    while (Date.now() - started < timeoutMs) {
      try {
        const invoice = await this.lookupInvoiceByHashHex(paymentHashHex);
        last = invoice;
        if (wanted.has(invoice.state)) return invoice;
      } catch (err) {
        last = { error: err.message };
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    const e = new Error(`WAIT_FOR_INVOICE_STATE_TIMEOUT:${this.name}:${states.join(',')}`);
    e.last = last;
    throw e;
  }

  async lookupInvoiceByHashHex(paymentHashHex) {
    return this.request('GET', `/v1/invoice/${paymentHashHex}`);
  }

  async request(method, pathname, body = null) {
    const raw = await this.rawRequest(method, pathname, body, { stream: false });
    const parsed = parseJsonSafe(raw);
    const err = extractError(parsed);
    if (err) {
      const e = new Error(`LND_ERROR:${this.name}:${err.message || JSON.stringify(err)}`);
      e.details = err;
      throw e;
    }
    return extractResult(parsed);
  }

  async *stream(method, pathname, body = null) {
    const req = await this.rawRequest(method, pathname, body, { stream: true });
    let buffer = '';
    for await (const chunk of req) {
      buffer += chunk.toString('utf8');
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }
        const err = extractError(parsed);
        if (err) throw new Error(`LND_STREAM_ERROR:${this.name}:${err.message || JSON.stringify(err)}`);
        yield extractResult(parsed);
      }
    }
    const tail = buffer.trim();
    if (tail) {
      try {
        const parsed = JSON.parse(tail);
        const err = extractError(parsed);
        if (err) throw new Error(`LND_STREAM_ERROR:${this.name}:${err.message || JSON.stringify(err)}`);
        yield extractResult(parsed);
      } catch {
        // LND REST streams normally end on JSON boundaries; ignore truncated final frames.
      }
    }
  }

  rawRequest(method, pathname, body = null, { stream = false } = {}) {
    const url = new URL(`${this.baseUrl}${pathname}`);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: { 'Grpc-Metadata-macaroon': this.macaroonHex, 'Content-Type': 'application/json' },
      rejectUnauthorized: this.rejectUnauthorized
    };
    if (this.tlsCert) options.ca = this.tlsCert;
    if (payload) options.headers['Content-Length'] = payload.length;

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        if (stream) {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            let errBody = '';
            res.on('data', (chunk) => { errBody += chunk.toString('utf8'); });
            res.on('end', () => reject(new Error(`LND_HTTP_${res.statusCode}:${this.name}:${errBody}`)));
            return;
          }
          resolve(res);
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`LND_HTTP_${res.statusCode}:${this.name}:${text}`));
            return;
          }
          resolve(text);
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  normalizeInvoice(invoice, fallback = {}) {
    const paymentHashB64url = invoice.r_hash ? b64ToB64url(invoice.r_hash) : fallback.paymentHashB64url;
    return {
      id: invoice.add_index ? `${fallback.kind || 'invoice'}_${invoice.add_index}` : `${fallback.kind || 'invoice'}_${Date.now()}`,
      owner: fallback.owner || this.name,
      amountSats: Number(fallback.amountSats || invoice.value || invoice.num_satoshis || 0),
      paymentHashB64url,
      paymentHashHex: paymentHashB64url ? b64urlToHex(paymentHashB64url) : null,
      finalCltvDelta: Number(fallback.finalCltvDelta || invoice.cltv_expiry || 40),
      paymentRequest: invoice.payment_request,
      payment_request: invoice.payment_request,
      paymentAddr: invoice.payment_addr,
      kind: fallback.kind || 'regular',
      raw: invoice
    };
  }
}

export function normalizePaymentUpdate(update) {
  const u = update?.payment || update || {};
  const status = u.status || u.state || 'UNKNOWN';
  const preimage = u.payment_preimage || u.preimage || u.htlcs?.find((h) => h.preimage)?.preimage || null;
  const paymentHash = u.payment_hash || u.payment_hash_string || null;
  return {
    status,
    paymentHash,
    preimageB64url: normalizeMaybePreimage(preimage),
    feeSat: Number(u.fee_sat || u.fee || 0),
    failureReason: u.failure_reason || u.failure?.failure_reason || null,
    route: u.htlcs?.at(-1)?.route || u.route || null,
    raw: update
  };
}

function normalizeMaybePreimage(preimage) {
  if (!preimage) return null;
  if (/^[0-9a-fA-F]{64}$/.test(preimage)) return hexToB64url(preimage);
  try { return Buffer.from(preimage, 'base64').toString('base64url'); } catch { return preimage; }
}

function isFinalPaymentState(status) {
  return ['SUCCEEDED', 'FAILED', 'UNKNOWN_FAILURE', 'FAILURE_REASON_NO_ROUTE', 'FAILURE_REASON_TIMEOUT'].includes(status);
}

export const conversions = { b64urlToB64, b64ToB64url, b64urlToHex, hexToB64url };
