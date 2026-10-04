# Project Status — Pixelmon (Pokémon MMORPG)

> **Cập nhật lần cuối: 2026-10-03**
>
> **File này là Single Source of Truth (SSOT)** cho toàn bộ dự án — AI Agent và lập trình viên
> đọc đây để nắm kiến trúc + trạng thái ngay tức thì. Lịch sử chi tiết từng plan đã nén vào **Mục 9**;
> kế hoạch tiếp theo ở **Mục 10**.
>
> **Trạng thái hiện tại:** ✅ Typecheck 4/4 sạch · ✅ `build:map` 5/5 · ✅ Server+Client chạy (port 2567/5173).
> **Tiếp theo:** **Plan 45** — Hệ thống Items, Evolution, Tiền tệ, Trade (chi tiết: `.plans/plan-45-items-evolution.md`).

---

## 1. Tổng quan Trạng thái Dự án

**Pixelmon** — MMORPG Pokémon phong cách retro chạy trên trình duyệt, Monorepo pnpm + Turborepo.

| Hạng mục | Công nghệ / Đặc tả | Trạng thái |
| :--- | :--- | :---: |
| **Monorepo** | pnpm 9.15.0 + Turborepo 2.x | ✅ |
| **Package chung** | `@pixelmon/shared` (Types, Constants, Formulas, Schema, Contracts) | ✅ |
| **Dữ liệu game** | Essentials v21.1: 898 loài · 740 chiêu · 693 items · 267 abilities · 19 hệ | ✅ |
| **Hệ thống bản đồ** | 5 map chuẩn từ `MapInfos.rxdata`, Tiled-First pipeline (`build:map`) | ✅ |
| **Tileset** | Essentials 32×32 (Outdoor.png 16096px, Interior general, 37 autotiles) | ✅ |
| **Server backend** | Express + Colyseus 0.15 + PostgreSQL 18 + Valkey/Redis | ✅ |
| **Client** | Phaser 3.87 (CANVAS 2D pixel-art 60 FPS) + Vite 6 (vanilla TS) | ✅ |
| **Admin Dashboard** | Users, Sprites, Game Data, Maps (interactive canvas preview) | ✅ |
| **Đa ngôn ngữ (i18n)** | Song ngữ VI/EN, 285+ key, toggle 1-nút trong Settings | ✅ |
| **Di chuyển** | Tile-based + delta grid-step + input buffering + A* | ✅ |
| **Warp & collision** | Server-authoritative, 8 warp khép kín, ledge 4 hướng, grass/surf, **passage 4 hướng (Plan 46)**, **Overhead walkable + render che trên player** | ✅ |
| **Debug tools** | Tab `🛠 Debug` (Settings), overlay grid/collision/warp/passage, CLI, 4 widget | ✅ |
| **Wild encounter + Battle** | `battle_init` token → `BattleModal` popup + `BattleRoom` combat thật | ✅ |
| **Chat lệnh debug** | Ô nhập cố định trong ChatLog, route `/` → `handleDebugCommand`, `/tile` `/clear` `/debug …` | ✅ |
| **Items / Evolution / Store** | Chưa có — **Plan 45** (xem Mục 10) | ⬜ |
| **Xác thực** | JWT (Header + LocalStorage), role `player < moderator < admin` | ✅ |
| **Lưu trạng thái** | PostgreSQL persistence (x, y, map_id, direction) realtime | ✅ |
| **Typecheck** | `pnpm run typecheck` — 4/4 packages, 0 errors | ✅ |

---

## 2. Cấu trúc Thư mục Chuẩn (Repository Architecture)

