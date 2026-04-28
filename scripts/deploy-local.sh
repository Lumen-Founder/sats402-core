#!/usr/bin/env bash
set -euo pipefail
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose up --build
else
  npm install
  npm run dev
fi
