import { CONFIG } from '../config.js';
import { preflightBridge } from './cltv.js';

export class Sats402Gateway {
  constructor({ lightning, currentHeight = CONFIG.currentBlockHeight, bridgeSafetyDelta = CONFIG.bridgeSafetyDelta } = {}) {
    this.lightning = lightning;
    this.currentHeight = currentHeight;
    this.bridgeSafetyDelta = bridgeSafetyDelta;
    this.merchantRisk = new Map();
    this.inflight = new Map();
  }

  prepareBridge({ merchantId, merchantInvoice, amountSats, requestedIncomingExpiry = null, routeMode = 'controlled_direct', forceRouteFailure = false }) {
    const firstRoute = this.lightning.routePlan({ mode: routeMode, amountSats, fail: forceRouteFailure });
    const routeAttempts = [firstRoute];

    let activeRoute = firstRoute;
    let fallbackUsed = false;
    if (!firstRoute.ok && routeMode !== 'controlled_direct') {
      activeRoute = this.lightning.routePlan({ mode: 'controlled_direct', amountSats });
      routeAttempts.push(activeRoute);
      fallbackUsed = true;
    }
    if (!activeRoute.ok) {
      return {
        ok: false,
        error: activeRoute.failure || 'ROUTE_FAILED',
        routeAttempts,
        gatewayInvoice: null,
        preflight: null,
        fallbackUsed
      };
    }

    const preflight = preflightBridge({
      currentHeight: this.currentHeight,
      route: activeRoute,
      merchantInvoice,
      requestedIncomingExpiry,
      bridgeSafetyDelta: this.bridgeSafetyDelta,
      policy: CONFIG.cltvPolicy
    });

    if (!preflight.ok) {
      return {
        ok: false,
        error: preflight.error,
        route: activeRoute,
        routeAttempts,
        preflight,
        gatewayInvoice: null,
        fallbackUsed
      };
    }

    const gatewayInvoice = this.lightning.createHoldInvoice({
      owner: 'sats402-gateway-us-1',
      amountSats,
      paymentHashB64url: merchantInvoice.paymentHashB64url,
      finalCltvDelta: preflight.incomingExpiry - this.currentHeight,
      memo: 'SATS-402 same-hash incoming hold invoice with asymmetric CLTV'
    });

    const bridge = {
      ok: true,
      id: `bridge_${gatewayInvoice.id}_${merchantInvoice.id}`,
      merchantId,
      route: activeRoute,
      routeAttempts,
      fallbackUsed,
      merchantInvoiceId: merchantInvoice.id,
      gatewayInvoice,
      preflight,
      state: 'BRIDGE_PREPARED',
      creditExtended: false,
      sameHashBridge: gatewayInvoice.paymentHashB64url === merchantInvoice.paymentHashB64url
    };

    this.inflight.set(bridge.id, bridge);
    return bridge;
  }

  executeBridge({ bridge, merchantInvoice, preimageB64url, revealDelayMs = 0 }) {
    if (!bridge?.ok) {
      return { ok: false, state: 'BRIDGE_NOT_OPENED', error: bridge?.error || 'UNKNOWN_BRIDGE_ERROR' };
    }

    const risk = this.riskFor(bridge.merchantId);
    const lateReveal = revealDelayMs > CONFIG.cltvPolicy.lateRevealMs;

    this.lightning.acceptInvoice(bridge.gatewayInvoice.id, { payer: 'agent' });
    this.lightning.acceptInvoice(merchantInvoice.id, { payer: 'sats402-gateway-us-1' });

    const outgoing = this.lightning.settleInvoice(merchantInvoice.id, { preimageB64url });
    const incoming = this.lightning.settleInvoice(bridge.gatewayInvoice.id, { preimageB64url });

    bridge.state = lateReveal ? 'SETTLED_WITH_LATE_REVEAL' : 'SETTLED';
    bridge.revealDelayMs = revealDelayMs;

    if (lateReveal) {
      risk.lateRevealStrikes += 1;
      risk.status = risk.lateRevealStrikes >= 3 ? 'BRIDGE_DEGRADED' : 'WATCHLIST';
    }

    return {
      ok: true,
      state: bridge.state,
      preimageB64url,
      sameHashBridge: bridge.sameHashBridge,
      incomingInvoice: incoming,
      outgoingInvoice: outgoing,
      creditExtended: false,
      fallbackUsed: bridge.fallbackUsed,
      cltv: bridge.preflight.cltv,
      route: bridge.route,
      routeAttempts: bridge.routeAttempts,
      merchantRisk: { ...risk }
    };
  }

  riskFor(merchantId) {
    if (!this.merchantRisk.has(merchantId)) {
      this.merchantRisk.set(merchantId, {
        merchantId,
        status: 'GOOD',
        lateRevealStrikes: 0,
        maxInflightHtlcs: CONFIG.cltvPolicy.maxInflightHtlcsPerMerchant,
        maxInflightSats: CONFIG.cltvPolicy.maxInflightSatsPerMerchant
      });
    }
    return this.merchantRisk.get(merchantId);
  }
}