```
pixelmon/
├── package.json                    # Root scripts: dev, build, lint, format, pm:*
├── turbo.json                      # Turbo tasks: build, dev, lint, clean, typecheck
├── pnpm-workspace.yaml             # Workspace: apps/*, packages/*
├── AGENTS.md                       # Quy tắc cốt lõi & Hướng dẫn AI Agent (ĐỌC TRƯỚC KHI CODE)
├── project_status.md               # Tài liệu này — SSOT trạng thái dự án
├── .plans/                         # Plan chi tiết (gitignored, local) — plan-45-*.md
│
├── scripts/
│   ├── pm.sh                       # Process manager (start/stop/restart/status/logs)
│   ├── server.sh                   # Quản lý tài khoản, DB, seed
│   └── tools/
│       ├── query_data.py           # Tra cứu Pokemon/Move/Item/Map siêu tốc (tiết kiệm token)
│       ├── inspect_image.py        # Kiểm tra kích thước/spritesheet bằng Pillow
│       └── convert_essentials_map.py # Chuyển RMXP → Tiled JSON
│
├── packages/shared/                # CHUNG: client & server đều import từ đây
│   ├── assets/                     # tilesets, autotiles, characters, battlers...
│   ├── data/
│   │   ├── species.json            # 898 Pokemon (base stats, learnsets, evolutions)
│   │   ├── moves.json              # 740 chiêu (power, accuracy, pp, target, type)
│   │   ├── items.json              # 693 vật phẩm (category, prices, pocket)
│   │   ├── abilities.json          # 267 đặc tính
│   │   ├── type_chart.json         # Ma trận khắc hệ 19×19
│   │   ├── encounters.json         # Spawn theo map
│   │   └── maps/
│   │       ├── tiled/              # Tiled JSON (*.tmj, manifest.json, types.ts)
│   │       └── server/             # Server map metadata (*.json, index.json)
│   └── src/
│       ├── index.ts                # Re-exports
│       ├── types/                  # player, pokemon, stats, items, messages
│       ├── constants/              # MAPS, TILE_SIZE=32, speeds, MOVE_COOLDOWN_MS
│       ├── formulas/               # combat, stats, generator, encounter, learnset, mapruntime
│       ├── schema/                 # Colyseus Schema: WorldState, PlayerState, BattleState
│       └── data/                   # Zod contracts + normalize + loader (fs server-only)
│
├── apps/server/
│   ├── public/                     # index.html, admin.html, css, js, sprites
│   └── src/
│       ├── index.ts                # Khởi động Express + Colyseus + PostgreSQL
│       ├── app.ts                  # Middleware, static serve, router
│       ├── config/                 # database.ts (Pool), redis.ts, env.ts
│       ├── i18n/                   # Đa ngôn ngữ server EN/VI
│       ├── middleware/auth.ts      # requireAuth, requireAdmin
│       └── modules/
│           ├── auth/               # Register, Login, Me API
│           ├── admin/              # User CRUD, Sprites, Maps API, Game Data
│           ├── user/               # User Info & Profile
│           ├── pokemon/            # battleParty.ts (load party cho battle)
│           ├── world/              # Colyseus WorldRoom (move, warp, encounter, chat, debug)
│           └── battle/             # Colyseus BattleRoom + manager.ts (token)
│
└── apps/client/
    ├── vite.config.ts              # plugin vite-plugin-tmj-json (parse .tmj → JSON)
    └── src/
        ├── main.ts                 # Phaser (CANVAS, Scale.RESIZE; antialias từ Settings)
        ├── i18n/index.ts           # Từ điển VI/EN: t/tr/mkText/setLang/initLang/onLangChange
        ├── scenes/
        │   ├── BootScene.ts        # Nạp assets, dev login
        │   ├── LoginScene.ts       # Đăng nhập / đăng ký
        │   └── WorldScene.ts       # Gameplay chính, Colyseus sync, camera, debug, battle entry
        ├── world/
        │   ├── TiledMapLoader.ts   # glob *.tmj, tileset động, Depth 10/12/20/30
        │   ├── CollisionGrid.ts    # Client collision registry (5 map)
        │   └── Pathfinder.ts       # A*
        ├── entities/               # PlayerSprite, SpriteSheetLoader
        ├── network/ColyseusManager.ts  # joinWorld/sendMove/chat/battle/debug_spawn
        └── ui/
            ├── theme.ts            # Bảng màu retro + font styles
            ├── UiModal.ts          # Base modal (drag, dock, minimize, depth, UI-zoom)
            ├── BattleModal.ts      # Cửa sổ battle (Plan 44 — popup lockUi)
            ├── ChatLog.ts          # Khung chat + ô nhập cố định + lệnh debug
            ├── PartyStrip.ts       # Thẻ Pokemon trong đội (6 slot)
            ├── PlayerHud.ts        # Avatar, tên, tiền tệ
            ├── InfoPanel.ts        # Poke Time (6x) + Real Time + weather
            ├── SettingsPanel.ts    # 4 tab + tab 🛠 Debug (moderator+)
            ├── PcBoxModal.ts       # PC Box
            ├── PokemonSummaryModal.ts # Bảng chỉ số Pokemon
            ├── TopMenu.ts          # Toolbar (Bag, Dex, Team, Map, Settings, Debug)
            └── Debug*.ts           # Console, TrackerWidget, InfoWidgets
```

---

## 3. Hệ thống Bản đồ & Quy chuẩn Đồ hoạ

### 3.1 Quy chuẩn tileset & render
- **Tileset chuẩn: 32×32 px, 8 cột/tileset** (rút từ Essentials v21.1).
- **Giới hạn WebGL `MAX_TEXTURE_SIZE` = 8192**: `Outdoor.png` cao 16096px → client dùng
  **`Phaser.CANVAS` + `pixelArt: true`** (Canvas 2D không bị giới hạn) → pixel-perfect 100%.
- **Vite TMJ plugin**: `.tmj` → `export default JSON.parse(...)` (không dùng `assetsInclude`).

### 3.2 5 map hiện hành

| Slug | Tên | RMXP ID | Kích thước | Tileset | Warps |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `lappet-town` *(mặc định)* | Lappet Town | 002 | 32×21 | Outdoor.png | 4 |
| `players-house` | Player's house | 003 | 31×15 | Interior general | 3 |
| `pokemon-lab` | Pokémon Lab | 004 | 20×15 | Interior general | 1 |
| `route-1` | Route 1 | 005 | 36×24 | Outdoor.png | 1 |
| `daisys-house` | Daisy's house | 008 | 20×15 | Interior general | 1 |

