const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';

export class MissingFirecrawlApiKeyError extends Error {
  constructor() {
    super('Missing FIRECRAWL_API_KEY. Run fixture mode or export FIRECRAWL_API_KEY.');
    this.name = 'MissingFirecrawlApiKeyError';
  }
}

function assertScrapeUrl(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Firecrawl scrape URL must use http or https.');
  }
  return parsed.toString();
}

function extractMarkdown(json) {
  const data = json?.data || json;
  if (typeof data?.markdown === 'string') return data.markdown;
  if (typeof data?.content === 'string') return data.content;
  return '';
}

export async function scrapeWithFirecrawl({
  url,
  apiKey = process.env.FIRECRAWL_API_KEY,
  fetchImpl = globalThis.fetch
}) {
  if (!apiKey) throw new MissingFirecrawlApiKeyError();
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available.');

  const targetUrl = assertScrapeUrl(url);
  const body = {
    url: targetUrl,
    formats: ['markdown'],
    onlyMainContent: true
  };

  const response = await fetchImpl(FIRECRAWL_SCRAPE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const snippet = text ? ` ${text.replace(/\s+/g, ' ').slice(0, 300)}` : '';
    throw new Error(`Firecrawl scrape failed: HTTP ${response.status} ${response.statusText || ''}${snippet}`);
  }

  const json = await response.json();
  const markdown = extractMarkdown(json);
  if (!markdown) throw new Error('Firecrawl scrape response did not include markdown.');

  return {
    mode: 'real',
    endpoint: FIRECRAWL_SCRAPE_URL,
    request: body,
    url: targetUrl,
    markdown,
    metadata: json?.data?.metadata || json?.metadata || null,
    raw_status: json?.success === undefined ? 'unknown' : Boolean(json.success)
  };
}

export { FIRECRAWL_SCRAPE_URL };
