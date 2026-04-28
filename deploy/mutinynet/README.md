# Mutinynet node notes

This repository does not ship private node state. Bring your own Mutinynet LND nodes or run them externally.

Included files:

```txt
bitcoin.conf          # Mutinynet custom Signet config
lnd.conf.template     # LND config template for a bitcoind-backed node
```

The easier pitch path is to run three external Mutinynet LND nodes, expose their REST endpoints locally, and point `.env.mutinynet` at them.

Required topology:

```txt
Agent   -> Gateway  channel with enough outbound liquidity from Agent
Gateway -> Merchant channel with enough outbound liquidity from Gateway
```

Before the pitch:

```bash
npm run mutinynet:doctor
npm run mutinynet:live
```