**→ 8 warp khép kín** (lappet-town ↔ route-1 nối bằng 2 warp vẽ trong Tiled).

### 3.3 Depth stacking
`Ground=10` → `Decoration=12` → `Player/Entity=20` → `Overhead=30` → debug overlay 31–35 → HUD 100+ → battle modal 300.

### 3.4 Workflow Tiled-First (không sửa code khi thêm map)
```bash
# 1. Vẽ map trong Tiled → xuất .tmj vào packages/shared/data/maps/tiled/
# 2. Sinh server JSON (collision + warp + encounters):
pnpm run build:map <mapId>        # hoặc --all
# 3. Restart:
./scripts/pm.sh restart
```
- Collision derive 6 tầng: layer heuristic → tile property (`passage`/`terrain_tag`/`ledge_dir`/`water`/`spawn_zone`) → object override → warp post-pass → landing → **cross-map landing**.
- **Quy tắc:** `passage=0x0f` → BLOCKED (bất kỳ layer nào); grass (`terrain_tag` 2/10/14 hoặc `spawn_zone=1`) **luôn walkable**; `ledge_dir` 4 hướng chỉ đọc từ layer đầu tiên có property → đặt ledge/cỏ/water ở **Ground**.
- **`Overhead` mặc định WALKABLE** (2026-10-03): lớp tile vẽ đè lên nhân vật (tán cây, mái nhà, rào trên cao) **không chặn di chuyển** — heuristic tầng A chỉ BLOCKED khi `Decoration != 0`; `Overhead != 0` → WALKABLE. Muốn chặn ô có Overhead → gán `passage=0x0f` cho tile trong Tiled (đi qua tầng B). Render: Overhead depth **30** > Player **20** → che nhân vật khi đứng dưới.
- **Nguồn vùng spawn (đã đồng bộ):** GRASS chỉ đến từ `terrain_tag` (Ground) **hoặc** property `spawn_zone=1` trong tileset (**chỉ đọc từ Ground**, Plan 46).
  Đã **xoá** `grass_zone` (object + `injectGrassZonesFromEncounterZones`) vì rect inject rộng hơn ô cỏ thật → Pokémon spawn ở ô không phải cỏ.
  `MAPS[id].spawnZones` (tên cũ `encounterZones`) chỉ còn là **mốc kiểm tra**, không inject nữa.
  Hiện: route-1 = 80 ô GRASS (`terrain_tag`), lappet-town = 0 ô (có bảng encounter 7 loài) → **cần vẽ `spawn_zone=1` trong Tiled**.
- **`passage` theo hướng (Plan 46 — ✅ đã implement):** `passage` là **bitmask 4 hướng RMXP**, bit = 1 nghĩa là **không cho đi**:
  bit 0=Down `0x01` · bit 1=Left `0x02` · bit 2=Right `0x04` · bit 3=Up `0x08` · `0x0f` = chặn cả 4 → BLOCKED.
  Encode vào **bits 8–11** của `collision.flags` (**uint16**, schema `max(65535)`): `PASS_DOWN 0x0100` · `PASS_LEFT 0x0200` · `PASS_RIGHT 0x0400` · `PASS_UP 0x0800` · `PASS_DIR_MASK = PASS_ALL = 0x0F00`.
  Bits 0–7 giữ nguyên: `WALKABLE 0x01` `WATER 0x02` `BLOCKED 0x04` `GRASS 0x08` `LEDGE 0x10` `LEDGE_DIR_MASK 0x60` `WARP 0x80`.
  Logic chung SSOT (`formulas/mapruntime.ts`): `isDirBlocked()` · `canStep()` · `isPassageAll()` + type `MoveDir`.
  Áp dụng: server `CollideGrid.steppable()/dirBlocked()` + `validateStep()` (reason mới `passage_direction_blocked`) ·
  client `CollisionGrid.isDirBlocked/canStep` + `WorldScene.canEnterTile(col,row,dir)` + `Pathfinder.TileCollider(col,row,fromCol,fromRow)` (A* kiểm hướng từ ô cha).
  **Decoration mặc định BLOCKED** (heuristic), trừ tile có `passage=0` hoặc là ledge (`ledge_dir` / `terrain_tag=1`).
  Chi tiết: [`docs/tiled-workflow.md` mục 5.2b](./docs/tiled-workflow.md) · [`docs/plans/2026-10-03-plan46-decor-passage.md`](./docs/plans/2026-10-03-plan46-decor-passage.md).
- ⚠️ `rebuildIndex()` quét toàn bộ `server/*.json` (không chỉ map vừa build) — **không sửa lại về bản cũ** (bug đã từng mất 4 map).
- ⚠️ **Sau khi thêm export mới vào `@pixelmon/shared` phải chạy:**
  ```bash
  pnpm --filter @pixelmon/shared build     # main: ./dist/index.js — client/server đều dùng dist
  rm -rf apps/client/node_modules/.vite     # ⚠ cache Vite nằm ở đây, KHÔNG phải node_modules/.vite ở root
  ./scripts/pm.sh restart
  ```
  Thiếu 2 bước này → `SyntaxError: does not provide an export named '…'` → **màn hình đen**, mà `pnpm run typecheck` **không** phát hiện (typecheck source, không check dist).

