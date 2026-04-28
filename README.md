# SATS-402

[![Build](https://github.com/Lumen-Founder/sats402-core/actions/workflows/ci.yml/badge.svg)](https://github.com/Lumen-Founder/sats402-core/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.4.0-black.svg)](package.json)

SATS-402 is a Bitcoin-native atomic delivery protocol for invoice-gated API and AI-agent commerce.

## Abstract

SATS-402 binds Lightning payment settlement to deterministic API delivery without custody, accounts, balances, or off-chain credit.

## Architecture

```text
+---------+      HTTP 402       +---------+
|         | ------------------> |         |
| Agent   |                     | Gateway |
|         | <-- invoice + hash -|         |
+----+----+                     +----+----+
     |                               |
     | Lightning payment             | Policy + settlement check
     |                               |
     v                               v
+---------+   preimage proof    +----------+
|         | ------------------> |          |
| LND     |                     | Merchant |
|         |                     |          |
+---------+                     +----------+
```

## Quickstart: Regtest

Run the deterministic local proof.

```bash
npm install
npm run regtest:bootstrap
npm run regtest:live
```

Expected result:

```text
[OK] regtest nodes online
[OK] invoice created
[OK] payment settled
[OK] same-hash delivery verified
[OK] protected payload released
```

## Core Invariants

### Same-Hash Bridge

The payment request and delivery authorization are bound by the same payment hash.

A gateway must not release protected merchant output unless the settled invoice hash matches the delivery challenge.

### Asymmetric CLTV

The payer-facing invoice expiry and merchant-facing delivery window are intentionally asymmetric.

The protocol must leave enough time for settlement observation, retry handling, and deterministic failure before merchant delivery expires.

### No Custody

SATS-402 does not custody funds.

The protocol coordinates payment requirements, invoice verification, and delivery release. Funds settle through the merchant's Lightning node or configured adapter.

### No Accounts

SATS-402 does not require user accounts, balances, sessions, or prepaid credits.

The invoice is the authorization primitive.

### Deterministic Failure

Unpaid, expired, duplicate, malformed, and late-settled requests must fail explicitly.

Silent fallback to free delivery is a protocol violation.

## Repository Layout

```text
src/
  core/              protocol primitives
  core/mutinynet/    LND REST bridge and live node integration
  sdk/               agent and merchant SDK surfaces
  public/            deterministic dashboard

examples/
  firecrawl-sats402-wrapper/
  apify-sats402-wrapper/

test/
  *.test.js          invariant and wrapper tests
```

## Wrappers

- [`sats402-firecrawl`](https://github.com/Lumen-Founder/sats402-firecrawl)
- [`sats402-apify`](https://github.com/Lumen-Founder/sats402-apify)

## Security Model

SATS-402 assumes hostile clients, replay attempts, delayed settlement, malformed invoices, and unreliable upstream APIs.

Production deployments must not expose:

- LND macaroons
- TLS private keys
- wallet seeds
- private channel data
- merchant API secrets
- customer payload data

## Whitepaper

- [`SATS-402 Technical Whitepaper`](docs/SATS-402_Technical_Whitepaper.pdf)

## License

MIT
