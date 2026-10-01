# Project Status — Pixelmon (Pokemon MMORPG)

> Cập nhật lần cuối: **2026-09-30** (đã rescan + dọn dead code UI — khớp với thực tế)
> File này được cập nhật **sau khi hoàn thành mỗi plan**.
> Designed để AI agent mới có thể load lại toàn bộ cấu trúc project ngay lập tức.

---

## Tổng quan dự án

**Pixelmon** — Pokémon MMORPG chạy trên web, Monorepo pnpm + Turborepo.

| Hạng mục                                                                                    | Trạng thái |
| ------------------------------------------------------------------------------------------- | ---------- |
| Monorepo scaffold (pnpm 9.15.0 + turbo 2.x)                                                 | ✅         |
| `packages/shared` — Types, Constants, Formulas, Schema, Data                                | ✅         |
| `packages/shared` — Game data (649 species, 559 moves, 526 items)                           | ✅         |
| `packages/shared` — Engine code (typechart, combat, stats, encounter, learnset, mapruntime) | ✅         |
| `apps/server` — Colyseus 0.15 + Express + PostgreSQL + Redis                                | ✅         |
| `apps/client` — Phaser 3 + Vite + Colyseus.js                                               | ✅         |
| `pnpm build` — 3/3 pass                                                                     | ✅         |
| `pnpm typecheck` — 4/4 pass                                                                 | ✅         |
| `pnpm lint` — 0 errors, 13 warnings (5 no-explicit-any, 5 consistent-type-imports, 3 normalize) | ✅ |
| Responsive — `Scale.RESIZE` + HUD relayout theo viewport                                | ✅ |
| `pnpm format:check` — clean                                                                 | ✅         |
| Seed users (11 accounts)                                                                    | ✅         |
| Auth UI (login + register — trang chủ + client overlay)                                     | ✅         |
| Security — JWT middleware trên mọi admin/game API                                           | ✅         |
| Security — 404 handler + central error handler                                              | ✅         |
| Security — Zod validation → HTTP 400 (không phải 500)                                       | ✅         |
| Security — admin.js gửi JWT token                                                           | ✅         |
| Process manager `scripts/pm.sh`                                                             | ✅         |
| End-to-end API test (18 checks) — all pass                                                  | ✅         |
| BattleRoom — ArraySchema, onJoin session mapping, empty team guard                          | ✅         |
| WorldScene — self-filter, throttle, sleep/launch ordering                                   | ✅         |
| Plan 6 — Client UI skeleton (6 panel HUD + placeholder map)                                 | ✅         |
| Plan 5i — Multi-language EN/VI (server + static client)                                     | ✅         |
| Plan 7 — Environment setup (pnpm, PostgreSQL 18, Valkey/Redis)                             | ✅         |
| Plan 8 — UI zoom tách riêng + Toolbar modes (Normal/Mini/Hidden + Anchor/Float)            | ✅         |
| Plan 9 — Click-to-move + Minimap drag + Button component + Font sắc + Fix zoom remote      | ✅         |
| Plan 10 — Camera pan bằng kéo trong vùng gameplay (MMB / Shift+drag)                       | ✅         |
| Plan 11 — Fix render: nameplate đơn, hover tile highlight, destination marker, camera ignore refresh | ✅         |
| Fix 12 — Ô hover/destination lệch toạ độ chuột (scrollFactor 0 vs world space)              | ✅         |
| Plan 13 — Phân tích UI phong cách MMORPG (neo góc, stack trục, bỏ floating)                | 📋 Chờ duyệt |
| Plan 14 — TopMenu dãy icon nhỏ + InfoPanel giờ/thời tiết + Minimap theo GPS                | ✅         |
| Plan 15 — Bỏ hotbar + bảng thông tin dạng bảng (avatar + tên + 2 loại tiền) + party dọc  | ✅         |
| Plan 16 — Dọn dead code UI (xóa Hotbar/Toolbar/Button + helpers hỏng)                    | ✅         |
| Plan 17 — Thư viện Sprite trong trang admin (upload/căn khung/preview/export 2 dạng)     | ✅         |
| Plan 18 — HUD Layout: tách zoom (Game/UI) + Neo/Tự do + Mini/Normal/Hidden + Ẩn tất cả     | 🔄 Đang làm |
| `gameData` / `mapLoader` nối vào server boot                                                | ❌ Chưa làm |
| Session persist — refresh trang không bị đá ra khỏi game                                    | ✅         |
| Scroll zoom chỉ map/nhân vật, không zoom UI (2 camera)                                     | ✅         |

