# Project Status — Pixelmon (Pokemon MMORPG)

> Cập nhật lần cuối: **2026-10-01** (Hoàn thành Plan 28: Nâng cấp UiModal neo gắn cứng, Reset Settings, Scroll to Zoom, Khắc phục ẩn Party Box & Hud không title bar)
> File này được cập nhật **sau khi hoàn thành mỗi plan**.
> Designed để AI agent mới có thể load lại toàn bộ cấu trúc project ngay lập tức.

---

## Tổng quan dự án

**Pixelmon** — Pokémon MMORPG chạy trên web, Monorepo pnpm + Turborepo.

| Hạng mục                                                                                             | Trạng thái   |
| ---------------------------------------------------------------------------------------------------- | ------------ |
| Monorepo scaffold (pnpm 9.15.0 + turbo 2.x)                                                          | ✅           |
| `packages/shared` — Types, Constants, Formulas, Schema, Data                                         | ✅           |
| `packages/shared` — Game data (649 species, 559 moves, 526 items)                                    | ✅           |
| `packages/shared` — Engine code (typechart, combat, stats, encounter, learnset, mapruntime)          | ✅           |
| `apps/server` — Colyseus 0.15 + Express + PostgreSQL + Redis                                         | ✅           |
| `apps/client` — Phaser 3 + Vite + Colyseus.js                                                        | ✅           |
| `pnpm build` — 3/3 pass                                                                              | ✅           |
| `pnpm typecheck` — 4/4 pass                                                                          | ✅           |
| `pnpm lint` — 0 errors, 17 warnings (no-explicit-any + consistent-type-imports)                      | ✅           |
| Responsive — `Scale.RESIZE` + HUD relayout theo viewport                                             | ✅           |
| `pnpm format:check` — clean                                                                          | ✅           |
| Seed users (11 accounts)                                                                             | ✅           |
| Auth UI (login + register — trang chủ + client overlay)                                              | ✅           |
| Security — JWT middleware trên mọi admin/game API                                                    | ✅           |
| Security — 404 handler + central error handler                                                       | ✅           |
| Security — Zod validation → HTTP 400 (không phải 500)                                                | ✅           |
| Security — admin.js gửi JWT token                                                                    | ✅           |
| Process manager `scripts/pm.sh`                                                                      | ✅           |
| End-to-end API test (18 checks) — all pass                                                           | ✅           |
| BattleRoom — ArraySchema, onJoin session mapping, empty team guard                                   | ✅           |
| WorldScene — self-filter, throttle, sleep/launch ordering                                            | ✅           |
| Plan 6 — Client UI skeleton (6 panel HUD + placeholder map)                                          | ✅           |
| Plan 5i — Multi-language EN/VI (server + static client)                                              | ✅           |
| Plan 7 — Environment setup (pnpm, PostgreSQL 18, Valkey/Redis)                                       | ✅           |
| Plan 8 — UI zoom tách riêng + Toolbar modes (Normal/Mini/Hidden + Anchor/Float)                      | ✅           |
| Plan 9 — Click-to-move + Minimap drag + Button component + Font sắc + Fix zoom remote                | ✅           |
| Plan 10 — Camera pan bằng kéo trong vùng gameplay (MMB / Shift+drag)                                 | ✅           |
| Plan 11 — Fix render: nameplate đơn, hover tile highlight, destination marker, camera ignore refresh | ✅           |
| Fix 12 — Ô hover/destination lệch toạ độ chuột (scrollFactor 0 vs world space)                       | ✅           |
| Plan 13 — Phân tích UI phong cách MMORPG (neo góc, stack trục, bỏ floating)                          | 📋 Chờ duyệt |
| Plan 14 — TopMenu dãy icon nhỏ + InfoPanel giờ/thời tiết + Minimap theo GPS                          | ✅           |
| Plan 15 — Bỏ hotbar + bảng thông tin dạng bảng (avatar + tên + 2 loại tiền) + party dọc              | ✅           |
| Plan 16 — Dọn dead code UI (xóa Hotbar/Toolbar/Button + helpers hỏng)                                | ✅           |
| Plan 17 — Thư viện Sprite trong trang admin (upload/căn khung/preview/export 2 dạng)                 | ✅           |
| Plan 18 — HUD Layout: tách zoom (Game/UI) + Neo/Tự do + Mini/Normal/Hidden + Ẩn tất cả               | 🔄 Đang làm  |
| Plan 20 — Sprite #2 (jin-yuichi) + `users.sprite_id` + editor 16-frame + gán sprite trong admin      | ✅           |
| Plan 21 — Import toàn bộ sprite (16-frame chuẩn), preview 128/256, nâng cấp Sprite Library, Register & Player Info | ✅           |
| Căn giữa map ở trung tâm hiển thị thay vì neo ở góc trên bên trái                                    | ✅           |
| Plan 22 — Chuẩn hoá giao diện Client ở màn hình nhỏ (Responsive Mobile & Small Viewport)             | ✅           |
| Plan 23 — Tinh gọn UI, Profile Mini, Toolbar thu gọn & Settings Panel đa năng                        | ✅           |
| Plan 24 — Nâng cấp Tabbed Settings Panel & Khung Chat Draggable                                      | ✅           |
| Plan 25 — Chuẩn hoá Tỷ lệ HUD, Draggable Settings, Overlay Khóa UI, Ngôn ngữ & Logout trên Toolbar    | ✅           |
| Plan 26 — Baseline scale 1.25x, Toolbar Pixel Art, Cắt padding Info, Confirm Modal, Fix Settings & Move LMB | ✅           |
| Plan 27 — Thư viện UiModal dùng chung & Chuẩn hoá 6 Pop-up/Panel (Settings, Chat, Party, Weather, Confirm, UserInfo) | ✅           |
| Plan 28 — Nâng cấp UiModal (Dock gắn cứng, không Titlebar, Depth, Padding, Footer, Header buttons) + Reset Settings + Scroll to Zoom + Fix Party | ✅           |
| `gameData` / `mapLoader` nối vào server boot                                                         | ❌ Chưa làm  |
| Session persist — refresh trang không bị đá ra khỏi game                                             | ✅           |
| Scroll zoom chỉ map/nhân vật, không zoom UI (2 camera)                                               | ✅           |

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
│   │   │   │   ├── sprite.ts       # CRUD /api/admin/sprites (list/get/create/patch/delete) — multer RAM, PNG magic, frame_count, toUserSprite()
│   │   │   │   └── shared.ts        # Hằng SPRITES (FRAME_COUNT=12, DIRS, FRAME_SIZE=32, BASE_URL, MAX_UPLOAD_BYTES)
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
│       │   ├── SpriteSheetLoader.ts # loadSpriteSheet(url, frameCount) — đăng ký frame theo layout 12/16
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
│           └── ColyseusManager.ts  # Singleton: HTTP login → WS joinOrCreate(world), sendMove/Chat, userSprite (đọc từ /api/auth/me)
│
├── .pm/                            # Runtime: PID files + logs (gitignored)
│   ├── server.pid, client.pid
│   └── logs/
│
└── typescript-tmp/                 # Trống — leftover directory (có thể xóa)
```

---

## Backend API reference

| Method | Endpoint                        | Auth    | Mô tả                                                                 | Response                                                                 |
| ------ | ------------------------------- | ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/health`                       | ❌      | Health check                                                          | `{ok, uptime}`                                                           |
| POST   | `/api/auth/register`            | ❌      | Đăng ký                                                               | `{ok, token, userId}` (201), `{USER_EXISTS}` (409), `{VALIDATION}` (400) |
| POST   | `/api/auth/login`               | ❌      | Đăng nhập                                                             | `{ok, token, userId, displayName, language}`                             |
| GET    | `/api/auth/me`                  | ✅      | User info + player + profile                                          | `{ok, user: {...}, player: {...}}`                                       |
| GET    | `/api/admin/status`             | ✅Admin | DB/Redis stats + roleCounts                                           | `{ok, database, redis, userCount, pokemonCount, roleCounts}`             |
| GET    | `/api/admin/users`              | ✅Admin | Users (search+pagination+role+sort): `?q=&page=&limit=&sort=&role=`   | `{ok, users: [...], pagination: {...}}`                                  |
| POST   | `/api/admin/users`              | ✅Admin | Tạo user mới                                                          | `{ok, userId, message}` (201), `{USER_EXISTS}` (409)                     |
| PATCH  | `/api/admin/users/:id`          | ✅Admin | Sửa (displayName, level, money, role, language, bio, notes, spriteId) | `{ok, message}`, `{INVALID_SPRITE}` (400), `{SPRITE_NOT_FOUND}` (404)    |
| POST   | `/api/admin/users/:id/password` | ✅Admin | Reset password                                                        | `{ok, message}` (200), `{NOT_FOUND}` (404)                               |
| POST   | `/api/admin/users/:id/ban`      | ✅Admin | Ban user → role='banned'                                              | `{ok, message}`                                                          |
| POST   | `/api/admin/users/:id/unban`    | ✅Admin | Unban → role='player'                                                 | `{ok, message}`                                                          |
| DELETE | `/api/admin/users/:id`          | ✅Admin | Xóa user (cascade)                                                    | `{ok, message}` (200), `{NOT_FOUND}` (404)                               |
| GET    | `/api/admin/sprites`            | ✅Admin | Danh sách thư viện sprite                                             | `{ok, sprites: [...], dirs, frameCount}`                                 |
| POST   | `/api/admin/sprites`            | ✅Admin | Tạo sprite (multipart: image + bakedSheet + frameW/H + frameCount)    | `{ok, sprite}`, `{SPRITE_EXISTS}` (409), `{INVALID_FILE}` (400)          |
| GET    | `/api/admin/sprites/:id`        | ✅Admin | Chi tiết 1 sprite (nút Sửa trong editor)                              | `{ok, sprite}`, `{NOT_FOUND}` (404)                                      |
| PATCH  | `/api/admin/sprites/:id`        | ✅Admin | Sửa sprite (JSON hoặc multipart — bakedSheet/file mới)                | `{ok, sprite}`                                                           |
| DELETE | `/api/admin/sprites/:id`        | ✅Admin | Xoá sprite + file (user tự về mặc định qua ON DELETE SET NULL)        | `{ok, message}`                                                          |
| GET    | `/api/users/:id/info`           | ✅      | Xem profile (birthday, bio, notes)                                    | `{ok, user: {...}, info: {...}}`                                         |
| PUT    | `/api/users/:id/info`           | ✅      | Cập nhật profile (chính mình hoặc admin)                              | `{ok, message}`                                                          |
| GET    | `/api/admin/pokemon`            | ✅Admin | Danh sách pokemon                                                     | `{ok, pokemon: [...]}`                                                   |
| GET    | `/api/admin/players`            | ✅Admin | Vị trí players                                                        | `{ok, players: [...]}`                                                   |
| GET    | `/api/players/:userId`          | ✅      | Player info                                                           | `{ok, player: {...}}`                                                    |
| GET    | `/api/players`                  | ✅      | Online players list (stub)                                            | `{ok, players: [...]}`                                                   |
| GET    | `/api/pokemon/:userId`          | ✅      | Pokemon list                                                          | `{ok, pokemon: [...]}`                                                   |

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
sprite_id UUID NULL REFERENCES sprite_catalog(id) ON DELETE SET NULL,  -- sprite gán trong admin (NULL = mặc định)
created_at TIMESTAMPTZ DEFAULT NOW(), last_login_at TIMESTAMPTZ
-- migration tự động: ALTER TABLE users ADD COLUMN role/language/sprite_id (nếu DB cũ)

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

-- sprite_catalog (thư viện sprite nhân vật)
id UUID PK, name TEXT UNIQUE, mode TEXT CHECK IN ('baked','atlas') DEFAULT 'baked',
sheet_url TEXT,          -- sheet đã ghép, ví dụ /sprites/jin-yuichi.png (Express serve tĩnh)
source_url TEXT,          -- ảnh gốc (mode atlas)
frames JSONB DEFAULT '[]', -- toạ độ frame (mode atlas; baked thì để [])
frame_w INTEGER DEFAULT 32, frame_h INTEGER DEFAULT 32,
frame_count SMALLINT DEFAULT 12,  -- 12 = sheet ngang 3f/hd, 16 = lưới 4×4 4f/hd
created_by UUID FK→users.id ON DELETE SET NULL,
created_at, updated_at TIMESTAMPTZ
-- ⚠️ frame_count PHẢI khớp layout file, sai → sprite quay sai hướng (lỗi âm thầm)

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

