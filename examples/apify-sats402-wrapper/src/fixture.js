export function fixtureApifyActorResult({
  actorId = 'apify/rag-web-browser',
  query = 'bitcoin lightning agent payments'
} = {}) {
  const items = [
    {
      title: 'Lightning-native paid delivery for agents',
      url: 'https://example.invalid/lightning-agent-payments',
      query,
      summary: 'Fixture item showing how an Actor result can be encrypted until a Lightning preimage is observed.',
      score: 0.98
    },
    {
      title: 'SATS-402 same-hash bridge',
      url: 'https://example.invalid/sats402-bridge',
      query,
      summary: 'Fixture item for local verification without an Apify API token.',
      score: 0.95
    }
  ];

  return {
    mode: 'fixture',
    upstream_called: true,
    actor_id: actorId,
    run_id: 'fixture-run-apify-sats402',
    dataset_id: 'fixture-dataset-apify-sats402',
    items,
    input: {
      query,
      maxResults: 3
    },
    endpoint: 'fixture://apify/acts/run-sync-get-dataset-items',
    sync: true
  };
}