---

## Cấu trúc thư mục (tham chiếu nhanh)

```
pixelmon/
├── package.json                    # Root scripts: dev, build, lint, format, pm:*
├── turbo.json                      # Turbo tasks: build, dev, lint, clean, typecheck
├── pnpm-workspace.yaml             # Workspace: apps/*, packages/*
├── tsconfig.base.json              # Shared TS config
├── eslint.config.js                # Flat ESLint (typescript-eslint + prettier)
├── .prettierrc                     # Prettier config
├── AGENTS.md                       # Agent instructions (đọc trước khi code)
├── project_status.md               # File này — comprehensive status + reference
├── README.md                       # Project overview
├── .env.example                    # Reference env vars
├── .gitignore
│
├── scripts/
│   ├── pm.sh                       # Process manager (start/stop/restart/logs/watch)
│   ├── pm.config                   # Config: ports, commands, timeouts
│   ├── server.sh                   # Server control: up/down/logs + users + db + tooling
│   └── README.md                   # PM documentation
│
├── packages/shared/
│   ├── package.json                # @pixelmon/shared — exports: ".", "./schema", "./data", "./data/*", "./assets/*"
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                # Re-exports: types, constants, formulas, schema, contracts, normalize (KHÔNG re-export loader)
│   │   ├── types/
│   │   │   ├── index.ts            # Barrel
│   │   │   ├── player.ts           # Player, OwnedPokemon, Stats, Inventory...
│   │   │   ├── item.ts             # Item, ItemCategory...
│   │   │   └── messages.ts         # Client/server message types
│   │   ├── constants/
│   │   │   ├── index.ts            # Barrel
│   │   │   ├── game.ts             # EV/IV caps, natures, battle timeouts, exp curves
│   │   │   ├── grid.ts             # TILE_SIZE=32, CANVAS_WIDTH/HEIGHT, PLAYER_SPEED
│   │   │   └── maps.ts             # MAPS (route_1, oak_lab, pewter_city) + DEFAULT_MAP
│   │   ├── schema/
│   │   │   └── index.ts            # Colyseus schemas: WorldState, PlayerState, BattleState, BattleSide, BattlePokemon
│   │   ├── formulas/
│   │   │   ├── index.ts            # Barrel (xuất tất cả công thức + type)
│   │   │   ├── combat.ts           # calcDamage, stageMultiplier, accuracyCheck, isCriticalHit, calcExpGain...
│   │   │   ├── stats.ts            # calcAllStats, computeOwnedPokemonStats, expToLevel, rollIVs/Nature/Gender/Shiny
│   │   │   ├── generator.ts        # generatePokemon, levelUp, addExp, applyEvYields
│   │   │   ├── encounter.ts        # rollEncounter, rollWildEncounter, attemptCatch, calculateCatchChance
│   │   │   ├── learnset.ts         # learnsetAtLevel, checkLevelEvolution, evolveSpecies
│   │   │   ├── moveset.ts          # MoveSlot, hasPp, consumePp, restorePp
│   │   │   ├── typechart.ts        # typeEffectiveness, stabMultiplier, setTypeChart/getTypeChart
│   │   │   └── mapruntime.ts       # isWalkable, isGrass, getWarpAt, clampToMap...
│   │   └── data/
│   │       ├── index.ts            # Barrel (contracts + normalize + loader)
│   │       ├── contracts.ts        # Zod schemas: Species, Move, Item, Ability, TypeChart, SpawnEntry, ServerMap
│   │       ├── normalize.ts        # Field normalization: special_attack→spAttack, medium_slow→mediumSlow
│   │       └── loader.ts           # GameData (singleton), MapLoader — server-only fs (import qua @pixelmon/shared/data)
│   ├── data/                       # JSON game data (species, moves, items, maps/server, maps/tiled, quests...)
│   └── assets/                     # Icons (649 pokemon), tilesets (16x16 PNGs)
│
├── apps/server/
│   ├── package.json                # @colyseus/core ^0.15, @colyseus/schema ^2.0, express ^4.21
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                # Entry: initDatabase() → createApp() + createServer() → Server.define(world,battle) → listen
│   │   ├── app.ts                  # Express: CORS, /health, static pages, auth router, admin API (JWT), user API, 404 + error
│   │   ├── i18n/
│   │   │   └── index.ts            # Server i18n: t(locale, key), localeFromRequest (EN/VI) — 20+ message keys
│   │   ├── middleware/
│   │   │   └── auth.ts             # requireAuth + requireAdmin + asAuth (JWT middleware)
│   │   ├── config/
│   │   │   ├── env.ts              # process.env → config object (JWT_SECRET, DB, Redis, PORT)
│   │   │   ├── database.ts         # PostgreSQL Pool + schema DDL (users, user_info, players, pokemon, inventory) + migration
│   │   │   ├── redis.ts            # Redis/ioredis client + session cache
│   │   │   └── index.ts            # Re-exports pool, redis, config, initDatabase, closeDatabase, cacheSession
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── index.ts        # Express Router: POST /register, POST /login, GET /me
│   │   │   │   ├── register.ts     # Zod validate → bcrypt hash → INSERT users+players → JWT token
│   │   │   │   ├── login.ts        # Zod validate → bcrypt compare → UPDATE last_login → cacheSession → JWT
│   │   │   │   └── me.ts          # GET /me — JWT verify → SELECT user+player+user_info → return
│   │   │   ├── admin/
│   │   │   │   ├── index.ts        # GET /status, /users (search+pagination+roleFilter+sort), POST /users, PATCH /users/:id, POST /users/:id/password, /ban|/unban, DELETE /users/:id, GET /pokemon, /players
│   │   │   │   ├── shared.ts       # Hằng SPRITES (FRAME_COUNT=12, DIRS, FRAME_SIZE=32, BASE_URL, MAX_UPLOAD_BYTES)
│   │   │   │   └── sprite.ts       # CRUD /api/admin/sprites — multer RAM upload, kiểm tra PNG magic, ghi public/sprites/, export 2 dạng (baked sheet / atlas+toạ độ)
│   │   │   ├── user/
│   │   │   │   └── index.ts        # GET/PUT /api/users/:id/info (birthday, bio, notes) + getUserLanguage
│   │   │   ├── player/
│   │   │   │   └── index.ts        # GET /players/:userId, /players (online list — stub)
│   │   │   ├── pokemon/
│   │   │   │   └── index.ts        # GET /pokemon/:userId
│   │   │   ├── world/
│   │   │   │   └── index.ts        # Colyseus WorldRoom: onJoin, move handler, chat, start_battle (encounterRate), simulationInterval
│   │   │   └── battle/
│   │   │       └── index.ts        # Colyseus BattleRoom: onJoin, battle_move/item/switch/forfeit, resolveTurn, 60s timeout
│   │   └── scripts/
│   │       ├── seed-users.ts       # Idempotent seed: admin/admin123 + 10 users + players rows
│   │       └── user-admin.ts       # CLI quản lý tài khoản: list/create/passwd/delete/show
│   ├── public/                     # Static HTML/CSS/JS served by Express
│   │   ├── index.html              # Landing page + auth forms (login + register with confirm password)
│   │   ├── admin.html              # Admin dashboard: login gate + EN/VI toggle, CRUD users, sprites
│   │   ├── sprites/                # Sprite sheet đã export từ admin (gitignored, tự tạo lúc chạy)
│   │   ├── css/base.css, home.css, admin.css
│   │   └── js/home.js, admin.js, i18n.js
│   └── dist/                       # Build output
│
├── apps/client/
│   ├── package.json                # phaser ^3.87, colyseus.js ^0.15, vite ^6.0
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.ts                 # Entry: new Phaser.Game(roundPixels, Scale.FIT, scenes: Boot→Login→World→Battle)
│       ├── config.ts               # DEV_MODE=true + DEV_CREDENTIALS (admin/admin123) — auto-login khi dev
│       ├── scenes/
│       │   ├── BootScene.ts        # Gen textures (tiles, trainer sheet 4h×3f, shadow, px), DEV_MODE auto-login → World
│       │   ├── LoginScene.ts       # HTML overlay: login + register tabs, confirmPassword, API_BASE dynamic
│       │   ├── WorldScene.ts       # PlaceholderMap + camera follow + 6 panels HUD + Colyseus network + wild encounter (30%)
│       │   └── BattleScene.ts      # Battle UI placeholder (hardcoded Pikachu vs Charmander — chưa dùng server state)
│       ├── entities/
│       │   ├── PlayerSprite.ts     # 4 hướng + walk anim, bóng đổ, depth, giữ API cũ
│       │   └── PokemonSprite.ts    # Placeholder (unused)
│       ├── ui/
│       │   ├── theme.ts            # C (palette) + FONT + ts (text style helper) — nguồn màu duy nhất
│       │   ├── PanelFrame.ts       # drawPanel (shadow+bg+border), panelTitle, PANEL_PAD
│       │   ├── PlayerHud.ts        # Trái-trên: bảng avatar + tên + tiền game + tiền thật (KHÔNG level/EXP)
│       │   ├── PartyStrip.ts       # Trái, dọc (dưới PlayerHud): 6 ô pokemon xếp chồng + HP bar
│       │   ├── TopMenu.ts          # Giữa cạnh trên: 8 icon nhỏ (pokedex/bag/map/gps/team/settings/help/menu)
│       │   ├── InfoPanel.ts        # Góc trên phải: giờ HH:MM + ngày + thời tiết mô phỏng
│       │   ├── Minimap.ts          # Popup dưới InfoPanel, mặc định ẩn, bật qua icon GPS hoặc phím M
│       │   ├── ChatLog.ts          # Góc phải-dưới: 5 dòng chat + input (Enter để gửi)
│       │   ├── MenuPanel.ts        # Esc → pause menu: toggle HUD/minimap, UI zoom +/-, logout
│       │   └── UiZoomManager.ts    # UI zoom 0.7–1.5 step 0.1, lưu localStorage['pixelmon.uiZoom']
│       ├── world/
│       │   ├── PlaceholderMap.ts   # Map 60×45 tile (1920×1440px) + walkGrid cho pathfinding
│       │   └── Pathfinder.ts       # A* trên grid walkable (findPath, pathToPixels)
│       └── network/
│           └── ColyseusManager.ts  # Singleton: HTTP login → WS joinOrCreate(world), create(battle), sendMove/Chat
│
├── .pm/                            # Runtime: PID files + logs (gitignored)
│   ├── server.pid, client.pid
│   └── logs/
│
└── typescript-tmp/                 # Trống — leftover directory (có thể xóa)
```

