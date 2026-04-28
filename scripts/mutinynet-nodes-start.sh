#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

echo "[SATS-402] Starting Mutinynet bitcoind + 3 LND nodes..."
docker compose -f docker-compose.nodes.yml up -d

echo ""
echo "[SATS-402] Containers:"
docker compose -f docker-compose.nodes.yml ps

echo ""
echo "Next: npm run nodes:init"
