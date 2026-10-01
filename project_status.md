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

## Plans đã hoàn thành

### Plan 0–4 (2026-09-29/30)

- Scaffold monorepo, shared types/formulas/schema, server (Colyseus+Express), client (Phaser+Vite)
- Copy game data + assets từ pixmon, rewrite engine code
- Tooling: build, lint, format, typecheck, README, .env.example

### Plan 5 (2026-09-30)

- **5a.** Seed 11 users (admin `admin` + 10 users) idempotent
- **5b.** Client LoginScene overlay (login + register tabs + confirmPassword)
- **5c.** Form auth trang chủ (`index.html` + `home.js`, token localStorage)
- **5d.** Fix register "không kết nối server" (API_BASE dynamic)
- **5e.** Process manager `scripts/pm.sh` (+ config, docs, npm scripts)

### Plan 5f — Security & Audit Fix (2026-09-30) ✅

Hoàn thành audit toàn bộ project và fix critical issues:

- **[12 critical + 3 warning fixes]**
- JWT `requireAuth` middleware cho mọi admin/game API
- LoginScene register: API_BASE dynamic (fix gọi nhầm Vite :5173)
- ZodError → HTTP 400 (thay vì 500)
- 404 handler + central error handler
- BattleRoom rewrite: ArraySchema, onJoin session mapping, empty team guard, divide-by-zero guard
- WorldScene: self-filter, throttle 100ms, sleep/launch ordering fix
- admin.js: gửi JWT token từ localStorage
- npm symlink fix (`packages/shared/node_modules`)

**Verify:** 18/18 end-to-end API checks pass, build 3/3, typecheck 4/4, lint 0 errors.

---

## Plans đang thực hiện

### Plan 6 — Client UI Skeleton (demo) — 2026-09-30 ✅ (đã verify)

Mục tiêu: dựng **bộ khung giao diện client** (sơ bộ, chưa cần đẹp hoàn chỉnh) gồm vùng thế giới + 6 panel HUD.
Chưa render map thật (chưa đọc `data/maps/tiled/*.tmj` hoặc `data/maps/server/*.json`) — chỉ vùng tượng trưng.

**Dev shortcut:** Thêm `src/config.ts` với `DEV_MODE = true` + `DEV_CREDENTIALS` để auto-login. Nếu muốn bật lại login bình thường, đổi `DEV_MODE = false`.

**Cấu trúc thư mục mới (được duyệt):** `apps/client/src/ui/`, `apps/client/src/world/`

| #   | Step      | File                                      | Nội dung                                                                                 |
| --- | --------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0   | Ghi plan  | `project_status.md`, `projects_status.md` | Plan này                                                                                 |
| 1   | Theme     | `src/ui/theme.ts`                         | Palette + font + helper text style (nguồn màu duy nhất)                                  |
| 2   | Shell     | `index.html`, `src/main.ts`               | `roundPixels`, `Scale.FIT`, `image-rendering: pixelated`                                 |
| 3   | Texture   | `src/scenes/BootScene.ts`                 | Tiles giả (grass/path/water/tree/roof…), trainer sheet 4 hướng × 3 frame, `shadow`, `px` |
| 4   | Sprite    | `src/entities/PlayerSprite.ts`            | 4 hướng + walk anim, bóng đổ, depth, giữ API cũ                                          |
| 5   | Map giả   | `src/world/PlaceholderMap.ts`             | 60×45 tile (1920×1440), `createBlankLayer` O(1) draw call, trang trí deterministic       |
| 6   | Camera    | `src/scenes/WorldScene.ts`                | Tách `createWorld/createHud/createInput`, `setBounds` + `startFollow` + `setRoundPixels` |
| 7   | Panels    | `src/ui/*.ts`                             | `PanelFrame`, `PlayerHud`, `Hotbar`, `PartyStrip`, `Minimap`, `ChatLog`                  |
| 8   | Modal mẫu | `src/ui/MenuPanel.ts`                     | `Esc` → tắt HUD/minimap, nút đăng xuất                                                   |
| 9   | Debug     | `src/scenes/WorldScene.ts`                | `const DEBUG = false` (FPS + vị trí)                                                     |
| 10  | Status    | `project_status.md`, `projects_status.md` | Đánh dấu `[x]` + kết quả                                                                 |

**Kết quả:**