---

## 4. Hệ thống Giao diện Client (HUD & Debug)

### 4.1 HUD cốt lõi
- **`TopMenu`** — Bag, Pokédex, Team, Map, Help, Settings, Debug (icon chip neon).
- **`PlayerHud`** (góc trên trái) — Avatar, tên, Pokédollars 🪙, Coin 💎; mini mode 48×48.
- **`PartyStrip`** (dọc trái) — 6 slot, icon 28×28, `Lv.x` + HP bar; mini mode 48px.
- **`InfoPanel`** (góc trên phải) — Poke Time (×6), Real Time, weather icon; mini mode.
- **`ChatLog`** (góc dưới phải) — draggable + dock; **ô nhập chữ cố định** ở đáy (xem 4.4); nút ⤢ góc trên-trái + grip góc dưới-phải **kéo resize tự do mọi lúc** (không cần bật/tắt).
- Responsive: viewport `< 800×600` → mini mode.

### 4.2 Settings panel (F3 / F2) — tab `🛠 Debug` (chỉ moderator+)
Phân quyền đọc `pixelmon.role` (thang `player=0 < moderator=1 < admin=2`, `banned` = không bao giờ đủ).

Tab Debug gồm:
1. **Overlay & layer** — Debug Toolbar, Grid, Coordinate Tracking, Collision, Warp, 3 toggle lớp tilemap (`Nền`/`Trang trí`/`Che trên`), persist trong `pixelmon.*`.
2. **Thông số realtime** — Map info, toạ độ pixel/tile, hướng, speed, FPS, camera, zoom.
3. **Điều khiển** — 5 Quick Teleport, Speed ×4 (`1x`–`5x`), Console CLI.
4. **Log output** + copy toạ độ + xoá log.

| Lệnh CLI | Chức năng |
| --- | --- |
| `/tp <x> <y>` · `/tp <mapId>` | Dịch chuyển / đổi map |
| `/speed <hệ_số>` | Tốc độ di chuyển |
| `/noclip [on\|off]` | Đi xuyên tường |
| `/overlay <grid\|collision\|warp> [on\|off]` | Bật/tắt overlay |
| `/layer <ground\|decoration\|overhead> [on\|off]` | Ẩn/hiện lớp tilemap |
| `/debug terrain <num\|all\|none>` | Tô ô theo `terrain_tag` (vd `2` = cỏ thật) |
| `/debug is_terrain <x> <y>` | Kiểm tra ô có phải terrain không |
| `/debug passage <up\|down\|left\|right\|all\|none>` | Tô ô có `passage` chặn hướng |
| `/debug off` | Tắt toàn bộ overlay debug + marker |
| `/spawn [dexNum]` | **Gọi trận wild** (bỏ trống = random) |
| `/map` `/pos` `/server` `/help` `/clear` | Thông tin / lệnh |

### 4.3 i18n — song ngữ VI/EN (chỉ hiển thị 1 ngôn ngữ)
- **Module** `apps/client/src/i18n/index.ts` — 291+ key dạng tuple `[vi, en]`.
- **API:** `t(key)` · `mkText(scene,key,style)` (Text bind key, tự refresh) · `tr(text,key)` ·
  `setLang/getLang/initLang` · `onLangChange(fn)` · `isI18nKey(s)`.
- **Refresh:** `setLang()` → `refreshBoundTexts()`; các modal đăng ký `onLangChange(() => setTitle(...))`.
- **Toggle:** Settings > Hệ thống → 1 nút duy nhất hiển thị ngôn ngữ hiện tại.
- **Settings kèm theo:** Anti-aliasing (`system.antialias`, đọc lúc boot).

### 4.4 Chat + lệnh debug (`ChatLog` + `WorldScene`)
- **Ô nhập chữ cố định** ở đáy khung chat (không cần bấm Enter để mở) — tự nắn vị trí theo `relayout()`,
  **lịch sử lệnh ArrowUp/Down** (50 lệnh), placeholder đổi theo role.
- **Route lệnh:** bắt đầu bằng `/` → `handleDebugCommand()` (chỉ **moderator+**, server luôn re-check role);
  không đủ quyền → báo đỏ, **không gửi lên server**. Còn lại → chat thường qua `sendChat`.
- **Output dài** (VD `/help` 13 dòng) → `addSystemBlock()` tạm mở khung lên 14 dòng, giữ 30s rồi co lại.
- **`/spawn [dexNum]`** → client `sendDebugSpawn` → server `WorldRoom.debug_spawn` (validate role từ DB)
  → `initiateWildBattle` → trả `debug_msg` hiện vào chat.
- **`/tile [x] [y]`** — soi ô (gid, terrain, flag) và **đánh dấu ô đó lên bản đồ** (viền trắng + cyan,
  nhãn tọa độ, depth 35); `/tile off` để xoá đánh dấu, marker tự xoá khi đổi map.
  Output gồm dòng `passage chặn: …` (Plan 46) và flag hex 4 chữ số.
