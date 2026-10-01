# Setup lại môi trường dev (Arch → Fedora 44)

Mục tiêu: dựng lại toàn bộ toolchain + dịch vụ nền (PostgreSQL, Redis) + cài deps, sao cho
`pnpm build` / `pnpm typecheck` chạy được và server/client dev start được.

## Trạng thái đầu (đã kiểm tra)

- Fedora Linux 44 Workstation, SELinux `unconfined`, sudo passwordless OK (group `wheel`)
- Node **v24.21.0** (nvm, `~/.nvm/versions/node/v24.21.0`) — **không** có fnm, **không** pnpm, **không** corepack trong PATH
- `psql`, `redis-server`, `docker` — chưa cài
- Project deps cũ (`node_modules` còn 12 entries, `.pnpm` store còn) — cần `pnpm install` lại
- `.env` chưa có (chỉ `.env.example`)
- `packageManager: pnpm@9.15.0`

## Các bước

- [x] **S1. pnpm** — `npm i -g pnpm@9.15.0` → `~/.nvm/versions/node/v24.21.0/bin/pnpm` (Node 24 chạy pnpm 9 OK, không cần corepack/fnm)
- [x] **S2. PostgreSQL** — `dnf install postgresql-server postgresql` (PostgreSQL **18.6**), `postgresql-setup --initdb` → `/var/lib/pgsql/data`, enable + start - `ALTER USER postgres WITH PASSWORD 'postgres'` - `CREATE DATABASE pixelmon` - `pg_hba.conf`: `local`/`127.0.0.1`/`::1` → `scram-sha-256` (mặc định Fedora là `peer`/`ident`, phải đổi mới login được bằng password)
- [x] **S3. Redis** — `dnf install redis` → thực tế Fedora 44 cài **Valkey 9.0.6** (`valkey-compat-redis` shim), service name là `valkey.service` (`redis.service` là alias). `redis-cli ping` → `PONG`
- [x] **S4. Env** — `.env` copy từ `.env.example`
- [x] **S5. Deps** — `pnpm install` (lockfile v9 còn hợp lệ, store còn → 1.2s, không cần reinstall sạch)
- [x] **S6. Verify** — `pnpm build` 3/3 ✅ · `pnpm typecheck` 4/4 ✅ · `pnpm lint` 0 errors / 13 warnings ✅
- [x] **S7. Runtime** — `server.sh seed` tạo 11 users ✅ · `server.sh up` + `pm.sh start client` ✅ · `/health` → `{ok:true}` · `POST /api/auth/login` → token OK

## Kết quả

Setup hoàn tất, toàn bộ stack chạy được:

| Hạng mụng    | Trạng thái                                                    |
| ------------ | ------------------------------------------------------------- |
| OS           | Fedora Linux 44 Workstation (SELinux unconfined)              |
| Node         | v24.21.0 qua **nvm** (không có fnm)                           |
| pnpm         | 9.15.0 (`npm i -g`) — khớp `packageManager` trong root        |
| PostgreSQL   | 18.6, service active, DB `pixelmon`, user `postgres/postgres` |
| Redis        | Valkey 9.0.6 (`valkey.service`), `PONG`                       |
| Build        | 3/3 pass                                                      |
| Typecheck    | 4/4 pass                                                      |
| Lint         | 0 errors, 13 warnings (có sẵn từ trước)                       |
| Server :2567 | running, `/health` OK                                         |
| Client :5173 | running (Vite 6.4.3), HTTP 200                                |
| DB seed      | 11 accounts (admin + user01–10)                               |

### Ghi chú quan trọng cho session sau

1. **Dùng nvm, không dùng fnm.** `pm.config` đang set `PM_NODE_VERSION=20` và `pm.sh` có thể gọi
   `fnm use` → sẽ fail vì máy không có fnm. Node 24 chạy được mọi thứ, nên đổi `PM_NODE_VERSION`
   thành rỗng (dùng node hiện tại) hoặc cài fnm.
2. **pnpm phải nằm trong PATH.** Shell của agent có PATH chỉ gồm
   `/usr/local/bin:/usr/bin`. Cần thêm `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`
   trước khi chạy `pnpm`.
3. **Service name là `valkey.service`**, không phải `redis.service` (alias vẫn hoạt động).
4. `pm.sh`/`server.sh` vẫn chạy được vì các lệnh gọi `pnpm` — chỉ cần PATH đúng.