✅ Tạo mới 8 files: `theme.ts`, `PanelFrame.ts`, `PlayerHud.ts`, `Hotbar.ts`, `PartyStrip.ts`, `Minimap.ts`, `ChatLog.ts`, `MenuPanel.ts`, `PlaceholderMap.ts`
✅ Sửa 3 files: `main.ts`, `index.html`, `BootScene.ts`, `PlayerSprite.ts`, `WorldScene.ts`
✅ Camera follow + bounds (map 60×45 > viewport → camera thực sự trượt)
✅ 6 panels: PlayerHud (top-left), Minimap (top-right), PartyStrip (bottom-left), Hotbar (bottom-center), ChatLog (bottom-right), MenuPanel (Esc)
✅ Debug flag: `const DEBUG = false` trong `WorldScene.ts`

**Verify (đã chạy, 2026-09-30):**

- `pnpm build` — 3/3 pass ✅
- `pnpm typecheck` — 4/4 pass ✅
- `pnpm lint` — 0 errors, 13 warnings ✅ (warnings có sẵn từ trước — `normalize.ts` + `WorldScene`)
- `pnpm format:check` — clean ✅

**Quyết định thiết kế (demo):**

- Map: **Option A** — vùng tượng trưng, texture tự sinh trong BootScene. Không đụng `MapLoader` (server-only `fs`).
- Camera: **follow + bounds** (map 60×45 > viewport 1280×960 → camera thực sự trượt).
- Player: **Option A** — sprite vẽ bằng Graphics, không dùng assets nhân vật (chưa có trong repo).
- Party: ô màu tô, **không** import `assets/icons/pokemon/*.png` (rủi ro Vite resolve từ `@pixelmon/shared/assets/*`).
- Mọi panel là **shell**: khung đẹp, dữ liệu mock/fallback, chưa hành vi thật.
- i18n chưa gắn HUD (để sau; `public/js/i18n.js` hiện chỉ phục vụ trang chủ/admin).

---

### Plan 7 — Environment setup lại (Arch → Fedora 44) — 2026-09-30 ✅

> Chi tiết + checklist: `docs/plans/2026-09-30-environment-setup.md`

Mục tiêu: dựng lại toolchain sau khi cài lại OS — pnpm, PostgreSQL, Redis, deps, verify build.

- [x] S1. pnpm `9.15.0` (Node 24 nvm — bỏ fnm, không cần corepack)
- [x] S2. PostgreSQL 18.6 server + DB `pixelmon` + user `postgres/postgres`
- [x] S3. Valkey 9.0.6 (Redis-compat, `valkey.service`)
- [x] S4. `.env` từ `.env.example`
- [x] S5. `pnpm install`
- [x] S6. `pnpm build` 3/3 ✅ / `typecheck` 4/4 ✅ / `lint` 0 errors ✅
- [x] S7. Seed 11 accounts ✅ + start server :2567 / client :5173 ✅ + `/health` OK

**Ghi chú:** Dùng `nvm` (không `fnm`). `pm.sh` cần thêm nvm bin vào PATH trước khi chạy. Service name là `valkey.service`.

---

### Plan 8 — UI: Game zoom / UI zoom + Toolbar modes — 2026-09-30 ✅

Mục tiêu: tách zoom thành **2 chức năng độc lập** và thêm chế độ hiển thị cho thanh công cụ (toolbar/HUD panels).

**Kết quả:**

- **Game zoom** (scroll wheel) giữ nguyên — chỉ zoom camera, không đụng HUD.
- **UI zoom** (`+`/`-` keys) mới — scale uniform toàn bộ HUD panels, range 0.7–1.5 step 0.1, lưu `localStorage['pixelmon.uiZoom']`.
- **Toolbar** mới — panel nhỏ top-center: 3 chế độ Normal/Mini/Hidden (phím `H`), Anchor/Float toggle (phím `F`).
- **Mini mode:** PlayerHud hiển thị avatar + HP bar + level; Hotbar slot nhỏ hơn (×0.75), ẩn label; PartyStrip slot nhỏ hơn, ẩn tên + HP bar; ChatLog hiển thị 2 dòng; Minimap co 50%.
- **Hidden mode:** ẩn toàn bộ panels (Toolbar cũng tự ẩn; nhấn `H` hiện lại).
- **Auto-mini:** tự chuyển mini khi viewport <720px hoặc <540px (hoàn nguyên khi viewport lớn hơn).

**Files mới:**
- `src/ui/UiZoomManager.ts` — UI zoom state + keybinds
- `src/ui/Toolbar.ts` — Normal/Mini/Hidden + Anchor/Float toggle

