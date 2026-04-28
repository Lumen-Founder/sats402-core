#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

parse_address() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d); console.log(j.address || d.trim())}catch{console.log(d.trim())}})"
}

is_running() {
  docker ps --format '{{.Names}}' | grep -Fxq "$1"
}

echo "Mutinynet faucet: https://faucet.mutinynet.com/"
echo "Fund Agent and Gateway first. Merchant can receive inbound capacity from Gateway."
echo ""

exit_code=0
for role in agent gateway merchant; do
  svc="sats402-lnd-${role}"
  echo "===== ${role} funding address ====="
  if ! is_running "$svc"; then
    echo "ERROR: ${svc} is not running."
    echo "Next: npm run nodes:bootstrap"
    echo ""
    exit_code=1
    continue
  fi

  if output="$(docker exec "$svc" lncli --network=signet newaddress p2wkh 2>&1)"; then
    printf '%s' "$output" | parse_address
  else
    echo "ERROR: could not create address for ${role}."
    echo "$output"
    if printf '%s' "$output" | grep -Eiq 'locked|unlock'; then
      echo "Next: npm run nodes:init"
    else
      echo "Next: docker logs ${svc} --tail 120"
    fi
    exit_code=1
  fi
  echo ""
done

if [ "$exit_code" -eq 0 ]; then
  echo "After funding Agent and Gateway, wait for confirmation, then run:"
  echo "  npm run nodes:connect"
fi

exit "$exit_code"

