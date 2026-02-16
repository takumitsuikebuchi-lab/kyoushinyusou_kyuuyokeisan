#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV=production
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

if [[ ! -f ".next/BUILD_ID" ]]; then
  echo "[run-prod] build artifact not found. running npm run build..."
  npm run build
fi

echo "[run-prod] starting on http://${HOSTNAME}:${PORT}"
exec npm run start -- --hostname "${HOSTNAME}" --port "${PORT}"