**Files sửa:**
- `src/ui/PanelFrame.ts` — thêm drag helper cho floating (save/load position)
- `src/ui/PlayerHud.ts` — thêm `setUiZoomManager()`, `setHudMode()`, `relayout()` nhân uiZoom
- `src/ui/Hotbar.ts` — thêm mini mode, slot co giãn theo uiZoom
- `src/ui/PartyStrip.ts` — thêm mini mode, slot co giãn
- `src/ui/Minimap.ts` — thêm mini mode (co 50%), uiZoom
- `src/ui/ChatLog.ts` — thêm mini mode (2 dòng), uiZoom
- `src/ui/MenuPanel.ts` — thêm UI Zoom +/- buttons, label hiển thị zoom hiện tại
- `src/scenes/WorldScene.ts` — wire UiZoomManager + Toolbar + phím `H`/`F`/`+`/`-`

**Verify:**
- `pnpm build` — 3/3 ✅
- `pnpm typecheck` — 4/4 ✅
- `pnpm lint` — 0 errors, 9 warnings ✅

---

### Plan 18 — HUD Layout: Neo/Tự do + Mini/Normal/Hidden + Ẩn tất cả + tách 2 loại zoom — 2026-10-01 🔄

**Bối cảnh:** Plan 8 từng có `Toolbar.ts` với Normal/Mini/Hidden + Anchor/Float, nhưng Plan 16 đã
**xóa `Toolbar.ts`, `Button.ts`, `Hotbar.ts`** → mất hết các chế độ này. `Minimap.ts` / `ChatLog.ts`
vẫn còn type `HudMode = 'normal'|'mini'|'hidden'` nhưng **không còn ai gọi `setHudMode()`**.

**Yêu cầu (user):**

1. Zoom tách làm **2 chức năng độc lập**: **game zoom** (camera) và **ui zoom** (toàn bộ HUD).
2. Thêm **chế độ mini** cho các thanh công cụ — tự bật khi màn hình **quá nhỏ**.
3. Thanh công cụ **neo ở góc màn hình** *hoặc* **kéo được tự do** → 2 chế độ: **Nép (docked)** / **Tự do (floating)**.
4. Có chế độ **ẩn hết tất cả** thanh công cụ.

**Thiết kế:**

- **`UiZoomManager`** (đã có) = UI zoom, `+`/`-`, lưu `localStorage['pixelmon.uiZoom']`.
- **Game zoom** = `cameras.main.zoom`, scroll wheel, tách qua **camera UI riêng** (`uiCam`) → HUD không bị ảnh hưởng.
- **`HudManager` (MỚI)** — trung tâm điều phối HUD, thay `Toolbar` đã bị xóa. Giữ state:
  - `mode: 'docked' | 'floating'` (phím `F`)
  - `visibility: 'normal' | 'mini' | 'hidden'` (phím `H` → cycle)
  - auto-mini: viewport `< 720×540` → ép mini (khi quay lại kích thước lớn → trở về `normal`)
  - Đăng ký các **thanh công cụ** (PlayerHud, PartyStrip, ChatLog, Minimap, InfoPanel, TopMenu, MenuPanel)
    + **góc neo** (`anchor: 'tl'|'tr'|'bl'|'br'|'top'|'bottom'`), auto neo lại về góc khi chuyển về `docked`.
  - **Ẩn tất cả** = set visibility `hidden` cho mọi thanh + **tự ẩn HudManager**.
- **Drag (chế độ floating):** `PanelFrame.makeDraggable()` — kéo bằng **title bar**, clamp trong viewport,
  lưu toạ độ `localStorage['pixelmon.hud.<id>']`. Chế độ `docked` → bỏ drag + về góc.

