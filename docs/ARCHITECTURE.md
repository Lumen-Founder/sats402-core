# SATS-402 Architecture v0.4

## Core thesis

SATS-402 is a Bitcoin-native x402-style payment facilitator for AI-agent API commerce.

It does not assume raw Lightning routing is always reliable. It assumes the opposite and turns routing, liquidity, CLTV safety, and response delivery into the product surface.

## v0.4 change

The project now has two execution planes:

```txt
Controlled Plane
  └─ deterministic Lightning harness for hostile/failure scenarios

Mutinynet Live Plane
  └─ real LND REST calls for AddInvoice, AddHoldInvoice, QueryRoutes, SendPaymentV2, LookupInvoice, SettleInvoice
```

## Live path

```txt
Agent SDK
  -> SATS402-REQUEST envelope
  -> Merchant response encryption
  -> Merchant LND AddInvoice(r_preimage=S)
  -> Gateway LND DecodePayReq + QueryRoutes
  -> CLTV Safety Controller
  -> Gateway LND AddHoldInvoice(hash=H)
  -> Agent LND SendPaymentV2(gateway hold invoice)
  -> Gateway LND SendPaymentV2(merchant invoice)
  -> Gateway observes S from outgoing payment
  -> Gateway LND SettleInvoice(S)
  -> Agent obtains S
  -> Agent decrypts response locally
```

## Safety invariant

```txt
E_agent_to_gateway >= E_gateway_to_merchant_first_hop + Δbridge_safety
```

The Gateway must never bridge blind. It must decode the merchant invoice, query/preflight the outgoing route, calculate first-hop CLTV exposure, and only then issue the Agent-facing hold invoice.

## Layers

```txt
Application Layer
  └─ Merchant API / MCP Server

SATS-402 Server SDK
  ├─ Request envelope parser
  ├─ Response encryptor
  ├─ Payment requirement generator
  ├─ Idempotency cache
  └─ Delivery receipt signer

SATS-402 Facilitator
  ├─ x402-compatible verification interface
  ├─ Same-hash HTLC bridge
  ├─ Asymmetric CLTV Safety Controller
  ├─ Liquidity Manager
  ├─ Merchant risk engine
  └─ Receipt engine

Lightning Layer
  ├─ LND REST adapter
  ├─ Direct channels
  ├─ Hold invoices
  ├─ Route planner
  └─ Preimage observer

Client SDK
  ├─ Preemptive SATS402-REQUEST envelope
  ├─ Ephemeral key generation
  ├─ Wallet payment adapter
  ├─ Preimage capture
  ├─ Response decryption
  └─ Retry/idempotency manager
```

## What is simulated

The controlled harness still simulates:

- forced route failure
- unsafe CLTV rejection
- late reveal watchlist
- semantic garbage boundary

These are intentional fault-injection tools.

## What is live

The live path uses real LND nodes for:

- merchant invoice creation with supplied preimage
- gateway hold invoice creation
- route query / CLTV preflight
- Agent payment to Gateway
- Gateway payment to Merchant
- Gateway settlement of incoming hold invoice
