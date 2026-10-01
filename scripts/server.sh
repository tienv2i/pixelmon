#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# server.sh — Điều khiển server Pixelmon (các lệnh + DB + tài khoản)
#
# Cách dùng:
#   ./scripts/server.sh up            # khởi động server
#   ./scripts/server.sh down          # dừng server
#   ./scripts/server.sh restart       # restart server
#   ./scripts/server.sh status        # trạng thái server + port + log
#   ./scripts/server.sh logs [n]      # xem log server (mặc định 200 dòng)
#   ./scripts/server.sh tail          # theo dõi log realtime
#
#   # ── Tài khoản ──
#   ./scripts/server.sh users               # liệt kê tài khoản
#   ./scripts/server.sh user <name>         # xem chi tiết
#   ./scripts/server.sh user-add <name> <pass> [display]  # tạo
#   ./scripts/server.sh user-passwd <name> <pass>         # đổi mk
#   ./scripts/server.sh user-del <name>     # xóa
#
#   # ── DB ──
#   ./scripts/server.sh db                  # vào psql trực tiếp
#   ./scripts/server.sh db-sql "<SQL>"      # chạy SQL 1 lần
#   ./scripts/server.sh db-tables           # liệt kê bảng
#   ./scripts/server.sh db-count            # số dòng mỗi bảng
#
#   # ── Khác ──
#   ./scripts/server.sh health             # GET /health
#   ./scripts/server.sh rebuild            # build lại server
#   ./scripts/server.sh typecheck          # typecheck
#   ./scripts/server.sh lint               # lint
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

PM="$SCRIPT_DIR/pm.sh"

# Node + pnpm env
setup_env() {
  if ! command -v pnpm >/dev/null 2>&1; then
    if command -v fnm >/dev/null 2>&1; then
      eval "$(fnm env)" 2>/dev/null || true
      fnm use 20 >/dev/null 2>&1 || true
    fi
  fi
}

# Nạp .env (nếu có) để lấy DB_*
load_env() {
  if [ -f .env ]; then
    set -a; . ./.env; set +a
  fi
}

# ── Chạy script trong apps/server (dùng tsx) ──
run_tsx() {
  setup_env
  (cd apps/server && npx tsx "$@")
}

# ── psql helper ──
psql_cmd() {
  load_env
  local db="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/pixelmon}"
  psql "$db" "$@"
}

usage() {
  sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  local cmd="${1:-help}"
  shift || true

  case "$cmd" in
    up|start)
      bash "$PM" start server
      ;;
    down|stop)
      bash "$PM" stop server
      ;;
    restart|reload)
      bash "$PM" restart server
      ;;
    status|st)
      bash "$PM" status
      ;;
    logs)
      bash "$PM" logs server "$@"
      ;;
    tail)
      bash "$PM" tail server
      ;;
    watch)
      bash "$PM" watch server
      ;;
    kill-port)
      bash "$PM" kill-port "$@"
      ;;

    # ── Tài khoản ──
    users|user-list)
      run_tsx src/scripts/user-admin.ts list
      ;;
    user)
      local u="${1:-}"; [ -n "$u" ] || { echo "thiếu username"; exit 1; }
      run_tsx src/scripts/user-admin.ts show "$u"
      ;;
    user-add|create-user)
      local u="${1:-}" p="${2:-}" d="${3:-}"
      [ -n "$u" ] && [ -n "$p" ] || { echo "thiếu <username> <password>"; exit 1; }
      run_tsx src/scripts/user-admin.ts create "$u" "$p" $d
      ;;
    user-passwd|passwd)
      local u="${1:-}" p="${2:-}"
      [ -n "$u" ] && [ -n "$p" ] || { echo "thiếu <username> <newPassword>"; exit 1; }
      run_tsx src/scripts/user-admin.ts passwd "$u" "$p"
      ;;
    user-del|delete-user)
      local u="${1:-}"; [ -n "$u" ] || { echo "thiếu username"; exit 1; }
      run_tsx src/scripts/user-admin.ts delete "$u"
      ;;

    # ── Seed ──
    seed)
      run_tsx src/scripts/seed-users.ts
      ;;

    # ── DB ──
    db)
      psql_cmd
      ;;
    db-sql)
      local sql="${1:-}"; [ -n "$sql" ] || { echo "thiếu <SQL>"; exit 1; }
      psql_cmd -c "$sql"
      ;;
    db-tables)
      psql_cmd -c "\dt"
      ;;
    db-count)
      psql_cmd -c "
        SELECT 'users' AS tbl, COUNT(*)::int AS rows FROM users
        UNION ALL
        SELECT 'players', COUNT(*)::int FROM players
        UNION ALL
        SELECT 'pokemon', COUNT(*)::int FROM pokemon;"
      ;;

    # ── Dev tooling ──
    health)
      setup_env
      curl -s "${SERVER_URL:-http://localhost:2567}/health"; echo
      ;;
    rebuild)
      setup_env
      pnpm build
      ;;
    typecheck)
      setup_env
      pnpm typecheck
      ;;
    lint)
      setup_env
      pnpm lint
      ;;

    help|-h|--help)
      usage
      ;;
    *)
      echo "[server.sh] lệnh không hợp lệ: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