| # | File | Nội dung |
| -|------|----------|
| 1 | `src/ui/HudManager.ts` | **MỚI** — state modes + registry thanh công cụ + auto-mini + anchor/drag + hidden |
| 2 | `src/ui/PanelFrame.ts` | thêm `makeDraggable()` / `clearDraggable()` (title bar, clamp, persist) |
| 3 | `src/ui/Minimap.ts` | thêm `setAnchor()` + `getBounds()`; wire `setHudMode()` từ HudManager |
| 4 | `src/ui/ChatLog.ts` | thêm `getBounds()`; wire `setHudMode()` |
| 5 | `src/ui/PlayerHud.ts` | thêm `getBounds()`, `setHudMode()` (mini → avatar+money ngắn) |
| 6 | `src/ui/PartyStrip.ts` | thêm `getBounds()`, `setHudMode()` (mini → ẩn title, slot nhỏ) |
| 7 | `src/ui/InfoPanel.ts` | thêm `getBounds()`, `setHudMode()` (mini → chỉ giờ) |
| 8 | `src/ui/TopMenu.ts` | thêm `getBounds()`, `setHudMode()` (mini → icon nhỏ) |
| 9 | `src/ui/MenuPanel.ts` | thêm toggle cho **Neo/Tự do**, **Ẩn tất cả**, **Mini/Normal**, nút Game Zoom |
| 10 | `src/scenes/WorldScene.ts` | tạo `HudManager`, wire các thanh, phím `F`/`H`/`Shift+H`, auto-mini, drag |
| 11 | `src/ui/UiZoomManager.ts` | (giữ) — có thể thêm nút +/- trong MenuPanel |

**Verify:** `pnpm build` / `pnpm typecheck` / `pnpm lint` + test browser (F, H, resize nhỏ, drag).

---

## Nhật ký thay đổi

- **2026-09-30** — **Plan 7 (✅):** Setup lại môi trường Fedora 44 — pnpm 9.15.0 (nvm Node 24), PostgreSQL 18.6 (initdb + pg_hba password auth), Valkey 9.0.6 (Redis compat), `.env`, `pnpm install`, verify build/typecheck/lint, seed 11 accounts, start server + client, `/health` OK. Chi tiết: `docs/plans/2026-09-30-environment-setup.md`.
- **2026-09-30** — **Plan 17 (✅):** Quản lý sprite nhân vật trong trang admin — Hướng A (chuẩn hoá sheet) + khung preview.
  - **DB** — bảng `sprite_catalog` (id, name unique, mode `baked|atlas`, sheet_url, source_url, frames JSONB, frame_w/h, created_by, timestamps) + index theo name.
  - **Backend** — `modules/admin/shared.ts` (hằng SPRITES) + `modules/admin/sprite.ts`: GET/POST/PATCH/DELETE `/api/admin/sprites` (requireAuth+requireAdmin). Upload qua **multer memoryStorage** (4 MB), **kiểm tra PNG magic number** (8 byte đầu) thay vì tin Content-Type. Ghi file vào `apps/server/public/sprites/` (đã thêm `.gitignore`). Xuất **2 dạng**: `baked` (client ghé sheet 384×32 ở trình duyệt rồi gửi dataURL `bakedSheet` → lưu `{id}-sheet.png`) và `atlas` (giữ ảnh gốc `{id}.png` + toạ độ 12 frame trong DB). Validate: name unique (409), mode, frameW/H 8…256, frames array. Delete cascade file trên đĩa. Fix path `__dirname` — cần `'../../../public'` vì file nằm ở `src/modules/admin/`.
  - **Admin UI** — nav item mới **"Thư viện Sprite"** + view `view-sprites`: bảng danh sách (thumb sheet, tên, mode badge, frame size, ngày, Sửa/Xoá) + modal **sprite-editor** 920px 2 cột: trái = **canvas khung 12 frame** (overlay đánh số, ô đang chọn cyan) + **preview animate** (play/pause, chọn 1 hướng hoặc tất cả, ×4 pixel-art); phải = form (tên, loại đầu ra baked/atlas, frame W/H, upload ảnh gốc, layout "sheet hoàn chỉnh" hoặc "từng lát" với grid 12 ô drag-drop/click để chọn file) + **bảng toạ độ 12 frame** (X/Y/W/H editable trực tiếp, click hàng để chọn frame preview) + 3 nút Cancel / **Export sheet PNG** / Lưu. Editor ghép 12 lát ở trình duyệt → canvas 384×32 → dataURL upload làm `bakedSheet`.
  - **i18n** — thêm keys `view.sprites`, `sp.*` (EN/VI) trong `i18n.js`. ESLint thêm globals `Image`, `FileReader`.
  - **Verify browser (curl + Playwright):** atlas mode lưu 12 frame coords ✓; baked mode lưu `{id}-sheet.png`, serve 200 ✓; duplicate name → 409 ✓; PATCH rename ✓; DELETE xoá file trên đĩa ✓; UI upload sheet → canvas vẽ 12706 px, preview "↓ down frame 0 (32×32)" ✓; Preview "all" cycle 12 frame ✓; Lưu từ browser → modal đóng + bảng có 4 dòng + file download ✓. Build 3/3, typecheck 4/4, lint 0 errors/14 warnings. Test data đã dọn sạch.
  - **Chưa làm (đã chọn "Bỏ qua sync"):** chưa nối sprite vào Colyseus `PlayerState` / `PlayerSprite` (client game vẫn dùng texture hardcode trong BootScene), chưa gán sprite cho từng user. Xem lại ở plan sau nếu cần.
