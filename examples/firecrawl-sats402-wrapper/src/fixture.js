export function fixtureFirecrawlScrape({ url = 'https://tvp.fund/philosophy/' } = {}) {
  const targetUrl = new URL(url).toString();
  const markdown = [
    '# TVP Philosophy',
    '',
    'This deterministic fixture stands in for Firecrawl markdown during local SATS-402 testing.',
    '',
    'It proves the wrapper can lock a Firecrawl-shaped response behind a Lightning preimage without requiring a Firecrawl API key.',
    '',
    '- upstream_auth_bypass: false',
    '- upstream_billing_bypass: false',
    '- fixture_mode: true'
  ].join('\n');

  return {
    mode: 'fixture',
    endpoint: 'fixture://firecrawl/v2/scrape',
    request: {
      url: targetUrl,
      formats: ['markdown'],
      onlyMainContent: true
    },
    url: targetUrl,
    markdown,
    metadata: {
      source: 'deterministic-fixture',
      title: 'TVP Philosophy fixture'
    },
    raw_status: true
  };
}
