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
[ -n "$NODE_BIN" ] || { echo "ERROR: Node.js was not found inside bash."; echo "Next: npm install"; exit 1; }

lncli_role() {
  local role="$1"
  shift
  docker exec "sats402-lnd-${role}-regtest" lncli --network=regtest "$@"
}

json_field() {
  local field="$1"
  "$NODE_BIN" -e "const field=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); console.log(j[field] ?? '')}catch{console.log('')}})" "$field"
}

channel_state() {
  local pubkey="$1"
  "$NODE_BIN" -e "const pubkey=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); const c=(j.channels || []).find(ch => ch.remote_pubkey === pubkey); if (!c) { console.log('missing'); return; } console.log(c.active ? 'active' : 'inactive')}catch{console.log('unknown')}})" "$pubkey"
}

run_section() {
  local title="$1"
  shift
  echo "===== ${title} ====="
  "$@" || true
  echo ""
}

getinfo_json() {
  local role="$1"
  lncli_role "$role" getinfo 2>/dev/null || true
}

channels_json() {
  local role="$1"
  lncli_role "$role" listchannels 2>/dev/null || printf '{}'
}

echo "===== containers ====="
docker compose -f docker-compose.regtest.yml ps || true
echo ""

echo "===== bitcoind ====="
docker exec sats402-bitcoind-regtest bitcoin-cli -regtest -rpcuser=sats402 -rpcpassword=sats402 getblockchaininfo 2>/dev/null || true
echo ""

for role in agent gateway merchant; do
  run_section "${role}: getinfo" lncli_role "$role" getinfo
  run_section "${role}: walletbalance" lncli_role "$role" walletbalance
  run_section "${role}: channelbalance" lncli_role "$role" channelbalance
  run_section "${role}: listchannels" lncli_role "$role" listchannels
  run_section "${role}: pendingchannels" lncli_role "$role" pendingchannels
done

agent_info="$(getinfo_json agent)"
gateway_info="$(getinfo_json gateway)"
merchant_info="$(getinfo_json merchant)"
gateway_pubkey="$(printf '%s' "$gateway_info" | json_field identity_pubkey)"
merchant_pubkey="$(printf '%s' "$merchant_info" | json_field identity_pubkey)"

agent_gateway_state="unknown"
gateway_merchant_state="unknown"
if [ -n "$gateway_pubkey" ]; then
  agent_gateway_state="$(channels_json agent | channel_state "$gateway_pubkey")"
fi
if [ -n "$merchant_pubkey" ]; then
  gateway_merchant_state="$(channels_json gateway | channel_state "$merchant_pubkey")"
fi

echo "===== regtest live demo readiness ====="
echo "Agent -> Gateway channel: ${agent_gateway_state}"
echo "Gateway -> Merchant channel: ${gateway_merchant_state}"
if [ "$agent_gateway_state" = "active" ] && [ "$gateway_merchant_state" = "active" ]; then
  echo "Live demo can run: yes"
  echo "Next: npm run regtest:live"
else
  echo "Live demo can run: no"
  echo "Next: npm run regtest:bootstrap"
fi
