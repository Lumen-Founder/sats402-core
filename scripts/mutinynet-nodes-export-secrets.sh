#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

cd "$(dirname "$0")/.."

mkdir -p secrets/agent secrets/gateway secrets/merchant

docker_exec() {
  local container="$1"
  local cmd="$2"
  docker exec "${container}" sh -lc "${cmd}"
}

docker_cp_from() {
  local container="$1"
  local remote="$2"
  local local_path="$3"
  docker cp "${container}:${remote}" "${local_path}"
}

assert_container_running() {
  local container="$1"

  if ! docker ps --format '{{.Names}}' | grep -Fxq "${container}"; then
    echo ""
    echo "ERROR: container is not running: ${container}"
    echo ""
    echo "Run:"
    echo "  npm run nodes:start"
    exit 1
  fi
}

copy_role() {
  local role="$1"
  local container="sats402-lnd-${role}"

  echo ""
  echo "[${role}] checking container: ${container}"
  assert_container_running "${container}"

  echo "[${role}] locating tls.cert"
  local tls_path
  tls_path="$(docker_exec "${container}" "find /root/.lnd -name tls.cert -type f | head -n 1" | tr -d '\r')"

  if [ -z "${tls_path}" ]; then
    echo ""
    echo "[${role}] ERROR: tls.cert not found."
    echo "LND may not have started correctly."
    echo ""
    echo "Inspect:"
    echo "  docker logs ${container} --tail 120"
    exit 1
  fi

  echo "[${role}] locating admin.macaroon"
  local macaroon_path
  macaroon_path="$(docker_exec "${container}" "find /root/.lnd -name admin.macaroon -type f | head -n 1" | tr -d '\r')"

  if [ -z "${macaroon_path}" ]; then
    echo ""
    echo "[${role}] ERROR: admin.macaroon not found."
    echo ""
    echo "Likely cause: wallet not initialized/unlocked."
    echo ""
    echo "Run:"
    echo "  npm run nodes:init"
    echo ""
    echo "Logs:"
    echo "  docker logs ${container} --tail 120"
    exit 1
  fi

  echo "[${role}] found tls.cert: ${tls_path}"
  echo "[${role}] found admin.macaroon: ${macaroon_path}"

  echo "[${role}] copying tls.cert"
  docker_cp_from "${container}" "${tls_path}" "./secrets/${role}/tls.cert"

  echo "[${role}] copying admin.macaroon"
  docker_cp_from "${container}" "${macaroon_path}" "./secrets/${role}/admin.macaroon"

  echo "[${role}] exported secrets/${role}/tls.cert"
  echo "[${role}] exported secrets/${role}/admin.macaroon"
}

copy_role agent
copy_role gateway
copy_role merchant

cat > .env.mutinynet <<'ENV'
MUTINYNET_AGENT_LND_REST=https://127.0.0.1:8081
MUTINYNET_AGENT_MACAROON_PATH=./secrets/agent/admin.macaroon
MUTINYNET_AGENT_TLS_CERT_PATH=./secrets/agent/tls.cert

MUTINYNET_GATEWAY_LND_REST=https://127.0.0.1:8082
MUTINYNET_GATEWAY_MACAROON_PATH=./secrets/gateway/admin.macaroon
MUTINYNET_GATEWAY_TLS_CERT_PATH=./secrets/gateway/tls.cert

MUTINYNET_MERCHANT_LND_REST=https://127.0.0.1:8083
MUTINYNET_MERCHANT_MACAROON_PATH=./secrets/merchant/admin.macaroon
MUTINYNET_MERCHANT_TLS_CERT_PATH=./secrets/merchant/tls.cert

SATS402_MUTINYNET_TLS_REJECT_UNAUTHORIZED=false
ENV

echo ""
echo "[SATS-402] Wrote .env.mutinynet and local secrets."
echo ""
echo "Next:"
echo "  npm run mutinynet:doctor"