---

## Backend API reference

| Method | Endpoint                        | Auth | Mô tả                                               | Response                                                                       |
| ------ | ------------------------------- | ---- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/health`                       | ❌   | Health check                                        | `{ok, uptime}`                                                                 |
| POST   | `/api/auth/register`            | ❌   | Đăng ký                                             | `{ok, token, userId}` (201), `{USER_EXISTS}` (409), `{VALIDATION}` (400)       |
| POST   | `/api/auth/login`               | ❌   | Đăng nhập                                           | `{ok, token, userId, displayName, language}`                                   |
| GET    | `/api/auth/me`                  | ✅   | User info + player + profile                        | `{ok, user: {...}, player: {...}}`                                             |
| GET    | `/api/admin/status`             | ✅Admin | DB/Redis stats + roleCounts                      | `{ok, database, redis, userCount, pokemonCount, roleCounts}`                   |
| GET    | `/api/admin/users`              | ✅Admin | Users (search+pagination+role+sort): `?q=&page=&limit=&sort=&role=` | `{ok, users: [...], pagination: {...}}`                               |
| POST   | `/api/admin/users`              | ✅Admin | Tạo user mới                                        | `{ok, userId, message}` (201), `{USER_EXISTS}` (409)                           |
| PATCH  | `/api/admin/users/:id`          | ✅Admin | Sửa (displayName, level, money, role, language, bio, notes) | `{ok, message}`                                                          |
| POST   | `/api/admin/users/:id/password` | ✅Admin | Reset password                                      | `{ok, message}` (200), `{NOT_FOUND}` (404)                                     |
| POST   | `/api/admin/users/:id/ban`      | ✅Admin | Ban user → role='banned'                           | `{ok, message}`                                                                |
| POST   | `/api/admin/users/:id/unban`    | ✅Admin | Unban → role='player'                              | `{ok, message}`                                                                |
| DELETE | `/api/admin/users/:id`          | ✅Admin | Xóa user (cascade)                                  | `{ok, message}` (200), `{NOT_FOUND}` (404)                                     |
| GET    | `/api/users/:id/info`           | ✅   | Xem profile (birthday, bio, notes)                   | `{ok, user: {...}, info: {...}}`                                               |
| PUT    | `/api/users/:id/info`           | ✅   | Cập nhật profile (chính mình hoặc admin)            | `{ok, message}`                                                                |
| GET    | `/api/admin/pokemon`            | ✅Admin | Danh sách pokemon                                   | `{ok, pokemon: [...]}`                                                         |
| GET    | `/api/admin/players`            | ✅Admin | Vị trí players                                      | `{ok, players: [...]}`                                                         |
| GET    | `/api/players/:userId`          | ✅   | Player info                                         | `{ok, player: {...}}`                                                          |
| GET    | `/api/players`                  | ✅   | Online players list (stub)                          | `{ok, players: [...]}`                                                         |
| GET    | `/api/pokemon/:userId`          | ✅   | Pokemon list                                        | `{ok, pokemon: [...]}`                                                         |

## Colyseus rooms

| Room     | maxClients | Messages                                                        | Mô tả                      |
| -------- | ---------- | --------------------------------------------------------------- | -------------------------- |
| `world`  | 50         | `move`, `chat`                                                  | Map sync, player positions |
| `battle` | 2          | `battle_move`, `battle_item`, `battle_switch`, `battle_forfeit` | Turn-based battle          |

**WebSocket:** `ws://localhost:2567` (ws → http upgrade auto)