| Issue                                                           | File                                             | Mô tả / Mức độ                                                                                                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JWT_SECRET fallback hardcoded                                   | `config/env.ts:6`                                | Cần `.env` production                                                                                                                                                                                        |
| authToken never sent to Colyseus rooms                          | `ColyseusManager.ts`                             | Không verify JWT trong WS                                                                                                                                                                                    |
| WorldRoom: no server-side collision check                       | `world/index.ts:12-19`                           | Client có thể teleport                                                                                                                                                                                       |
| WorldRoom: no rate limit / spam protection                      | `world/index.ts:12-19`                           | Client có thể spam move messages                                                                                                                                                                             |
| WorldRoom: `this.presence.publish` deprecated in 0.16           | `world/index.ts:37`                              | Battle request qua presence — cần rewrite nếu upgrade Colyseus                                                                                                                                               |
| BattleRoom: applyAttack không dùng move data                    | `battle/index.ts:191-207`                        | Ignores power, type, STAB, accuracy, critical hit                                                                                                                                                            |
| BattleRoom: timeout 60s hardcoded                               | `battle/index.ts:72`                             | Không dùng BATTLE_TIMEOUT từ constants/game.ts                                                                                                                                                               |
| Dead code: loader.ts GameData/MapLoader never boot server-side  | `packages/shared/src/data/loader.ts`             | `src/index.ts` exports loader nhưng `server/index.ts` không gọi `gameData.load()`                                                                                                                            |
| Dead code: PokemonSprite unused                                 | `apps/client/src/entities/PokemonSprite.ts`      | Placeholder — không dùng trong scene nào                                                                                                                                                                     |
| Dead code: `getUserLanguage` API không wired                    | `user/index.ts:96` + `app.ts`                    | Export nhưng không đăng ký route                                                                                                                                                                             |
| BattleScene: client-side damage không dùng server state         | `BattleScene.ts`                                 | Hardcoded Pikachu vs Charmander — chưa sync Colyseus                                                                                                                                                         |
| Duplicated constants: STAGE_MULT vs STAT_STAGE_MULTIPLIER       | `constants/game.ts` vs `formulas/combat.ts`      | Cần gộp                                                                                                                                                                                                      |
| `MAPS` (constants/maps.ts) vs `data/maps/` dual source of truth | `constants/maps.ts`                              | Route_1 60×60 trong MAPS vs 60×45 PlaceholderMap; ID khác (route_1 vs pallet-town)                                                                                                                           |
| No migration system                                             | `config/database.ts`                             | `CREATE TABLE IF NOT EXISTS` + manual ALTER COLUMN only                                                                                                                                                      |
| exp returned as string (pg BIGINT)                              | `auth/me.ts` (if pg returns BigInt)              | Type mismatch potential                                                                                                                                                                                      |
| `updateUserInfo` auth logic bug                                 | `user/index.ts:56`                               | `auth.user && (userId !== id \|\| role !== 'admin')` — self non-admin bị 403, và `!auth.user` bypass auth check                                                                                              |
| `typescript-tmp/` empty leftover dir                            | `/mnt/data/AI-Agent/pixelmon/typescript-tmp/`    | Có thể xóa                                                                                                                                                                                                   |
| `root package.json` thiếu `"type": "module"`                    | `package.json`                                   | Gây MODULE_TYPELESS_PACKAGE_JSON warning khi lint                                                                                                                                                            |
| Vite bundle > 500kB                                             | client build                                     | 1,665 kB single chunk — cần code-split                                                                                                                                                                       |
| 🔴 Tiled map load fail → luôn fallback `PlaceholderMap`         | `world/TiledMapLoader.ts:35`, `WorldScene.ts:61` | `mapJson.tilesets` = `undefined` → `TypeError: Cannot read properties of undefined (reading '0')`. Kèm `WebGL: INVALID_VALUE: texImage2D`. **Map thật chưa bao giờ hiển thị.** Tạm hoãn theo quyết định user |
| `hero_32.png` sinh ra nhưng chưa được load ở đâu                | `packages/shared/assets/sprites/hero_32.png`     | Dead asset — chỉ `hero_64.png` được import trong `BootScene.ts`. Xoá hoặc dùng cho scale nhỏ                                                                                                                 |
| `registerPlayerAnims` tạo anim 1-frame, không dùng              | `PlayerSprite.ts`                                | Walk dùng `setFrame` trực tiếp, các anim `walk-<sheet>-<dir>-<i>` không ai chơi → dead code                                                                                                                  |

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
11. **Sprite sheet layout:** Hàng = hướng theo thứ tự `['down','up','left','right']`
    (khớp `DIRS` ở `PlayerSprite.ts` và `HERO_DIRS` ở `BootScene.ts`); cột = frame
    đi bộ 0..3. Frame được truy xuất bằng **name** (`'0_1'`), không dùng index số.
    Khi sinh sheet mới xem `docs/sprite-import-guide.md`.

---

## Plans & Trạng thái công việc

> Toàn bộ chi tiết các Plan cũ (Plan 0 đến Plan 18) và Nhật ký thay đổi đã được chuyển vào: [`docs/plans/archive_status_history.md`](docs/plans/archive_status_history.md).

### Kế hoạch hiện tại: Quản lý Maps & Sprite (Plan 19)

1. **Phân tích tài nguyên trong `game_pack`:**
   - [x] Khảo sát map Kanto / Tiled maps (`.tmx`, `.tsx`, tileset PNG) và sprite demo.
   - _Ghi chú (2026-10-01):_ `game_pack/` đã bị xóa theo yêu cầu user. Kết luận
     phân tích trước đó: **không có file Tiled** (`.tmx/.tsx/.tmj`) trong
     `game_pack` — map là 1 ảnh raster `FullKanto.png` 7700×6400 không chia tile
     ổn định, nên **không thể import trực tiếp** theo kiểu Tiled.
2. **Import Maps Tiled vào Game:**
   - [ ] Thay thế `PlaceholderMap` bằng map thật từ `game_pack`.
   - [ ] Xóa các tính năng map editor thừa, chuyển sang cơ chế import map có sẵn.
   - **⏸ TẠM DỪNG (2026-10-01):** User quyết định bỏ qua hệ thống maps hiện tại
     (không đạt kỳ vọng, thư mục maps cũ đã xóa). Chưa có hướng thay thế.
   - _Lưu ý:_ pipeline Tiled sẵn có của project
     (`packages/shared/data/maps/tiled/*.tmj`, `apps/client/src/world/TiledMapLoader.ts`)
     vẫn còn và **đang lỗi** → xem "Known issues" mục Warning.
3. **Cập nhật Sprite mặc định:**
   - [x] Import `sprites_import/main.png` → `packages/shared/assets/sprites/hero_64.png`
         (16/16 frame, grid 4×4, tách nền alpha). _2026-10-01_
   - [x] Sửa lỗi `BootScene` (đăng ký frame 2D + thứ tự `HERO_DIRS`). _2026-10-01_
   - [x] Sửa lỗi `PlayerSprite` (frame name thay vì index, bỏ `setFlipX`,
         `setDirection` không reset mỗi tick, origin theo loại sheet). _2026-10-01_
   - [x] Tạo tool tái dùng `scripts/tools/build_spritesheet.py`. _2026-10-01_
   - [x] Tạo hướng dẫn `docs/sprite-import-guide.md`. _2026-10-01_
   - [x] Sửa lỗi **đảo hướng** (thứ tự hàng sheet ≠ layout game) + thêm
         `--preview` để kiểm bằng mắt. _2026-10-01_
   - _Xác nhận:_ ↓ ↑ ← → hiển thị đúng, walk cycle chạy `*_1→*_2→*_3→*_0`,
     console chỉ còn 2 warning (dự kiến, thuộc lỗi Tiled).
4. **Cập nhật Admin Dashboard:**
   - [ ] Thêm tab/view Quản lý tài nguyên (Maps & Sprites) trong trang quản trị.

---

## Kế hoạch hiện tại: Plan 20 — Hoàn thiện thư viện Sprite + gán sprite cho user

> Bắt đầu 2026-10-01. User chọn: import `jin-yuichi.png`, lưu `sprite_id` (UUID → `sprite_catalog`).

1. **Import sprite thứ 2 (`jin-yuichi.png`):**
   - [x] Chạy `build_spritesheet.py` → `hero_jin_64.png` + `hero_jin_32.png` (16 frame, 4×4). _2026-10-01_
   - [x] Mở `--preview` kiểm tra 4 hướng bằng mắt (quy tắc bắt buộc).
   - [x] Đăng ký sheet trong `BootScene` (`TEX.heroJin`, 16 frame, frame 64).
     - _Thay đổi cách làm:_ không hardcode trong `BootScene` — sprite đưa vào
       **thư viện** (`apps/server/public/sprites/jin-yuichi.png` +
       `sprite_catalog`) và client load động theo URL (`SpriteSheetLoader`).
       `BootScene` giữ nguyên sheet mặc định `hero_64` cho user chưa gán.
2. **DB — trường sprite cho user:**
   - [x] `users.sprite_id UUID NULL → sprite_catalog(id) ON DELETE SET NULL` + migration.
   - [x] `sprite_catalog.frame_count SMALLINT DEFAULT 12` + migration (12 = 384×32, 16 = 256×256).
   - _Đã seed 2 sprite:_ `main` (→`/sprites/hero-64.png`, 16f) + `jin-yuichi` (16f); gán `jin-yuichi` cho `admin` và `user01` (demo).
3. **Server API:**
   - [x] `GET /api/admin/users` trả `spriteId` + tên/sheet sprite (LEFT JOIN).
   - [x] `POST /api/admin/users` + `PATCH /api/admin/users/:id` nhận `spriteId` (validate tồn tại + `sheet_url`/`frame_count ≥ 12`, `null`/`''` = bỏ, sai UUID → 400, không có → 404).
   - [x] `GET /api/auth/me` trả `sprite` (sheetUrl, frameW/H, frameCount) cho client.
   - [x] `DELETE /api/admin/sprites/:id` dọn cả file `{id}-sheet.png` (FK `ON DELETE SET NULL` tự bỏ gán của user).
   - [x] `GET /api/admin/sprites/:id` (mới) + `PATCH /api/admin/sprites/:id` giờ nhận cả FormData (`bakedSheet` ghi đè file sheet, `frameCount`, ảnh gốc).
4. **Admin UI (users edit panel + sprite library):**
   - [x] Modal user: thêm select "Sprite nhân vật" (load từ `/api/admin/sprites`) + preview canvas frame `down#0` + label (i18n `m.sprite*`).
   - [x] Bảng users: cột Sprite (thumb + tên, i18n `u.colSprite`).
   - [x] Sửa nút **Sửa** trong bảng sprite: `_spriteEdit(id)` load sprite (name/mode/frameW/H/`frameCount`/sheet ảnh) vào editor → lưu bằng PATCH.
   - [x] i18n keys EN/VI cho các label mới (`m.sprite*`, `u.colSprite`, `sp.frameCount`, `sp.fc12/16`, `sp.edit`, `sp.frames16`, sửa `sp.modeBaked`/`sp.readSheet`).
   - [x] Editor hỗ trợ **16 frame lưới 4×4** (canvas, bảng toạ độ, export/compose theo lưới) — trước đây hardcode 12.
5. **Client dùng sprite của user:**
   - [x] `ColyseusManager` lưu `userSprite` từ `/api/auth/me` (await trong `connect()`, đọc response trong `resume()`).
   - [x] `WorldScene` load sheet theo `sprite.sheetUrl` (dynamic texture `user_sprite`, 12/16 frame), fallback hero → trainer; remote player load `ps.spriteUrl` qua `PlayerSprite.swapSheet()` sau khi state sync.
   - [x] Server (`WorldRoom.onJoin`) tra sprite user → `PlayerState.spriteUrl/spriteFrame/spriteFrameCount`.
6. **Verify:** typecheck 4/4 ✅, lint 0 errors ✅ (17 warnings), build 3/3 ✅, `format:check` clean ✅, API test (assign/validate/clear/404) ✅, Playwright (bảng users, modal user, sprite editor 16f, in-game 4 hướng bằng mắt) ✅.
7. **Cập nhật `project_status.md`** đánh dấu hoàn thành. _2026-10-01_

