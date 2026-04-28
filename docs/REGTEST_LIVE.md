# Regtest Live Mode

## Purpose

Regtest is the recommended investor demo path. It proves the real SATS-402 Lightning flow with local infrastructure only:

```txt
local bitcoind regtest
Agent LND -> Gateway LND -> Merchant LND
real AddInvoice, AddHoldInvoice, SendPaymentV2, SettleInvoice
real preimage observed
local API response decryption
```

No faucet, no Mutinynet sync, and no unbounded waits.

## Commands

```bash
npm install
npm run demo:real
npm run dev
```

Open:

```txt
http://localhost:4020
```

Manual commands:

```bash
npm run regtest:bootstrap
npm run regtest:doctor
npm run regtest:status
npm run regtest:live
npm run regtest:reset
```

## Bootstrap

`npm run regtest:bootstrap` starts `docker-compose.regtest.yml`, initializes or unlocks three local LND wallets, exports local secrets to `secrets-regtest`, writes `.env.regtest`, mines spendable regtest BTC, funds Agent and Gateway, opens the two required channels, mines confirmations, and runs the doctor.

Expected live topology:

```txt
Agent -> Gateway: active
Gateway -> Merchant: active
```

## Mutinynet

Mutinynet remains available for public-chain realism:

```bash
npm run nodes:bootstrap
npm run mutinynet:doctor
npm run nodes:addresses
# fund Agent/Gateway from https://faucet.mutinynet.com/
npm run nodes:connect
npm run mutinynet:live
```

Use regtest for a reliable meeting demo. Use Mutinynet as optional secondary proof.