---

## Database schema (PostgreSQL)

```sql
-- users
id UUID PK, username TEXT UNIQUE, password_hash TEXT, display_name TEXT,
role TEXT CHECK IN ('player','moderator','admin','banned') DEFAULT 'player',
language TEXT NOT NULL DEFAULT 'en',          -- i18n preference
created_at TIMESTAMPTZ DEFAULT NOW(), last_login_at TIMESTAMPTZ
-- migration tự động: ALTER TABLE users ADD COLUMN role/language (nếu DB cũ)

-- user_info (1-1 với users — profile bổ sung)
user_id UUID PK FK→users.id ON DELETE CASCADE,
birthday DATE NULL,
bio TEXT DEFAULT '',            -- giới thiệu / self intro
notes TEXT DEFAULT '',          -- ghi chú (admin)
updated_at TIMESTAMPTZ DEFAULT NOW()

-- players (1-1 với users)
id UUID PK FK→users.id ON DELETE CASCADE,
x INT DEFAULT 0, y INT DEFAULT 0, map_id TEXT DEFAULT 'route_1',
direction TEXT DEFAULT 'down', level INT DEFAULT 1, exp BIGINT DEFAULT 0,
money INT DEFAULT 5000, stats JSONB DEFAULT '{}'

-- pokemon
id UUID PK, owner_id UUID FK→users.id ON DELETE CASCADE,
species_id TEXT, nickname TEXT, level INT DEFAULT 1, exp BIGINT DEFAULT 0,
ivs JSONB DEFAULT '{}', evs JSONB DEFAULT '{}', stats JSONB DEFAULT '{}',
current_hp INT DEFAULT 0, moves JSONB DEFAULT '[]', status TEXT,
shiny BOOLEAN DEFAULT FALSE,        -- KHÔNG phải is_shiny
caught_at TIMESTAMPTZ DEFAULT NOW(),
party_slot SMALLINT                 -- 0-5 = party, NULL = PC box

-- inventory (chưa dùng — đã khai báo DDL)
owner_id UUID FK→users.id ON DELETE CASCADE,
item_id TEXT, quantity INT DEFAULT 0,
PK (owner_id, item_id)
```