### Lỗi phát hiện & fix trong Plan 20

| #   | Lỗi                                                               | Fix                                                                                                                   |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | eslint quét `.venv/` (torch .js) → 82 error giả                   | Thêm `**/.venv/**`, `**/temp/**` vào `eslint.config.js` ignores                                                       |
| 2   | `@ts-ignore` thừa ở import PNG (đã có type trong `vite-env.d.ts`) | Bỏ directive (dòng import PNG) — nhưng dòng type Tiled giữ `@ts-ignore` + `eslint-disable-next-line` (TS6059 rootDir) |
| 3   | Modal user: đổi select sprite → preview không cập nhật            | Thêm `addEventListener('change')` → `updateSpritePreview()`                                                           |
| 4   | Sprite editor mode sửa: bảng toạ độ hiện 32×32 dù sprite 64×64    | `openSpriteModal` set input `frameW/H` **trước** khi gọi `defaultFrames()` (đọc giá trị từ input)                     |
| 5   | Editor hardcode 12 frame → sheet 4×4 bị cắt sai khi export        | Thêm `frameCount()`/`framesPerDir()` + export/compose/draw theo lưới 4×4 khi `frameCount=16`                          |
| 6   | Payload `''` gửi lên `PATCH user` làm `spriteId=''` không đổi     | Server coi `''` = `null` (bỏ gán) — đã test clear + re-assign                                                         |

### Quy tắc thêm khi import sprite (thư mục 3b trong guide)

Sprite phục vụ cho **nhiều user** → dùng `--publish-name` copy sheet sang
`apps/server/public/sprites/` + đăng ký `sprite_catalog` (đừng hardcode vào
`BootScene`). `frame_count` trong DB **phải khớp layout file**, sai → sprite
quay hướng âm thầm. Chi tiết: `docs/sprite-import-guide.md` mục 3b.

---

## Kế hoạch hiện tại: Plan 22 — Chuẩn hoá giao diện Client ở màn hình nhỏ (Responsive Mobile & Small Viewport)

> Bắt đầu 2026-10-01. Mục tiêu: Client hiển thị đẹp, rõ ràng, không bị chồng đè hay tràn viền trên màn hình nhỏ (< 768px, < 640px, < 480px, < 400px) và xoay ngang mobile.

1. **Bước 1 — Nâng cấp `UiZoomManager` & Adaptive Scaling:**
   - [x] Bổ sung cơ chế tự động tính toán scale thích ứng (`adaptiveUiZoom`) dựa trên chiều rộng và chiều cao viewport khi ở màn hình nhỏ (< 640px).
   - [x] Hỗ trợ xác định breakpoint tự động: `normal` (>= 720px), `compact` (540px - 719px), `mini` (< 540px hoặc height < 480px).
2. **Bước 2 — Chuẩn hoá `PlayerHud` ở chế độ Mini:**
   - [x] Sửa lỗi tính `w` và `h` trong `relayout()` khi ở `mini` mode (dùng 172×54px thay vì hardcode 260×92px).
   - [x] Căn chỉnh tỉ lệ avatar 32px và text tên, tiền trong game cân đối, ẩn tiền thật khi ở chế độ mini.
3. **Bước 3 — Chuẩn hoá `InfoPanel` Responsive:**
   - [x] Hỗ trợ `UiZoomManager` và chế độ `mini` / `compact` (thu gọn từ 168×54px xuống 84×36px, chỉ hiện giờ to + icon thời tiết gọn).
   - [x] Tự động chuyển compact khi chiều rộng màn hình < 640px để giải phóng khoảng trống cho TopMenu.
4. **Bước 4 — Chuẩn hoá `TopMenu` Chống Va Chạm (Top Bar Collision-Free):**
   - [x] Tính toán vị trí linh hoạt: Khi khoảng trống giữa `PlayerHud` và `InfoPanel` không đủ (< 260px), tự động thu nhỏ icon (từ 28px xuống 24px) và neo dạt phải hoặc xếp dưới thanh trạng thái thay vì đè lên `PlayerHud`.
   - [x] Mở rộng hit area cảm ứng (zone tối thiểu 36px) để dễ chạm trên màn hình di động.
5. **Bước 5 — Chuẩn hoá `PartyStrip` Chống Tràn Chiều Dọc:**
   - [x] Kiểm tra chiều cao khả dụng: Khi `viewport.height < 480px` (mobile landscape), tự động chuyển sang slot mini 24px, giảm gap để tổng chiều cao <= 180px, không bị tràn ra khỏi đáy màn hình.
6. **Bước 6 — Chuẩn hoá `ChatLog` Co Giãn & Thu Gọn:**
   - [x] Tính lại `baseW` linh hoạt theo `scale.width` mỗi khi resize (`Math.min(240, scale.width * 0.55)`).
   - [x] Giảm số dòng hiển thị ở mini xuống 2 dòng, hỗ trợ toggle thu nhỏ/mở rộng nhanh.
7. **Bước 7 — Điều phối tập trung trong `WorldScene.ts`:**
   - [x] Lắng nghe `scale.on('resize')`, tự động phân bổ `hudMode` (`normal`/`mini`) cho tất cả các panel.
   - [x] Điều chỉnh lại toạ độ xếp chồng cột trái và các panel đảm bảo giao diện luôn thoáng đãng, nhìn rõ thế giới game.
8. **Bước 8 — Kiểm tra typecheck và cập nhật status:**
   - [x] Chạy `pnpm --filter client typecheck` pass 100%.
   - [x] Cập nhật kết quả vào `project_status.md` và git commit.

---

## Kế hoạch hiện tại: Plan 28 — Nâng cấp UiModal nâng cao (Dock khoá cứng, Ẩn Title Bar, Z-Index, Padding, Footer, Nút phụ), Reset Settings, Khôi phục Party Box & Tuỳ chọn Scroll-to-Zoom

> Bắt đầu 2026-10-01. Mục tiêu:
> 1. Nâng cấp `UiModal`: Chế độ neo khoá cứng vị trí (không thể drag khi đang neo), ẩn title bar linh hoạt, thuộc tính z-index/depth, padding tuỳ biến, thanh công cụ footer, hỗ trợ thêm nút tính năng phụ trên header.
> 2. Menu Settings: Thay nút return bằng chức năng Reset Settings (khôi phục cài đặt gốc).
> 3. Cố định UserInfo (`PlayerHud`) và Weather (`InfoPanel`): Ẩn title bar, neo cố định không thể drag.
> 4. Khắc phục sự cố Party Box biến mất: Bỏ nút ✕ tránh bấm nhầm, nối nút `team` trên Toolbar để mở lại bất kỳ lúc nào.
> 5. Tuỳ chọn Scroll to Zoom: Thêm cấu hình cuộn chuột zoom thế giới game vào Settings, mặc định TẮT.

1. **Bước 1 — Nâng cấp `UiModal` (`apps/client/src/ui/UiModal.ts`):**
   - [ ] Hỗ trợ `docked: true` (khoá cứng vị trí không thể drag khi neo, toggle mở khoá bằng ⚓).
   - [ ] Hỗ trợ `showTitleBar: false` (ẩn hoàn toàn header bar, nội dung chiếm trọn panel).
   - [ ] Thêm tuỳ biến z-index/depth, padding (top, right, bottom, left).
   - [ ] Thêm thanh footer (`showFooter`, `footerHeight`, `footerContainer`).
   - [ ] Thêm mảng nút tính năng phụ trên header (`customHeaderButtons`, `addHeaderButton`).
2. **Bước 2 — Cập nhật `SettingsPanel` (Reset Settings & Scroll-to-Zoom):**
   - [ ] Thay nút return bằng chức năng Reset Settings (khôi phục toàn bộ cài đặt gốc).
   - [ ] Thêm checkbox Cuộn chuột thu phóng game (Scroll to zoom) — mặc định tắt.
3. **Bước 3 — Cố định `PlayerHud` (UserInfo) & `InfoPanel` (Weather):**
   - [ ] Đặt `showTitleBar: false`, chế độ neo khoá cứng `docked: true`, không thể kéo đi.
4. **Bước 4 — Khắc phục Party Box & Nối nút Team trên Toolbar:**
   - [ ] Bỏ nút ✕ trên `PartyStrip` tránh click nhầm làm mất panel.
   - [ ] Nối nút `team` trên thanh Toolbar trong `WorldScene.ts` để toggle bật/tắt Party Box.
5. **Bước 5 — Kiểm soát Scroll-to-Zoom (`main.ts` & `WorldScene.ts`):**
   - [ ] Kiểm tra cấu hình `localStorage('pixelmon.scrollToZoom')`, mặc định không zoom khi cuộn chuột.
6. **Bước 6 — Typecheck, kiểm tra toàn bộ & Git commit:**
   - [ ] Chạy typecheck `pnpm run typecheck` đảm bảo 4/4 pass.
   - [ ] Cập nhật kết quả vào `project_status.md` và tạo git commit.

---

## Kế hoạch hiện tại: Plan 27 — Xây dựng thư viện UiModal dùng chung & Chuẩn hoá toàn bộ Pop-up/Panel (Settings, Chat, Party, Weather, Confirm, UserInfo)

> Bắt đầu 2026-10-01. Hoàn thành 2026-10-01. Mục tiêu:
> 1. Xây dựng thư viện khung cửa sổ modal dùng chung `UiModal` (`apps/client/src/ui/UiModal.ts`).
> 2. Đầy đủ tính năng: Header bar, kéo thả di chuyển, nút tắt (✕), nút thu nhỏ (－/▲), nút neo (⚓), chế độ khóa UI (`lockUi`), co giãn theo UI Zoom và giới hạn an toàn trong màn hình.
> 3. Cấu hình linh hoạt: Cho phép ẩn/hiện từng nút điều khiển theo yêu cầu của từng popup.
> 4. Chuẩn hoá đồng bộ toàn bộ các thành phần: Settings, Khung chat, Party, Weather, Logout confirm, UserInfo.

1. **Bước 1 — Xây dựng component `UiModal` (`apps/client/src/ui/UiModal.ts`):**
   - [x] Tạo class `UiModal` với thanh tiêu đề đồng nhất, các nút điều khiển (Close, Minimize, Dock), container nội dung, kéo thả di chuyển, co giãn theo UI zoom và kẹp an toàn không vượt quá màn hình.
2. **Bước 2 — Chuẩn hoá `SettingsPanel` & `ConfirmModal` qua `UiModal`:**
   - [x] Áp dụng `UiModal` cho bảng Settings và modal xác nhận Logout với chế độ khóa UI (`lockUi: true`).
3. **Bước 3 — Chuẩn hoá `ChatLog` qua `UiModal`:**
   - [x] Áp dụng `UiModal` cho Khung chat với chế độ nổi (`lockUi: false`), hỗ trợ kéo thả, thu nhỏ và neo góc dưới-trái.
4. **Bước 4 — Chuẩn hoá `PlayerHud` (UserInfo) qua `UiModal`:**
   - [x] Áp dụng `UiModal` cho bảng UserInfo với thanh tiêu đề, hỗ trợ thu nhỏ thành dạng pill/compact và neo góc trên-trái.
5. **Bước 5 — Chuẩn hoá `InfoPanel` (Weather / Clock) qua `UiModal`:**
   - [x] Áp dụng `UiModal` cho bảng Đồng hồ / Thời tiết, hỗ trợ kéo thả và neo góc trên-phải.
6. **Bước 6 — Chuẩn hoá `PartyStrip` qua `UiModal`:**
   - [x] Áp dụng `UiModal` cho dải Pokémon Party, hỗ trợ thu nhỏ và neo dọc bên trái.
7. **Bước 7 — Đồng bộ điều phối trong `WorldScene.ts`, Typecheck & Commit:**
   - [x] Kiểm tra camera ignore và điều phối relayout.
   - [x] Chạy typecheck `pnpm run typecheck` đảm bảo 4/4 pass 100%.
   - [x] Cập nhật kết quả vào `project_status.md` và tạo git commit.

---

### Nhật ký 2026-10-01 (11) — Plan 27: Thư viện UiModal dùng chung & Chuẩn hoá toàn bộ Pop-up/Panel

