#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

cd "$(dirname "$0")/.."

mkdir -p secrets-regtest/agent secrets-regtest/gateway secrets-regtest/merchant

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
    echo "ERROR: container is not running: ${container}"
    echo "Next: npm run regtest:bootstrap"
    exit 1
  fi
}

copy_role() {
  local role="$1"
  local container="sats402-lnd-${role}-regtest"

  echo "[${role}] checking container: ${container}"
  assert_container_running "${container}"

  local tls_path
  tls_path="$(docker_exec "${container}" "find /root/.lnd -name tls.cert -type f | head -n 1" | tr -d '\r')"
  if [ -z "${tls_path}" ]; then
    echo "[${role}] ERROR: tls.cert not found."
    echo "Next: docker logs ${container} --tail 120"
    exit 1
  fi

  local macaroon_path
  macaroon_path="$(docker_exec "${container}" "find /root/.lnd -path '*/bitcoin/regtest/admin.macaroon' -type f | head -n 1" | tr -d '\r')"
  if [ -z "${macaroon_path}" ]; then
    macaroon_path="$(docker_exec "${container}" "find /root/.lnd -name admin.macaroon -type f | head -n 1" | tr -d '\r')"
  fi
  if [ -z "${macaroon_path}" ]; then
    echo "[${role}] ERROR: admin.macaroon not found."
    echo "Next: npm run regtest:bootstrap"
    exit 1
  fi

  docker_cp_from "${container}" "${tls_path}" "./secrets-regtest/${role}/tls.cert"
  docker_cp_from "${container}" "${macaroon_path}" "./secrets-regtest/${role}/admin.macaroon"
  echo "[${role}] exported tls.cert and admin.macaroon"
}

copy_role agent
copy_role gateway
copy_role merchant

cat > .env.regtest <<'ENV'
REGTEST_AGENT_LND_REST=https://127.0.0.1:8181
REGTEST_AGENT_MACAROON_PATH=./secrets-regtest/agent/admin.macaroon
REGTEST_AGENT_TLS_CERT_PATH=./secrets-regtest/agent/tls.cert

REGTEST_GATEWAY_LND_REST=https://127.0.0.1:8182
REGTEST_GATEWAY_MACAROON_PATH=./secrets-regtest/gateway/admin.macaroon
REGTEST_GATEWAY_TLS_CERT_PATH=./secrets-regtest/gateway/tls.cert

REGTEST_MERCHANT_LND_REST=https://127.0.0.1:8183
REGTEST_MERCHANT_MACAROON_PATH=./secrets-regtest/merchant/admin.macaroon
REGTEST_MERCHANT_TLS_CERT_PATH=./secrets-regtest/merchant/tls.cert

SATS402_REGTEST_TLS_REJECT_UNAUTHORIZED=false
ENV

echo "[SATS-402] Wrote .env.regtest and local regtest secrets."
