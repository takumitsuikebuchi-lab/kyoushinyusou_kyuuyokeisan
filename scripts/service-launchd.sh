#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
LABEL="com.kyoshin.payroll"
USER_ID="$(id -u)"
DOMAIN="gui/${USER_ID}"
SERVICE_TARGET="${DOMAIN}/${LABEL}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="${HOME}/kyoshin-payroll-runtime"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${ROOT_DIR}/logs"
OUT_LOG="${LOG_DIR}/${LABEL}.out.log"
ERR_LOG="${LOG_DIR}/${LABEL}.err.log"

write_plist() {
  mkdir -p "${HOME}/Library/LaunchAgents"
  mkdir -p "${LOG_DIR}"
  cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${ROOT_DIR}/scripts/run-prod.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${ROOT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
      <key>NODE_ENV</key>
      <string>production</string>
      <key>PORT</key>
      <string>3000</string>
      <key>HOSTNAME</key>
      <string>0.0.0.0</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${OUT_LOG}</string>
    <key>StandardErrorPath</key>
    <string>${ERR_LOG}</string>
  </dict>
</plist>
EOF
}

bootout_if_loaded() {
  launchctl bootout "${SERVICE_TARGET}" >/dev/null 2>&1 || true
  launchctl bootout "${DOMAIN}" "${PLIST_PATH}" >/dev/null 2>&1 || true
}

install_service() {
  bash "${SOURCE_DIR}/scripts/prepare-runtime.sh"
  write_plist
  bootout_if_loaded
  launchctl bootstrap "${DOMAIN}" "${PLIST_PATH}"
  launchctl enable "${SERVICE_TARGET}" || true
  launchctl kickstart -k "${SERVICE_TARGET}"
  echo "[service] installed and started: ${LABEL}"
}

start_service() {
  launchctl kickstart -k "${SERVICE_TARGET}"
  echo "[service] started: ${LABEL}"
}

stop_service() {
  bootout_if_loaded
  echo "[service] stopped: ${LABEL}"
}

restart_service() {
  if [[ ! -f "${PLIST_PATH}" ]]; then
    install_service
    return
  fi
  bootout_if_loaded
  launchctl bootstrap "${DOMAIN}" "${PLIST_PATH}"
  launchctl enable "${SERVICE_TARGET}" || true
  launchctl kickstart -k "${SERVICE_TARGET}"
  echo "[service] restarted: ${LABEL}"
}

status_service() {
  launchctl print "${SERVICE_TARGET}"
}

uninstall_service() {
  bootout_if_loaded
  rm -f "${PLIST_PATH}"
  echo "[service] uninstalled: ${LABEL}"
}

logs_service() {
  mkdir -p "${LOG_DIR}"
  touch "${OUT_LOG}" "${ERR_LOG}"
  tail -n 100 -f "${OUT_LOG}" "${ERR_LOG}"
}

case "${ACTION}" in
  install)
    install_service
    ;;
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    restart_service
    ;;
  status)
    status_service
    ;;
  uninstall)
    uninstall_service
    ;;
  logs)
    logs_service
    ;;
  *)
    echo "usage: bash scripts/service-launchd.sh {install|start|stop|restart|status|uninstall|logs}"
    exit 1
    ;;
esac
