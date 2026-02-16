#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${HOME}/kyoshin-payroll-runtime"

echo "[prepare-runtime] source:  ${SOURCE_DIR}"
echo "[prepare-runtime] runtime: ${RUNTIME_DIR}"

mkdir -p "${RUNTIME_DIR}"

rsync -a --delete \
  --exclude ".git" \
  --exclude ".next" \
  --exclude "node_modules" \
  --exclude "logs" \
  --exclude "data/payroll-state.json" \
  "${SOURCE_DIR}/" "${RUNTIME_DIR}/"

if [[ -f "${SOURCE_DIR}/data/payroll-state.json" && ! -f "${RUNTIME_DIR}/data/payroll-state.json" ]]; then
  mkdir -p "${RUNTIME_DIR}/data"
  cp "${SOURCE_DIR}/data/payroll-state.json" "${RUNTIME_DIR}/data/payroll-state.json"
  echo "[prepare-runtime] migrated existing state file to runtime."
fi

cd "${RUNTIME_DIR}"

echo "[prepare-runtime] npm install..."
npm install

echo "[prepare-runtime] npm run build..."
npm run build

echo "[prepare-runtime] ready."