---

## Multi-language (i18n)

**Ngôn ngữ hỗ trợ:** `en` (mặc định) và `vi`.

### Server (`apps/server/src/i18n/index.ts`)

- `t(locale, key)` — trả message theo locale, dùng cho mọi API error message
- `localeFromRequest(req)` — xác định locale: `?lang=vi` → `Accept-Language: vi` → mặc định `en`
- Login response trả `language` từ DB (`users.language`)
- `/api/auth/me` trả `user.language`
- Header response nên set `Content-Language`

### Client/Static

- `public/js/i18n.js` — dictionary 200+ keys `[en, vi]`, `window.I18N = { t, setLang, getLang, apply, onApply }`
- HTML dùng `data-i18n="key"` cho text, `data-i18n-ph="key"` cho placeholder, `data-i18n-title="key"` cho title
- Nút EN/VI toggle ở header (`data-lang-toggle="en|vi"`), lưu vào `localStorage['pixelmon.lang']`
- `admin.js` đăng ký `I18N.onApply(fn)` để re-render dynamic content (badges, counts, table)
- Mặc định `en` — nếu chưa set, localStorage fallback `'en'`

### DB

- Cột `users.language TEXT DEFAULT 'en'` — lưu preference của user
- Migration tự động thêm cột khi DB cũ chưa có

