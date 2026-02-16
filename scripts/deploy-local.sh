#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy-local] preparing runtime..."
bash scripts/prepare-runtime.sh

echo "[deploy-local] restarting launchd service..."
bash scripts/service-launchd.sh restart

echo "[deploy-local] done."
