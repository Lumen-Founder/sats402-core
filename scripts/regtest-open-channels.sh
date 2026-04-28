#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

LOCAL_AMT="${SATS402_REGTEST_CHANNEL_LOCAL_AMT:-500000}"
PUSH_AMT="${SATS402_REGTEST_CHANNEL_PUSH_AMT:-1000}"
MIN_WALLET_BALANCE="$((LOCAL_AMT + 50000))"

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

btc() {
  docker exec sats402-bitcoind-regtest bitcoin-cli -regtest -rpcuser=sats402 -rpcpassword=sats402 "$@"
}

lncli_role() {
  local role="$1"
  shift
  docker exec "sats402-lnd-${role}-regtest" lncli --network=regtest "$@"
}

fail() {
  echo "ERROR: $1"
  echo "Next: $2"
  exit 1
}

parse_json_field() {
  local field="$1"
  "$NODE_BIN" -e "const field=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); console.log(j[field] ?? '')}catch{console.log('')}})" "$field"
}

json_bool_field_true() {
  local field="$1"
  "$NODE_BIN" -e "const field=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); process.exit(j[field] ? 0 : 1)}catch{process.exit(1)}})" "$field"
}

json_has_peer() {
  local pubkey="$1"
  "$NODE_BIN" -e "const pubkey=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); const peers=j.peers || []; process.exit(peers.some(p => p.pub_key === pubkey) ? 0 : 1)}catch{process.exit(1)}})" "$pubkey"
}

json_channel_state() {
  local pubkey="$1"
  "$NODE_BIN" -e "const pubkey=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); const c=(j.channels || []).find(ch => ch.remote_pubkey === pubkey); if (!c) process.exit(1); console.log(c.active ? 'active' : 'inactive')}catch{process.exit(1)}})" "$pubkey"
}

json_has_pending_channel() {
  local pubkey="$1"
  "$NODE_BIN" -e "const pubkey=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); const pending=j.pending_open_channels || []; process.exit(pending.some(p => p.channel && p.channel.remote_node_pub === pubkey) ? 0 : 1)}catch{process.exit(1)}})" "$pubkey"
}

ensure_container() {
  local container="$1"
  docker ps --format '{{.Names}}' | grep -Fxq "$container" || fail "${container} is not running." "npm run regtest:bootstrap"
}

ensure_miner_wallet() {
  if btc -rpcwallet=miner getwalletinfo >/dev/null 2>&1; then
    return 0
  fi
  if btc createwallet miner >/dev/null 2>&1; then
    return 0
  fi
  if btc loadwallet miner >/dev/null 2>&1; then
    return 0
  fi
  fail "could not create or load the regtest miner wallet." "docker logs sats402-bitcoind-regtest --tail 120"
}

mine_blocks() {
  local count="$1"
  ensure_miner_wallet
  local address
  address="$(btc -rpcwallet=miner getnewaddress "" bech32 | tr -d '\r')"
  btc -rpcwallet=miner generatetoaddress "$count" "$address" >/dev/null
}

ensure_height() {
  local target="$1"
  local height
  height="$(btc getblockcount | tr -d '\r')"
  if [ "${height:-0}" -lt "$target" ]; then
    local count=$((target - height))
    echo "[bitcoind] mining ${count} blocks to reach height ${target}"
    mine_blocks "$count"
  else
    echo "[bitcoind] height ${height} already mature enough"
  fi
}

get_pubkey() {
  local role="$1"
  local output
  output="$(lncli_role "$role" getinfo 2>/dev/null)" || fail "could not read ${role} getinfo." "npm run regtest:bootstrap"
  printf '%s' "$output" | parse_json_field identity_pubkey
}

confirmed_balance() {
  local role="$1"
  local output
  output="$(lncli_role "$role" walletbalance 2>/dev/null || printf '{}')"
  printf '%s' "$output" | "$NODE_BIN" -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); console.log(Number(j.confirmed_balance || j.total_balance || 0))}catch{console.log(0)}})"
}

new_address() {
  local role="$1"
  local output
  output="$(lncli_role "$role" newaddress p2wkh 2>/dev/null)" || fail "could not create ${role} on-chain address." "npm run regtest:bootstrap"
  printf '%s' "$output" | parse_json_field address
}

wait_lnd_synced() {
  local role="$1"
  local waited=0
  while [ "$waited" -lt 120 ]; do
    local output
    output="$(lncli_role "$role" getinfo 2>/dev/null || true)"
    if printf '%s' "$output" | json_bool_field_true synced_to_chain; then
      echo "[${role}] synced to regtest chain"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  fail "${role} did not sync to regtest chain within 120s." "npm run regtest:status"
}