---

## User profile (`user_info`)

Bảng `user_info` (1-1 với `users`) lưu:

| Cột        | Kiểu      | Mô tả                   |
| ---------- | --------- | ----------------------- |
| `birthday` | DATE NULL | Ngày sinh               |
| `bio`      | TEXT      | Giới thiệu / self-intro |
| `notes`    | TEXT      | Ghi chú nội bộ (admin)  |

API:

- `GET /api/users/:id/info` — xem (cần auth: chính mình hoặc admin)
- `PUT /api/users/:id/info` — cập nhật (birthday, bio, notes)
- `PATCH /api/admin/users/:id` — admin sửa cả bio + notes + language
- `GET /api/auth/me` — trả luôn birthday/bio/notes

---

## Test accounts

| Username             | Password   | Role            |
| -------------------- | ---------- | --------------- |
| `admin`              | `admin123` | Administrator   |
| `user01` .. `user10` | `123`      | Regular trainer |

> Tài khoản cũ đã bị xóa để ẩn. Seed script (`scripts/server.sh seed`) tạo `admin/admin123` + 10 users.

---

## Server control commands

```bash
# Process management (qua pm.sh)
bash scripts/server.sh up            # khởi động server
bash scripts/server.sh down          # dừng server
bash scripts/server.sh restart       # restart
bash scripts/server.sh status        # trạng thái + port + log
bash scripts/server.sh logs [n]      # xem log (mặc định 200 dòng)
bash scripts/server.sh tail          # theo dõi log realtime
bash scripts/server.sh watch         # auto-reload khi edit src/
bash scripts/server.sh health        # GET /health

# Account management
bash scripts/server.sh users               # liệt kê tài khoản
bash scripts/server.sh user <name>         # xem chi tiết
bash scripts/server.sh user-add <name> <pass> [display]  # tạo mới
bash scripts/server.sh user-passwd <name> <pass>         # đổi mật khẩu
bash scripts/server.sh user-del <name>     # xóa

# Database
bash scripts/server.sh db                # vào psql trực tiếp
bash scripts/server.sh db-sql "<SQL>"    # chạy SQL 1 lần
bash scripts/server.sh db-tables         # liệt kê bảng
bash scripts/server.sh db-count          # số dòng mỗi bảng

# Seed (tạo admin + 10 users idempotent)
bash scripts/server.sh seed

# Dev tooling
bash scripts/server.sh rebuild          # build lại
bash scripts/server.sh typecheck        # typecheck
bash scripts/server.sh lint             # lint
```

> Hoặc qua npm: `pnpm pm:start`, `pnpm pm:stop`, `pnpm pm:status`...

---

## Admin Dashboard Features

### Login Gate

- Trang `/admin.html` yêu cầu đăng nhập trước khi hiển thị dashboard
- JWT token lưu trong `localStorage['pixelmon.token']`
- Kiểm tra token bằng `GET /api/auth/me` khi load trang
- Nếu token hết hạn → hiện form đăng nhập
- Nút "Đăng xuất" ở sidebar footer

### User Management (view "Quản lý người chơi")

- **Bảng users** với phân trang server-side (20/trang)
- **Tìm kiếm** realtime (debounce 300ms) — search theo username hoặc displayName (ILIKE)
- **Pagination** — nút «/» + page numbers, hiển thị tổng/trang hiện tại
- **Tạo user mới** — modal form: username, displayName, password, level, money
- **Sửa user** — modal: sửa displayName, level, money (không đổi username)
- **Reset password** — prompt nhập password mới
- **Xóa user** — confirm modal trước khi xóa (cascade xóa player + pokemon)
- **Highlight dòng self** — user đang đăng nhập được đánh dấu
- **Ẩn nút xóa self** — không thể tự xóa mình