- **Xây dựng thư viện nền tảng `UiModal` (`apps/client/src/ui/UiModal.ts`):**
  - Cung cấp kiến trúc cửa sổ / modal thống nhất chuẩn MMORPG cho toàn bộ client.
  - Tích hợp Header bar bo góc, viền neon, thanh kéo thả di chuyển mượt mà (Draggable Zone).
  - Tích hợp sẵn hệ thống nút điều khiển trên thanh tiêu đề:
    - Nút ✕ chính (Close / Ẩn).
    - Nút ⮌ phụ (Secondary Close / Huỷ).
    - Nút － / ＋ (Thu nhỏ / Mở rộng): thu gọn panel chỉ còn thanh Header để tối đa tầm nhìn gameplay.
    - Nút ⚓ (Dock): khôi phục tức thì về vị trí neo chuẩn mặc định (`center`, `top-left`, `top-right`, `bottom-left`, v.v.).
    - Từng nút có thể bật/tắt (ẩn/hiện) tuỳ biến linh hoạt qua options.
  - **Chế độ khóa UI (`lockUi`):** Hỗ trợ overlay đen mờ khóa toàn bộ thao tác bên dưới cho modal chặn (Settings, Confirm Dialog) hoặc chế độ nổi tự do không chặn click cho các panel HUD.
  - **Co giãn thích ứng theo UI Zoom & kẹp an toàn màn hình:** Tự động nhân theo `UiZoomManager.uiZoom` và kẹp `maxScale`, chống tràn màn hình trên mọi độ phân giải.
  - **Cung cấp `contentContainer`:** Tách biệt layout phần cứng của modal và phần nội dung của các component con trong không gian toạ độ local `(0, 0)`.
- **Chuẩn hoá đồng loạt 6 thành phần giao diện qua `UiModal`:**
  - `SettingsPanel`: Chuyển sang kế thừa `UiModal` (`lockUi: true`), có 2 nút tắt (✕ + ⮌), nút thu nhỏ và nút neo giữa màn hình.
  - `ConfirmModal`: Kế thừa `UiModal` (`lockUi: true`, depth 250), giao diện xác nhận đồng bộ với header và các nút thao tác.
  - `ChatLog`: Kế thừa `UiModal` (`lockUi: false`), neo góc dưới-trái, kéo thả tự do, có nút thu nhỏ chỉ còn 1 dòng tiêu đề và nút neo.
  - `PlayerHud` (UserInfo): Kế thừa `UiModal` (`lockUi: false`), neo góc trên-trái, có nút thu nhỏ thành dạng compact/mini.
  - `InfoPanel` (Weather / Clock): Kế thừa `UiModal` (`lockUi: false`), neo góc trên-phải, tiêu đề tự động cập nhật thời gian thực, có nút thu nhỏ.
  - `PartyStrip`: Kế thừa `UiModal` (`lockUi: false`), neo dọc bên trái dưới PlayerHud, hiển thị số lượng Pokémon trên header, có nút thu nhỏ.

---

## Kế hoạch hiện tại: Plan 26 — Tăng baseline scale 1.25x, Toolbar Pixel Art, Cắt padding thừa Info, Modal Xác nhận Logout, Sửa Settings & Di chuyển Chuột trái

> Bắt đầu 2026-10-01. Hoàn thành 2026-10-01. Mục tiêu:
> 1. Tăng tổng thể giao diện 1.25 lần (xem đó là chuẩn 100%).
> 2. Chuyển icon thanh Toolbar phía trên thành dạng pixel art và cùng hưởng zoom chung với HUD.
> 3. Cắt bỏ khoảng trống thừa ở phần padding phải của khung info bên trái (`PlayerHud`).
> 4. Tạo modal popup xác nhận trước khi đăng xuất (`ConfirmModal`).
> 5. Cài đặt bảng Settings chỉ đóng khi nhấn nút ✕ (click overlay không tự đóng).
> 6. Mặc định di chuyển bằng chuột trái/touch và có thể tuỳ chỉnh chuột trái/chuột phải trong Settings.
> 7. Sửa lỗi text "Thu phóng thế giới game" bị đè lên các nút trong bảng Settings.

1. **Bước 1 — Tăng baseline scale UI 1.25x & Kết nối Toolbar với Zoom (`UiZoomManager.ts`, `TopMenu.ts`):**
   - [x] Đặt `BASE_UI_SCALE = 1.25` trong `UiZoomManager` làm chuẩn 100% cho mọi panel HUD.
   - [x] Nối `UiZoomManager` vào `TopMenu`: icon toolbar phóng to theo tỷ lệ UI zoom của toàn hệ thống.
   - [x] Vẽ các biểu tượng thanh công cụ bằng phong cách pixel art sắc nét thay cho ký tự unicode.
2. **Bước 2 — Cắt bỏ khoảng trống thừa bên phải khung Info (`PlayerHud.ts`):**
   - [x] Giảm `PANEL_W` từ 210px xuống 158px, tối ưu không gian hiển thị tên và tiền tệ, vừa vặn không thừa viền phải.
3. **Bước 3 — Modal Popup Xác nhận Đăng xuất (`ConfirmModal.ts`, `WorldScene.ts`):**
   - [x] Xây dựng modal popup hỏi xác nhận khi bấm Logout với 2 lựa chọn: `Đăng xuất` (đỏ) và `Huỷ bỏ` (xám).
4. **Bước 4 — Nâng cấp Settings Panel (`SettingsPanel.ts`):**
   - [x] Đổi hành vi overlay: Chỉ đóng modal khi bấm nút `✕`, click bên ngoài không đóng.
   - [x] Sắp xếp lại layout dòng Thu phóng (UI Zoom & Game Zoom) chống chồng chéo text và nút bấm.
   - [x] Thêm tuỳ chọn Cơ chế di chuyển: `Chuột trái / Touch (LMB)` [Mặc định] vs `Chuột phải (RMB)`.
5. **Bước 5 — Cập nhật Cơ chế di chuyển trong `WorldScene.ts`:**
   - [x] Mặc định di chuyển bằng chuột trái / touch khi click vào thế giới (ngoài UI), hỗ trợ chuyển đổi linh hoạt theo cấu hình Settings.
6. **Bước 6 — Typecheck, kiểm tra toàn bộ & Git commit:**
   - [x] Chạy typecheck kiểm tra không còn lỗi (`pnpm run typecheck` pass).
   - [x] Cập nhật `project_status.md` và tạo git commit.

---

### Nhật ký 2026-10-01 (10) — Plan 26: Baseline scale 1.25x, Toolbar Pixel Art, Cắt padding Info, Confirm Modal, Sửa Settings & Di chuyển Chuột trái

- **Tăng baseline scale toàn bộ UI lên 1.25x (`BASE_UI_SCALE = 1.25`):**
  - Mọi panel HUD hiển thị lớn hơn 1.25 lần rõ ràng, dễ nhìn nhưng người chơi vẫn thấy tỷ lệ chuẩn là 100% trong Settings.
- **Thanh Toolbar phong cách Pixel Art & co giãn theo UI Zoom:**
  - Thay thế toàn bộ ký tự unicode bằng các icon pixel art sắc nét tự vẽ qua canvas graphics (`drawPixelIcon`): Pokéball, Balo, Nhóm, Bản đồ, La bàn, Bánh răng cài đặt, Trợ giúp, Cửa đăng xuất.
  - Kết nối `TopMenu` với `UiZoomManager`: thanh toolbar tự động co giãn đồng bộ với tỷ lệ phóng to HUD của toàn hệ thống.
- **Cắt bỏ khoảng trống thừa ở khung Info (`PlayerHud`):**
  - Giảm chiều rộng `PANEL_W` từ 210px xuống **158px**, tái cấu trúc vị trí cột tên và tiền tệ, viền phải ôm khít nội dung gọn gàng, tăng không gian thoáng đãng cho thế giới game.
- **Modal Popup Xác nhận Đăng xuất (`ConfirmModal`):**
  - Tạo hộp thoại xác nhận độc lập (`ConfirmModal`) với overlay tối bảo vệ (`depth = 250`), chặn click nhầm khi đăng xuất từ Toolbar hoặc Settings. Cung cấp hai nút `[ Xác nhận ]` (đỏ) và `[ Huỷ ]` (xám).
- **Hoàn thiện bảng Cài đặt (Settings):**
  - Đổi cơ chế đóng: Bảng cài đặt **chỉ đóng khi bấm nút ✕**, không tự đóng khi bấm vào khoảng trống overlay bên ngoài.
  - Sửa lỗi chồng lấn hiển thị: Dịch chuyển các nút tăng/giảm thu phóng game sang phải, đảm bảo text nhãn không bao giờ bị đè.
  - Bổ sung cấu hình Cơ chế di chuyển: Người chơi có thể tuỳ chọn giữa `Chuột trái / Touch (LMB)` [Mặc định] và `Chuột phải (RMB)`.
  - **Tự động co giãn theo UI Zoom và kẹp an toàn trong màn hình:**
    - Tích hợp `Phaser.GameObjects.Container` (`modalContainer`) cho toàn bộ phần tử của bảng cài đặt, giúp phóng to/thu nhỏ đồng bộ theo `uiZoom`.
    - Tính toán tỷ lệ co giãn an toàn: `effectiveScale = Math.max(0.35, Math.min(uiZoom, maxScale))`, tự động giới hạn theo kích thước thực của màn hình để không bao giờ bị tràn mép trên/dưới/trái/phải, đồng thời kẹp toạ độ kéo thả (`customX`, `customY`) luôn nằm trong tầm nhìn.
- **Cập nhật Cơ chế di chuyển trong game (`WorldScene`):**
  - Hỗ trợ di chuyển mặc định bằng click chuột trái / chạm màn hình (touch), kiểm tra chuẩn xác không trúng UI và không xung đột với thao tác Pan camera (Shift + Drag / MMB).

---

## Kế hoạch hiện tại: Plan 25 — Chuẩn hoá Tỷ lệ HUD, Draggable Settings, Overlay Khóa UI, Cài đặt Ngôn ngữ & Nút Logout trên Toolbar

> Bắt đầu 2026-10-01. Hoàn thành 2026-10-01. Mục tiêu: Khắc phục lỗi kích thước HUD không chuẩn khi phóng to/thu nhỏ màn hình; Thêm tuỳ chọn ngôn ngữ trực quan trong Settings; Khung Settings có thể kéo thả di chuyển; Bổ sung Overlay chặn toàn bộ thao tác UI/game khi mở Settings; Đưa nút Logout lên thanh Toolbar.

1. **Bước 1 — Chuẩn hoá Tỷ lệ HUD & Cơ chế Relayout tập trung (`UiZoomManager.ts`, `WorldScene.ts`):**
   - [x] Bỏ cơ chế `autoFactor` co rút làm nhảy tỷ lệ HUD khi resize; giữ giá trị `uiZoom` chuẩn do người dùng điều khiển và phân bổ chế độ `mini` đồng bộ.
   - [x] Thống nhất ngưỡng chuyển đổi `mini` trên toàn bộ các panel (`< 640px` chiều rộng hoặc `< 500px` chiều cao).
   - [x] Xây dựng hàm `relayoutAllPanels()` trong `WorldScene.ts` để cập nhật đồng loạt mọi panel khi resize màn hình, đảm bảo không panel nào bị kẹt kích thước cũ.
2. **Bước 2 — Khung Settings Draggable & Overlay Khóa UI (`SettingsPanel.ts`):**
   - [x] Bổ sung cơ chế kéo thả di chuyển (Draggable) modal Settings bằng thanh tiêu đề Header.
   - [x] Cải tiến Overlay mờ tối toàn màn hình (`depth = 200`) có khả năng khóa và chặn đứng toàn bộ tương tác chuột xuống các panel HUD và world gameplay bên dưới.
3. **Bước 3 — Cải tiến Cài đặt Ngôn ngữ trong Settings (`SettingsPanel.ts`):**
   - [x] Thiết kế khu vực chọn Ngôn ngữ trực quan: Nút chuyển đổi Tiếng Việt / English có đánh dấu trạng thái Active rõ ràng, lưu cấu hình vào `localStorage`.
4. **Bước 4 — Đưa nút Logout ra thanh Toolbar (`TopMenu.ts`, `WorldScene.ts`):**
   - [x] Bổ sung icon `🚪` Đăng xuất trực tiếp lên thanh công cụ `TopMenu` (cả ở chế độ dàn ngang lẫn pop-up mini).
   - [x] Bấm vào nút Đăng xuất trên Toolbar sẽ lập tức ngắt kết nối và quay về màn hình Login.
