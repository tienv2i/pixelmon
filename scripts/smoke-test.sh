#!/usr/bin/env bash
# Smoke test cho hệ thống Users/Auth.
# Chạy: ./scripts/smoke-test.sh   (server phải đang chạy ở 127.0.0.1:3000)
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"
PASS=0; FAIL=0

check() { # name expected actual
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "✅ $name"
    PASS=$((PASS+1))
  else
    echo "❌ $name — expected '$expected', got: $actual"
    FAIL=$((FAIL+1))
  fi
}

# jget <json> <dotted.path> — trích xuất giá trị lồng nhau, trả về "" nếu thiếu
jget() {
  echo "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for k in '$2'.split('.'):
        d = d[k]
    print(d if not isinstance(d, (dict, list)) else json.dumps(d))
except Exception:
    print('')
"
}

echo "=== 1. Health ==="
R=$(curl -s "$BASE/health")
check "GET /health" '"status":"ok"' "$R"

echo "=== 2. Register player ==="
EMAIL="player$RANDOM@test.dev"
UNAME="pl$RANDOM"
R=$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"username\":\"$UNAME\",\"password\":\"secret123\"}")
TOKEN=$(jget "$R" token)
ROLE=$(jget "$R" user.role)
check "register returns token" "" "$( [[ -n "$TOKEN" ]] && echo ok )"
check "new user role=player" 'player' "$ROLE"

echo "=== 3. Duplicate email rejected ==="
R=$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"username\":\"other\",\"password\":\"secret123\"}")
check "duplicate email 409" 'email already registered' "$R"

echo "=== 4. Login wrong password rejected ==="
R=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpass\"}")
check "bad password 401" 'Invalid credentials' "$R"

echo "=== 5. Login correct ==="
R=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\"}")
TOKEN=$(jget "$R" token)
check "login returns token" "" "$( [[ -n "$TOKEN" ]] && echo ok )"

echo "=== 6. GET /me without token ==="
R=$(curl -s "$BASE/api/auth/me")
check "no token 401" 'Missing bearer token' "$R"

echo "=== 7. GET /me with token ==="
R=$(curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")
check "me returns email" "$EMAIL" "$R"
check "me returns username" "$UNAME" "$R"

echo "=== 8. Player cannot access admin ==="
R=$(curl -s "$BASE/api/admin/users" -H "Authorization: Bearer $TOKEN")
check "player on admin 403" 'Requires role' "$R"

echo "=== 9. Admin login + list users ==="
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234}"
R=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
ATOKEN=$(jget "$R" token)
if [[ -z "$ATOKEN" ]]; then
  echo "⚠️  Bỏ qua admin tests (chưa seed admin — set ADMIN_EMAIL/ADMIN_PASSWORD trong .env rồi restart)"
else
  R=$(curl -s "$BASE/api/admin/users" -H "Authorization: Bearer $ATOKEN")
  check "admin lists users" "$EMAIL" "$R"

  TARGET_ID=$(echo "$R" | python3 -c "import sys,json;print([x for x in json.load(sys.stdin)['users'] if x['email']=='$EMAIL'][0]['id'])")
  R=$(curl -s -X PATCH "$BASE/api/admin/users/$TARGET_ID/role" -H "Authorization: Bearer $ATOKEN" \
    -H 'Content-Type: application/json' -d '{"role":"moderator"}')
  check "promote to moderator" '"role":"moderator"' "$R"

  R=$(curl -s -X PATCH "$BASE/api/admin/users/$TARGET_ID/active" -H "Authorization: Bearer $ATOKEN" \
    -H 'Content-Type: application/json' -d '{"isActive":false}')
  check "deactivate user" '"isActive":false' "$R"

  R=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"secret123\"}")
  check "deactivated user cannot login" 'Invalid credentials' "$R"
fi

echo ""
echo "=== RESULT: $PASS pass, $FAIL fail ==="
[[ $FAIL -eq 0 ]]
