# SATS-402 Firecrawl Wrapper

This is an unofficial permissionless wrapper proof for Firecrawl MCP/API responses.

It does not bypass Firecrawl auth, Firecrawl billing, Firecrawl API keys, Firecrawl rate limits, or Firecrawl usage limits. Real upstream mode uses a normal `FIRECRAWL_API_KEY` and calls Firecrawl exactly as an upstream customer would:

```http
POST https://api.firecrawl.dev/v2/scrape
Authorization: Bearer <FIRECRAWL_API_KEY>
Content-Type: application/json

{
  "url": "https://tvp.fund/philosophy/",
  "formats": ["markdown"],
  "onlyMainContent": true
}
```

SATS-402 then encrypts the Firecrawl markdown before delivery. The local regtest bridge creates a real LND hold invoice, pays a real merchant invoice, observes the real Lightning preimage, settles the agent-side hold invoice with that same preimage, and decrypts the response locally.

## Run

From the SATS-402 demo repo:

```bash
npm run demo:real
npm run firecrawl:demo:fixture
export FIRECRAWL_API_KEY=...
npm run firecrawl:demo -- --url https://tvp.fund/philosophy/
```

Fixture mode runs without `FIRECRAWL_API_KEY`:

```bash
npm run firecrawl:demo:fixture
```

Real upstream mode requires `FIRECRAWL_API_KEY`:

```bash
npm run firecrawl:demo -- --url https://tvp.fund/philosophy/
```

If the key is missing, the command fails with:

```txt
Missing FIRECRAWL_API_KEY. Run fixture mode or export FIRECRAWL_API_KEY.
```

## Proof Output

The demo output includes:

```json
{
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

- Unofficial wrapper, not endorsed by Firecrawl unless maintainers choose otherwise.
- No Firecrawl auth bypass.
- No Firecrawl billing bypass.
- No Firecrawl API key bypass in real upstream mode.
- No Firecrawl usage-limit bypass.
- No mainnet funds are used by the demo path.