5. **Bước 5 — Typecheck, kiểm tra toàn bộ & Git commit:**
   - [x] Chạy typecheck kiểm tra không còn lỗi (100% pass toàn monorepo).
   - [x] Cập nhật `project_status.md` và tạo git commit.

---

### Nhật ký 2026-10-01 (9) — Plan 25: Ổn định Tỷ lệ HUD, Draggable Settings, Overlay Khóa UI & Logout Toolbar

- **Khắc phục lỗi kích thước HUD không chuẩn khi phóng to/thu nhỏ:**
  - Bỏ công thức co rút tự động `autoFactor` trong `UiZoomManager`: HUD giữ tỷ lệ pixel-perfect sắc nét theo đúng tỷ lệ người dùng chọn trong Settings (100%, 110%, v.v.), không còn bị biến dạng méo mó khi resize hay browser zoom.
  - Đồng bộ ngưỡng chuyển đổi chế độ tối giản (`mini mode`) thống nhất trên toàn bộ các thành phần: `viewport.width < 640 || viewport.height < 500`.
  - Bổ sung hàm điều phối tập trung `relayoutAllPanels()` trong `WorldScene.ts`: cập nhật đồng loạt `PlayerHud`, `InfoPanel`, `PartyStrip`, `TopMenu`, `ChatLog` và `Minimap` trên mọi sự kiện resize / breakpoint-change / ui-zoom-change.
- **Khung Settings Draggable & Khóa UI:**
  - Thanh tiêu đề modal Settings hỗ trợ nhấn giữ chuột trái và kéo thả di chuyển tự do trên màn hình (kèm nút `⚓` để căn giữa lại tức thì).
  - Overlay phủ toàn màn hình (`depth = 200`) nuốt trọn mọi tương tác click chuột, chặn hoàn toàn click-to-move, pan camera và tương tác các panel phía sau khi đang mở Settings.
- **Cài đặt Ngôn ngữ hoàn thiện:**
  - Giao diện chọn ngôn ngữ trực quan với 2 nút `🇻🇳 Tiếng Việt` và `🇺🇸 English`, hiển thị highlight viền cyan cho ngôn ngữ đang chọn và lưu trạng thái vào `localStorage` (`pixelmon.lang`).
- **Nút Logout trên Toolbar:**
  - Đưa trực tiếp icon `🚪` Đăng xuất lên thanh công cụ `TopMenu` (dàn ngang desktop & pop-up mini), giúp người chơi đăng xuất nhanh chóng tiện lợi chỉ với 1 click.

---

## Kế hoạch hiện tại: Plan 24 — Nâng cấp Tabbed Settings Panel & Khung Chat Draggable

> Bắt đầu 2026-10-01. Hoàn thành 2026-10-01. Mục tiêu: Mở rộng Settings Panel thành modal lớn có nhiều Tab (Giao diện, Gameplay, Âm thanh, Hệ thống), tích hợp Game Zoom, bật tắt độc lập 5 thành phần UI (Profile, Clock, Party, Chat, Minimap); Nâng cấp ChatLog lớn hơn, có thể kéo thả di chuyển, có nút thu nhỏ và nút neo xuống.

1. **Bước 1 — Nâng cấp ChatLog (`ChatLog.ts`):**
   - [x] Tăng tỷ lệ khung chat: chiều rộng `320px` (desktop), 6 dòng tin nhắn, `LINE_H = 18px`, chữ sắc nét dễ đọc.
   - [x] Hỗ trợ kéo thả (Draggable) di chuyển vị trí khung chat tự do trên màn hình bằng chuột tại Title Bar (`cursor: grab`), có clamp toạ độ an toàn.
   - [x] Bổ sung nút Thu nhỏ (`▼` / `▲`) trên Title bar: Khi thu nhỏ, panel chỉ còn thanh header mỏng ~26px, bấm lại mở rộng tức thì.
   - [x] Bổ sung nút Neo (`⚓` / Snap): Đưa khung chat về lại vị trí neo mặc định ở góc màn hình.
2. **Bước 2 — Xây dựng SettingsPanel Đa Tab (`SettingsPanel.ts`):**
   - [x] Mở rộng kích thước modal (540×410px), thiết kế chuyên nghiệp với thanh Tab bar:
     - `[🖥 Giao diện]`
     - `[🎮 Lối chơi]`
     - `[🔊 Âm thanh]`
     - `[⚙ Hệ thống]`
   - [x] Tab Giao diện:
     - Bật/tắt độc lập 5 thành phần UI: Profile Info, Clock/Weather, Party, Chat Box, Minimap.
     - Toggle chế độ tối giản (Mini Mode / Normal Mode).
     - Điều khiển UI Zoom (`-`, `+`, `Reset 100%`).
     - Điều khiển Game Zoom (Camera Zoom: `-`, `+`, `Reset 1.0x`), hiển thị giá trị zoom thực tế (1.0x, 1.2x, v.v.).
   - [x] Tab Lối chơi (Gameplay):
     - Hiển thị tên người chơi khác (Show Names).
     - Hiệu ứng click-to-move marker.
     - Chế độ tự động chạy (Auto-Run) / Lưới toạ độ (Grid Overlay).
   - [x] Tab Âm thanh (Audio):
     - Bật/tắt và chỉnh âm lượng BGM & SFX.
   - [x] Tab Hệ thống (System):
     - Lựa chọn ngôn ngữ (VI / EN).
     - Thông tin tài khoản & Nút Đăng xuất (Logout).
3. **Bước 3 — Kết nối và điều phối trong `WorldScene.ts`:**
   - [x] Nối Game Zoom điều khiển camera world trong scene (`cameras.main.zoom` qua `zoomGameBy` / `setGameZoom`).
   - [x] Nối các toggle độc lập cho từng thành phần UI (`hud.setVisible`, `infoPanel.setVisible`, `partyStrip.setVisible`, `chatLog.setVisible`, `minimap.setVisible`).
4. **Bước 4 — Typecheck, cập nhật trạng thái & Git commit:**
   - [x] Typecheck pass 100% (cả client, server, shared).
   - [x] Cập nhật `project_status.md` và tạo git commit.

---

### Nhật ký 2026-10-01 (8) — Plan 24: Tabbed Settings Modal & Khung Chat Draggable

- **Khung Chat (ChatLog) hoàn thiện cao cấp:**
  - Tăng kích thước rộng `320px` (desktop), hiển thị 6 dòng tin nhắn cùng lúc, font 12px rõ nét, padding hợp lý.
  - **Kéo thả di chuyển (Draggable):** Chuột trái nhấn giữ thanh tiêu đề (Title Bar) để kéo thả khung chat đến bất kỳ vị trí mong muốn trên màn hình. Có clamp chống kéo bay ra ngoài viewport.
  - **Thu nhỏ (Minimize/Expand):** Nút `▼` / `▲` trên thanh tiêu đề cho phép thu gọn khung chat chỉ còn thanh bar cao 26px giúp người chơi quan sát map tối đa, bấm lại bung to ngay lập tức.
  - **Nút Neo (Dock):** Icon `⚓` trên thanh tiêu đề giúp đưa khung chat lập tức snap trở lại vị trí neo chuẩn góc màn hình.
- **Settings Panel đa Tab lớn:**
  - Nâng cấp modal lên kích thước 540×410px với 4 Tab:
    1. **🖥 Giao diện:** Toggle độc lập 5 thành phần UI (Profile, Clock/Weather, Party, Chat Box, Minimap); Toggle chế độ Mini; Bộ điều khiển UI Zoom (`-`, `+`, `100%`); Bộ điều khiển Game Zoom (`-`, `+`, `1.0x`).
    2. **🎮 Lối chơi:** Bật/tắt tên người chơi, hiệu ứng click-to-move, lưới toạ độ, auto-run.
    3. **🔊 Âm thanh:** Bật/tắt BGM & SFX.
    4. **⚙ Hệ thống:** Chọn ngôn ngữ VI/EN, Đăng xuất tài khoản, Đóng bảng cài đặt.
- **Kết nối camera và scene:**
  - `zoomGameBy(delta, screenX?, screenY?)` hỗ trợ zoom từ SettingsPanel không cần truyền toạ độ chuột (mặc định lấy tâm màn hình).
  - Tách bạch hoàn toàn việc ẩn/hiện từng thành phần UI thay vì chỉ có 1 nút toggle toàn bộ HUD.

---

### Kế hoạch hiện tại: Plan 23 — Tinh gọn UI, Profile Mini, Toolbar thu gọn & Settings Panel

> Bắt đầu 2026-10-01. Hoàn thành 2026-10-01. Mục tiêu: Cắt bỏ khoảng trống thừa, Profile Mini dạng viên thuốc (pill), Toolbar thu gọn chỉ còn 1 nút bật mở Toolbar Panel Mini, loại bỏ Pause Menu và thay bằng Settings Panel đa năng.

1. **Bước 1 — Tinh gọn khoảng trống thừa & Profile Mini (`PlayerHud.ts`):**
   - [x] Tối ưu padding panel chuẩn 6px (desktop) và 4px (mini), giảm kích thước bảng từ 260×92px xuống 210×72px.
   - [x] Xây dựng Profile Mini dạng viên thuốc (pill badge): Avatar tròn 28px + Tên Trainer + Tiền game, kích thước chỉ 146×36px, cực kỳ thoáng đãng.
   - [x] Hỗ trợ click vào Profile Mini để chuyển đổi nhanh hoặc xem chi tiết.
2. **Bước 2 — Xây dựng Toolbar Mini thu gọn (`TopMenu.ts`):**
   - [x] Bỏ nút Pause (`☰`). Sắp xếp lại danh mục menu logic: Gameplay (Pokédex, Túi đồ, Đội hình, Bản đồ, GPS/Minimap) + Hệ thống (Cài đặt, Hướng dẫn).
   - [x] Ở giao diện tối giản (hoặc khi màn hình nhỏ): Thu gọn toàn bộ toolbar thành **1 Nút Toggle Toolbar** (`☰` 28px) nhỏ gọn ở cạnh trên.
   - [x] Khi click nút Toggle: Bung ra một **Toolbar Mini Panel** chứa các icon chức năng với nền mờ tối, bo góc đẹp mắt. Click ra ngoài hoặc click lại để đóng.
3. **Bước 3 — Tạo mới `SettingsPanel.ts` thay thế `MenuPanel.ts`:**
   - [x] Loại bỏ `MenuPanel.ts` (bỏ khái niệm "Pause Menu" không phù hợp với game MMORPG online).
   - [x] Tạo `SettingsPanel.ts` với giao diện Cài đặt toàn diện:
     - Nhóm Hiển thị: Toggle HUD, Toggle Minimap, Chế độ Mini/Normal, UI Zoom controls (+ / - / Reset).
     - Nhóm Âm thanh: BGM, SFX toggle (chuẩn bị sẵn).
     - Nhóm Tài khoản & Hệ thống: Đăng xuất (Logout), Đóng (Close).
   - [x] Phím `Esc` và icon `⚙ Cài đặt` trên Toolbar sẽ mở `SettingsPanel`.
4. **Bước 4 — Tinh gọn các panel khác (`InfoPanel.ts`, `PartyStrip.ts`):**
   - [x] Thu hẹp các khoảng đệm bên trong `InfoPanel` (144×46px desktop, 80×32px mini) và `PartyStrip` để giảm chiếm dụng không gian màn hình.
5. **Bước 5 — Cập nhật `WorldScene.ts` kết nối toàn bộ hệ thống mới:**
   - [x] Đổi liên kết từ `MenuPanel` sang `SettingsPanel`.
   - [x] Tích hợp Toolbar mini và Profile mini vào update loop, resize listener và đồng bộ trạng thái HUD mode.
6. **Bước 6 — Kiểm tra typecheck toàn dự án & Cập nhật `project_status.md`:**
   - [x] `pnpm typecheck` pass 100% (cả client, server, shared).
   - [x] Cập nhật kết quả vào `project_status.md` và tạo git commit.

---

### Nhật ký 2026-10-01 (7) — Plan 23: Tinh gọn UI, Profile Mini, Toolbar thu gọn & Settings Panel đa năng