### Server Health (view "Tổng quan")

- KPI: uptime, tổng users, đang online, tổng Pokémon
- Badge: Colyseus/Express, PostgreSQL, Redis
- Bảng 5 users mới nhất

### Pokemon & Players Views

- Danh sách Pokémon với species, level, shiny
- Vị trí người chơi trên map

### Backend Admin API

| Endpoint                                 | Method | Chức năng                       |
| ---------------------------------------- | ------ | ------------------------------- |
| `/api/admin/users?q=&page=&limit=&sort=` | GET    | Danh sách + search + pagination |
| `/api/admin/users`                       | POST   | Tạo user mới                    |
| `/api/admin/users/:id`                   | PATCH  | Sửa displayName/level/money     |
| `/api/admin/users/:id/password`          | POST   | Reset password                  |
| `/api/admin/users/:id`                   | DELETE | Xóa user (cascade)              |

---

## Build & quality check

```bash
fnm use 20        # Node 20.20.2 (required — pnpm is only in v20)
pnpm build        # 3/3 pass (shared → server → client)
pnpm typecheck    # 4/4 pass
pnpm lint         # 0 errors, 9 warnings (no-explicit-any)
pnpm format:check # clean
```

---

## Known issues cần sửa tiếp (Phase 2+)

### Critical (đã fix trong session này)

| Issue                                                           | File                           | Status                       |
| --------------------------------------------------------------- | ------------------------------ | ---------------------------- |
| LoginScene register fetch relative URL → gọi nhầm Vite          | `LoginScene.ts:260`            | ✅ Đã fix (API_BASE dynamic) |
| Admin/game API không auth middleware — public data leak         | `app.ts`                       | ✅ Đã fix (`requireAuth`)    |
| ZodError → HTTP 500 thay vì 400                                 | `auth/register.ts`, `login.ts` | ✅ Đã fix (ZodError → 400)   |
| BattleRoom: sessionId vs userId mismatch                        | `battle/index.ts:33`           | ✅ Đã fix (sessionSide Map)  |
| BattleRoom: `side.team = array as any` breaks Colyseus encoding | `battle/index.ts:82`           | ✅ Đã fix (ArraySchema push) |
| BattleRoom: empty team → crash                                  | `battle/index.ts`              | ✅ Đã fix (guard empty team) |
| BattleRoom: divide-by-zero                                      | `battle/index.ts`              | ✅ Đã fix (defense guard)    |
| WorldScene: self never filtered                                 | `WorldScene.ts:79`             | ✅ Đã fix (userId match)     |
| WorldScene: throttle always fires                               | `WorldScene.ts:162`            | ✅ Đã fix (lastMoveSent)     |
| No 404/500 handler                                              | `app.ts`                       | ✅ Đã fix                    |
| `admin.js` không gửi JWT                                        | `admin.js`                     | ✅ Đã fix                    |
| `@colyseus/schema` import failed (broken symlink)               | `packages/shared/node_modules` | ✅ Đã fix (reinstall)        |

### Warning (chưa fix — theo dõi Phase 2+)