- **`/clear`** — xoá cả chat lẫn console (`ChatLog.clear()`).
- **Encounter report:** khi Pokémon xuất hiện, chat hiện `Character: (x, y) [pixel …]` + `Pokemon: (x, y)`
  (server thêm `tile` vào payload `battle_init`, client `reportEncounter()` trước `startBattle()`).
- **i18n mới:** `CHAT_PLACEHOLDER_DEBUG`, `CHAT_CMD_DENIED`, `WS_HELP_SPAWN`, `WS_HELP_NO_ARGS`…

### 4.5 Hệ thống Battle (`BattleModal` — popup lockUi, depth 300)
- **Không dùng scene riêng** — `BattleScene.ts` đã bị xoá. `BattleModal` kế thừa `UiModal`.
- **Flow:** server `handleMove` (bước vào ô GRASS) roll encounter → `battle_init {token, foe, ally}`
  → client `joinBattle(token)` → `create('battle')` → BattleRoom consume token (single-use, TTL 30s).
- **Layout:** foe plate góc trên trái · ally plate góc dưới phải (trên menu) · sprite foe phải/ally trái ·
  menu panel nền neo phải · message box đáy (2 dòng log) · turn indicator · pop message (super effective/critical/missed).
- **Layout 4 lớp rõ ràng, không chồng nhau:** `Title` (header 0–34) → `Opponent` plate (trên trái, y 46–124) → `Player` plate (dưới phải, y 183–278) → **bottom row 1 dòng** (y 288–406): **khung text** (trái, x 14–374) + **khung hành động** (phải, x 388–646, 2×2 FIGHT/POKÉMON/BALL/RUN; mode move = lưới chiêu 2 cột + Back; mode switch = danh sách team + Back). Hằng layout `FIELD_TOP/FIELD_BOTTOM/BOTTOM_Y/BOTTOM_H/MSG_*/ACT_*`.
- **Background battleback chỉ phủ vùng 2 Pokémon** (FIELD 40–284) — không phủ khung text/hành động ở bottom row.
- **Info plate mẫu chuẩn:** dòng 1 = `Name ♂ Lv.5` (tên + giới tính + level, 1 dòng) + ô item góc phải (reserved Plan 45); dòng 2 = `[status] HP ████████░░ 12/20`; dòng 3 = chừa chỗ (reserved). Dòng **EXP** nằm ngoài plate, chỉ Pokémon của user. Schema `BattlePokemon` thêm `gender` + `heldItem`; `BattleTeamMember` thêm `gender` + `heldItem`; query `loadBattleParty` thêm cột `gender`.
- **UI:** HP bar **có track + số HP** (tween mượt) · EXP bar · **battleback dùng `TileSprite`** (giữ tỉ lệ pixel, chỉ phủ vùng đất) ·
  platform ellipses (bóng) · sprite `fitSprite()` ≤140px · **move button tô màu theo hệ Pokémon** (19 màu).
- **Menu:** FIGHT (4 chiêu, type-colored, PP) / POKÉMON (6 slot panel bên trái) / **BALL** (`battle_catch`) / RUN.
  Buttons neo `originX=1` + `fixedWidth` → không tràn mép.
- **Keyboard:** `1-4` chọn menu/move · `Esc`/`Backspace` quay lại.
- **Hiệu ứng:** flash+shake+particles khi trúng · tween HP · animation kết thúc (thắng/thua/bắt/chạy) → OK → `leaveBattle()`.
- **Chống render đôi:** `registerHudObject(...modal.getGameObjects())` + `setUiZoomManager()` + cờ `battleStarting`.
- **Foe AI:** chọn move theo `power × effectiveness × STAB × accuracy`.

---

## 5. Admin Dashboard (`http://localhost:2567/admin`)

- **Login gate:** yêu cầu role `admin`, JWT trong LocalStorage, kiểm tra phiên qua `/api/auth/me`.
- **i18n:** EN/VI (200+ từ khoá).
- **Tab Maps:** danh sách + filter theo loại · preview canvas 32×32 (toggle layer/grid/collision/warp)
  · import từ `.rxdata` · **`♻️ Regenerate JSON`** (chạy `build:map` server-side) · card **Thống kê Map** (cells/layer, phân bố collision, đối tượng).
- **Tab Users:** search realtime, phân trang server-side, tạo tài khoản, đổi mật khẩu, ban/unban, gán sprite.
- **Tab Sprites:** upload, kiểm tra frame, cấu hình 12/16-frame, preview animation, export baked.
- **Tab Game Data:** tra cứu 898 Pokemon / 740 chiêu / 693 item / 267 ability.

---

## 6. Cơ sở Dữ liệu (PostgreSQL 18)

