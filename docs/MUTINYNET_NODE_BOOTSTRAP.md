# SATS-402 Mutinynet Node Bootstrap

This is the Windows Git Bash path for the local Mutinynet/LND live demo.

```bash
cd /c/Users/kkk/Desktop/sats402-mutinynet-live-demo
npm install
npm run nodes:bootstrap
npm run mutinynet:doctor
npm run nodes:addresses
```

Fund the Agent and Gateway addresses at:

```txt
https://faucet.mutinynet.com/
```

Then run:

```bash
npm run nodes:connect
npm run nodes:status
npm run mutinynet:live
```

## What Bootstrap Does

`npm run nodes:bootstrap`:

1. Starts `bitcoind`, Agent LND, Gateway LND, and Merchant LND from `docker-compose.nodes.yml`.
2. Waits for the containers to be running.
3. Creates or unlocks each local LND wallet.
4. Stores local test-only wallet passwords and seeds under `secrets/{role}/`.
5. Exports each node's local `tls.cert` and `admin.macaroon`.
6. Writes `.env.mutinynet`.
7. Runs `npm run mutinynet:doctor`.

No mainnet is used. Do not download or borrow macaroons; the local Docker LND nodes generate their own credentials.

## Generated Local Files

```txt
secrets/agent/admin.macaroon
secrets/agent/tls.cert
secrets/agent/seed.txt
secrets/agent/wallet-password.txt
secrets/gateway/admin.macaroon
secrets/gateway/tls.cert
secrets/gateway/seed.txt
secrets/gateway/wallet-password.txt
secrets/merchant/admin.macaroon
secrets/merchant/tls.cert
secrets/merchant/seed.txt
secrets/merchant/wallet-password.txt
.env.mutinynet
```

These files are ignored by git.

## Useful Commands

```bash
npm run nodes:logs
npm run nodes:status
npm run nodes:reset
```

`nodes:reset` runs `docker compose -f docker-compose.nodes.yml down -v`. It resets Docker node data; local files under `secrets/` remain unless you delete them yourself.

## Troubleshooting

If `.env.mutinynet` is missing:

```bash
npm run nodes:bootstrap
```

If `admin.macaroon` is missing:

```bash
npm run nodes:init
npm run nodes:export
docker logs sats402-lnd-agent --tail 120
```

If a wallet is locked:

```bash
npm run nodes:init
```

If there are no active channels:

```bash
npm run nodes:addresses
# fund Agent and Gateway at https://faucet.mutinynet.com/
npm run nodes:connect
npm run nodes:status
```

If `mutinynet:live` cannot find a route, wait for channel confirmation and rerun:

```bash
npm run nodes:status
npm run mutinynet:live
```