- **2026-09-30** — **Plan 16 (✅):** Dọn dead code UI sau khi redesign layout.
  - **Xóa 3 file chết:** `src/ui/Hotbar.ts` (8 slot dưới — đã bỏ trong Plan 15), `src/ui/Toolbar.ts` (toolbar trung tâm — đã thay bằng TopMenu trong Plan 14), `src/ui/Button.ts` (chỉ được Toolbar dùng — Toolbar đã chết).
  - **Di chuyển `HudMode` type** từ `Toolbar.ts` sang `Minimap.ts` (exported); `ChatLog.ts` import từ `Minimap` thay vì `Toolbar`.
  - **Cắt `PanelFrame.ts`** — xóa dead helpers: `loadPanelPos`, `savePanelPos`, `clearPanelPos`, `makeDraggable`, `DRAG_HANDLE_H` (từ khi bỏ floating panel). Còn `drawPanel` + `panelTitle` + `PANEL_PAD`.
  - Sửa comment WorldScene còn reference `Hotbar`.
  - **Verify:** `pnpm --filter client typecheck` 0 error, `pnpm build` 3/3, `pnpm lint` 0 errors/14 warnings. Browser: WorldScene hoạt động bình thường, 7 panel đều tồn tại, `childrenCount=85`.
- **2026-09-30** — **Plan 15 (✅):** UI — bỏ hotbar, đổi PlayerHud sang bảng, party dọc, thêm nút hướng dẫn.
  - **Bỏ `Hotbar`** (8 ô ở dưới) + text hint cố định ở đáy màn hình. Xóa import + field `hotbar` trong WorldScene.
  - **`PlayerHud` viết lại** — layout **bảng**: avatar lớn chiếm cột trái, cột phải theo hàng trên→xuống gồm **tên nhân vật** → **tiền game** (`$`) → **tiền thật** (`₿`). **Xóa hoàn toàn level + EXP bar** (game Pokémon trainer không có EXP/level).
  - **`PartyStrip` đổi sang dọc** — neo **ngay dưới PlayerHud** (`anchorY = 8+92+8 = 108`, scale theo uiZoom), 6 ô xếp chồng dọc trong khung 132px, HP bar dưới mỗi ô. Thêm `relayoutPublic()` + `getPanelHeight()`.
  - **Bảng hướng dẫn** (`hintText` + `hintGfx`) — khung tự co theo `hintText.width/height`, ẩn mặc định. Toggle bằng **phím `H`** hoặc **icon `?`** (mới thêm vào TopMenu). Nội dung: WASD, RMB, MMB+drag, Enter, M, H, Esc.
  - `onTopMenuIcon` thêm case `help`.
  - **Verify browser:** `hotbarExists:false`, `hudHasExpBar:false`, `hudHasRealMoney:true`, `partyAnchor=162` (uiZoom 1.5 → 108×1.5), `partyTitleY=171`, hint `H` + `?` đều toggle OK. Build 3/3, typecheck 4/4, lint 0 errors/14 warnings.
  - **`src/ui/TopMenu.ts` (MỚI):** dãy 7 icon nhỏ 28×28 neo giữa cạnh trên — 📖 Pokédex, 🎒 Bag, 🗺 Map, 📍 GPS, 👥 Team, ⚙ Settings, ☰ Menu. Hover hiện tooltip + viền sáng, active đổi nền cyan. Các icon (trừ GPS/Menu) là nút bấm placeholder — chưa popup.
  - **`src/ui/InfoPanel.ts` (MỚI):** khối góc trên phải — đồng hồ `HH:MM` (cập nhật mỗi giây), ngày `T4 • 30/9`, icon + tên thời tiết **giả lập** (xoay theo khung 3 giờ: ☀ Nắng / ⛅ Nhiều mây / ☁ Âm uất / 🌧 Mưa). `getBottomY()` trả về đáy panel để Minimap neo.
  - **`src/ui/Minimap.ts` (VIẾT LẠI):** neo **ngay dưới InfoPanel** (dùng `setAnchorYSource(() => infoPanel.getBottomY())`). **Mặc định ẩn** — bật qua icon GPS hoặc phím `M`. Bỏ hẳn cơ chế drag + snap.
  - **`src/scenes/WorldScene.ts`:** bỏ `Toolbar` + `applyHudMode()` + `lastHudMode`; thêm `topMenu`, `infoPanel`, `onTopMenuIcon(key)` switch. `getHudObjects()` include TopMenu + InfoPanel.
  - Xóa keybinds `H` (HUD mode) + `F` (Anchor/Float) vì đã bỏ toolbar.
  - **Verify:** GPS toggle `false → true`, `InfoPanel.getBottomY() = 62`, layout 7 icon ở giữa trên, InfoPanel 18:38 + ⛅. Build 3/3, typecheck 4/4, lint 0 errors/13 warnings.
  **Root cause:** `hoverGfx` / `destGfx` tạo với `.setScrollFactor(0)` → vẽ ở **screen space** (0,0 = góc trái-trên màn hình), nhưng toạ độ truyền vào là **world coords** từ `getWorldPoint()`. Khi camera scroll khác 0 → highlight bị lệch đúng bằng vector `scroll × zoom`.
  **Fix:** bỏ `.setScrollFactor(0)` ở `hoverGfx` (depth 6) và `destGfx` (depth 7) → giờ vẽ ở **world space**, khớp với toạ độ đã convert. Cả 2 đã `registerWorldObject()` để `uiCam` không render.
  **Verify:** 3 vị trí chuột khác nhau → `correctTile: true` cả 3 (ô highlight = `floor(getWorldPoint(p)/32)`), `hoverIsSameTile: true` khi right-click. Build 3/3, typecheck 4/4, lint 0 errors/10 warnings.