- **Cắt giảm khoảng trống thừa:**
  - `PlayerHud`: thu gọn từ 260×92px xuống 210×72px (tiết kiệm ~30% diện tích).
  - `InfoPanel`: thu gọn từ 168×54px xuống 144×46px (ở mode mini là 80×32px).
- **Profile Mini dạng viên thuốc (Pill Badge):**
  - Kích thước siêu gọn 146×36px: bo tròn viền cyan, avatar 28px nằm gọn bên trái, hiển thị Tên Trainer và Tiền game, ẩn tiền thật để tối giản không gian.
- **Toolbar Mini thu gọn:**
  - Ở `mini` mode: ẩn toàn bộ dãy icon, thay bằng duy nhất 1 nút toggle tròn `☰` (28px).
  - Khi click vào nút toggle: hiển thị một Toolbar Mini Panel popup nổi lên với nền mờ tối, chứa đầy đủ các icon chức năng (Pokédex, Túi đồ, Đội hình, Bản đồ, GPS, Cài đặt, Hướng dẫn).
  - Click lại nút toggle hoặc click ra ngoài canvas sẽ tự động đóng popup toolbar.
- **Settings Panel đa năng & Xóa Pause Menu:**
  - Xóa bỏ file `MenuPanel.ts` và khái niệm pause game offline.
  - Tạo mới `SettingsPanel.ts` (`apps/client/src/ui/SettingsPanel.ts`) thiết kế dạng modal hiện đại với 3 phân vùng rõ ràng:
    1. **Hiển thị:** Bật/tắt thanh HUD, Bật/tắt bản đồ thu nhỏ (Minimap), Bật/tắt giao diện tối giản (Chế độ Mini / Normal), Điều chỉnh độ phóng to UI (+, -, 100%).
    2. **Âm thanh:** Bật/tắt nhạc nền (BGM), Bật/tắt âm thanh hiệu ứng (SFX).
    3. **Tài khoản & Hệ thống:** Nút Đăng xuất tài khoản (đưa về trang Login), Nút Đóng.
  - Phím `Esc` và icon `⚙` trên Toolbar đều mở Settings Panel này.
- **Typecheck & Clean code:**
  - Loại bỏ hoàn toàn references của `MenuPanel`.
  - Typecheck `pnpm typecheck` toàn monorepo vượt qua 100%.

---

## Nhật ký 2026-10-01 — Sprite import & fix lỗi

### Khởi động lại game

- Khởi động bằng `bash scripts/pm.sh start` → server :2567 + client :5173 OK.
- **Fix 403 ở client:** `apps/client/vite.config.ts` khai `server.fs.allow`
  **ghi đè hoàn toàn** allow-list mặc định của Vite → chính
  `apps/client/index.html` bị chặn.
  ```ts
  // ❌ cũ
  allow: ['../../packages/shared'],
  // ✅ mới
  import { defineConfig, searchForWorkspaceRoot } from 'vite';
  allow: [searchForWorkspaceRoot(process.cwd()), '../../packages/shared'],
  ```
- Kiểm tra hạ tầng: Postgres (5432) + Redis (6379) đều chạy sẵn.

### Import sprite

|               | Trước                                 | Sau                                   |
| ------------- | ------------------------------------- | ------------------------------------- |
| `hero_64.png` | 1024×64 dải 1D, **12/16 frame trống** | **256×256 grid 4×4**, **16/16 frame** |
| `hero_32.png` | 512×32                                | 128×128                               |
| Nền           | nền trắng                             | alpha trong suốt (white-unmatting)    |
| Console       | 28 warning                            | **2 warning** (còn lại = lỗi Tiled)   |

Layout chuẩn sheet: hàng = `['down','up','left','right']`, cột = frame 0..3.
Ảnh nguồn `sprites_import/*.png`: hàng = `['down','left','right','up']`.

### Lỗi đã fix (chi tiết trong `docs/sprite-import-guide.md` mục 4)

| #   | Lỗi                                                                                 | File                   | Fix                                                |
| --- | ----------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| 1   | Đăng ký frame theo dải 1D → index vượt 256 → clamp 0 → **tất cả frame trỏ ô `0_0`** | `BootScene.ts`         | `tex.add(name, 0, F*i, F*di, F, F)`                |
| 2   | Thứ tự hướng `BootScene` ≠ `PlayerSprite`                                           | 2 file                 | Xuất `HERO_DIRS` chung                             |
| 3   | `setFrame(number)` tra `frames[number]` → 26 warning "has no frame"                 | `PlayerSprite.ts`      | Dùng `frameName(dir, frame)`                       |
| 4   | `setFlipX(true)` cho hướng trái dù có frame left thật                               | `PlayerSprite.ts`      | Bỏ `setFlipX`                                      |
| 5   | `setDirection` reset `walkFrame` mỗi tick → walk không advance                      | `PlayerSprite.ts`      | Chỉ reset khi đổi hướng                            |
| 6   | `setOrigin(0.5, 0.7)` không hợp frame canh chân                                     | `PlayerSprite.ts`      | hero → `(0.5, 1.0)`                                |
| 7   | Sheet sinh ra giữ thứ tự hàng ảnh nguồn → **↑ quay trái, ← quay phải, → quay lưng** | `build_spritesheet.py` | Thêm `SOURCE_DIR_ORDER` + remap hàng + `--preview` |
| 8   | Vite `fs.allow` ghi đè → 403                                                        | `vite.config.ts`       | Thêm workspace root vào allow list                 |

### Bài học — lỗi đảo hướng là lỗi ÂM THẦM

Lỗi #7 không bị bất kỳ lớp kiểm tra nào bắt được:

- `--verify` chỉ kiểm frame **không trống** → 16/16 vẫn ✓
- `typecheck` sạch → `DIRS` vẫn đúng thứ tự
- console vẫn hiện `up / 1_1` → **tên frame do code quyết định, không do ảnh**
- walk cycle vẫn chạy bình thường

**Quy tắc:** mỗi lần sinh sheet phải kèm `--preview`, mở ảnh soi 4 dòng nhãn
`0:down / 1:up / 2:left / 3:right` **trước khi báo hoàn thành**. Không tin
frame name trong console.

### File mới / thay đổi trong session này

```
scripts/tools/build_spritesheet.py        (mới)  — tool cắt sprite tái dùng
docs/sprite-import-guide.md               (mới)  — quy trình import + 5 lỗi đã biết
packages/shared/assets/sprites/hero_64.png (sinh lại, 256×256, 16 frame)
packages/shared/assets/sprites/hero_32.png (sinh lại, 128×128)
apps/client/vite.config.ts                (fix 403)
apps/client/src/scenes/BootScene.ts       (HERO_DIRS + đăng ký frame 2D)
apps/client/src/entities/PlayerSprite.ts  (frameName, bỏ flip, origin, walk reset)
```

---

## Nhật ký 2026-10-01 (2) — Plan 20: thư viện Sprite hoàn thiện + gán sprite cho user

### Import sprite thứ 2 — `jin-yuichi`

```bash
.venv/bin/python3 scripts/tools/build_spritesheet.py sprites_import/jin-yuichi.png \
  --name hero_jin_64 --verify --preview /tmp/jin_preview.png \
  --also-32 --publish-name jin-yuichi
```

| Output                                                             | Kích thước | Frame                            |
| ------------------------------------------------------------------ | ---------- | -------------------------------- |
| `packages/shared/assets/sprites/hero_jin_64.png`                   | 256×256    | 16/16, hàng `down,up,left,right` |
| `packages/shared/assets/sprites/hero_jin_32.png`                   | 128×128    | 16/16                            |
| `apps/server/public/sprites/jin-yuichi.png` (mới `--publish-name`) | 256×256    | serve tĩnh, gán cho user         |

Đối chiếu preview **bằng mắt**: `0:down` mặt trước, `1:up` lưng, `2:left` nhìn
sang trái, `3:right` nhìn sang phải. Kiểm tra lại **in-game** 4 hướng bằng cách
đóng băng frame + chụp → khớp nhãn.

### Luồng sprite mới (thay cho hardcode trong BootScene)

```
sprites_import/*.png
  → build_spritesheet.py --publish-name <tên>
  → apps/server/public/sprites/<tên>.png  (+ sprite_catalog: frame_count)
  → Admin → Người chơi → Sửa → "Character sprite" (users.sprite_id)
  → GET /api/auth/me → user.sprite
  → ColyseusManager.userSprite → WorldScene.loadSpriteSheet('user_sprite')
  → PlayerSprite (16 frame) / remote player qua PlayerState.spriteUrl
```

- Server `WorldRoom.onJoin` tra `users.sprite_id` → `sprite_catalog` →
  `PlayerState.spriteUrl/spriteFrame/spriteFrameCount` → remote player cũng
  hiển thị sprite đúng (load bất đồng bộ, `swapSheet` khi xong).
- Sprite sheet trong thư viện serve tĩnh từ Express (`/sprites/*.png`) —
  KHÔNG đi qua Vite nên client nối `SERVER_ORIGIN` trước khi load.

### Thử (test) đã chạy

- `pnpm typecheck` 4/4, `pnpm lint` 0 errors, `pnpm build` 3/3, `format:check` clean.
- API: `PATCH user {spriteId}` → `/api/auth/me` trả sprite; sai UUID → 400
  `INVALID_SPRITE`; UUID không tồn tại → 404 `SPRITE_NOT_FOUND`; `spriteId=null`
  → bỏ gán (và `ON DELETE SET NULL` khi xóa sprite).
- Playwright: bảng users thêm cột Sprite (thumb + tên), modal user select +
  preview đổi theo lựa chọn, sprite editor load 16 frame (toạ độ 64×64, lưới
  4×4, export theo lưới), console không lỗi.
- In-game: texture `user_sprite` có đủ 16 frame (`0_0…3_3`, cutX/Y phân bố
  đúng lưới), 4 hướng hiển thị đúng bằng mắt.

### File thay đổi trong session này

```
scripts/tools/build_spritesheet.py               (+ --publish-name → public/sprites)
packages/shared/src/schema/index.ts               (+ PlayerState.spriteUrl/spriteFrame/spriteFrameCount)
apps/server/src/config/database.ts               (+ users.sprite_id, sprite_catalog.frame_count + migration)
apps/server/src/modules/admin/sprite.ts          (+ getAdminSprite, parseFrameCount, frame_count, toUserSprite, PATCH bakedSheet, delete file -sheet)
apps/server/src/modules/admin/index.ts           (list/create/update user + spriteId, validateSpriteId, AdminApiError)
apps/server/src/modules/auth/me.ts               (+ user.spriteId/user.sprite)
apps/server/src/modules/world/index.ts           (onJoin tra sprite → PlayerState)
apps/server/src/app.ts                           (GET /sprites/:id, PATCH dùng multer)
apps/server/public/admin.html                    (+ cột Sprite, modal select+preview, frame-count select)
apps/server/public/js/admin.js                   (spriteCell/ensureSprites/fillSpriteSelect, _spriteEdit(id), editor 16-frame, change listener)
apps/server/public/js/i18n.js                    (+ m.sprite*, u.colSprite, sp.frameCount/fc12/16/edit/frames16)
apps/server/public/css/admin.css                 (+ .sprite-thumb-cell, .sprite-picker, .sprite-thumb-frame)
apps/client/src/entities/SpriteSheetLoader.ts    (mới — load sheet theo URL, layout 12/16 frame)
apps/client/src/entities/PlayerSprite.ts         (+ swapSheet())
apps/client/src/network/ColyseusManager.ts       (+ UserSprite, userSprite, loadSprite)
apps/client/src/scenes/WorldScene.ts             (chọn sheet user → hero → trainer, remote sprite async)
apps/client/src/scenes/BootScene.ts              (bỏ @ts-ignore thừa)
apps/client/src/world/TiledMapLoader.ts          (eslint-disable + @ts-ignore giữ TS6059)
eslint.config.js                                 (+ ignores .venv, temp)
```

---

## Nhật ký 2026-10-01 (3) — Sửa lỗi theo phản hồi

### Lỗi 3a: Sprite không xoay mặt / không hoạt động đúng khi di chuyển bằng chuột phải

