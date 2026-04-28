#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

LOCAL_AMT="${SATS402_CHANNEL_LOCAL_AMT:-150000}"
PUSH_AMT="${SATS402_CHANNEL_PUSH_AMT:-75000}"
FAUCET_URL="https://faucet.mutinynet.com/"

lncli_role() {
  local role="$1"
  shift
  docker exec "sats402-lnd-${role}" lncli --network=signet "$@"
}

is_running() {
  docker ps --format '{{.Names}}' | grep -Fxq "$1"
}

parse_json_field() {
  local field="$1"
  node -e "const field=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); console.log(j[field] ?? '')})" "$field"
}

get_pubkey() {
  local role="$1"
  local output
  if ! output="$(lncli_role "$role" getinfo 2>&1)"; then
    echo "ERROR: could not read ${role} getinfo." >&2
    echo "$output" >&2
    if printf '%s' "$output" | grep -Eiq 'locked|unlock'; then
      echo "Next: npm run nodes:init" >&2
    else
      echo "Next: docker logs sats402-lnd-${role} --tail 120" >&2
    fi
    return 1
  fi
  printf '%s' "$output" | parse_json_field identity_pubkey
}

confirmed_balance() {
  local role="$1"
  local output
  if ! output="$(lncli_role "$role" walletbalance 2>/dev/null)"; then
    echo "0"
    return
  fi
  printf '%s' "$output" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); console.log(Number(j.confirmed_balance || j.total_balance || 0))})"
}

new_address() {
  local role="$1"
  local output
  output="$(lncli_role "$role" newaddress p2wkh 2>/dev/null || true)"
  printf '%s' "$output" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); console.log(j.address || '')}catch{console.log('')}})"
}

json_has_peer() {
  local pubkey="$1"
  node -e "const pubkey=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); const peers=j.peers || []; process.exit(peers.some(p => p.pub_key === pubkey) ? 0 : 1)})" "$pubkey"
}

json_channel_state() {
  local pubkey="$1"
  node -e "const pubkey=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); const c=(j.channels || []).find(ch => ch.remote_pubkey === pubkey); if (!c) process.exit(1); console.log(c.active ? 'active' : 'inactive')})" "$pubkey"
}

json_has_pending_channel() {
  local pubkey="$1"
  node -e "const pubkey=process.argv[1];let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); const pending=j.pending_open_channels || []; process.exit(pending.some(p => p.channel && p.channel.remote_node_pub === pubkey) ? 0 : 1)})" "$pubkey"
}

ensure_containers() {
  local missing=0
  for role in agent gateway merchant; do
    if ! is_running "sats402-lnd-${role}"; then
      echo "ERROR: sats402-lnd-${role} is not running."
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    echo "Next: npm run nodes:bootstrap"
    exit 1
  fi
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
  if output="$(lncli_role "$from_role" connect "${pubkey}@${host}" 2>&1)"; then
    echo "[${from_role}] connected to ${to_label}"
  elif printf '%s' "$output" | grep -Eiq 'already connected|already exists'; then
    echo "[${from_role}] already connected to ${to_label}"
  else
    echo "[${from_role}] connect failed: $output"
    if printf '%s' "$output" | grep -Eiq 'starting|not yet ready|sync'; then
      echo "Next: wait for Mutinynet sync, then run npm run nodes:status and npm run nodes:connect."
    else
      echo "Next: npm run nodes:status"
    fi
    return 1
  fi
}

open_channel_if_needed() {
  local from_role="$1"
  local to_label="$2"
  local pubkey="$3"
  local channels pending balance address output

  channels="$(lncli_role "$from_role" listchannels 2>/dev/null || printf '{}')"
  if state="$(printf '%s' "$channels" | json_channel_state "$pubkey" 2>/dev/null)"; then
    echo "[${from_role}] ${to_label} channel already ${state}"
    return 0
  fi

  pending="$(lncli_role "$from_role" pendingchannels 2>/dev/null || printf '{}')"
  if printf '%s' "$pending" | json_has_pending_channel "$pubkey"; then
    echo "[${from_role}] ${to_label} channel is already pending confirmation"
    return 0
  fi

  balance="$(confirmed_balance "$from_role")"
  if [ "$balance" -lt "$LOCAL_AMT" ]; then
    address="$(new_address "$from_role")"
    echo "[${from_role}] missing confirmed funds for ${to_label} channel."
    echo "Confirmed balance: ${balance} sats. Need at least ${LOCAL_AMT} sats plus fees."
    echo "Fund this ${from_role} Mutinynet address at ${FAUCET_URL}:"
    echo "  ${address:-run npm run nodes:addresses}"
    return 1
  fi

  echo "[${from_role}] opening channel to ${to_label} (local=${LOCAL_AMT}, push=${PUSH_AMT})"
  if output="$(lncli_role "$from_role" openchannel --node_key="$pubkey" --local_amt="$LOCAL_AMT" --push_amt="$PUSH_AMT" 2>&1)"; then
    echo "$output"
    return 0
  fi

  echo "[${from_role}] openchannel failed: $output"
  if printf '%s' "$output" | grep -Eiq 'insufficient|not enough|no coins'; then
    address="$(new_address "$from_role")"
    echo "Fund this ${from_role} Mutinynet address at ${FAUCET_URL}:"
    echo "  ${address:-run npm run nodes:addresses}"
  elif printf '%s' "$output" | grep -Eiq 'sync|block|chain backend'; then
    echo "Next: wait for Mutinynet sync, then run npm run nodes:connect again."
  else
    echo "Next: npm run nodes:status"
  fi
  return 1
}

ensure_containers

GATEWAY_PUBKEY="$(get_pubkey gateway)"
MERCHANT_PUBKEY="$(get_pubkey merchant)"

echo "Gateway pubkey: ${GATEWAY_PUBKEY}"
echo "Merchant pubkey: ${MERCHANT_PUBKEY}"

connect_peer agent gateway "$GATEWAY_PUBKEY" "lnd-gateway:9735"
connect_peer gateway merchant "$MERCHANT_PUBKEY" "lnd-merchant:9735"

exit_code=0
open_channel_if_needed agent gateway "$GATEWAY_PUBKEY" || exit_code=1
open_channel_if_needed gateway merchant "$MERCHANT_PUBKEY" || exit_code=1

echo ""
if [ "$exit_code" -eq 0 ]; then
  echo "Channels are open or pending. Wait for Mutinynet block confirmation, then run:"
  echo "  npm run nodes:status"
else
  echo "After funding/confirmation, rerun:"
  echo "  npm run nodes:connect"
fi

exit "$exit_code"
