# Deployment

## Controlled mode

```bash
npm install
npm run dev
```

Docker:

```bash
docker compose up --build
```

## Mutinynet live mode

```bash
npm run nodes:bootstrap
npm run mutinynet:doctor
npm run nodes:addresses
# fund Agent/Gateway at https://faucet.mutinynet.com/
npm run nodes:connect
npm run nodes:status
npm run mutinynet:live
```

The CLI scripts load `.env.mutinynet` automatically.

Docker app profile:

```bash
docker compose -f docker-compose.mutinynet.yml up --build
```

## Required LND setup

You need three reachable Mutinynet LND nodes with channels:

```txt
Agent   -> Gateway  outbound from Agent / inbound to Gateway
Gateway -> Merchant outbound from Gateway / inbound to Merchant
```

## Environment variables

| Variable | Meaning |
|---|---|
| `MUTINYNET_AGENT_LND_REST` | Agent LND REST URL |
| `MUTINYNET_AGENT_MACAROON_PATH` | Agent admin macaroon path |
| `MUTINYNET_AGENT_TLS_CERT_PATH` | Agent TLS cert path |
| `MUTINYNET_GATEWAY_LND_REST` | Gateway LND REST URL |
| `MUTINYNET_GATEWAY_MACAROON_PATH` | Gateway admin macaroon path |
| `MUTINYNET_GATEWAY_TLS_CERT_PATH` | Gateway TLS cert path |
| `MUTINYNET_MERCHANT_LND_REST` | Merchant LND REST URL |
| `MUTINYNET_MERCHANT_MACAROON_PATH` | Merchant admin macaroon path |
| `MUTINYNET_MERCHANT_TLS_CERT_PATH` | Merchant TLS cert path |
| `SATS402_MUTINYNET_FEE_LIMIT_SATS` | fee limit for SendPaymentV2 |
| `SATS402_BRIDGE_SAFETY_DELTA` | CLTV safety margin in blocks |

## Do not present this as production-ready mainnet infrastructure

The live Mutinynet path proves the core primitive. Production still needs:

- liquidity manager
- channel operations automation
- LSP integration
- merchant risk scoring
- stream/gRPC backpressure hardening
- wallet preimage adapter coverage
- legal posture for any non-core optimistic fast path