- **Nguyên nhân:**
  1. Trong `WorldScene.update()`, logic `if (this.moving)` xử lý di chuyển dùng chung cho cả phím lẫn chuột phải. Khi chuột phải di chuyển (`advanceAlongPath`), biến hướng phím mặc định `keyDirection = 'down'` (vì không bấm phím) lại bị gán đè vào `this.player.setDirection('down')` mỗi tick.
  2. Việc gán đè này làm hướng liên tục bị reset về `down`, đồng thời reset `walkFrame` về 0 mỗi frame khiến animation bước đi bị giật/đứng yên và sprite luôn hướng mặt xuống dưới.
  3. Xử lý chuột phải trong Phaser cần hỗ trợ cả `p.button === 2` và `p.rightButtonDown()`, đồng thời gọi `this.input.mouse?.disableContextMenu()` để tránh bị nuốt sự kiện.
- **Khắc phục:**
  - Tách rời nhánh phím (`isKeyboardMoving`) và nhánh chuột phải (`advanceAlongPath`). Nhánh phím chỉ chạy khi thực sự có phím bấm.
  - Cập nhật hướng di chuyển theo vector (`dx, dy`) cho từng bước của path trong `advanceAlongPath`, giữ nguyên hướng hiện tại khi bước dừng.
  - Hỗ trợ thêm cụm phím WASD song song với 4 phím mũi tên.
- **File sửa:** `apps/client/src/scenes/WorldScene.ts`.

### Lỗi 3b: Tên nhân vật quá thấp trùng với phần đầu của nhân vật

- **Nguyên nhân:** Toạ độ của text tên nhân vật `nameText` được hardcode cố định ở `y - TILE_SIZE - 4` (`y - 36`). Khi nâng cấp từ sprite 32×32 lên sprite 64×64 (với origin Y = 1.0 đặt chân tại `y`, đầu nhân vật vươn tới `y - 56`), vị trí `y - 36` rơi đúng vào vùng đầu/cổ của nhân vật.
- **Khắc phục:**
  - Thêm phương thức `getNameOffsetY()` trong `PlayerSprite`: với sheet 64px `hero` (origin chân), offset Y nâng lên 68px (cao hơn đỉnh đầu 12px); với sheet 32px legacy giữ `TILE_SIZE + 4` (36px).
  - Tự động cập nhật lại vị trí `nameText` trong constructor, `setPosition()`, và khi gọi `swapSheet()`.
- **File sửa:** `apps/client/src/entities/PlayerSprite.ts`.

### Lỗi 3c: Trang admin tiếng Anh / tiếng Việt chưa phân rõ

- **Nguyên nhân:**
  1. `admin.html` có nhiều label, tiêu đề KPI, bảng người chơi/pokemon/vị trí, modal inputs, placeholder bị hardcode tiếng Việt hoặc tiếng Anh không có thuộc tính `data-i18n` / `data-i18n-ph`.
  2. `admin.js` chứa nhiều chuỗi tiếng Việt hardcode trong thông báo đăng nhập, confirm xóa user/sprite, prompt đổi mật khẩu, title nút thao tác bảng users (`Sửa`, `Xóa`, `Ban`, `Gỡ ban`).
  3. `i18n.js` thiếu nhiều translation key song ngữ và chưa hỗ trợ chèn tham số động (`{username}`, `{name}`) trong hàm `t()`.
  4. Khi chuyển ngôn ngữ qua nút EN/VI, các view không được re-render đồng bộ.
- **Khắc phục:**
  - Bổ sung toàn bộ translation keys EN/VI thiếu trong `i18n.js` và hỗ trợ biến template `{key}` trong hàm `t(key, params)`.
  - Gắn thuộc tính `data-i18n` / `data-i18n-ph` cho tất cả các thẻ trong `admin.html` (tiêu đề KPI, bảng thống kê, modal options, placeholder).
  - Thay thế các thông báo `alert`, `confirm`, `prompt`, `showMsg`, tiêu đề nút bảng trong `admin.js` bằng `t()`.
  - Định dạng ngày tháng và tiền tệ theo locale tương ứng (`vi-VN` khi ở tiếng Việt, `en-US` khi ở tiếng Anh).
  - Đồng bộ re-render lại toàn bộ bảng khi bấm nút chuyển đổi ngôn ngữ EN/VI.
- **File sửa:** `apps/server/public/admin.html`, `apps/server/public/js/admin.js`, `apps/server/public/js/i18n.js`.

### Lỗi 3d: Vẫn còn nút Edit trong Sprite Library

- **Nguyên nhân:** Cột thao tác của bảng danh sách sprite trong `loadSprites()` (`admin.js`) vẫn render nút `✏️` gọi hàm `_spriteEdit(id)` mở editor để sửa.
- **Khắc phục:**
  - Bỏ hoàn toàn nút edit `_spriteEdit` trong bảng sprite, chỉ giữ nút xóa `🗑` (`_spriteDelete`).
  - Gỡ bỏ `window._spriteEdit` khỏi phạm vi window.
- **File sửa:** `apps/server/public/js/admin.js`.

### Lỗi 3e: Giao diện dropdown / select có hiệu ứng nhưng bị lỗi mất một phần

- **Nguyên nhân:**
  1. Thẻ `<select>` dùng chung class `.input-search` thiếu `box-sizing: border-box`, khi kết hợp padding và width: 100% trong modal khiến kích thước thực tế vượt ra ngoài container.
  2. Các item trong `.form-row` dùng CSS Grid (`1fr 1fr`) có `min-width: auto` mặc định, khiến select bị tràn ra ngoài cột khi có nội dung dài.
  3. Khung chọn sprite `.sprite-picker` là flexbox container có thẻ `<select id="user-sprite">` mang inline `style="width: 100%"`, khi kết hợp cùng preview canvas 64px bị cộng dồn width tràn khỏi `modal-box`, dẫn tới bị che khuất hoặc cắt mất góc.
  4. Mũi tên dropdown native của browser không đồng bộ giữa các hệ điều hành, thiếu khoảng đệm bên phải khiến text dài bị đè lên mũi tên, và menu popup `<option>` chưa được style nền tối đồng bộ theme.
- **Khắc phục:**
  - Thêm `box-sizing: border-box`, `min-width: 0` cho `.form-row .form-field` và `overflow-x: hidden` cho `.modal-box`.
  - Thiết lập rule chuẩn cho `select.input-search, .form-field select`: kích hoạt `appearance: none`, thêm icon mũi tên chevron SVG tinh gọn, tạo padding bên phải chống đè chữ (`padding-right: 32px`), style nền tối cho thẻ `<option>`.
  - Chuẩn hóa flexbox `.sprite-picker select` với `flex: 1 1 0%`, `min-width: 0` và gỡ các inline style width thừa trong `admin.html`.
- **File sửa:** `apps/server/public/admin.html`, `apps/server/public/css/admin.css`.

### Lỗi 3f: Khung party Pokémon dư padding bên phải (thu gọn chỉ hiển thị avatar)

- **Nguyên nhân:**
  - Khung `PartyStrip` được khởi tạo với chiều rộng cố định `PANEL_W = 132`, trong khi kích thước mỗi ô avatar chỉ là `SLOT = 40` và toạ độ x của slot là `x + 14 * z`.
  - Việc này khiến bên phải của khung party thừa một khoảng trống lớn (~78px padding trống không cần thiết).
- **Khắc phục:**
  - Định nghĩa lại `INNER_PAD = 6` và `PANEL_W = SLOT + INNER_PAD * 2` (52px ở chế độ normal, 36px ở chế độ mini).
  - Căn giữa ô slot hoàn hảo theo trục ngang của panel: `sx = x + (w - slotSize) / 2`, đảm bảo lề trái và lề phải đối xứng tuyệt đối.
  - Căn giữa tiêu đề `PARTY` ở đầu panel và tinh chỉnh kích thước chữ theo `uiZoom`.
  - Giữ thiết kế slot vuông vắn hiển thị avatar Pokémon và thanh HP tích hợp gọn bên trong slot, chuẩn bị sẵn sàng để gắn avatar thật khi dựng chức năng tiếp theo.
- **File sửa:** `apps/client/src/ui/PartyStrip.ts`.

---

## Nhật ký 2026-10-01 (4) — Plan 21: Import toàn bộ Sprite, Previews 128/256px, Redesign Admin & Register

### 1. Chuẩn hóa & Import toàn bộ sprite trong `sprites_import/`

- **Xử lý:**
  - Nâng cấp `scripts/tools/build_spritesheet.py`: hỗ trợ ảnh nguồn 3 cột (`ninja-blue.png`, 1086×1448) tự động chuyển đổi sang chu kỳ 4 frame bước đi `[Neutral (1), Left step (0), Neutral (1), Right step (2)]`.
  - Xử lý các sprite còn lại: `ninja-red.png`, `purple-boy.png`, `ninja-blue.png` thành sheet chuẩn 16 frames 4×4 256×256, frame 64×64.
  - Kiểm tra thứ tự 4 hàng nghiêm ngặt bằng `--preview`:
    - Hàng 0: `down` (mặt trước)
    - Hàng 1: `up` (lưng)
    - Hàng 2: `left` (nhìn trái)
    - Hàng 3: `right` (nhìn phải)
  - Xuất bản vào `apps/server/public/sprites/` và đăng ký vào bảng `sprite_catalog` trong PostgreSQL:
    - `main` (`/sprites/hero-64.png`)
    - `jin-yuichi` (`/sprites/jin-yuichi.png`)
    - `ninja-red` (`/sprites/ninja-red.png`)
    - `purple-boy` (`/sprites/purple-boy.png`)
    - `ninja-blue` (`/sprites/ninja-blue.png`)

### 2. Sinh bộ Sprite Previews chuẩn kích thước 128px và 256px

- **Tự động sinh:**
  - Tĩnh (PNG): `<name>-128.png` (128×128) và `<name>-256.png` (256×256) dùng thuật toán `NEAREST` giữ nguyên độ sắc nét pixel-art.
  - Động (GIF): `<name>-128.gif` và `<name>-256.gif` lặp lại 4 frame bước đi (150ms/frame) của hướng down.
  - Lưu trữ tại: `apps/server/public/sprites/previews/`.
  - Backend API (`toRow`, `toUserSprite`) trả kèm `previewUrl128`, `previewUrl256`, `previewGif128`, `previewGif256`.

### 3. Cải tiến Sprite Library trong trang Admin

- Thay thế việc hiển thị cả tấm spritesheet cồng kềnh bằng ô preview 56×56 tinh tế với ảnh 128px pixelated.
- Thêm modal xem trước sprite kích thước lớn 256px (`#sprite-preview-modal`), hỗ trợ chuyển đổi giữa xem ảnh tĩnh 256px và animation đi bộ 256px.
- Cải thiện ô sprite trong bảng `users` (`spriteCell`): hiển thị đúng avatar mặt trước 48×48 thay vì co cả sheet 16 frame.

### 4. Thiết kế lại giao diện Edit User trong Admin

- Tái cấu trúc modal `#user-modal` sang layout 2 cột hiện đại:
  - Cột trái: Form thông tin người chơi (Tài khoản, Mật khẩu, Cấp & Tiền, Quyền & Ngôn ngữ, Ngày sinh, Bio, Notes).
  - Cột phải: **Character Avatar Showcase**:
    - Khung xem trước lớn 160×160 với nền checkerboard pixel art nổi bật.
    - Nút toggle xem ảnh tĩnh / hoạt ảnh đi bộ.
    - Badge thông số sprite và select chọn sprite đặt ngay bên dưới, cập nhật tức thì khi chuyển đổi lựa chọn.

### 5. Cập nhật tính năng Đăng ký tài khoản (Register)

- **Backend:**
  - Thêm endpoint công khai `GET /api/sprites` trả về danh sách các sprite có sẵn kèm preview URLs.
  - Cập nhật `RegisterSchema` và `registerHandler` (`register.ts`) để nhận và lưu `spriteId` vào trường `users.sprite_id`.
- **Client:**
  - Trong `LoginScene.ts`: Thêm giao diện chọn avatar nhân vật đại diện ngay trong form Đăng ký.
  - Nạp danh sách avatar trực quan từ `/api/sprites`, có viền highlight khi chọn và tự động gửi `spriteId` khi submit form đăng ký.

### 6. Tích hợp sprite preview vào Client Player Info

