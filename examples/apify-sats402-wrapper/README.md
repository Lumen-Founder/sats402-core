# SATS-402 Apify Wrapper

This is an unofficial, permissionless, non-invasive SATS-402 wrapper proof for Apify Actor results.

Apify already leads in agentic payments with x402/Skyfire. SATS-402 demonstrates an optional Bitcoin-native paid-delivery path for Actor results using Lightning preimage-locked response delivery.

It does not bypass Apify auth, billing, API tokens, usage limits, or rate limits. Real upstream mode uses a normal Apify API token through `APIFY_TOKEN`, or `APIFY_API_TOKEN` as an alias.

## Run

From the SATS-402 demo repo:

```bash
npm run demo:real
npm run apify:demo:fixture
export APIFY_TOKEN=...
npm run apify:demo -- --actor apify/rag-web-browser --query "bitcoin lightning agent payments"
```

Fixture mode runs without `APIFY_TOKEN`:

```bash
npm run apify:demo:fixture
```

Real upstream mode requires `APIFY_TOKEN`:

```bash
npm run apify:demo -- --actor apify/rag-web-browser --query "bitcoin lightning agent payments"
```

If the token is missing, the command fails with:

```txt
Missing APIFY_TOKEN. Run fixture mode or export APIFY_TOKEN.
```

## Proof Output

The demo output includes:

```json
{
  "ok": true,
  "target": "apify",
  "mode": "fixture",
  "same_hash_bridge": true,
  "cltv_safety_check": "passed",
  "preimage_observed": true,
  "response_decrypted_locally": true,
  "receipt_issued": true,
  "custody": false,
  "credit_extended": false
}
```

## Boundaries

- Unofficial wrapper, not endorsed by Apify unless maintainers choose otherwise.
- Complements Apify x402/Skyfire; it is not a replacement claim.
- No Apify auth bypass.
- No Apify billing bypass.
- No Apify API token bypass in real upstream mode.
- No Apify usage-limit or rate-limit bypass.
- No mainnet funds are used by the demo path.
