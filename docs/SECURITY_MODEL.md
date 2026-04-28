# Security Model

## Threats addressed

| Threat | Control |
|---|---|
| Agent views response without payment | Response-Locked Encryption |
| Facilitator decrypts response | ECDH + preimage-derived key; facilitator lacks ECDH private key |
| Merchant receives payment before exposing key | Same-hash HTLC bridge exposes preimage only on settlement |
| Gateway balance-sheet exposure | Core path has no credit extension |
| CLTV griefing | Asymmetric CLTV Safety Controller |
| Route failure | Gateway route cascade and fallback policy |
| Late preimage reveal | Merchant risk scoring and bridge degradation |
| Replay / duplicate charges | payment_id + request_hash cache |

## Threats not fully solved by cryptography

| Threat | Why it remains |
|---|---|
| Semantic garbage response | Cryptography proves delivery, not quality |
| Expensive compute pre-work | Requires hold_compute mode or milestone payments |
| Streaming sessions | Requires chunked settlement or session budget |
| External side effects | Requires AP2-style authorization and merchant SLA |

## Non-goals

- No custodial wallet in core demo
- No stablecoin routing dependency
- No Taproot Assets dependency in first investor demo
- No Base/EVM fallback
- No default credit guarantee
- No semantic arbitration at protocol layer
