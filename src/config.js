export const CONFIG = {
  port: Number(process.env.PORT || 4020),
  protocolVersion: '0.4-mutinynet',
  demoMode: process.env.SATS402_DEMO_MODE || 'hybrid',
  lightningBackend: process.env.SATS402_LIGHTNING_BACKEND || 'sim',
  currentBlockHeight: Number(process.env.SATS402_CURRENT_BLOCK_HEIGHT || 840000),
  bridgeSafetyDelta: Number(process.env.SATS402_BRIDGE_SAFETY_DELTA || 18),
  defaultMaxPriceUsd: process.env.SATS402_DEFAULT_MAX_PRICE_USD || '0.01',
  maxResponseBytes: Number(process.env.SATS402_MAX_RESPONSE_BYTES || 1_000_000),
  crypto: {
    curve: 'secp256k1',
    kdf: 'HKDF-SHA256',
    aead: 'AES-256-GCM',
    info: 'sats402-response-v0.4-mutinynet'
  },
  cltvPolicy: {
    minBridgeSafetyDelta: Number(process.env.SATS402_MIN_BRIDGE_SAFETY_DELTA || 18),
    maxMerchantFinalCltvDelta: Number(process.env.SATS402_MAX_MERCHANT_FINAL_CLTV_DELTA || 144),
    maxBridgeTotalCltvDelta: Number(process.env.SATS402_MAX_BRIDGE_TOTAL_CLTV_DELTA || 288),
    maxInflightHtlcsPerMerchant: Number(process.env.SATS402_MAX_INFLIGHT_HTLCS || 25),
    maxInflightSatsPerMerchant: Number(process.env.SATS402_MAX_INFLIGHT_SATS || 250_000),
    lateRevealMs: Number(process.env.SATS402_LATE_REVEAL_MS || 3_000)
  },
  mutinynet: {
    network: 'mutinynet-custom-signet',
    blockTargetSeconds: 30,
    signetChallenge: '512102f7561d208dd9ae99bf497273e16f389bdbd6c4742ddb8e6b216e64fa2928ad8f51ae',
    seedNode: '45.79.52.207:38333',
    faucetLightningNode: '02465ed5be53d04fde66c9418ff14a5f2267723810176c9212b722e542dc1afb1b@45.79.52.207:9735',
    esploraUrl: process.env.MUTINYNET_ESPLORA_URL || 'https://mutinynet.com/api',
    explorerUrl: process.env.MUTINYNET_EXPLORER_URL || 'https://mutinynet.com',
    invoiceExpirySeconds: Number(process.env.SATS402_MUTINYNET_INVOICE_EXPIRY_SECONDS || 180),
    feeLimitSat: Number(process.env.SATS402_MUTINYNET_FEE_LIMIT_SATS || 25),
    paymentTimeoutSeconds: Number(process.env.SATS402_MUTINYNET_PAYMENT_TIMEOUT_SECONDS || 45),
    pollIntervalMs: Number(process.env.SATS402_MUTINYNET_POLL_INTERVAL_MS || 500),
    pollTimeoutMs: Number(process.env.SATS402_MUTINYNET_POLL_TIMEOUT_MS || 120_000),
    liveAmountSats: Number(process.env.SATS402_MUTINYNET_AMOUNT_SATS || 350),
    merchantId: process.env.SATS402_MERCHANT_ID || 'merchant-premium-mcp-mutinynet-001',
    tlsRejectUnauthorized: String(process.env.SATS402_MUTINYNET_TLS_REJECT_UNAUTHORIZED || 'false') === 'true'
  },
  regtest: {
    network: 'regtest',
    blockTargetSeconds: 1,
    invoiceExpirySeconds: Number(process.env.SATS402_REGTEST_INVOICE_EXPIRY_SECONDS || 180),
    feeLimitSat: Number(process.env.SATS402_REGTEST_FEE_LIMIT_SATS || 25),
    paymentTimeoutSeconds: Number(process.env.SATS402_REGTEST_PAYMENT_TIMEOUT_SECONDS || 45),
    pollIntervalMs: Number(process.env.SATS402_REGTEST_POLL_INTERVAL_MS || 500),
    pollTimeoutMs: Number(process.env.SATS402_REGTEST_POLL_TIMEOUT_MS || 120_000),
    liveAmountSats: Number(process.env.SATS402_REGTEST_AMOUNT_SATS || 350),
    merchantId: process.env.SATS402_REGTEST_MERCHANT_ID || 'merchant-premium-mcp-regtest-001',
    tlsRejectUnauthorized: String(process.env.SATS402_REGTEST_TLS_REJECT_UNAUTHORIZED || 'false') === 'true'
  }
};
