#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

wait_for_container() {
  local container="$1"
  local waited=0
  while [ "$waited" -lt 120 ]; do
    if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" = "true" ]; then
      echo "[${container}] running"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  echo "ERROR: ${container} did not reach running state."
  echo "Next: docker logs ${container} --tail 120"
  return 1
}

echo "[SATS-402] Starting Mutinynet bitcoind + Agent/Gateway/Merchant LND nodes..."
docker compose -f docker-compose.nodes.yml up -d

echo ""
echo "[SATS-402] Waiting for containers..."
wait_for_container sats402-bitcoind-mutinynet
wait_for_container sats402-lnd-agent
wait_for_container sats402-lnd-gateway
wait_for_container sats402-lnd-merchant

echo ""
echo "[SATS-402] Initializing or unlocking LND wallets..."
node scripts/mutinynet-nodes-init-wallets.js

echo ""
echo "[SATS-402] Exporting local TLS certs and admin macaroons..."
bash scripts/mutinynet-nodes-export-secrets.sh

echo ""
echo "[SATS-402] Running Mutinynet doctor..."
if node scripts/mutinynet-doctor.js; then
  echo ""
  echo "[SATS-402] Bootstrap OK."
  echo "Next:"
  echo "  npm run nodes:addresses"
else
  echo ""
  echo "[SATS-402] Bootstrap created/loaded the nodes, but doctor is not ready yet."
  echo "Next:"
  echo "  npm run nodes:logs"
  echo "  npm run mutinynet:doctor"
  exit 1
fi

