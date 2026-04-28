import { CONFIG } from '../config.js';
import { randomId, sha256B64url, randomBytesB64url, verifyPaymentHash } from './crypto.js';

export class LightningSim {
  constructor({ currentHeight = CONFIG.currentBlockHeight } = {}) {
    this.currentHeight = currentHeight;
    this.invoices = new Map();
    this.events = [];
  }

  createPreimage() {
    const preimageB64url = randomBytesB64url(32);
    return { preimageB64url, paymentHashB64url: sha256B64url(Buffer.from(preimageB64url, 'base64url')) };
  }

  createInvoice({ owner, amountSats, paymentHashB64url, finalCltvDelta = 40, memo = 'sats402 merchant invoice', kind = 'regular' }) {
    const invoice = {
      id: randomId(kind === 'hold' ? 'holdinv' : 'inv'),
      owner,
      amountSats,
      paymentHashB64url,
      finalCltvDelta,
      memo,
      kind,
      status: 'OPEN',
      createdBlock: this.currentHeight,
      acceptedAt: null,
      settledAt: null,
      preimageB64url: null
    };
    this.invoices.set(invoice.id, invoice);
    this.events.push({ type: 'invoice_created', invoiceId: invoice.id, owner, kind, paymentHashB64url, amountSats });
    return invoice;
  }

  createHoldInvoice(args) {
    return this.createInvoice({ ...args, kind: 'hold', memo: args.memo || 'sats402 gateway hold invoice' });
  }

  acceptInvoice(invoiceId, { payer = 'agent' } = {}) {
    const invoice = this.requireInvoice(invoiceId);
    if (invoice.status !== 'OPEN') throw new Error(`INVOICE_NOT_OPEN:${invoice.status}`);
    invoice.status = 'ACCEPTED';
    invoice.acceptedAt = Date.now();
    this.events.push({ type: 'invoice_accepted', invoiceId, payer });
    return invoice;
  }

  settleInvoice(invoiceId, { preimageB64url }) {
    const invoice = this.requireInvoice(invoiceId);
    if (!['OPEN', 'ACCEPTED'].includes(invoice.status)) throw new Error(`INVOICE_NOT_SETTLEABLE:${invoice.status}`);
    if (!verifyPaymentHash({ preimageB64url, paymentHashB64url: invoice.paymentHashB64url })) {
      throw new Error('PREIMAGE_DOES_NOT_MATCH_PAYMENT_HASH');
    }
    invoice.status = 'SETTLED';
    invoice.preimageB64url = preimageB64url;
    invoice.settledAt = Date.now();
    this.events.push({ type: 'invoice_settled', invoiceId, owner: invoice.owner, paymentHashB64url: invoice.paymentHashB64url });
    return invoice;
  }

  failInvoice(invoiceId, reason = 'FAILED') {
    const invoice = this.requireInvoice(invoiceId);
    invoice.status = 'FAILED';
    invoice.failureReason = reason;
    this.events.push({ type: 'invoice_failed', invoiceId, reason });
    return invoice;
  }

  requireInvoice(invoiceId) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`INVOICE_NOT_FOUND:${invoiceId}`);
    return invoice;
  }

  routePlan({ mode = 'controlled_direct', amountSats = 350, fail = false } = {}) {
    if (fail) {
      return {
        mode,
        ok: false,
        failure: 'NO_ROUTE',
        amountSats,
        totalCltvDelta: null,
        estimatedLatencyMs: 0,
        feeSats: null
      };
    }

    if (mode === 'controlled_direct') {
      return { mode, ok: true, amountSats, totalCltvDelta: 24, estimatedLatencyMs: 420, feeSats: 0 };
    }
    if (mode === 'gateway_relay') {
      return { mode, ok: true, amountSats, totalCltvDelta: 42, estimatedLatencyMs: 760, feeSats: 1 };
    }
    if (mode === 'public_multi_hop') {
      return { mode, ok: true, amountSats, totalCltvDelta: 72, estimatedLatencyMs: 1_450, feeSats: 3 };
    }
    return { mode, ok: true, amountSats, totalCltvDelta: 48, estimatedLatencyMs: 950, feeSats: 2 };
  }
}
