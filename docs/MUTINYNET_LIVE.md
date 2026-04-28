# Mutinynet Live Mode

## Purpose

This mode upgrades SATS-402 from a deterministic simulator into a controlled live Lightning demo.

For investor demos, use the deterministic local real-LND path first:

```bash
npm run demo:real
```

That command uses local bitcoind regtest and three real LND nodes, so it does not depend on the Mutinynet faucet, public sync, or public infrastructure. Mutinynet remains the optional public-chain realism path.

It still avoids mainnet risk. It uses Mutinynet, a custom Signet used for Lightning application testing, and three LND nodes:

```txt
Agent LND  -> pays Gateway hold invoice
Gateway LND -> bridges same hash and enforces CLTV safety
Merchant LND -> creates invoice with supplied response preimage
```

## Local Node Setup

From Windows Git Bash:

```bash
npm run nodes:bootstrap
npm run mutinynet:doctor
npm run nodes:addresses
# fund Agent/Gateway at https://faucet.mutinynet.com/
npm run nodes:connect
npm run nodes:status
npm run mutinynet:live
```

The scripts load `.env.mutinynet` automatically. The local Docker LND nodes generate their own `tls.cert` and `admin.macaroon` files; do not use mainnet and do not borrow macaroons.

## Live bridge sequence

```txt
Merchant:
  S = random 32-byte preimage
  H = SHA256(S)
  C = Encrypt(response, HKDF(S || ECDH(agent, merchant)))
  LND AddInvoice(r_preimage=S)

Gateway:
  Decode merchant invoice
  QueryRoutes to merchant
  Compute E_out from route total_time_lock
  Compute E_in = E_out + Δsafe
  LND AddHoldInvoice(hash=H, cltv_expiry=E_in-currentHeight)

Agent:
  LND SendPaymentV2(gateway_hold_invoice)

Gateway:
  Wait until hold invoice is ACCEPTED
  LND SendPaymentV2(merchant_invoice)
  Observe S from outgoing payment result
  LND SettleInvoice(preimage=S)

Agent:
  Payment succeeds and returns S
  Decrypt C locally
```

## What is still deliberately controlled

The live path proves the happy-path real primitive:

- real hold invoice
- real outgoing payment
- real preimage settlement
- real local decryption
- real CLTV preflight from LND route data

The following remain deterministic fault harnesses by design:

- forced CLTV griefing rejection
- forced public route failure fallback
- semantic garbage payload
- late reveal watchlist

Those are not hidden. They are presented as protocol-hardening scenarios, not fake mainnet claims.

## Operational requirement

Before a live meeting, make sure:

```txt
Agent has outbound liquidity to Gateway.
Gateway has outbound liquidity to Merchant.
Merchant has inbound liquidity from Gateway.
All three nodes are synced to Mutinynet.
All three LND REST endpoints are reachable from the app process.
Macaroons are read-only only where possible, admin only for demo setup.
```