- Cập nhật `PlayerHud.ts`: hỗ trợ phương thức `setAvatar(sheetKey, frame, frameSize)` và tính toán `scale` theo kích thước `frameSize` thực tế (64px / 32px) thay vì hardcode.
- Trong `WorldScene.ts`: Khi người chơi vào game, truyền đúng `sheetKey` của nhân vật người chơi (kèm frame `0_0` và frameSize 64) vào `PlayerHud`, giúp avatar hiển thị chính xác nhân vật người chơi đang sử dụng.

---

## Nhật ký 2026-10-01 (5) — Căn giữa map ở trung tâm hiển thị thay vì neo góc trên bên trái

### 1. Phân tích nguyên nhân
- Trước đây `WorldScene.setupCameraFollow()` thiết lập cố định `cam.setBounds(0, 0, this.mapWidth, this.mapHeight)`.
- Khi kích thước viewport hiển thị (`cam.width / zoom`, `cam.height / zoom`) lớn hơn kích thước map (`mapWidth`, `mapHeight`) — xảy ra khi mở trình duyệt toàn màn hình, màn hình độ phân giải cao hoặc zoom out:
  - Hàm `clampX` và `clampY` của Phaser kẹp giá trị scroll tại biên nhỏ nhất `0, 0`.
  - Hậu quả: Toàn bộ bản đồ bị dính chặt vào góc trên bên trái (`0, 0`), để lại khoảng trống màu đen lớn ở bên phải và phía dưới màn hình, gây mất cân đối thị giác.

### 2. Giải pháp kỹ thuật
- **Tính toán Bounds linh hoạt (`updateCameraBounds`):**
  - Kích thước hiển thị trong world space: `dw = cam.width / zoomX`, `dh = cam.height / zoomY`.
  - Độ lệch so với kích thước map: `diffX = dw - mapWidth`, `diffY = dh - mapHeight`.
  - Khi `diffX > 0` (viewport rộng hơn map):
    - Đặt `boundX = -diffX / 2` và `boundW = dw`.
    - Phaser's `clampX` tự động kẹp `scrollX` về đúng `(mapWidth - width) / 2`, đưa tâm camera trùng khít với tâm ngang của map (`midPoint.x = mapWidth / 2`). Khoảng trống 2 bên trái/phải đối xứng hoàn hảo.
  - Khi `diffY > 0` (viewport cao hơn map):
    - Đặt `boundY = -diffY / 2` và `boundH = dh`.
    - Phaser's `clampY` tự động kẹp `scrollY` về đúng `(mapHeight - height) / 2`, đưa tâm camera trùng khít với tâm dọc của map (`midPoint.y = mapHeight / 2`). Khoảng trống trên/dưới đối xứng hoàn hảo.
  - Khi viewport nhỏ hơn map (`diff <= 0`): Giữ nguyên `bound = 0` và `bound = mapSize`, camera bám theo player và kẹp tại 4 mép map như bình thường.

### 3. Đồng bộ tương tác chuột & Camera Controls
- **Zoom (`setGameZoom`):** Tự động gọi `updateCameraBounds()` ngay sau khi set zoom mới, tính toán lại vị trí zoom mượt mà và kẹp scroll trong bounds.
- **Resize cửa sổ (`scale.on('resize')`):** Cập nhật lại bounds ngay khi kích thước canvas thay đổi.
- **Pan camera (`camDrag`):** Kẹp toạ độ kéo `cam.scrollX` / `cam.scrollY` qua `clampX` / `clampY`, ngăn không cho kéo trôi map ra ngoài màn hình.
- **Hover tile & Click-to-move:** Thêm kiểm tra ranh giới bản đồ (`col < 0 || row < 0 || col >= maxCols || row >= maxRows`). Khi con trỏ chuột trỏ ra ngoài khoảng trống bao quanh map (pillarbox / letterbox), tự động ẩn khung highlight và bỏ qua lệnh di chuyển tự động.
- **Files sửa:** `apps/client/src/scenes/WorldScene.ts`.

---

## Nhật ký 2026-10-01 (6) — Plan 22: Chuẩn hoá giao diện Client ở màn hình nhỏ (Responsive Mobile & Small Viewport)

### 1. Phân tích bài toán màn hình nhỏ & giải pháp
- **Xung đột Top Bar (Top Bar Collision):**
  - Trước đây, khi chiều rộng màn hình < 674px, `PlayerHud` (trái, 196-260px), `TopMenu` (giữa, 266px) và `InfoPanel` (phải, 168px) đè nát lên nhau.
  - Giải pháp:
    - `InfoPanel` chuyển sang chế độ compact khi màn hình < 640px, giảm từ 168px xuống 84px (chỉ hiện giờ to + icon thời tiết).
    - `TopMenu` tự động tính toán không gian khả dụng (`setBoundsConstraints`). Nếu khoảng trống ở hàng 1 không đủ, tự động chuyển xuống hàng 2 (dưới PlayerHud/InfoPanel) và mở rộng hit area cảm ứng tối thiểu 36px cho mobile.
- **Tràn viền cột trái (PartyStrip):**
  - Chiều cao PlayerHud + PartyStrip trước đây lên tới ~380px, tràn khỏi mép dưới trên mobile landscape (chiều cao 360-400px).
  - Giải pháp: Khi chiều cao < 500px, tự động kích hoạt mini mode, giảm slot Pokémon từ 40px xuống 26px, ẩn header "PARTY", neo sát dưới PlayerHud mini (54px), giúp toàn bộ cột trái chỉ chiếm ~260px.
- **Che khuất gameplay (ChatLog):**
  - Tính toán `baseW` linh hoạt theo `scale.width` (`Math.min(220, W * 0.35)`), giảm số dòng xuống 2 ở mini mode, tự động gói chữ theo chiều rộng thực tế.
- **Thích ứng kích thước tự động (Adaptive UI Zoom):**
  - `UiZoomManager` tự động nhân hệ số co giãn thích ứng khi `width < 640px` (`Math.max(0.7, width / 640)`), đồng thời phát hiện breakpoint (`normal`, `compact`, `mini`) và phát sự kiện `breakpoint-change`.
- **Khung Menu Pause (MenuPanel):**
  - Sửa lỗi không vẽ nền graphics của menu Esc trong `relayout()`.

### 2. Files chỉnh sửa
- `apps/client/src/ui/UiZoomManager.ts`: Thêm `UiBreakpoint`, adaptive scale factor theo viewport, sự kiện `breakpoint-change`.
- `apps/client/src/ui/PlayerHud.ts`: Sửa kích thước mini mode thực tế 172×54px trong `relayout()` và `getSize()`, căn chỉnh lại avatar 32px và font chữ.
- `apps/client/src/ui/InfoPanel.ts`: Hỗ trợ `UiZoomManager`, `setHudMode('mini')` thu gọn 84×36px, cập nhật `getBottomY()`.
- `apps/client/src/ui/TopMenu.ts`: Thêm né va chạm thông minh (`setBoundsConstraints`), tự động xuống hàng 2 khi hẹp, mở rộng touch zone 36px cho cảm ứng.
- `apps/client/src/ui/PartyStrip.ts`: Thêm tự động mini mode khi chiều cao < 500px, slot 26px chống tràn mép dưới.
- `apps/client/src/ui/ChatLog.ts`: Co giãn chiều rộng động theo canvas, 2 dòng ở mini mode, cập nhật word wrap.
- `apps/client/src/ui/MenuPanel.ts`: Vẽ khung nền panel trong `relayout()`.
- `apps/client/src/scenes/WorldScene.ts`: Điều phối tập trung, tự động kích hoạt mini mode cho toàn bộ panel khi viewport nhỏ (`width < 640 || height < 500`).

---

## Nhật ký 2026-10-01 (12) — Plan 28: Nâng cấp UiModal neo gắn cứng, Reset Settings, Scroll to Zoom & Khắc phục Party Box

### 1. Nâng cấp cốt lõi `UiModal`
- **Chế độ Neo gắn cứng (`docked: true`):**
  - Khi `isDocked === true`, con trỏ chuột trên header chuyển thành `default`, thao tác kéo thả bị khóa hoàn toàn.
  - Người chơi chỉ có thể click nút ⚓ (Dock toggle) để mở khóa trạng thái neo sang tự do trước khi di chuyển modal.
- **Tùy chọn ẩn Title bar (`showTitleBar: false`):**
  - Cho phép các panel HUD tinh gọn (như `PlayerHud`, `InfoPanel`) không có thanh header, `contentContainer` tự động chiếm trọn không gian modal từ đỉnh `(0, 0)`.
- **Quản lý Depth / Z-Index linh hoạt (`depth`, `zIndex`, `setDepth(d)`):**
  - Thiết lập depth đồng bộ cho `overlay`, `overlayBlocker`, `modalContainer` và nội dung.
- **Tùy biến khoảng đệm nội dung (`padding`, `setPadding()`):**
  - Hỗ trợ số nguyên đồng nhất hoặc object `{ top, right, bottom, left }`.
- **Thanh công cụ đáy (`showFooter`, `footerHeight`, `footerContainer`):**
  - Cho phép thêm các nút điều khiển, phân trang hoặc action bar ở đáy modal.
- **Nút tính năng phụ trên Header (`customHeaderButtons: UiModalCustomButton[]`, `addHeaderButton()`):**
  - Hỗ trợ chèn các icon tùy biến vào bên trái nhóm nút hệ thống (✕, －, ⚓).

### 2. Cải tiến Bảng Settings & Reset Settings
- **Thay nút Return bằng Reset Settings (↺):**
  - Gắn nút `↺` (`customHeaderButtons`) màu vàng nhạt trên header của `SettingsPanel`.
  - Hàm `resetAllSettings()`: Đưa toàn bộ cấu hình về mặc định:
    - UI Zoom: 100%
    - Game Zoom: 1.0x
    - Cơ chế di chuyển: Chuột trái / Touch (`left`)
    - Cuộn chuột để thu phóng (Scroll to zoom): Tắt (`false`)
    - Ngôn ngữ: Tiếng Việt (`vi`)
    - Các thành phần HUD: Profile bật, Clock bật, Party bật, Chat bật, Minimap tắt, Mini HUD tắt
    - Gameplay: Hiện tên bật, Đích đến bật, Lưới toạ độ tắt, Auto-run tắt
    - Âm thanh: BGM bật, SFX bật.
  - Đồng bộ cập nhật visual cho toàn bộ checkbox (`checkboxSetters`) và labels.
- **Tùy chọn Scroll to Zoom:**
  - Thêm checkbox `Cuộn chuột để thu phóng (Scroll to zoom)` trong Tab Lối chơi (Gameplay), **mặc định tắt** (`false`).
  - Trong `main.ts`, hàm `handleWheelZoom` kiểm tra `localStorage.getItem('pixelmon.scrollToZoom') === 'true'`. Khi người chơi chưa kích hoạt, con lăn chuột sẽ không zoom camera thế giới, tránh tình trạng giật lag hoặc zoom ngoài ý muốn khi lướt web.

### 3. Cập nhật HUD & Khắc phục Party Box
- **`PlayerHud` & `InfoPanel`:**
  - Cấu hình `showTitleBar: false`, `docked: true`, gắn cứng tại góc trên-trái (`top-left`) và góc trên-phải (`top-right`), không có thanh title bar cồng kềnh.
  - Kích thước tinh gọn: `PlayerHud` 168×56px, `InfoPanel` 154×40px.
- **Khắc phục lỗi thanh Party Box biến mất:**
  - **Nguyên nhân:** Khung `PartyStrip` trước đây có chiều rộng nhỏ (76px) nhưng chứa cả 3 nút (✕, －, ⚓), dẫn tới người chơi click nhầm vào nút ✕ làm modal đóng lại; đồng thời icon `team` trên Toolbar rơi vào `default: [team] chưa implement` nên không có cách nào mở lại.
  - **Khắc phục:**
    - Đặt `showClose: false` trên `PartyStrip`, tăng nhẹ chiều rộng lên 82px.
    - Trong `WorldScene.ts`: Xử lý sự kiện icon `team` trên Toolbar để gọi `this.partyStrip.toggle()` và đồng bộ trạng thái active của icon.
    - Trong `WorldScene.layoutLeftColumn()`: Tôn trọng trạng thái của `partyStrip`, không ép bật lại khi người chơi chủ động đóng.

### 4. Kết quả kiểm tra
- `pnpm typecheck`: 4/4 packages pass không có lỗi TypeScript nào (`@pixelmon/shared`, `client`, `server`).