### 6.1 Schema DDL hiện tại
```sql
-- users: tài khoản (JWT auth, role-based)
users(id UUID PK, username TEXT UNIQUE, password_hash, display_name,
      role TEXT CHECK IN ('player','moderator','admin','banned') DEFAULT 'player',
      language TEXT DEFAULT 'en', sprite_id UUID NULL, created_at, last_login_at)

-- user_info: profile mở rộng (1-1)
user_info(user_id UUID PK → users, birthday, bio, notes, updated_at)

-- players: trạng thái ingame (1-1) — VỊ TRÍ + TIỀN TỆ
players(id UUID PK → users, x INT DEFAULT 256, y INT DEFAULT 256,
        map_id TEXT DEFAULT 'lappet-town', direction TEXT DEFAULT 'down',
        level INT DEFAULT 1, exp BIGINT DEFAULT 0,
        money INT DEFAULT 5000,          -- ⚠ CHƯA có code nào ± (Plan 45)
        stats JSONB DEFAULT '{}')

-- pokemon: Pokemon sở hữu (owner = users)
pokemon(id UUID PK, owner_id UUID → users, species_id, nickname,
        level INT DEFAULT 1, exp BIGINT DEFAULT 0,
        ivs/evs/stats JSONB, current_hp INT, moves JSONB, status TEXT,
        shiny BOOLEAN, caught_at, party_slot SMALLINT,  -- 0..5 = party, NULL = PC
        nature TEXT, gender TEXT)
        -- ⚠ Plan 45 sẽ thêm: held_item TEXT

-- sprite_catalog: thư viện sprite (12/16 frame chuẩn)
sprite_catalog(id UUID PK, name UNIQUE, mode, sheet_url, source_url, frames JSONB,
               frame_w, frame_h, frame_count, created_by, timestamps)

-- inventory: TÚI ĐỒ (⚠ TỒN TẠI nhưng chưa module nào đọc/ghi — Plan 45)
inventory(owner_id UUID → users, item_id TEXT, quantity INT, PRIMARY KEY(owner_id,item_id))
```
> **Plan 45 sẽ thêm:** `pokemon.held_item` · `pokemon_events` (xp_gain/level_up/evolve/item_used/trade/money)
> · `pokemon_evolution_history` (kèm `moderator_id`) · `trade_sessions`.

### 6.2 Đồng bộ vị trí
- `onJoin` → SELECT từ `players` (khớp room mới giữ, khác → spawn mặc định).
- `move` → cache dirty, **flush định kỳ 5s** → `onLeave`/`onDispose` → flush tức thời.
- Noclip/teleport/cambio map → ghi realtime (không bị kéo lùi về quá khứ).

---

## 7. Danh mục API & Colyseus Rooms

### 7.1 REST API (Express)
| Nhóm | Method | Endpoint | Quyền |
| :--- | :---: | :--- | :---: |
| Hệ thống | `GET` | `/health` | Công khai |
| Auth | `POST` | `/api/auth/register` · `/api/auth/login` | Công khai |
| | `GET` | `/api/auth/me` | User |
| User | `GET`/`PUT` | `/api/users/:id/info` | User/Admin |
| Admin | `GET` | `/api/admin/status` | Admin |
| | `GET`/`POST` | `/api/admin/users` · `PATCH /:id` · `DELETE /:id` | Admin |
| | `POST` | `/api/admin/users/:id/password` · `/:id/ban` · `/:id/unban` | Admin |
| Sprites | `GET`/`POST` | `/api/admin/sprites` · `GET/PATCH/DELETE /:id` | Admin |
| Maps | `GET`/`PATCH` | `/api/admin/maps` · `GET /:id` | Admin |
| | `POST` | `/api/admin/maps/import` · `/api/admin/maps/:id/regenerate` | Admin |
| Game data | `GET` | `/api/admin/pokemon` · `/api/admin/players` | Admin |
| Static | `GET` | `/maps/tiled/*.tmj` (route Tiled-First) | Công khai |

### 7.2 Colyseus Rooms (`ws://localhost:2567`)
| Room | Giới hạn | Message nhận | Trách nhiệm |
| :--- | :---: | :--- | :--- |
| **`world`** (1/map) | 50 | `move` · `teleport` · `change_map` · `chat` · `debug_spawn` | Validate bước, roll encounter, flush DB, broadcast chat |
| **`battle`** | 2 | `battle_move` · `battle_switch` · `battle_run` · `battle_catch` · `battle_item` · `battle_forfeit` | Combat theo lượt, calcDamage, EXP + level-up, ghi DB |
| Message nhận từ server | | `player_moved_map` · `move_rejected` · `battle_init` · `debug_msg` · `battle_need_switch` · `chat` | Client xử lý |

---

## 8. Công cụ Phát triển & Quy tắc dành cho AI Agent

