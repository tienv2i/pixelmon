#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# pm.sh - Process manager cho server (:2567) & client (:5173)
#
# Cách dùng:
#   ./scripts/pm.sh start   [server|client|all]   # khởi động (tự free port cũ)
#   ./scripts/pm.sh stop    [server|client|all]   # dừng sạch (TERM -> KILL)
#   ./scripts/pm.sh restart [server|client|all]   # restart = stop + start
#   ./scripts/pm.sh reload                         # restart toàn bộ (alias)
#   ./scripts/pm.sh status                          # trạng thái process/port
#   ./scripts/pm.sh logs    [server|client] [-f]  # xem log (mặc định: in mới nhất)
#   ./scripts/pm.sh tail      [server|client]      # theo dõi log realtime (-f)
#   ./scripts/pm.sh watch     [server|client]      # tự reload khi file thay đổi
#   ./scripts/pm.sh kill-port <port>               # force free một port
#   ./scripts/pm.sh clean                          # xoá .pm/ (pid + log)
#
# Đặc điểm:
#   - Log ghi vào .pm/logs/<svc>.log (relative với project root).
#   - PID file ghi vào .pm/<svc>.pid, session riêng để không dính shell cha.
#   - Start/restart luôn đảm bảo port trống trước (tránh "port in use").
#   - Stop dùng SIGTERM rồi SIGKILL sau PM_STOP_TIMEOUT (tránh kill nhầm).
#   - Watch mode: theo dõi src/ của service, debounce, tự restart khi sửa.
# ---------------------------------------------------------------------------
set -euo pipefail

# --- Tìm project root (thư mục chứa package.json với "@pixelmon" workspaces) --
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PM_ROOT"

# --- Nạp config -------------------------------------------------------------
# shellcheck source=pm.config
source "$SCRIPT_DIR/pm.config"
PM_STATE_DIR="$PM_ROOT/$PM_STATE_DIR"
PM_LOG_DIR="$PM_ROOT/$PM_LOG_DIR"
mkdir -p "$PM_STATE_DIR" "$PM_LOG_DIR"

# --- Node / pnpm environment -------------------------------------------------
setup_env() {
  # Ưu tiên pnpm đã có sẵn
  if command -v pnpm >/dev/null 2>&1; then
    return 0
  fi
  # Thử nvm (Fedora/Arch — nvm bin thường ở ~/.nvm/versions/node/<ver>/bin)
  if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
    # Thử version đang cấu hình, nếu không có thì dùng bản mới nhất đã cài
    if [ -n "${PM_NODE_VERSION:-}" ]; then
      nvm use "$PM_NODE_VERSION" >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
    else
      nvm use default >/dev/null 2>&1 || true
    fi
  fi
  # Nếu chưa có, thử fnm và chọn đúng node version (pnpm nằm cùng bin với node)
  if command -v fnm >/dev/null 2>&1; then
    # Tạo version file tạm nếu cấu hình yêu cầu
    if [ -n "${PM_NODE_VERSION:-}" ]; then
      local vfile="$PM_ROOT/.pm/.node-version"
      echo "$PM_NODE_VERSION" > "$vfile"
      eval "$(fnm env --version-file "$vfile" 2>/dev/null || fnm env)" || true
      rm -f "$vfile"
    else
      eval "$(fnm env)" || true
    fi
    # Một số bản fnm không tự switch theo version-file, fallback `fnm use`
    if ! command -v pnpm >/dev/null 2>&1 && [ -n "${PM_NODE_VERSION:-}" ]; then
      fnm use "$PM_NODE_VERSION" >/dev/null 2>&1 || true
    fi
  fi
  # Nếu vẫn không có pnpm, thử corepack
  if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1 || true
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "[pm] LỖI: không tìm thấy pnpm. Hãy cài pnpm hoặc chạy với fnm." >&2
    exit 1
  fi
}

# --- Helpers -----------------------------------------------------------------
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[pm] $(ts) $*"; }
log_err() { echo "[pm] $(ts) $*" >&2; }

svc_port() {
  case "$1" in
    server) echo "$PM_SERVER_PORT" ;;
    client) echo "$PM_CLIENT_PORT" ;;
    *) echo "" ;;
  esac
}

svc_cmd() {
  case "$1" in
    server) echo "$PM_SERVER_CMD" ;;
    client) echo "$PM_CLIENT_CMD" ;;
    *) echo "" ;;
  esac
}

