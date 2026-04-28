#!/usr/bin/env bash
set -euo pipefail
if [ $# -ne 1 ]; then
  echo "usage: $0 /path/to/admin.macaroon" >&2
  exit 1
fi
xxd -ps -u -c 1000 "$1"
