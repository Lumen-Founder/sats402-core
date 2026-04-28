# LND REST Adapter

## File

```txt
src/core/mutinynet/lnd-rest-client.js
```

## Design

Zero third-party runtime dependencies. It uses Node.js built-in `http`, `https`, and `fs`.

## Supported calls

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v1/getinfo` | node identity and height |
| GET | `/v1/balance/blockchain` | wallet balance |
| GET | `/v1/balance/channels` | channel balance |
| GET | `/v1/channels` | open channel visibility |
| POST | `/v1/invoices` | merchant invoice with supplied preimage |
| POST | `/v2/invoices/hodl` | gateway same-hash hold invoice |
| GET | `/v1/payreq/{pay_req}` | decode invoice |
| GET | `/v1/graph/routes/{pub_key}/{amt}` | CLTV route preflight |
| POST | `/v2/router/send` | Agent and Gateway payments |
| GET | `/v1/invoice/{r_hash_str}` | poll hold invoice ACCEPTED state |
| POST | `/v2/invoices/settle` | settle Gateway hold invoice with observed preimage |
| POST | `/v2/invoices/cancel` | cleanup on failure |

## Security note

For local Mutinynet demos the adapter can run with `SATS402_MUTINYNET_TLS_REJECT_UNAUTHORIZED=false` because many LND REST endpoints use self-signed TLS certs.

Do not use this setting for production mainnet infrastructure.