svc_pid_file() { echo "$PM_STATE_DIR/$1.pid"; }
svc_log_file() { echo "$PM_LOG_DIR/$1.log"; }

svc_pid() {
  local f; f="$(svc_pid_file "$1")"
  [ -f "$f" ] || { echo ""; return 0; }
  local pid; pid="$(cat "$f" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "$pid"
  else
    rm -f "$f"
    echo ""
  fi
}

is_running() { [ -n "$(svc_pid "$1")" ]; }

# Liệu có process nào đang chiếm port không?
port_owners() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti ":$port" 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$port/tcp" 2>/dev/null || true
  else
    # Fallback: parse /proc/net/tcp
    local hex
    hex=$(printf '%04X' "$port")
    awk -v p=":$hex" '$2 ~ p"$" {print $10}' /proc/net/tcp 2>/dev/null | while read -r ino; do
      for fd in /proc/[0-9]*/fd/*; do
        if readlink "$fd" 2>/dev/null | grep -q "socket:\[$ino\]"; then
          echo "$fd" | cut -d/ -f3
        fi
      done
    done 2>/dev/null || true
  fi
}

# Force free port: kill mọi process đang giữ port đó.
free_port() {
  local port="$1"
  local pids; pids="$(port_owners "$port" | sort -u | tr '\n' ' ')"
  pids="$(echo "$pids" | tr ' ' '\n' | grep -v "^$" | tr '\n' ' ' || true)"
  if [ -z "${pids// /}" ]; then
    log "port $port đã trống"
    return 0
  fi
  log "port $port đang bị giữ bởi PID: $pids -> gửi TERM"
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  local waited=0
  while [ "$waited" -lt "$PM_STOP_TIMEOUT" ]; do
    sleep 1
    waited=$((waited + 1))
    pids="$(port_owners "$port" | sort -u | tr '\n' ' ')"
    pids="$(echo "$pids" | tr ' ' '\n' | grep -v "^$" | tr '\n' ' ' || true)"
    [ -z "${pids// /}" ] && { log "port $port đã trống sau ${waited}s"; return 0; }
  done
  # shellcheck disable=SC2086
  kill -KILL $pids 2>/dev/null || true
  sleep 1
  pids="$(port_owners "$port" | sort -u | tr '\n' ' ')"
  if [ -z "${pids// /}" ]; then
    log "port $port đã trống (sau SIGKILL)"
  else
    log_err "CẢNH BÁO: port $port vẫn còn PID: $pids"
  fi
}

# --- Start -------------------------------------------------------------------
start_svc() {
  local svc="$1"
  local cmd; cmd="$(svc_cmd "$svc")"
  local port; port="$(svc_port "$svc")"
  local logf; logf="$(svc_log_file "$svc")"
  local pidf; pidf="$(svc_pid_file "$svc")"

  if is_running "$svc"; then
    log "$svc đã đang chạy (PID $(svc_pid "$svc")) - bỏ qua start"
    return 0
  fi

  setup_env

  # Đảm bảo port trống trước khi start
  if [ -n "$port" ]; then
    free_port "$port"
  fi

  log "start $svc: $cmd (port $port, log -> ${logf#$PM_ROOT/})"
  {
    echo "==================== start $(ts) ===================="
    echo "cmd: $cmd"
  } >> "$logf"

  # Chạy trong session mới (setsid) để tách khỏi shell cha,
  # không dính TTY, kill được cả nhóm khi stop.
  # shellcheck disable=SC2086
  setsid bash -c "cd '$PM_ROOT' && exec $cmd" >>"$logf" 2>&1 &
  local pid=$!
  echo "$pid" > "$pidf"
  log "$svc PID=$pid"

  # Chờ ready
  if [ -n "$port" ]; then
    wait_port "$port" "$PM_READY_TIMEOUT" "$svc"
  fi
}

wait_port() {
  local port="$1" timeout="$2" svc="${3:-}"
  local waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if [ -n "$(port_owners "$port" | head -n1)" ]; then
      log "$svc sẵn sàng trên port $port (sau ${waited}s)"
      return 0
    fi
    # Nếu process chết giữa chừng thì dừng chờ
    if [ -n "$svc" ] && ! is_running "$svc"; then
      log_err "$svc đã chết trong lúc chờ ready - xem log:"
      tail -n 20 "$(svc_log_file "$svc")" >&2 || true
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  log_err "$svc chưa mở port $port sau ${timeout}s - kiểm tra log:"
  tail -n 20 "$(svc_log_file "$svc")" >&2 || true
  return 1
}

# --- Stop --------------------------------------------------------------------
stop_svc() {
  local svc="$1"
  local pid; pid="$(svc_pid "$svc")"
  local port; port="$(svc_port "$svc")"

  if [ -z "$pid" ]; then
    log "$svc không đang chạy"
    # Vẫn dọn port nếu có process lạ giữ (giữ hành vi "clean")
    if [ -n "$port" ] && [ -n "$(port_owners "$port" | head -n1)" ]; then
      free_port "$port"
    fi
    rm -f "$(svc_pid_file "$svc")"
    return 0
  fi

  log "dừng $svc (PID $pid)"
  # Gửi TERM cho cả nhóm process (tránh sót child như tsx watch / vite)
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true

  local waited=0
  while [ "$waited" -lt "$PM_STOP_TIMEOUT" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    log "$svc chưa thoát sau ${PM_STOP_TIMEOUT}s -> SIGKILL"
    kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    sleep 1
  fi

  # Dọn port còn sót
  if [ -n "$port" ] && [ -n "$(port_owners "$port" | head -n1)" ]; then
    free_port "$port"
  fi

  rm -f "$(svc_pid_file "$svc")"
  log "$svc đã dừng"
}

restart_svc() {
  stop_svc "$1"
  start_svc "$1"
}

# --- Status ------------------------------------------------------------------
status_all() {
  printf "%-8s %-10s %-6s %-22s %s\n" "SVC" "STATE" "PORT" "PID" "LOG"
  printf -- "--------------------------------------------------------------\n"
  for svc in server client; do
    local pid port state logf
    pid="$(svc_pid "$svc")"
    port="$(svc_port "$svc")"
    logf="$(svc_log_file "$svc")"
    local portstate="-"
    if [ -n "$port" ]; then
      local owners; owners="$(port_owners "$port" | sort -u | tr '\n' ',' | sed 's/,$//')"
      if [ -n "$owners" ]; then
        portstate="$port($owners)"
      else
        portstate="$port(free)"
      fi
    fi
    if [ -n "$pid" ]; then
      state="running"
    else
      state="stopped"
    fi
    printf "%-8s %-10s %-6s %-22s %s\n" "$svc" "$state" "$portstate" "${pid:- -}" "${logf#$PM_ROOT/}"
  done
  echo
  echo "=== log mới nhất ==="
  for svc in server client; do
    local f; f="$(svc_log_file "$svc")"
    echo "--- $svc (${f#$PM_ROOT/}) ---"
    if [ -f "$f" ]; then
      tail -n 5 "$f" | sed 's/^/    /'
    else
      echo "    (chưa có log)"
    fi
  done
}

# --- Logs --------------------------------------------------------------------
show_logs() {
  local svc="$1"; shift || true
  local follow=0
  if [ "${1:-}" = "-f" ]; then follow=1; fi
  local f; f="$(svc_log_file "$svc")"
  if [ ! -f "$f" ]; then
    log_err "chưa có log cho $svc"
    exit 1
  fi
  if [ "$follow" = "1" ]; then
    tail -n 100 -f "$f"
  else
    tail -n 200 "$f"
  fi
}

# --- Watch (auto reload khi edit) -------------------------------------------
watch_svc() {
  local svc="$1"
  local watch_dirs=("packages/shared/src" "apps/$svc/src")
  # Nếu service chưa chạy thì start
  if ! is_running "$svc"; then
    log "watch: $svc chưa chạy -> start"
    start_svc "$svc"
  fi
  # Chọn tool theo dõi file
  local watcher_cmd=()
  if command -v inotifywait >/dev/null 2>&1; then
    watcher_cmd=(inotifywait -r -e modify,create,delete,move --format '%w%f')
  elif command -v fswatch >/dev/null 2>&1; then
    watcher_cmd=(fswatch -0 -r --event Created --event Updated --event Removed --event Renamed)
  else
    log_err "Không có inotifywait/fswatch - fallback polling mỗi 3s"
    watch_poll "$svc" "${watch_dirs[@]}"
    return
  fi

  local existing_dirs=()
  for d in "${watch_dirs[@]}"; do
    [ -d "$d" ] && existing_dirs+=("$d")
  done
  if [ "${#existing_dirs[@]}" -eq 0 ]; then
    log_err "watch: không thấy thư mục nào để theo dõi"
    exit 1
  fi
  log "watch $svc: theo dõi ${existing_dirs[*]} (Ctrl+C để dừng)"
  while true; do
    local changed=""
    if [ "${watcher_cmd[0]}" = "inotifywait" ]; then
      changed="$("${watcher_cmd[@]}" "${existing_dirs[@]}" 2>/dev/null || true)"
    else
      changed="$("${watcher_cmd[@]}" "${existing_dirs[@]}" 2>/dev/null | tr '\0' '\n' || true)"
    fi
    # Bỏ qua thay đổi không phải file .ts/.tsx/.js/.jsx/.json/.sql
    case "$changed" in
      *.ts|*.tsx|*.js|*.jsx|*.json|*.sql|*.css|*.html) ;;
      *) continue ;;
    esac
    log "phát hiện thay đổi: $changed -> restart $svc"
    sleep 0.5   # debounce
    restart_svc "$svc" || true
  done
}

watch_poll() {
  local svc="$1"; shift
  local dirs=("$@")
  local snapshot_file="$PM_STATE_DIR/$svc.watchsnapshot"
  take_snapshot() {
    find "${dirs[@]}" -type f \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
         -o -name '*.json' -o -name '*.sql' -o -name '*.css' -o -name '*.html' \) \
      -newermt '-90 seconds' -printf '%T@ %p\n' 2>/dev/null | sort || true
  }
  take_snapshot > "$snapshot_file.tmp"
  mv "$snapshot_file.tmp" "$snapshot_file.prev"
  log "watch(poll) $svc: kiểm tra mỗi 3s các thay đổi trong ${dirs[*]}"
  while true; do
    sleep 3
    take_snapshot > "$snapshot_file.now"
    if ! diff -q "$snapshot_file.prev" "$snapshot_file.now" >/dev/null 2>&1; then
      log "phát hiện thay đổi -> restart $svc"
      mv "$snapshot_file.now" "$snapshot_file.prev"
      restart_svc "$svc" || true
    else
      mv "$snapshot_file.now" "$snapshot_file.prev"
    fi
  done
}

# --- Cleanup -----------------------------------------------------------------
clean_all() {
  stop_svc server || true
  stop_svc client || true
  rm -rf "$PM_STATE_DIR" "$PM_LOG_DIR"
  log "đã xoá $PM_STATE_DIR (pid + log)"
}

# --- Resolve list of services -----------------------------------------------
RESOLVED=()
resolve_svcs() {
  local arg="${1:-all}"
  case "$arg" in
    all)    RESOLVED=(server client) ;;
    server|client) RESOLVED=("$arg") ;;
    *) log_err "service không hợp lệ: $arg (dùng: server | client | all)"; exit 1 ;;
  esac
}

# --- Main --------------------------------------------------------------------
usage() {
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  local cmd="${1:-status}"
  shift || true
  case "$cmd" in
    start)
      resolve_svcs "${1:-all}"
      for s in "${RESOLVED[@]}"; do start_svc "$s"; done
      status_all
      ;;
    stop)
      resolve_svcs "${1:-all}"
      for s in "${RESOLVED[@]}"; do stop_svc "$s"; done
      status_all
      ;;
    restart|reload)
      resolve_svcs "${1:-all}"
      for s in "${RESOLVED[@]}"; do restart_svc "$s"; done
      status_all
      ;;
    status|st)
      status_all
      ;;
    logs)
      local svc="${1:-server}"
      shift || true
      case "$svc" in server|client) ;; *) log_err "service không hợp lệ: $svc"; exit 1 ;; esac
      show_logs "$svc" "$@"
      ;;
    tail)
      local svc="${1:-server}"
      case "$svc" in server|client) ;; *) log_err "service không hợp lệ: $svc"; exit 1 ;; esac
      show_logs "$svc" -f
      ;;
    watch)
      local svc="${1:-all}"
      if [ "$svc" = "all" ]; then
        log_err "watch cần chỉ định 1 service: watch server | watch client"
        exit 1
      fi
      case "$svc" in server|client) ;; *) log_err "service không hợp lệ: $svc"; exit 1 ;; esac
      watch_svc "$svc"
      ;;
    kill-port)
      local port="${1:-}"
      [ -n "$port" ] || { log_err "thiếu port"; exit 1; }
      free_port "$port"
      ;;
    clean)
      clean_all
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      log_err "lệnh không hợp lệ: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