- **2026-09-30** — **Plan 11 (✅):** Fix 3 vấn đề render gameplay.
  - **(1) Nameplate chạy đôi:** `PlayerHud` render tên ở top-left trong khi `PlayerSprite.nameText` đã hiện tên nổi trên đầu nhân vật → thấy 2 bảng tên. Xoá `nameText` khỏi `PlayerHud` (đổi `name` thành optional, chỉ dùng nội bộ), `WorldScene` không truyền `name` nữa. Giữ `PlayerSprite.getChildObjects()` để register camera.
  - **(2) Chuột phải không track đúng ô:** trước đây chỉ đọc world point tại `pointerdown` → không có highlight, không feedback. Nay thêm `updateHoverTile(px, py)` gọi trong `pointermove` → `getWorldPoint` → `floor(x/TILE_SIZE)` → vẽ viền cyan 2px trên ô đó (depth 6, chỉ vẽ lại khi đổi ô qua `hoverTileX/hoverTileY`). Chuột phải → `drawDestination()` thay cho `drawPath()`: **không vẽ đường**, chỉ tô đen 40% ô đích + viền cyan + chấm nhỏ giữa ô (depth 7). Marker tự xoá khi nhân vật tới nơi.
  - **(3) Thu nhỏ màn hình sinh bản sao panel:** `PartyStrip.relayout()` destroy + tạo lại toàn bộ object qua `drawPanel()`, nhưng object mới **không** được `world.ignore()` → cả 2 camera cùng render → panel bị nhân đôi. Fix: thêm `WorldScene.refreshHudCameras()` + `scheduleCameraRefresh()` (dùng `time.delayedCall(0)` để chạy sau khi panel kịp relayout). Gọi trong `scale.on('resize')` của `setupUiCamera()` và trong `applyHudMode()` khi đổi mode.
  - Bonus: `ChatLog.setHudMode()` có bug comment + `destroy()` bị merge vào 1 dòng → text objects không được destroy → tích luỹ. Đã tách. `applyHudMode()` giờ guard `lastHudMode` để không rebuild thừa. `PlayerHud` lưu `lastHp`/`lastExp` để vẽ lại tỉ lệ sau khi `relayout()` tạo Bar mới.
  - Browser verify: `partyInWorld` = 0 trước/sau resize (700×500 → 1400×800), children count 76 → 76 ổn định, world camera chỉ còn 3 object (world), UI camera 102 object. Hover tile (672,640) vẽ 36 cmd; right-click tạo destination 57 cmd + path. Build 3/3, typecheck 4/4, lint 0 errors/10 warnings.