> ⚠️ **ĐỌC `AGENTS.md` TRƯỚC KHI CODE.** Tóm tắt tối ưu token:
> 1. **Dựng:** `./scripts/pm.sh status|restart|logs` · `pnpm run typecheck` (4/4).
> 2. **KHÔNG đọc file JSON lớn** (`species.json` 1.2MB, `moves.json`, `items.json`, `.tmj`)
>    → dùng `python3 scripts/tools/query_data.py <species|move|item|map> <tên>`.
> 3. **KHÔNG đọc binary ảnh** → `python3 scripts/tools/inspect_image.py <path> [tile_size]`.
> 4. **Hạn chế tối đa chạy test / mở browser / screenshot** — chỉ khi user yêu cầu hoặc đã xác nhận.
> 5. **Không quét** `.playwright-mcp/`, `temp/`, `.venv/`, `.turbo/`, `.pm/logs/`,
>    `packages/shared/assets/`, `packages/shared/data/pbs/`.
> 6. **Cập nhật `project_status.md`** sau mỗi plan/phase hoàn thành.
> 7. **Thêm export mới vào `@pixelmon/shared`** → `pnpm --filter @pixelmon/shared build` +
>    `rm -rf apps/client/node_modules/.vite` + `./scripts/pm.sh restart` (xem Mục 3.4).
>    Thiếu → màn hình đen do Vite bundle `dist` cũ, `typecheck` không bắt được.

**Tài khoản mặc định:**
- Admin: `admin` / `admin123` · Player: `tienv2i`, `user01`..`user10` / `123`

---

## 9. Lịch sử Triển khai (Tóm tắt)

<details>
<summary><b>Plan 1 — 34 (2026-09 → 2026-10-01)</b></summary>

- **Plan 1–7:** Monorepo pnpm+Turbo, Express+Colyseus, PostgreSQL+Redis, shared package, i18n, khung UI.
- **Plan 8–16:** Camera pan, click-to-move, A*, dọn UI thừa, TopMenu, InfoPanel.
- **Plan 17–21:** Sprite Catalog trong Admin (12/16 frame chuẩn, preview, gán sprite).
- **Plan 22–26:** HUD tỷ lệ màn hình nhỏ/mobile, mini mode, tối ưu chuột trái.
- **Plan 27–30:** Thư viện `UiModal` (drag/dock/minimize), nâng cấp Chat/Settings/Party/UserInfo/Help.
- **Plan 31–32:** Dữ liệu Essentials v21.1 (898/740/693), Admin Game Data, PC Box, bảng chỉ số.
- **Plan 33–34:** Map Pallet Town chuẩn, lưu vị trí PG, dọn file thừa, CLI tools.
</details>

| Plan | Nội dung | Trạng thái |
| :---: | :--- | :---: |
| **35** | Bản đồ mới chuẩn Essentials v21.1 (5 map), Admin Maps + interactive preview | ✅ |
| **36** | Fix dropdown Admin, thêm nút + panel Debug Client (`DebugModal`) | ✅ |
| **37** | Fix client render không khớp admin → `Phaser.CANVAS` + fix TMJ plugin → pixel-perfect 100% | ✅ |
| **38** | **Di chuyển tile-based** — `CollisionGrid`, `Pathfinder` A*, `WorldRoom` 1/map + validate, warp trích code 201, delta grid-step + input buffering + LERP | ✅ |
| **39** | Dời bảng Debug vào **tab Settings** (phân quyền moderator+), Grid Overlay + Coordinate Tracking, xoá `DebugModal.ts` | ✅ |
| **40** | Overlay va trận, overlay warp, toggle 3 lớp tilemap, CLI `/overlay` `/layer` | ✅ |
| **41** | **Maps Tiled-First** — `import.meta.glob` + `build:map` + template + doc; `rebuildIndex` fix mất 4 map | ✅ |
| **42** | **i18n toàn client** (285 key) + setting Anti-aliasing + fix DebugModal loạn | ✅ |
| **43** | Fix warp spawn lệch, grass bị chặn (425 ô route-1), ledge 4 hướng, nối lappet↔route-1 | ✅ |
| **44** | **Wild encounter + Battle** — server-authoritative token, `BattleRoom` combat thật, `BattleModal` popup | ✅ |
| **44b** | **Cải thiện giao diện `BattleModal`** — plates có nền, HP track+số, battleback `TileSprite`, type-colored moves, menu panel, particles, pop message, BALL, keyboard; fix overlap + listener leak | ✅ |
| **44c** | **Ô chat cố định + lệnh debug** — input luôn hiện, lịch sử, route `/` (moderator+), **`/spawn [dexNum]`**, `/help` mở rộng, auto-expand khung chat | ✅ |
| **46** | **Decoration mặc định BLOCKED + `passage` 4 hướng** — xoá `grass_zone` inject, `spawn_zone` chỉ đọc Ground; `flags` lên uint16 (bits 8–11 = `PASS_DOWN/LEFT/RIGHT/UP`); `isDirBlocked`/`canStep`/`isPassageAll` SSOT; server `validateStep` + client `canEnterTile(dir)` + `findPath` kiểm hướng; debug `/debug passage`, overlay dải tím; fix Vite cache `apps/client/node_modules/.vite` | ✅ |
| **46b** | **Overhead mặc định WALKABLE + render che nhân vật** — heuristic tầng A: `Overhead != 0` không còn BLOCKED (chỉ `Decoration != 0` chặn); muốn chặn thì `passage=0x0f` trong Tiled. Render: `PlayerSprite` depth chuẩn hoá (sprite 20 / bóng 19 / tên 21) qua hằng `PLAYER_DEPTH`, Overhead vẫn depth 30 → che player; remote player cũng depth 20. Rebuild 5 map + restart | ✅ |
| **44d** | **BattleModal layout 4 lớp rõ ràng, không chồng nhau** — Title / Opponent plate / Player plate / bottom row (khung text trái + khung hành động phải cùng 1 dòng); mọi mode menu (command/move/switch) render trong khung hành động; hằng layout `FIELD_*`/`BOTTOM_*`/`MSG_*`/`ACT_*`; `showEnd` căn theo field | ✅ |

