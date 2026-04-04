#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="127.0.0.1"
PORT="${PORT:-3210}"
URL="http://${HOST}:${PORT}"
LOG_FILE="${TMPDIR:-/tmp}codex-wrapped-launch.log"

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

list_server_pids_for_root() {
  local pid
  for pid in $(pgrep -f 'bun .*bin/cli.ts' 2>/dev/null); do
    local cwd
    cwd="$(pid_cwd "${pid}")"
    if [[ "${cwd}" == "${ROOT_DIR}" ]]; then
      printf '%s\n' "${pid}"
    fi
  done
}

list_port_listener_pids() {
  lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true
}

is_codex_wrapped_server_pid() {
  local pid="$1"
  local command
  command="$(ps -o command= -p "${pid}" 2>/dev/null || true)"
  [[ "${command}" == *"bin/cli.ts"* ]]
}

stop_pid_if_running() {
  local pid="$1"
  if kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}" >/dev/null 2>&1 || true
    local attempt
    for attempt in {1..8}; do
      if ! kill -0 "${pid}" >/dev/null 2>&1; then
        return 0
      fi
      sleep 0.25
    done
    kill -9 "${pid}" >/dev/null 2>&1 || true
  fi
}

wait_for_port_release() {
  local attempt
  for attempt in {1..40}; do
    if ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

pid_cwd() {
  local pid="$1"
  lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

restart_local_server_if_needed() {
  local pids_to_stop=()
  local pid

  while IFS= read -r pid; do
    [[ -n "${pid}" ]] && pids_to_stop+=("${pid}")
  done < <(list_server_pids_for_root)

  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    if is_codex_wrapped_server_pid "${pid}"; then
      pids_to_stop+=("${pid}")
    fi
  done < <(list_port_listener_pids)

  # De-duplicate before stopping.
  local unique_pids=()
  local seen=""
  for pid in "${pids_to_stop[@]}"; do
    if [[ " ${seen} " != *" ${pid} "* ]]; then
      seen="${seen} ${pid}"
      unique_pids+=("${pid}")
    fi
  done

  if [[ ${#unique_pids[@]} -eq 0 ]]; then
    return 0
  fi

  for pid in "${unique_pids[@]}"; do
    stop_pid_if_running "${pid}"
  done

  if wait_for_port_release; then
    return 0
  fi

  local conflict_pid
  conflict_pid="$(list_port_listener_pids | head -n 1)"
  if [[ -n "${conflict_pid}" ]]; then
    local conflict_command
    conflict_command="$(ps -o command= -p "${conflict_pid}" 2>/dev/null || true)"
    osascript -e "display alert \"Codex Wrapped\" message \"Port ${PORT} is in use by PID ${conflict_pid}. Close that app first, then launch Codex Wrapped again.\" as critical"
    printf '[codex-wrapped-launch] Port %s blocked by PID %s: %s\n' "${PORT}" "${conflict_pid}" "${conflict_command}" >>"${LOG_FILE}" 2>&1
    exit 1
  fi

  osascript -e 'display alert "Codex Wrapped" message "An older Codex Wrapped server is still running and could not be restarted automatically." as critical'
  exit 1
}

restart_local_server_if_needed

if ! curl -fsS "${URL}" >/dev/null 2>&1; then
  BUN_PATH="$(find_bun)" || {
    osascript -e 'display alert "Codex Wrapped" message "Bun was not found. Install Bun or set BUN_BIN before launching." as critical'
    exit 1
  }

  cd "${ROOT_DIR}"

  if [[ ! -f "${ROOT_DIR}/dist/index.html" ]]; then
    "${BUN_PATH}" run build >>"${LOG_FILE}" 2>&1
  fi

  nohup "${BUN_PATH}" ./bin/cli.ts >>"${LOG_FILE}" 2>&1 </dev/null &

  if ! wait_for_server; then
    osascript -e 'display alert "Codex Wrapped" message "Codex Wrapped did not start successfully. Check /tmp/codex-wrapped-launch.log for details." as critical'
    exit 1
  fi
fi

open "${URL}"
