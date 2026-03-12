#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="127.0.0.1"
PORT="${PORT:-3210}"
URL="http://${HOST}:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}ai-wrapped-launch.log"
LOG_FILE="/tmp/ai-wrapped-launch.log"

find_bun() {
  if [[ -n "${BUN_BIN:-}" && -x "${BUN_BIN}" ]]; then
    printf '%s\n' "${BUN_BIN}"
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi

  for candidate in /opt/homebrew/bin/bun /usr/local/bin/bun; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

wait_for_server() {
  local attempt
  for attempt in {1..60}; do
    if curl -fsS "${URL}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

if ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  BUN_PATH="$(find_bun)" || {
    osascript -e 'display alert "AI Wrapped Launcher" message "Bun was not found. Install Bun or set BUN_BIN before launching." as critical'
    exit 1
  }

  cd "${ROOT_DIR}"

  if [[ ! -f "${ROOT_DIR}/dist/index.html" ]]; then
    "${BUN_PATH}" run build >>"${LOG_FILE}" 2>&1
  fi

  nohup "${BUN_PATH}" ./bin/cli.ts >>"${LOG_FILE}" 2>&1 </dev/null &

  if ! wait_for_server; then
    osascript -e 'display alert "AI Wrapped Launcher" message "AI Wrapped did not start successfully. Check /tmp/ai-wrapped-launch.log for details." as critical'
    exit 1
  fi
fi

open "${URL}"