**Bug đã fix đáng chú ý (Plan 38–46):** terrain tag 2/10 bị gán nhầm ledge → grass · `resolveSpawnTile` (warp bị chia 32 → rơi góc trái) · Vite dep cache thiếu export → đen màn hình · `rebuildIndex` mất 4 map · battle render 2 khung · listener leak `onStateChange` · marker `/tile` hiện 2 ô (thiếu `uiCam.ignore`) · `is_terrain` trả sai do `grass_zone` inject · `passage=13` bị bỏ qua (walkable toàn phần).

---

## 10. Kế hoạch Tiếp theo (Roadmap)

### 🎯 Ưu tiên hiện tại: **Plan 45 — Items, Evolution, Tiền tệ, Trade**
> **Chi tiết đầy đủ:** [`.plans/plan-45-items-evolution.md`](./.plans/plan-45-items-evolution.md) (gitignored, local)
>
> ✅ **Plan 46 (collision/spawn) đã hoàn thành 2026-10-03** — xem Mục 9.

**Chẩn đoán đã verify:** `inventory` table tồn tại nhưng **không module nào dùng** · `Item.effect = None`
(693 item) · đá tiến hoá là `category:'misc'` (**0 item `evolution`**) · `pocket` bị `ItemSchema` strip ·
`evolveSpecies()` **hỏng (luôn `return null`)** · `players.money` có DEFAULT 5000 nhưng **không code ±** ·
`pokemon.held_item` chưa có cột · không có bảng log event/evolution.

| Phase | Nội dung | Kết quả |
| :---: | :--- | :--- |
| **0** | Foundation: `ItemSchema`+`pocket` · `formulas/evolution.ts` (`resolveEvolution()` thay `evolveSpecies` hỏng) · migration idempotent (`held_item`, `pokemon_events`, `pokemon_evolution_history`, `trade_sessions`) | ✅ mở khóa mọi phase sau |
| **1** | **Items**: `inventory.service` (transaction) · `GET /api/inventory` · cầm đồ · `resolveItemEffect()` registry (heal/revive/cure/buff/catch_ball/evo_stone) · dùng ngoài trận · **`battle_item` thật** (tốn lượt) | Bag hoạt động |
| **2** | **Store + tiền**: buy/sell transaction · sync `PlayerState.money` → HUD realtime · `STORE_STOCK` · `StoreModal` | Vòng mua-bán |
| **3** | **Evolution**: `tryEvolve()` recompute stats · hook sau mọi level-up · **`eventLog.grantXp`** (xp/level → event) · stone qua `use_item` | Tiến hoá + tracking |
| **4** | **Trade giả lập**: NPC trade (server tự set flag, client không gửi) → kích hoạt `method:'trade'` (18 species) · `TradeModal` | Trade-evo |
| **5** | **Công cụ moderator**: `/forceevolve` · `/reverseevolve` · `/leveldown` · `/levelup` · `/forcefriend` (role check + log `moderator_id`) | Admin test mọi case |
| **6** | **UI/i18n**: `BagModal` · `StoreModal` · `TradeModal` · `EvolveModal` · Summary tab cầm đồ · PartyStrip icon held item · +60 key VI/EN | Polish |
| **7** | *(tuỳ chọn)* Admin dashboard: inventory distribution, event feed, evolution history | Mở rộng |

**Thứ tự đề xuất:** 0 → 1 → 2 → 3 → 5 → 4 → 6 → (7)
**Chống gian lận đã tính:** server luôn join `owner_id = session.userId` cho mọi read/write item ·
mọi ± tiền trong transaction (SELECT FOR UPDATE) · `levelDown` recompute stats + clamp HP ·
trade flag do server quyết định · force/reverse chỉ moderator và có audit log.

### Các mục sau Plan 45
1. **NPC & Hội thoại** — spawn NPC từ data sự kiện map, Dialogue Box phong cách RPG (Space/Enter/click).
2. **Battle còn lại** — PvP, status effects (brn/par/poison đầy đủ), SoundManager BGM.
3. **Event feed UI** — tab hiển thị `pokemon_events` gần nhất trong Summary.
4. **Hoàn thiện dữ liệu Tiled** — vẽ `spawn_zone=1` cho vùng cỏ ở `lappet-town` (đang có bảng encounter 7 loài nhưng **0 ô GRASS**); thêm `passage` / `ledge_dir` cho các ô cần chặn hướng (hiện mới có 2 ô ở route-1).