- **2026-09-30** — **Plan 10 (✅):** Camera pan bằng cách kéo trong vùng gameplay — `WorldScene.setupPointerInput()` theo dõi `camDrag` state; middle-button drag (hoặc Shift+left) gọi `cam.stopFollow()` rồi set `scrollX/Y = start - delta/zoom` mỗi frame kéo; `pointerup` → `startFollow(player, true, 0.12, 0.12)` để camera trượt về nhân vật. Chặn `contextmenu` trên canvas (Firefox/Chrome mặc định hiện menu che gameplay khi bấm chuột phải). Browser verify: middle-drag scrollY 208→308→208, scrollX 0→200→0; Shift+left 208→408→208. Hint text cập nhật thêm `RMB: Go to • MMB/Shift+Drag: Pan camera`.
- **2026-09-30** — **Plan 9 (✅):** Fix zoom sai vị trí khi có người chơi khác — `setupUiCamera()` chỉ gọi `getWorldObjects()` 1 lần lúc khởi tạo, sprite remote tạo sau đó không được `uiCam.ignore()` → bị cả 2 camera render → nhân đôi + lệch vị trí khi zoom. Thêm `registerWorldObject()`, `PlayerSprite.getChildObjects()`; gọi khi tạo remote player và chat text. Fix font mờ — `pixelArt: true` tắt antialias toàn canvas, đổi thành `pixelArt: false, antialias: true`. Minimap kéo được (drag-to-view, thả gần neo <40px thì tween về trong 200ms, thả xa thì giữ vị trí) + vẽ khung viewport camera vàng. Click phải → tự chạy: A* pathfinding mới `src/world/Pathfinder.ts`, walkable grid build trong `buildPlaceholderMap()`, `advanceAlongPath()` trong update, WASD/Arrows huỷ lệnh qua `cancelAutoMove()`, vẽ path cyan. Tạo `src/ui/Button.ts` component nút bấm dùng chung (variant normal/primary/danger, hover đổi màu) — Toolbar giờ có 6 nút: Mode, Layout, Game Zoom (-/1.0/+), UI Zoom (-/+). Browser verify: click-to-move player 432→525 với 9 waypoints; bấm W → path=0; zoom 2.0 remote player render đúng 1 lần; font sắc nét. Build 3/3, typecheck 4/4, lint 0 errors/10 warnings.
- **2026-09-30** — **Fix refresh bị đá ra + random battle + scroll zoom UI:**
  - **Session persist:** `ColyseusManager` thêm `saveSession`/`restoreSession`/`resume`/`clearSession` — lưu `pixelmon.token`/`pixelmon.userId`/`pixelmon.displayName` vào localStorage. `BootScene.create()` ưu tiên `hasSession()` → `resume()` (verify token qua `/api/auth/me`) → vào thẳng `World` nếu token còn hạn. `disconnect()` clear session. Verify bằng browser: login → refresh → vẫn ở `World`, không hiện login overlay.
  - **Random battle:** xóa global `this.input.on('pointerdown')` trong `WorldScene.createWorld()` — trước đây click bất kỳ (UI, trống, button) đều có 30% mở cửa sổ battle. Đã test: click canvas → chỉ có `World` active, `Battle` inactive.
  - **Scroll zoom tách riêng:** thêm camera thứ hai `cameras.add()` tên `'ui'` (`transparent=true`, `scroll=0,0`, `zoom=1`) + `setupUiCamera()` — `cameras.main.ignore(HUD objects)`, `uiCam.ignore(world objects)`. `main.ts` gọi `scene.zoomGameBy(delta, x, y)` thay vì zoom trực tiếp. Mỗi panel thêm `getGameObjects()` để dựng ignore list. Verify: scroll → world zoom 1→1.1→2.0, uiCam luôn ở 1.0, HUD giữ nguyên kích thước.

