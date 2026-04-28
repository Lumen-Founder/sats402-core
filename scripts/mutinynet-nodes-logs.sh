#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

docker compose -f docker-compose.nodes.yml logs --tail="${SATS402_NODE_LOG_TAIL:-120}" bitcoind lnd-agent lnd-gateway lnd-merchant

