#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

resolve_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  if [ -n "${npm_node_execpath:-}" ]; then
    printf '%s\n' "${npm_node_execpath}"
    return 0
  fi
  if command -v node.exe >/dev/null 2>&1; then
    command -v node.exe
    return 0
  fi
  return 1
}

NODE_BIN="$(resolve_node || true)"

fail() {
  echo ""
  echo "[SATS-402] Regtest bootstrap FAIL: $1"
  echo "Next: $2"
  exit 1
}

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
  fail "${container} did not reach running state." "docker logs ${container} --tail 120"
}

btc() {
  docker exec sats402-bitcoind-regtest bitcoin-cli -regtest -rpcuser=sats402 -rpcpassword=sats402 "$@"
}

wait_for_bitcoind() {
  local waited=0
  while [ "$waited" -lt 120 ]; do
    if btc getblockchaininfo >/dev/null 2>&1; then
      echo "[bitcoind] RPC ready"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  fail "bitcoind RPC did not become ready." "docker logs sats402-bitcoind-regtest --tail 120"
}

if docker network inspect sats402-regtest >/dev/null 2>&1; then
  if ! docker ps -a --filter network=sats402-regtest --format '{{.Names}}' | grep -q .; then
    docker network rm sats402-regtest >/dev/null 2>&1 || true
  fi
fi

echo "[SATS-402] Starting local regtest bitcoind + Agent/Gateway/Merchant LND nodes..."
docker compose -f docker-compose.regtest.yml up -d

echo ""
echo "[SATS-402] Waiting for containers..."
wait_for_container sats402-bitcoind-regtest
wait_for_container sats402-lnd-agent-regtest
wait_for_container sats402-lnd-gateway-regtest
wait_for_container sats402-lnd-merchant-regtest
wait_for_bitcoind

echo ""
echo "[SATS-402] Initializing or unlocking regtest LND wallets..."
[ -n "$NODE_BIN" ] || fail "Node.js was not found inside bash." "npm install"
"$NODE_BIN" scripts/regtest-init-wallets.js || fail "LND wallet initialization failed." "npm run regtest:status"

echo ""
echo "[SATS-402] Exporting local regtest TLS certs and admin macaroons..."
bash scripts/regtest-export-secrets.sh || fail "could not export regtest LND secrets." "npm run regtest:bootstrap"

echo ""
echo "[SATS-402] Mining regtest funds and opening real LND channels..."
bash scripts/regtest-open-channels.sh || fail "could not fund wallets or open channels." "npm run regtest:status"

echo ""
echo "[SATS-402] Running regtest doctor..."
if "$NODE_BIN" scripts/regtest-doctor.js; then
  echo ""
  echo "[SATS-402] Regtest bootstrap PASS."
else
  fail "doctor did not report live_ready." "npm run regtest:status"
fi