wait_balance() {
  local role="$1"
  local min="$2"
  local waited=0
  while [ "$waited" -lt 120 ]; do
    local balance
    balance="$(confirmed_balance "$role")"
    if [ "$balance" -ge "$min" ]; then
      echo "[${role}] confirmed wallet balance ${balance} sats"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  fail "${role} wallet did not see confirmed regtest funds." "npm run regtest:status"
}

fund_role_if_needed() {
  local role="$1"
  local min="$2"
  local balance
  balance="$(confirmed_balance "$role")"
  if [ "$balance" -ge "$min" ]; then
    echo "[${role}] funding OK (${balance} sats confirmed)"
    return 0
  fi

  local address
  address="$(new_address "$role")"
  echo "[${role}] sending 1 regtest BTC to ${role} wallet"
  btc -rpcwallet=miner sendtoaddress "$address" 1 >/dev/null
  mine_blocks 6
  wait_balance "$role" "$min"
}

connect_peer() {
  local from_role="$1"
  local to_label="$2"
  local pubkey="$3"
  local host="$4"
  local peers
  peers="$(lncli_role "$from_role" listpeers 2>/dev/null || printf '{}')"
  if printf '%s' "$peers" | json_has_peer "$pubkey"; then
    echo "[${from_role}] already connected to ${to_label}"
    return 0
  fi

  echo "[${from_role}] connecting to ${to_label}"
  local output
  if output="$(lncli_role "$from_role" connect "${pubkey}@${host}" 2>&1)"; then
    echo "[${from_role}] connected to ${to_label}"
  elif printf '%s' "$output" | grep -Eiq 'already connected|already exists'; then
    echo "[${from_role}] already connected to ${to_label}"
  else
    echo "[${from_role}] connect failed: $output"
    fail "could not connect ${from_role} to ${to_label}." "npm run regtest:status"
  fi
}

wait_active_channel() {
  local from_role="$1"
  local to_label="$2"
  local pubkey="$3"
  local waited=0
  while [ "$waited" -lt 120 ]; do
    local channels
    channels="$(lncli_role "$from_role" listchannels 2>/dev/null || printf '{}')"
    if state="$(printf '%s' "$channels" | json_channel_state "$pubkey" 2>/dev/null)" && [ "$state" = "active" ]; then
      echo "[${from_role}] ${to_label} channel active"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  fail "${from_role}->${to_label} channel did not become active within 120s." "npm run regtest:status"
}

open_channel_if_needed() {
  local from_role="$1"
  local to_label="$2"
  local pubkey="$3"
  local channels pending

  channels="$(lncli_role "$from_role" listchannels 2>/dev/null || printf '{}')"
  if state="$(printf '%s' "$channels" | json_channel_state "$pubkey" 2>/dev/null)"; then
    echo "[${from_role}] ${to_label} channel already ${state}"
    if [ "$state" = "active" ]; then
      return 0
    fi
  fi

  pending="$(lncli_role "$from_role" pendingchannels 2>/dev/null || printf '{}')"
  if printf '%s' "$pending" | json_has_pending_channel "$pubkey"; then
    echo "[${from_role}] ${to_label} channel pending; mining confirmations"
    mine_blocks 6
    wait_active_channel "$from_role" "$to_label" "$pubkey"
    return 0
  fi

  fund_role_if_needed "$from_role" "$MIN_WALLET_BALANCE"

  echo "[${from_role}] opening channel to ${to_label} (local=${LOCAL_AMT}, push=${PUSH_AMT})"
  local output
  if output="$(lncli_role "$from_role" openchannel --node_key="$pubkey" --local_amt="$LOCAL_AMT" --push_amt="$PUSH_AMT" --sat_per_vbyte=1 2>&1)"; then
    printf '%s\n' "$output"
    mine_blocks 6
    wait_active_channel "$from_role" "$to_label" "$pubkey"
    return 0
  fi

  echo "[${from_role}] openchannel failed: $output"
  fail "could not open ${from_role}->${to_label} channel." "npm run regtest:status"
}

ensure_container sats402-bitcoind-regtest
ensure_container sats402-lnd-agent-regtest
ensure_container sats402-lnd-gateway-regtest
ensure_container sats402-lnd-merchant-regtest

ensure_miner_wallet
ensure_height 120

wait_lnd_synced agent
wait_lnd_synced gateway
wait_lnd_synced merchant

GATEWAY_PUBKEY="$(get_pubkey gateway)"
MERCHANT_PUBKEY="$(get_pubkey merchant)"

connect_peer agent gateway "$GATEWAY_PUBKEY" "lnd-gateway:9735"
connect_peer gateway merchant "$MERCHANT_PUBKEY" "lnd-merchant:9735"

open_channel_if_needed agent gateway "$GATEWAY_PUBKEY"
open_channel_if_needed gateway merchant "$MERCHANT_PUBKEY"

echo "[SATS-402] Regtest channels ready."