- **2026-09-29** — Khởi tạo monorepo scaffold + AGENTS.md.
- **2026-09-29** — Hoàn thành Plan 1–3: shared types/constants/formulas/schema, server, client.
- **2026-09-30** — Plan 1b: Copy data+assets, rewrite engine code, normalize field names.
- **2026-09-30** — Plan 4 Phase 1: build 3/3, lint 0 errors, format clean, fix Colyseus deps.
- **2026-09-30** — Plan 5a: Seed 11 users idempotent.
- **2026-09-30** — Plan 5b–5d: Auth UI, fix API_BASE, confirm password.
- **2026-09-30** — Plan 5e: Process manager `scripts/pm.sh` + config + docs.
- **2026-09-30** — Plan 5f: Full audit + 12 critical fixes. Security hardening. 18/18 tests pass.
- **2026-09-30** — Plan 5g: Đổi admin `tien2i`→`admin/admin123`, xóa tài khoản cũ (ẩn), tạo `scripts/server.sh` (server control + account mgmt + DB), script `user-admin.ts` CLI, fix script không thoát (closeRedis), cleanup 5 test users. Còn 11 tài khoản (admin + user01-10).
- **2026-09-30** — Plan 6: Client UI Skeleton (demo). Thêm `src/ui/` (theme, PanelFrame, PlayerHud, Hotbar, PartyStrip, Minimap, ChatLog, MenuPanel) + `src/world/PlaceholderMap.ts` (map tượng trưng 60×45 qua `createBlankLayer`). Sửa `main.ts` (roundPixels + Scale.FIT), `index.html` (pixelated shell), `BootScene.ts` (tiles giả + trainer sheet 4 hướng × 3 frame + shadow), `PlayerSprite.ts` (4 hướng, walk anim, bóng đổ), `WorldScene.ts` (tách createWorld/createHud/createInput, camera `setBounds` + `startFollow` 0.12 + `setRoundPixels`, 6 panels, `DEBUG=false`). Chưa chạy build/typecheck/lint — chờ user yêu cầu.
- **2026-09-30** — Plan 5i: Multi-language (EN/VI) — `i18n.js` client (200+ keys, localStorage, EN/VI toggle, `data-i18n` attributes), server i18n module (`t(locale, key)`, `localeFromRequest`), login responses return `language`, role-based admin page (403 FORBIDDEN nếu không phải admin, banned login blocked). DB: thêm cột `users.language`, bảng `user_info` (birthday/bio/notes), migration auto-add cho DB cũ. Admin API: role filter `?role=`, PATCH language/bio/notes, ban/unban. Admin.js: i18n dynamic render (badges, counts, buttons), language column, new fields (bio/notes/birthday). Build 3/3, typecheck 4/4, lint 0 errors, format clean, 14/14 API tests pass.
- **2026-09-30** — Rescan toàn bộ codebase (Load AGENTS.md + project_status.md). Verify: build 3/3 ✅, typecheck 4/4 ✅, lint 0 errors/13 warnings ✅, format:check clean ✅. Cập nhật project_status cho khớp thực tế: cấu trúc thư mục (thêm `config.ts`, `ui/`, `world/`, `formulas/index.ts`, `moveset.ts`), bảng API (thêm ban/unban/players), bảng DB (`shiny` không phải `is_shiny`, `party_slot`, `inventory`), Warning issues (thêm `updateUserInfo` auth bug, deprecated `presence.publish`, client bundle 500kB, `typescript-tmp/` leftover), sửa `onCreate ignores options` (đã fix — `options.mapId` được dùng).
- **2026-09-30** — Fix 3 lỗi critical khiến game bị trắng màn: (1) `PlayerSprite.setPosition()` được Phaser gọi trong `super()` trước khi `nameText`/`shadow` được gán → thêm optional chaining `?.`; (2) texture sheet `trainer_sheet` chỉ có 1 frame `__BASE` → đăng ký 12 frame con bằng `texture.add()` trong `BootScene.makeTrainerSheet()`; (3) HUD panels vẽ ở world-space khiến chúng biến mất khi camera scroll → thêm `.setScrollFactor(0)` cho mọi HUD object.
- **2026-09-30** — Responsive/scaling: đổi `Scale.FIT` → `Scale.RESIZE` (canvas fill viewport), thêm zoom bằng scroll wheel (clamp 0.5–3.0, center vào con trỏ). Tất cả UI panels (PlayerHud, Minimap, Hotbar, PartyStrip, ChatLog, MenuPanel) + BattleScene chuyển sang tính toạ độ động theo `scale.width/height` và có `relayout()` trên `scale.on('resize')`. PlayerHud dùng `H_MIN=96` + layout tính từ bottom + avatar scale co giãn. Minimap thêm `setResponsive()` (ẩn khi viewport < 720px). Tree/flower tile thêm nền grass (trước đó trong suốt → hiện thành ô đen). LoginScene card có `max-height + overflow-y:auto` (trước bị cắt ở viewport thấp). PartyStrip label dùng `setFixedSize`. Build 3/3, typecheck 4/4, lint 0 errors.