| Issue                                                                | File                                                | Mô tả / Mức độ                                    |
| -------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| JWT_SECRET fallback hardcoded                                        | `config/env.ts:6`                                   | Cần `.env` production                              |
| authToken never sent to Colyseus rooms                               | `ColyseusManager.ts`                                | Không verify JWT trong WS                          |
| WorldRoom: no server-side collision check                            | `world/index.ts:12-19`                              | Client có thể teleport                             |
| WorldRoom: no rate limit / spam protection                           | `world/index.ts:12-19`                              | Client có thể spam move messages                   |
| WorldRoom: `this.presence.publish` deprecated in 0.16                | `world/index.ts:37`                                 | Battle request qua presence — cần rewrite nếu upgrade Colyseus |
| BattleRoom: applyAttack không dùng move data                        | `battle/index.ts:191-207`                           | Ignores power, type, STAB, accuracy, critical hit  |
| BattleRoom: timeout 60s hardcoded                                   | `battle/index.ts:72`                                | Không dùng BATTLE_TIMEOUT từ constants/game.ts     |
| Dead code: loader.ts GameData/MapLoader never boot server-side       | `packages/shared/src/data/loader.ts`                | `src/index.ts` exports loader nhưng `server/index.ts` không gọi `gameData.load()` |
| Dead code: PokemonSprite unused                                      | `apps/client/src/entities/PokemonSprite.ts`         | Placeholder — không dùng trong scene nào            |
| Dead code: `getUserLanguage` API không wired                         | `user/index.ts:96` + `app.ts`                      | Export nhưng không đăng ký route                   |
| BattleScene: client-side damage không dùng server state              | `BattleScene.ts`                                    | Hardcoded Pikachu vs Charmander — chưa sync Colyseus |
| Duplicated constants: STAGE_MULT vs STAT_STAGE_MULTIPLIER           | `constants/game.ts` vs `formulas/combat.ts`         | Cần gộp                                            |
| `MAPS` (constants/maps.ts) vs `data/maps/` dual source of truth     | `constants/maps.ts`                                 | Route_1 60×60 trong MAPS vs 60×45 PlaceholderMap; ID khác (route_1 vs pallet-town) |
| No migration system                                                  | `config/database.ts`                                | `CREATE TABLE IF NOT EXISTS` + manual ALTER COLUMN only |
| exp returned as string (pg BIGINT)                                   | `auth/me.ts` (if pg returns BigInt)                 | Type mismatch potential                            |
| `updateUserInfo` auth logic bug                                      | `user/index.ts:56`                                  | `auth.user && (userId !== id \|\| role !== 'admin')` — self non-admin bị 403, và `!auth.user` bypass auth check |
| `typescript-tmp/` empty leftover dir                                 | `/mnt/data/AI-Agent/pixelmon/typescript-tmp/`       | Có thể xóa                                        |
| `root package.json` thiếu `"type": "module"`                        | `package.json`                                      | Gây MODULE_TYPELESS_PACKAGE_JSON warning khi lint   |
| Vite bundle > 500kB                                                  | client build                                        | 1,665 kB single chunk — cần code-split              |

---

## Quy tắc quan trọng khi reload project

1. **Node version:** Luôn `fnm use 20` trước — pnpm chỉ có trong Node v20 (v24 không có pnpm)
2. **Field names:** `spAttack`, `spDefense`, `pokemonId`, `mediumSlow`, `baseExperience` (không dùng legacy names)
3. **Data:** Import qua `@pixelmon/shared` (`gameData`, `mapLoader`), KHÔNG import trực tiếp `data/*.json`
4. **Shared package:** Tên package là `@pixelmon/shared`; client và server đều import từ đây
5. **Schema:** Colyseus schemas trong `packages/shared/src/schema/` — server broadcast, client `onStateChange`
6. **Auth flow:** HTTP POST `/api/auth/login` → JWT token → dùng `Authorization: Bearer <token>` cho mọi API protected
7. **Ports:** Server :2567 (Colyseus WS + Express), Client :5173 (Vite dev)
8. **Process manager:** `bash scripts/pm.sh [start|stop|restart|status|logs|watch]` — tự free port, tự kill child
9. **localStorage key:** `pixelmon.token`, `pixelmon.userId`, `pixelmon.displayName`
10. **API_BASE dynamic:** Client tại `:5173` gọi `http://localhost:2567`, tại `:2567` gọi `window.location.origin`

---

## Plans & Trạng thái công việc

> Toàn bộ chi tiết các Plan cũ (Plan 0 đến Plan 18) và Nhật ký thay đổi đã được chuyển vào: [`docs/plans/archive_status_history.md`](docs/plans/archive_status_history.md).

### Kế hoạch hiện tại: Quản lý Maps & Sprite (Plan 19)

1. **Phân tích tài nguyên trong `game_pack`:**
   - Khảo sát map Kanto / Tiled maps (`.tmx`, `.tsx`, tileset PNG) và sprite demo.
2. **Import Maps Tiled vào Game:**
   - Thay thế `PlaceholderMap` bằng map thật từ `game_pack`.
   - Xóa các tính năng map editor thừa, chuyển sang cơ chế import map có sẵn.
3. **Cập nhật Sprite mặc định:**
   - Kiểm tra sprite demo trong `game_pack`, tích hợp vào `PlayerSprite` và `BootScene`.
4. **Cập nhật Admin Dashboard:**
   - Thêm tab/view Quản lý tài nguyên (Maps & Sprites) trong trang quản trị.
