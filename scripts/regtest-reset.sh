#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")/.."

ROOT="$(pwd)"
case "$ROOT" in
  */sats402-mutinynet-live-demo|*\\sats402-mutinynet-live-demo) ;;
  *)
    echo "ERROR: refusing to reset from unexpected directory: ${ROOT}"
    echo "Next: cd /c/Users/kkk/Desktop/sats402-mutinynet-live-demo"
    exit 1
    ;;
esac

docker compose -f docker-compose.regtest.yml down -v --remove-orphans
docker network rm sats402-regtest >/dev/null 2>&1 || true
rm -rf ./secrets-regtest ./.env.regtest
echo "[SATS-402] Regtest stack, volumes, .env.regtest, and secrets-regtest removed."
echo "Next: npm run regtest:bootstrap"
