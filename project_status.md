# Project Status — Pixelmon (Pokémon MMORPG)

> Cập nhật lần cuối: **2026-10-02** (Sửa lỗi di chuyển Lappet Town 6,11→6,10: chuyển terrain tag 10 từ LEDGE_SOUTH sang GRASS theo script Essentials `TerrainTag` (`:TallGrass, :id_number=>10`); tag 2 cũng đổi sang GRASS; 7 ô ledge → 0; typecheck 4/4 sạch)  
> **2026-10-02 (bổ sung):** Sửa converter hardcode tileset `Outdoor.png` cho mọi map → đọc `@tileset_name` từ RMXP, emit đúng `Interior general.png` (256×8032, 2008 tiles) cho 3 map nội thất; re-convert 4 map; `lappet-town.tmj` sửa imageheight 22080→16096, tilecount 5520→4024. Xem `fix-plan.md` mục 1.1/1.2.  
> **2026-10-02 (bổ sung 2):** Chuyển di chuyển từ **snap 32px** sang **Delta Grid-Step** (nội suy trượt ô theo delta) + **Input Buffering** (`bufferedDir`) + **LERP remote player**. Xem `fix-plan.md` mục 3.1/3.2.  
> File này đóng vai trò là **Single Source of Truth (SSOT)** cho toàn bộ dự án, được thiết kế để AI Agent và lập trình viên nắm bắt toàn bộ kiến trúc, trạng thái và chi tiết kỹ thuật ngay tức thì.

---

## 1. Tổng quan Trạng thái Dự án

**Pixelmon** là tựa game MMORPG Pokémon phong cách retro chạy hoàn toàn trên trình duyệt web, xây dựng dưới dạng Monorepo quản lý bằng pnpm + Turborepo.

| Hạng mục | Công nghệ / Đặc tả | Trạng thái |
| :--- | :--- | :---: |
| **Monorepo Architecture** | pnpm 9.15.0 + Turborepo 2.x | ✅ Pass |
| **Package dùng chung** | `@pixelmon/shared` (Types, Constants, Formulas, Schema, Contracts) | ✅ Pass |
| **Dữ liệu Game Chuẩn** | Pokémon Essentials v21.1: 898 loài, 740 chiêu, 693 items, 267 abilities, 19 hệ | ✅ Pass |
| **Hệ thống Bản đồ Mới** | Đồng bộ RPG Maker XP `MapInfos.rxdata` (Lappet Town, Player's House, Lab...) | ✅ Pass |
| **Bộ Tileset Chuẩn** | Essentials 32×32 (Outside.png, Outdoor.png 16096px, Interior general, 37 Autotiles) | ✅ Pass |
| **Server Backend** | Express + Colyseus 0.15 + PostgreSQL 18 + Valkey/Redis | ✅ Pass |
| **Client Frontend** | Phaser 3.87 (Canvas 2D pixel-art, 60 FPS) + Vite 6 (vanilla TS) | ✅ Pass |
| **Admin Dashboard** | Quản lý Người chơi, Sprite, Dữ liệu game, Maps (Interactive Canvas preview) | ✅ Pass |
| **Công cụ Debug Client** | TopMenu Debug icon + Debug Modal (F3/F2): Map info, Coords, Teleport, CLI | ✅ Pass |
| **Xác thực & Bảo mật** | JWT token (Header + LocalStorage), Role-based (Admin, Player, Banned) | ✅ Pass |
| **Định vị & Lưu trạng thái** | PostgreSQL persistence (x, y, map_id, direction) đồng bộ realtime | ✅ Pass |
| **Kiểm tra Mã nguồn** | `pnpm run typecheck` (4/4 packages pass, 0 errors) | ✅ Pass |
| **Quản lý Tiến trình** | CLI `./scripts/pm.sh` (Server: port 2567, Client: port 5173) | ✅ Pass |

---

## 2. Cấu trúc Thư mục Chuẩn (Repository Architecture)

```
pixelmon/
├── package.json                    # Root scripts: dev, build, lint, format, pm:*
├── turbo.json                      # Turbo tasks: build, dev, lint, clean, typecheck
├── pnpm-workspace.yaml             # Workspace: apps/*, packages/*
├── tsconfig.base.json              # Shared TypeScript config
├── AGENTS.md                       # Quy tắc cốt lõi & Hướng dẫn AI Agent (đọc trước khi code)
├── opencode.json                   # Cấu hình OpenCode (watcher ignore, commands)
├── project_status.md               # Tài liệu này — SSOT trạng thái toàn dự án
├── .env.example                    # Mẫu cấu hình biến môi trường
│
├── scripts/
│   ├── pm.sh                       # Process manager (start/stop/restart/status/logs)
│   ├── pm.config                   # Cấu hình PM: ports (2567, 5173), timeout, logs
│   ├── server.sh                   # Quản lý tài khoản, DB, seed, tooling
│   └── tools/
│       ├── query_data.py           # Tra cứu Pokémon/Move/Item/Map siêu tốc (tiết kiệm token)
│       ├── inspect_image.py        # Kiểm tra kích thước và lưới spritesheet bằng Pillow
│       ├── convert_essentials_map.py # Công cụ chuyển đổi bản đồ RPG Maker XP sang Tiled JSON
│       └── rmxp_map_server.py      # Script đọc bản đồ nhị phân .rxdata
│
├── packages/shared/
│   ├── package.json                # @pixelmon/shared
│   ├── tsconfig.json
│   ├── assets/
│   │   ├── tilesets/               # Tileset chuẩn Essentials 32x32 (Outside.png, Outdoor.png...)
│   │   ├── autotiles/              # 37 autotiles động (nước, bờ biển, thác nước...)
│   │   └── characters/             # Sprite nhân vật gốc
│   ├── data/
│   │   ├── species.json            # 898 Pokémon (base stats, learnsets, forms, exp curves)
│   │   ├── moves.json              # 740 chiêu thức (power, accuracy, pp, target, type)
│   │   ├── items.json              # 693 vật phẩm (categories, prices, pocket)
│   │   ├── abilities.json          # 267 đặc tính
│   │   ├── type_chart.json         # Ma trận khắc hệ 19×19
│   │   ├── encounters.json         # Danh sách spawn Pokémon theo từng map
│   │   └── maps/
│   │       ├── map_tree.json       # Cây phả hệ bản đồ theo RPG Maker XP
│   │       ├── tiled/              # Tiled JSON 32x32 (*.tmj, manifest.json)
│   │       └── server/             # Server Colyseus map metadata (*.json, index.json)
│   └── src/
│       ├── index.ts                # Re-exports types, constants, formulas, schema, contracts
│       ├── types/                  # Types: player, pokemon, stats, items, messages
│       ├── constants/              # MAPS (lappet-town, route-1...), TILE_SIZE=32, speeds
│       ├── formulas/               # combat, stats, generator, encounter, learnset, mapruntime
│       ├── schema/                 # Colyseus Schema: WorldState, PlayerState, BattleState
│       └── data/                   # Contracts (Zod), normalize, loader (fs server-only)
│
├── apps/server/
│   ├── package.json                # @colyseus/server, express, pg, ioredis, multer
│   ├── tsconfig.json
│   ├── public/                     # Static Express assets
│   │   ├── index.html              # Landing page + Auth form (Login & Register)
│   │   ├── admin.html              # Admin Dashboard (Overview, Users, Sprites, Maps, Game Data)
│   │   ├── css/                    # admin.css, base.css, home.css
│   │   ├── js/                     # admin.js, home.js, i18n.js
│   │   └── sprites/                # Baked spritesheets phục vụ tĩnh (/sprites/*.png)
│   └── src/
│       ├── index.ts                # Khởi động Express + Colyseus server + PostgreSQL
│       ├── app.ts                  # Cấu hình Express middleware, static serve, router
│       ├── config/                 # database.ts (PostgreSQL Pool), redis.ts, env.ts
│       ├── i18n/                   # Hệ thống đa ngôn ngữ EN/VI server
│       ├── middleware/             # auth.ts (requireAuth, requireAdmin)
│       └── modules/
│           ├── auth/               # Register, Login, Me API (JWT auth)
│           ├── admin/              # User CRUD, Sprites CRUD, Maps API & Preview, Game Data
│           ├── user/               # User Info & Profile
│           ├── world/              # Colyseus WorldRoom (Move, sync, DB flush 5s, dynamic bounds)
│           └── battle/             # Colyseus BattleRoom (Turn-based combat)
│
└── apps/client/
    ├── package.json                # phaser ^3.87, colyseus.js ^0.15, vite ^6.4
    ├── tsconfig.json
    ├── vite.config.ts              # Custom vite-plugin-tmj-json (parse .tmj thành JSON)
    ├── index.html
    └── src/
        ├── main.ts                 # Cấu hình Phaser (Phaser.CANVAS, pixelArt: true, Scale.RESIZE)
        ├── scenes/
        │   ├── BootScene.ts        # Nạp assets, kiểm tra dev login
        │   ├── LoginScene.ts       # Giao diện đăng nhập / đăng ký
        │   ├── WorldScene.ts       # Gameplay chính, Colyseus sync, camera, phím tắt F3/F2
        │   └── BattleScene.ts      # Đấu trường chiến đấu
        ├── world/
        │   ├── TiledMapLoader.ts   # Nạp map TMJ, gán tileset động, quản lý Depth 10/12/20/30
        │   ├── CollisionGrid.ts   # Client collision registry: import tĩnh 5 map server JSON, grid walkable/water/grass/ledge
        │   └── Pathfinder.ts       # Thuật toán tìm đường A* trên grid
        ├── entities/
        │   ├── PlayerSprite.ts     # Nhân vật chính & Remote players, hoạt ảnh 4 hướng
        │   └── SpriteSheetLoader.ts # Nạp sprite 12-frame và 16-frame chuẩn
        ├── network/
        │   └── ColyseusManager.ts  # Kết nối WorldRoom ('lappet-town'), gửi move, chat, teleport
        └── ui/
            ├── theme.ts            # Bảng màu retro pixel & font styles
            ├── UiModal.ts          # Base modal component (drag, dock, minimize, depth layer)
            ├── TopMenu.ts          # Toolbar trên cùng (Bag, Dex, Team, Map, Settings, Debug...)
            ├── DebugModal.ts       # Modal Debug: Map info, Coords, Teleport presets, CLI console
            ├── PlayerHud.ts        # Bảng thông tin nhân vật, avatar, tiền tệ
            ├── InfoPanel.ts        # Poke Time (6x) & Real Time, biểu tượng thời tiết lớn
            ├── PartyStrip.ts       # Thẻ Pokémon mini card 86px rộng rãi (icon 28x28 + HP bar)
            ├── ChatLog.ts          # Khung chat draggable bên dưới
            └── SettingsModal.ts    # Bảng cài đặt âm thanh, giao diện, ngôn ngữ, camera zoom
```

---

## 3. Hệ thống Bản đồ & Quy chuẩn Đồ hoạ (Map & Tileset Standards)

### 3.1 Quy chuẩn Tileset & Kỹ thuật Render Khớp Tuyệt Đối
- **Quy chuẩn Tileset:** Chuẩn **32×32 pixels, 8 cột tiles** (chiều rộng 256px) trích xuất trực tiếp từ Pokémon Essentials v21.1.
  - Ngoại cảnh: `Outside.png` / `Outdoor.png` (chiều cao 16.096px = 503 hàng tiles).
  - Nội thất: `Interior general.png`, `Harbour interior.png`, `Gyms interior.png`, v.v.
- **Giải quyết Giới hạn WebGL `MAX_TEXTURE_SIZE`:**
  - Tileset `Outdoor.png` cao 16.096px vượt ngưỡng `MAX_TEXTURE_SIZE = 8192` của đa số GPU/WebGL drivers.
  - Client cấu hình dùng **`type: Phaser.CANVAS`** kết hợp `pixelArt: true`. Canvas 2D không bị giới hạn 8192px, rendering mượt mà ở 60 FPS và đạt **độ khớp 100% pixel-perfect (0 lỗi khác biệt)** khi đối chiếu từng điểm ảnh với canvas của Admin Dashboard.
- **Vite TMJ Plugin:** 
  - Đã loại bỏ hoàn toàn `assetsInclude: ['**/*.tmj']` (vốn biến TMJ thành static URL string gây lỗi parse).
  - Sử dụng plugin Vite tùy biến biến nội dung `.tmj` trực tiếp thành JSON module: `export default JSON.parse(...)`.

### 3.2 Danh mục Bản đồ Essentials v21.1 Hiện hành

| Slug ID | Tên hiển thị | Map ID (RMXP) | Kích thước | Tileset chính | Số Warps | Spawn (x, y) |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| **`lappet-town`** *(Mặc định)* | Lappet Town | Map 002 | 32×21 | `Outside.png` | 3 | (256, 256) |
| **`players-house`** | Player's house | Map 003 | 31×15 | `Interior general.png` | 3 | (96, 256) |
| **`pokemon-lab`** | Pokémon Lab | Map 004 | 20×15 | `Interior general.png` | 1 | (192, 384) |
| **`route-1`** | Route 1 | Map 005 | 36×24 | `Outside.png` | 0 | (416, 704) |
| **`daisys-house`** | Daisy's house | Map 008 | 20×15 | `Interior general.png` | 1 | (96, 256) |

### 3.3 Hệ thống Layer và Độ sâu (Depth Stacking)
- **Ground Layer (Depth = 10):** Mặt đất, thảm cỏ, đường mòn cát, mặt nước biển.
- **Decoration Layer (Depth = 12):** Thân cây, tường nhà, cửa sổ, hàng rào, bảng thông báo, bụi cỏ cao (Tall Grass).
- **Player & Remote Entities (Depth = 20):** Nhân vật người chơi, NPC, Pokémon đồng hành.
- **Overhead Layer (Depth = 30):** Mái nhà, vòm ngọn cây, mái hiên che khuất đầu nhân vật khi đi phía sau.

---

## 4. Hệ thống Giao diện Client (HUD & Debug Tools)

### 4.1 Bộ Giao diện Cốt lõi (Retro MMORPG HUD)
- **`TopMenu` (Thanh công cụ trên cùng):** Dãy icon pixel art tinh gọn neo giữa mép trên màn hình: Túi đồ (Bag), Pokédex, Đội hình (Team), Bản đồ (Map), Cài đặt (Settings), Hướng dẫn (Help), và **nút Debug (icon chip vi mạch neon)**.
- **`PlayerHud` (Góc trên trái):** Hiển thị Avatar pixel của nhân vật, tên người chơi, tiền tệ trong game (Pokédollars 🪙) và Coin tích luỹ 💎.
- **`PartyStrip` (Dọc mép trái):** Khung thẻ ngang mở rộng 86px, chứa tối đa 6 ô Pokémon:
  - Icon Pokémon 28×28px rõ nét.
  - Cột thông số tách biệt: Cấp độ `Lv.xx` và thanh máu HP trực quan, tuyệt đối không bị che khuất.
- **`InfoPanel` (Góc trên phải):**
  - **Poke Time:** Đồng hồ chu kỳ ngày đêm Pokémon chạy nhanh gấp 6 lần thời gian thực (`Poke: HH:MM`).
  - **Real Time:** Giờ máy tính thực tế (`Real: HH:MM`).
  - **Biểu tượng Thời tiết:** Icon thời tiết lớn (22px) trực quan, không chiếm diện tích văn bản.
- **`ChatLog` (Góc dưới phải):** Khung trò chuyện đa kênh, hỗ trợ kéo thả tự do hoặc neo vị trí.
- **Hệ thống Responsive Breakpoint:** Tự động chuyển đổi sang Mini Mode khi kích thước viewport `< 800×600` px.

### 4.2 Modal Debug Toàn diện (`DebugModal.ts` — Phím tắt `F3` hoặc `F2`)
Kế thừa từ `UiModal`, cho phép di chuyển, thu nhỏ, không khóa tương tác điều khiển nhân vật bên dưới:
1. **Thông số Bản đồ (Map Info):** Mã slug, tên hiển thị, kích thước (Tiles & Pixels), số lượng layer, số điểm warp, tên file tileset.
2. **Toạ độ & Chuyển động (Live Player Status):** Toạ độ Pixel `(X, Y)`, Toạ độ Tile `[TileX, TileY]`, Hướng quay mặt (Down/Up/Left/Right), Trạng thái (Đang di chuyển / Đứng yên), Chỉ số FPS thực tế, Toạ độ Camera và Hệ số Zoom.
3. **Phím Dịch chuyển Nhanh (Teleport Presets):** Nút bấm 1 chạm dịch chuyển tức thì đến 5 bản đồ Essentials: *Lappet Town, Player's House, Pokémon Lab, Route 1, Daisy's House*.
4. **Điều chỉnh Tốc độ (Speed Multiplier):** Các mức `1x`, `2x`, `3x`, `5x` phục vụ kiểm tra di chuyển.
5. **Khung Lệnh Điều khiển Console (CLI Debug Runner):**
   - `/tp <x> <y>` — Dịch chuyển nhân vật đến toạ độ pixel chỉ định.
   - `/tp <mapId>` — Chuyển tức thì sang bản đồ khác (VD: `/tp pokemon-lab`).
   - `/speed <hệ_số>` — Thay đổi tốc độ di chuyển (VD: `/speed 3`).
   - `/pos` — Xem toạ độ chi tiết hiện tại.
   - `/help`, `/clear` — Xem trợ giúp hoặc xóa lịch sử lệnh.

---

## 5. Hệ thống Quản trị Admin Dashboard (`http://localhost:2567/admin`)

- **Bảo mật Đăng nhập (Login Gate):** Đăng nhập yêu cầu quyền `admin`, lưu JWT trong LocalStorage, tự động kiểm tra phiên qua `/api/auth/me`.
- **Đa ngôn ngữ (i18n):** Chuyển đổi linh hoạt Tiếng Anh / Tiếng Việt (EN/VI) với hơn 200 từ khoá.
- **Tab Quản lý Bản đồ (Maps Management):**
  - Danh sách bản đồ trực quan kèm bộ lọc theo loại (`town`, `route`, `interior`).
  - Khung Canvas Interactive xem trước bản đồ 32×32: Hỗ trợ bật/tắt độc lập các lớp Ground, Decoration, Overhead, lưới toạ độ (Grid), vùng va chạm (Collisions) và các điểm chuyển map (Warps).
  - Modal nhập bản đồ Essentials từ `.rxdata`.
  - Đã khắc phục triệt để lỗi CSS dropdown bị co nhỏ ở lần click đầu tiên bằng `flex-shrink: 0; min-width: 130px`.
- **Tab Quản lý Người chơi (User Management):** Tìm kiếm thời gian thực, phân trang server-side, tạo tài khoản, đổi mật khẩu, ban/unban, cập nhật thông tin và gán Sprite.
- **Tab Thư viện Sprite (Sprite Catalog):** Upload ảnh nhân vật, kiểm tra frame tự động, cấu hình 12-frame hoặc 16-frame chuẩn, xem trước animation 4 hướng, export ảnh baked.
- **Tab Dữ liệu Trò chơi (Game Data Viewer):** Tra cứu danh mục 898 Pokémon, 740 chiêu thức, 693 vật phẩm và 267 đặc tính.

---

## 6. Cơ sở Dữ liệu & Lưu trữ (PostgreSQL 18)

### 6.1 Schema DDL Hiện tại

```sql
-- 1. users: Tài khoản người dùng
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('player', 'moderator', 'admin', 'banned')) DEFAULT 'player',
  language TEXT NOT NULL DEFAULT 'en',
  sprite_id UUID NULL REFERENCES sprite_catalog(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 2. user_info: Thông tin bổ sung (1-1 với users)
CREATE TABLE user_info (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  birthday DATE NULL,
  bio TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. players: Trạng thái nhân vật ingame (1-1 với users)
CREATE TABLE players (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  x INT DEFAULT 256,
  y INT DEFAULT 256,
  map_id TEXT DEFAULT 'lappet-town',
  direction TEXT DEFAULT 'down',
  level INT DEFAULT 1,
  exp BIGINT DEFAULT 0,
  money INT DEFAULT 5000,
  stats JSONB DEFAULT '{}'
);

-- 4. pokemon: Pokémon sở hữu
CREATE TABLE pokemon (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL,
  nickname TEXT,
  level INT DEFAULT 1,
  exp BIGINT DEFAULT 0,
  ivs JSONB DEFAULT '{}',
  evs JSONB DEFAULT '{}',
  stats JSONB DEFAULT '{}',
  current_hp INT DEFAULT 0,
  moves JSONB DEFAULT '[]',
  status TEXT,
  shiny BOOLEAN DEFAULT FALSE,
  caught_at TIMESTAMPTZ DEFAULT NOW(),
  party_slot SMALLINT -- 0..5: Party, NULL: PC Box
);

-- 5. sprite_catalog: Thư viện sprite nhân vật
CREATE TABLE sprite_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  mode TEXT CHECK (mode IN ('baked', 'atlas')) DEFAULT 'baked',
  sheet_url TEXT NOT NULL,
  source_url TEXT,
  frames JSONB DEFAULT '[]',
  frame_w INT DEFAULT 32,
  frame_h INT DEFAULT 32,
  frame_count SMALLINT DEFAULT 16, -- 12 = 3f/hướng, 16 = 4f/hướng
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. inventory: Túi đồ người chơi
CREATE TABLE inventory (
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INT DEFAULT 0,
  PRIMARY KEY (owner_id, item_id)
);
```

### 6.2 Cơ chế Đồng bộ Vị trí (Location Persistence)
- Khi kết nối (`WorldRoom.onJoin`): Server truy vấn database (`SELECT x, y, map_id, direction FROM players WHERE id = $1`) để khôi phục chính xác toạ độ người chơi.
- Khi di chuyển (`move`): Lưu trạng thái vào bộ nhớ đệm và tự động ghi đồng bộ xuống PostgreSQL định kỳ 5 giây/lần.
- Khi thoát mạng (`onLeave` / `onDispose`): Lưu tức thời toạ độ cuối cùng vào database.

---

## 7. Danh mục API & Colyseus Rooms

### 7.1 Backend REST API

| Nhóm | Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :---: | :--- | :---: | :--- |
| **Hệ thống** | `GET` | `/health` | Công khai | Kiểm tra tình trạng server (`{ok, uptime}`) |
| **Xác thực** | `POST` | `/api/auth/register` | Công khai | Đăng ký tài khoản mới (`{username, password, displayName}`) |
| | `POST` | `/api/auth/login` | Công khai | Đăng nhập lấy JWT (`{username, password}`) |
| | `GET` | `/api/auth/me` | User | Lấy thông tin tài khoản, player và profile |
| **Người dùng**| `GET` | `/api/users/:id/info` | User/Admin | Xem thông tin profile chi tiết |
| | `PUT` | `/api/users/:id/info` | User/Admin | Cập nhật ngày sinh, tiểu sử, ghi chú |
| **Quản trị** | `GET` | `/api/admin/status` | Admin | Thống kê DB, Redis, số người chơi online |
| | `GET` | `/api/admin/users` | Admin | Danh sách người chơi kèm tìm kiếm & phân trang |
| | `POST` | `/api/admin/users` | Admin | Tạo tài khoản người chơi mới |
| | `PATCH` | `/api/admin/users/:id` | Admin | Sửa thông tin, level, tiền, sprite, vai trò |
| | `POST` | `/api/admin/users/:id/password` | Admin | Đặt lại mật khẩu |
| | `POST` | `/api/admin/users/:id/ban` | Admin | Khóa tài khoản (`role = 'banned'`) |
| | `POST` | `/api/admin/users/:id/unban` | Admin | Mở khóa tài khoản (`role = 'player'`) |
| | `DELETE`| `/api/admin/users/:id` | Admin | Xóa tài khoản vĩnh viễn (cascade) |
| **Sprites** | `GET` | `/api/admin/sprites` | Admin | Lấy danh sách sprite trong catalog |
| | `POST` | `/api/admin/sprites` | Admin | Tải lên và tạo sprite mới (multipart) |
| | `GET` | `/api/admin/sprites/:id` | Admin | Xem chi tiết cấu hình sprite |
| | `PATCH` | `/api/admin/sprites/:id` | Admin | Cập nhật cấu hình / file sprite |
| | `DELETE`| `/api/admin/sprites/:id` | Admin | Xóa sprite khỏi catalog |
| **Bản đồ** | `GET` | `/api/admin/maps` | Admin | Lấy danh sách toàn bộ bản đồ hệ thống |
| | `GET` | `/api/admin/maps/:id` | Admin | Lấy dữ liệu chi tiết bản đồ (TMJ/server JSON) |
| | `PATCH` | `/api/admin/maps/:id` | Admin | Cập nhật metadata bản đồ |
| | `POST` | `/api/admin/maps/import`| Admin | Nhập bản đồ mới từ file RPG Maker XP |
| **Game Data** | `GET` | `/api/admin/pokemon` | Admin | Danh sách Pokémon toàn server |
| | `GET` | `/api/admin/players` | Admin | Danh sách toạ độ người chơi realtime |

### 7.2 Colyseus WebSocket Rooms (`ws://localhost:2567`)

| Room Name | Giới hạn | Messages lắng nghe | Trách nhiệm |
| :--- | :---: | :--- | :--- |
| **`world`** | 50 clients | `move`, `chat`, `teleport` | Đồng bộ vị trí người chơi trên map, quản lý danh sách phòng động, phân phát chat, flush toạ độ về DB |
| **`battle`**| 2 clients | `battle_move`, `battle_item`, `battle_switch`, `battle_forfeit` | Xử lý trận đấu theo lượt, tính sát thương, thời gian chờ 60 giây |

---

## 8. Công cụ Phát triển & Quy tắc Dành cho AI Agent

### 8.1 Bộ Lệnh Quản trị Hệ thống
```bash
./scripts/pm.sh status         # Xem trạng thái port 2567 & 5173
./scripts/pm.sh restart        # Khởi động lại đồng thời cả Server và Client
./scripts/pm.sh logs           # Xem 50 dòng log mới nhất
pnpm run typecheck             # Kiểm tra lỗi TypeScript cả 4 packages
```

### 8.2 Bộ Lệnh Tra cứu Dữ liệu Tiết kiệm Token (CLI Tools)
Tuân thủ nghiêm ngặt quy tắc trong [`AGENTS.md`](file:///home/huynhat/AI-Agent/pixelmon/AGENTS.md): **TUYỆT ĐỐI KHÔNG đọc toàn bộ file JSON lớn** (`species.json` 1.2MB, `moves.json`, `.tmj`) vào context chat. Sử dụng các công cụ chuyên dụng:
```bash
# Tra cứu dữ liệu trò chơi siêu tốc (chỉ tốn vài chục token):
python3 scripts/tools/query_data.py species pikachu
python3 scripts/tools/query_data.py move thunderbolt
python3 scripts/tools/query_data.py item potion
python3 scripts/tools/query_data.py map lappet-town
python3 scripts/tools/query_data.py search species char

# Kiểm tra phân tích kích thước và lưới ảnh/tileset bằng Pillow:
python3 scripts/tools/inspect_image.py packages/shared/assets/tilesets/Outdoor.png 32
```

### 8.3 Tài khoản Quản trị & Thử nghiệm Mặc định
- **Quản trị viên (Admin):** `admin` / `admin123`
- **Người chơi (Player):** `tienv2i` (đã định vị sẵn tại trung tâm `Lappet Town`), `user01` .. `user10` / `123`

---

## 9. Lịch sử Triển khai Chi tiết (Milestones Summary)

<details>
<summary><b>Xem tóm tắt các Plan từ 1 đến 34</b></summary>

- **Plan 1 — 7:** Khởi tạo Monorepo pnpm + Turborepo, thiết lập Express + Colyseus, cấu hình PostgreSQL + Redis, xây dựng cấu trúc shared package, tạo hệ thống i18n EN/VI và khung UI cơ sở.
- **Plan 8 — 16:** Tinh chỉnh cơ chế camera pan, di chuyển bằng click chuột (click-to-move), thuật toán A* pathfinding, dọn dẹp các thành phần UI thừa, xây dựng thanh công cụ `TopMenu`, bảng thông tin giờ/thời tiết `InfoPanel`.
- **Plan 17 — 21:** Xây dựng hệ thống Sprite Catalog trong Admin Dashboard, hỗ trợ chuẩn 12-frame và 16-frame, tự động căn khung, gán sprite cho người dùng và hiển thị avatar động.
- **Plan 22 — 26:** Chuẩn hoá tỷ lệ HUD trên màn hình nhỏ và thiết bị di động, bổ sung Mini Mode, thiết kế lại bảng thông tin thu gọn và tối ưu hoá điều khiển chuột trái (LMB).
- **Plan 27 — 30:** Thiết kế thư viện `UiModal` dùng chung với khả năng kéo thả, thu nhỏ, gắn dock linh hoạt; nâng cấp các modal Chat, Settings, Party, UserInfo và Help.
- **Plan 31 — 32:** Tích hợp bộ dữ liệu Pokémon Essentials v21.1 đồ sộ (898 loài, 740 chiêu, 693 items), xây dựng giao diện xem Game Data trong Admin, hệ thống PC Box và bảng chỉ số Pokémon.
- **Plan 33 — 34:** Tái thiết kế bản đồ Pallet Town chuẩn mực, xây dựng cơ chế lưu vị trí người chơi xuống PostgreSQL, dọn dẹp các tệp tin thừa và phát triển bộ CLI tools tối ưu token ngữ cảnh.
</details>

### Plan 35 — Hệ thống Bản đồ Mới Chuẩn Pokémon Essentials v21.1, Map Management Admin & Đồng bộ MapInfos.rxdata (2026-10-01)
- Xoá bỏ hoàn toàn 22 tệp bản đồ cũ không tương thích, thay bằng bộ dữ liệu chuẩn chuyển đổi từ `MapInfos.rxdata`.
- Bổ sung 22 tileset chuẩn Essentials (`Outside.png`, `Interior general.png`...) và 37 autotiles động.
- Xây dựng tab Bản đồ tương tác trong Admin: hiển thị danh sách bản đồ, render interactive preview canvas 2D 32×32, cho phép bật tắt layer, grid, collisions, warps.
- Thiết lập định danh 5 bản đồ chuẩn: `lappet-town` (Map 002, default), `players-house`, `pokemon-lab`, `route-1`, `daisys-house`.
- Cập nhật cơ sở dữ liệu chuyển toàn bộ người chơi sang xuất phát tại `lappet-town` toạ độ `(256, 256)`.

### Plan 36 — Sửa lỗi Co rút Dropdown Admin, Bổ sung Nút & Panel Debug Client (2026-10-01)
- **Sửa lỗi Admin Dropdown:** Khắc phục xung đột CSS flexbox, đặt `flex-shrink: 0; min-width: 130px;` cố định trên tất cả các select toolbar trong `admin.css` và `admin.html`.
- **Nút Debug trên Client:** Thêm icon microchip pixel neon vào `TopMenu.ts`.
- **Panel Debug Toàn diện (`DebugModal.ts`):** 
  - Kế thừa `UiModal`, tích hợp phím tắt `F3` và `F2`.
  - Hiển thị Map slug, tên map, kích thước, số layer, số warps, tileset.
  - Hiển thị toạ độ Pixel `(X, Y)`, Tile `[TileX, TileY]`, hướng nhìn, trạng thái di chuyển, FPS thực tế, zoom camera.
  - Phím tắt dịch chuyển nhanh (Teleport presets) tới 5 bản đồ Essentials.
  - Bộ điều chỉnh tốc độ di chuyển `1x`, `2x`, `3x`, `5x`.
  - Khung chạy lệnh Console CLI (`/tp`, `/speed`, `/pos`, `/help`, `/clear`).

### Plan 37 — Khắc phục Triệt để Lỗi Client Render Không Khớp với Admin (2026-10-01)
- **Xử lý lỗi Vite TMJ Parser:** Loại bỏ `assetsInclude: ['**/*.tmj']` trong `vite.config.ts`, tạo plugin `vite-plugin-tmj-json` tự động biến tệp `.tmj` thành đối tượng JSON khi import, loại bỏ lỗi runtime khiến client rơi vào map giả lập (`PlaceholderMap`).
- **Giải quyết giới hạn WebGL `MAX_TEXTURE_SIZE` (8192px):**
  - Tileset `Outdoor.png` cao 16.096px làm WebGL từ chối nạp texture (`GL_INVALID_VALUE`).
  - Chuyển `main.ts` sang `Phaser.CANVAS` kết hợp `pixelArt: true`. Canvas 2D không bị giới hạn 8192px, render sắc nét 60 FPS.
  - Đạt độ khớp 100.0% pixel-perfect giữa Admin canvas và Client canvas (0 sai lệch).
- **Đồng bộ Colyseus Default Map:** Đổi mặc định trong `ColyseusManager.ts` sang `'lappet-town'`.

### Plan 38 — Hệ thống Di chuyển Tile-based, Va chạm & Lưu toạ độ (2026-10-01)
> Plan chi tiết: `~/.opencode/plan/plan-movement-collision-persistence.md`. Đã xong **Phase 1 (1a → 1c)**.

**Mô hình đã chốt:** di chuyển **tile-based** (bấm phím = 1 ô 32px, snap tile center, 4 hướng). Nguồn dữ liệu va chạm: `packages/shared/data/maps/server/*.json` là SSOT, client import tĩnh. Kiến trúc phòng: 1 room / map + server authoritative, chống gian lận bằng validate walkable + giới hạn tốc độ.

#### Phase 1 — Shared: CollisionGrid + Converter đọc terrain tags (✅ xong)
- **1a. Converter** (`scripts/tools/convert_essentials_map.py`): đọc `@terrain_tags` từ `.rxdata`, map sang `CollisionFlag` bitmask, ghi bitwise OR. Mapping suy ra empirical từ `@passages` bits trên 69 map (Essentials đã compile MKXP, không đọc được `PBTerrain`):
  | Tag | Flag | Ý nghĩa |
  |---|---|---|
  | 1 | `WALKABLE \| LEDGE_SOUTH` | Ledge (jump down) — passage `0x07` |
  | 2 | `GRASS` | Grass — passage `0x40` |
  | 3 | `WALKABLE` | Sand (passage `0x00`) |
  | 4 | `BLOCKED` | Rock (passage `0x0f` ~92%) |
  | 6 | `WATER` | StillWater — surf được (passage `0x0f`) |
  | 8 | `WATER \| BLOCKED` | Waterfall — không surf (passage `0x0f`) |
  | 10 | `GRASS` | TallGrass (deep_bush, encounter) — passage `0x40` |
  | 12, 13, 16 | `WALKABLE` | Ice / Neutral / Puddle (passage `0x00`) |

  > **⚠ Sửa lỗi 2026-10-02 — terrain tag mapping đã xác minh từ script gốc Essentials.**
  > Bản đầu map tag `1, 2, 10` → `LEDGE_SOUTH` suy ra "empirically" từ passage bits, nhưng **sai**.
  > Đã giải nén `TerrainTag` module trong `Data/Scripts.rxdata` (script id `TerrainTag`) và đọc
  > bảng đăng ký chính thức — cả 3 tag đều **không phải ledge**:
  > - `id 1` = `:Ledge` → đúng là ledge, nhưng **chỉ** tag này (passage `0x07` = chặn 3 hướng).
  > - `id 2` = `:Grass` (`shows_grass_rustle`, `land_wild_encounters`) → **`GRASS`**, không phải ledge.
  > - `id 10` = `:TallGrass` (`deep_bush`, `must_walk`) → **`GRASS`**, không phải ledge.
  > Bằng chứng bổ sung: bit passage RMXP `0x40` **không phải** "ledge-jump bit" mà là
  > "cỏ cao / flowerbed" — nên suy luận tag 2 & 10 là ledge là do đọc sai ý nghĩa bit.
  > Hậu quả trước khi sửa: 7 ô Lappet Town bị gắn `LEDGE_SOUTH` (0x11) như thật ra chỉ là cỏ —
  > đáng chú ý là ô **(6,11)** chặn người chơi đi lên **(6,10)** dù hai ô đều trống, vì
  > `handleInputDirection` chặn mọi hướng ≠ hướng ledge khi đứng trên ô ledge, và server
  > `validateStep` trả `on_ledge_must_hop`. Sau khi sửa: Lappet Town **0 ledge**, 7 ô cỏ.
  > Mapping chính thức (dùng cho tag chưa xuất hiện trong data): `5` DeepWater, `7` Water,
  > `9` WaterfallCrest, `11` UnderwaterGrass, `14` SootGrass, `15` Bridge — theo bảng `TerrainTag`.

  Kết quả 5 map: Lappet Town 395 walkable / 266 blocked / **11 water** / **0 ledge** (7 ô tag-2/10 giờ là `GRASS`); Route 1 **không có nước** (78 ô tag-3 là Sand); players-house 393/72; pokemon-lab 240/60; daisys-house 262/38. Lưu ý: converter bỏ qua autotile (`tid < 384`) — ảnh hưởng 14/672 ô ở Lappet Town.
- **1b. Shared helpers** (`packages/shared/src/formulas/mapruntime.ts`): thêm `getLedgeDirection`, `canJumpLedge`, mở rộng `isWalkable(map,x,y,{canSurf})`. Sửa lỗi thiết kế `CollisionFlag` — `LEDGE_WEST: 0x30` trùng `LEDGE_SOUTH|LEDGE_NORTH`; đổi sang encode hướng bằng **2-bit field** (bit 5–6), giải phóng `0x80` cho `WARP`. Giá trị `LEDGE_SOUTH` giữ `0x10` → dữ liệu 5 map không phải chuyển đổi.
- **1c. Client registry** (`apps/client/src/world/CollisionGrid.ts` — mới):
  - `CollisionGrid`: wrapper gọi thẳng `formulas/mapruntime.ts` → client & server dùng chung một bộ logic va chạm. API `isWalkable/isWater/isGrass/isLedge/getLedgeDirection/canJumpLedge/getWarpAt/getFlag`.
  - `MapCollisionRegistry`: `register/has/get/ids`; `get(mapId)` chưa đăng ký → grid fallback (`hasData=false`, mọi ô walkable) để không phá hành vi hiện tại.
  - `collisionRegistry` singleton: 5 map + 4 alias (`pallet-town`, `interior-*`) khớp `TILED_MAPS`.
- **Xác minh Phase 1:** typecheck 4/4 package sạch; `vite build` thành công; 25 assertion (1b) + 14 assertion (1c) trên dữ liệu thật đều pass.

#### Phase 2 — Client: Tile-based movement (✅ xong)
> **Kết quả Phase 2:** typecheck 4/4 packages sạch; `vite build` thành công (120 modules); 15 assertion smoke pass trên dữ liệu thật (spawn walkable, nước chặn không Surf / đi được khi Surf, ledge có hướng, OOB chặn, A* chỉ đi ô walkable).

- **2a. `WorldScene.ts` — đã viết lại input & update (xong):**
  - **Bỏ hoàn toàn** di chuyển tự do `vx/vy` và `advanceAlongPath` chạy theo pixel.
  - **Keyboard:** bấm 1 phím = 1 ô 32px (snap tâm ô, 4 hướng); giữ phím lặp theo `MOVE_COOLDOWN_MS` (150ms/ô ≈ 6.67 ô/s — hằng số mới trong `constants/game.ts`).
  - **Click-to-move:** A* tìm đường → di chuyển từng ô, mỗi ô 1 bước (accumulator `nextStepAt` trong `update`), nghỉ `MOVE_COOLDOWN_MS` giữa các ô.
  - **`stepTo()` (helper chung):** snap `tileCenter(col,row)` → setDirection → gửi `move` throttle → kiểm tra warp / grass.
  - **Throttle network:** `sendMoveThrottled()` ~1 lần mỗi `MOVE_COOLDOWN_MS` (thay cho 100ms cũ, khớp nhịp bước).
- **2b. `Pathfinder.ts` — dùng CollisionGrid thật (xong):**
  - `findPath(fromX,fromY,toX,toY, isWalkable)` — thêm tham số **`TileCollider`** (callback `(col,row)=>boolean`), `WorldScene` truyền `this.canEnterTile` (dùng `CollisionGrid.isWalkable` + `canSurf`).
  - **A* đổi sang 4 hướng** (bỏ chéo) để khớp mô hình di chuyển 4 hướng của Phase 2 — tránh nhảy "chéo ô" khi bước theo path.
  - Ô đích blocked → `nearestWalkable` tìm ô đi được gần nhất.
- **2c. `PlaceholderMap.ts` — giữ nguyên (xong):** vẫn là fallback khi Tiled map load fail; `walkGrid` + `isWalkableTile` giữ nguyên.
- **2d. Spawn & Warp (xong):**
  - **Spawn:** đọc `MAPS[id].spawn` → snap tâm ô; ô spawn blocked → `CollisionGrid.nearestWalkable()` tìm ô gần nhất. Không còn spawn "giữa map" cứng.
  - **`switchMap()`:** cập nhật `this.collision = getCollisionGrid(mapId)` + reset `lastWarpKey`/`isJumping`/`heldDir` khi đổi map.
  - **Warp:** sau mỗi bước `onTileEntered()` kiểm tra `getWarpAt(col,row)` → `sendChangeMap()` (throttle theo `lastWarpKey` chống bắn trùng). ⚠️ **Warp chưa có dữ liệu** (converter chưa trích `@code=201`) → luôn `undefined` cho tới khi Phase 3 chạy converter.
- **2e. Ledge & Surf & Grass (xong):**
  - **Ledge:** `handleInputDirection()` — đứng trên ô `LEDGE_*` + bấm **đúng hướng** → `jumpLedge()` nhảy 2 ô (tween `jumpTo()` 220ms, khoá input `isJumping`); sai hướng → chặn. Đáp xuống ô walkable rồi gửi `move` + `onTileEntered`.
  - **Surf:** `canEnterTile(col,row)` chỉ cho vào ô `WATER` khi `canSurf=true` (tương ứng `this.surfing`); bước vào/ra nước → `PlayerSprite.setSurfing()` (tint xanh nhạt, swap sheet sau này). Không Surf → ô nước chặn như tường.
  - **Grass:** `onTileEntered()` kiểm tra `isGrass()` → random trigger `startBattle()` theo `MAPS[].encounterRate`. ⚠️ **Luôn `false`** với dữ liệu hiện tại (bit `GRASS` chưa map nào bật) — chỉ là điểm chờ.
- **`ColyseusManager.ts`:** thêm `sendChangeMap(toMap,toX,toY)` (gửi `change_map`), `onWorldMessage`/`offWorldMessage` (lắng `player_moved_map` + `move_rejected`).
- **`PlayerSprite.ts`:** thêm `setSurfing/on`, `jumpTo()` (tween nhảy ledge).
- **`constants/game.ts`:** thêm `MOVE_COOLDOWN_MS = 150` (export qua `constants/index.ts`).
- **`CollisionGrid.ts`:** thêm `nearestWalkable(x,y,opts,maxRadius=8)` — vòng xoáy tìm ô walkable gần nhất.

#### Phase 3 — Server: 1 room/map + validate + warp (✅ hoàn thành)
- **3a. `WorldRoom`** — `onCreate`: `setMetadata({ mapId })` + `filterBy(['mapId'])`; boot `await mapLoader.loadAll()` trong `index.ts`; `PlayerState.mapId` default `'lappet-town'`.
- **3b. `move` handler** — validate `player.mapId` khớp room; ô đích walkable (dùng `isWalkable` + `canSurf`); giới hạn tốc độ ≤ 1 ô mỗi `MIN_STEP_INTERVAL` (~120ms), vi phạm gửi `move_rejected` kèm vị trí server; ledge kiểm tra hướng khớp → cho nhảy 2 ô; cập nhật `player.x/y/direction` + đánh dấu dirty.
- **3c. `change_map` handler** — kiểm tra warp hợp lệ tại ô hiện tại (`getWarpAt`); cập nhật `player.mapId`, lưu DB ngay; broadcast `player_moved_map` → client rejoin room mới.
- **3d. `onJoin`** — dùng `mapLoader` lấy spawn thật từ `ServerMap`; snap tile center, validate walkable.
- **3e. `ColyseusManager`** — giữ `joinWorld(mapId)`; thêm `sendChangeMap(toMap, toX, toY)`.
- **3f. Converter warp** — trích code 201 từ event pages → emit `type: "warp"` objects; set bit `WARP (0x80)` + clear `BLOCKED` tại door tile; `ESSENTIALS_DEFAULT` sửa sang `/mnt/data/Downloads/...`. 8 warp khép kín hoạt động (3 lappet-town, 3 players-house, 1 pokemon-lab, 1 daisys-house). `route-1` = 0 warp (Kurt door → map 6 chưa convert).

#### Phase 4 — Đồng bộ & dọn dẹp (✅ hoàn thành)

- **4a. Spawn chuẩn hoá:** `register.ts` insert `(256,256,'lappet-town')`; `seed-users.ts` + `user-admin.ts` + `admin/index.ts` insert `(256,256,'lappet-town')`; `database.ts` DEFAULT `map_id='lappet-town'`.
- **4b. Schema defaults:** `PlayerState.mapId` + `WorldState.mapId` đổi `'route_1'` → `'lappet-town'`.
- **4c. Admin collision heuristic:** `admin.js` sửa `flag !== 1` → dùng bitmask `BLOCKED (0x04) | WATER (0x02)`; HUD `isBlocked` cũng dùng bitmask.
- **4d. DB migration:** `migrate-player-locations.ts` migrate `'route_1'`/`'pallet-town'` → `'lappet-town'`, spawn `(256,256)`.
- **4e. Client cache:** clear `.vite` cache khi import thêm export mới từ `@pixelmon/shared` (lỗi `canJumpLedge` đã fix).
- **4f. `MAPS` aliases:** giữ `'pallet-town'`/`'interior-*'`/`'route_1'`/`'oak_lab'` làm backward-compat (normalizeMapId map về id chính). Có thể xóa sau khi không còn reference.

#### Phát hiện chuẩn bị Phase 2/3
- **Warp đã được converter trích ra** (Phase 3f) — `ServerMap.objects` giờ có `type: "warp"` objects với `toMap/toX/toY/direction`. Warp object dùng **tile coords** (không phải pixel như Tiled TMJ).

  Cấu trúc warp trong `.rxdata`: event → `@pages[0]` → `@list[]`, lệnh code 201 có `@parameters = [type, destMapId, destX, destY, direction, fade]`. **Direction là hencoding RMXP thô** (đọc trực tiếp từ `Scene_Map` case statement Essentials): `0`=retain, `2`=down, `4`=left, `6`=right, `8`=up. Values 0-3 không xuất hiện trong data chuẩn.
  
  Converter tự map `MAP_ID_TO_SLUG = {2:lappet-town, 3:players-house, 4:pokemon-lab, 5:route-1, 8:daisys-house}`; warp có dest ngoài registry sẽ bị bỏ qua (fallback thành event generic).

- 8 warp khép kín trong 5 map (đã emit vào server JSON):

  | Nguồn | Ô | warp object | Đến | direction |
  |---|---|---|---|---|
  | lappet-town | (8,7) Home door | ✓ | players-house (3,8) | **up** |
  | lappet-town | (18,13) Lab door | ✓ | pokemon-lab (6,12) | **up** |
  | lappet-town | (17,7) Next door | ✓ | daisys-house (3,8) | **up** |
  | players-house | (3,9) Exit | ✓ | lappet-town (8,7) | retain |
  | players-house | (10,2) Stairs up | ✓ | players-house (29,2) | retain |
  | players-house | (28,2) Stairs down | ✓ | players-house (9,2) | retain |
  | pokemon-lab | (6,13) Exit | ✓ | lappet-town (18,13) | retain |
  | daisys-house | (3,9) Exit | ✓ | lappet-town (17,7) | retain |

  **Landing tiles walkable:** converter set `WALKABLE` (clear `BLOCKED`) tại ô đích warp, kể cả cross-map (post-pass đọc JSON của map khác). Đã verify tất cả dest flags có `WALKABLE=0x01`.

- Warp không emit (dest map chưa convert):
  | Nguồn | Ô | warp | Lý do |
  |---|---|---|---|
  | route-1 | (11,6) Kurt door | ✗ | map 6 (chưa convert) |
  | players-house | (1,3) Warp tile 1 | ✗ | switch 8-map (script) |
  | players-house | (2,3) Warp tile 2 | ✗ | switch 7-map (script) |

- 3 trường hợp cần xử lý riêng (không map 1-1): `route-1` (11,6) Kurt door → **map 6** (đã update trong 3f: bỏ qua, giữ event generic); `players-house` "Stairs up/down" (10,2)/(28,2) → **chính map 3** (warp nội bộ, đã emit); `players-house` "Warp tile 1/2" (1,3)/(2,3) → **8/7 đích** chọn theo switch (đã update trong 3f: bỏ qua, giữ event generic).
- **Bit `GRASS` hiện chưa map nào bật** (tag 2 của Lappet Town là ledge, không phải cỏ) — `isGrass` luôn `false` với dữ liệu hiện tại.
- **Spawn đã chuẩn hoá** (Phase 4 ✅): tất cả đều dùng `lappet-town` + pixel `(256,256)` — `MAPS['lappet-town'].spawn`, `register.ts` insert, `seed-users.ts`, `user-admin.ts`, `admin/index.ts`, DB DEFAULT, `PlayerState.mapId`/`WorldState.mapId`. Aliases `'pallet-town'`/`'route_1'` vẫn còn trong `MAPS` (backward-compat).

#### Rủi ro
- Vite import JSON từ `packages/shared/data/maps/server/*.json` — ✅ đã verify build thành công (Phase 1c).
- Remote player interpolation: tile-based dễ hơn (lerp từ ô này sang ô khác) nhưng cần viết lại `syncRemotePlayers`.
- Animation: đảm bảo `animateWalk` không bị giật khi snap ô.
- LEDGE direction hiện mặc định `LEDGE_SOUTH`, sẽ refine bằng tile graphic ở Phase 2.
- Client cũ đang ở room `world` mapId cũ → cần rejoin khi đổi map; xử lý `onLeave` cũ.

#### Checklist
- [x] 1a. Converter đọc terrain tags + chạy lại 5 map
- [x] 1b. `mapruntime.ts` bổ sung `getLedgeDirection` + `isWalkable(opts)`
- [x] 1c. `CollisionGrid.ts` client registry
- [x] 2a. `WorldScene` viết lại input tile-based
- [x] 2b. `Pathfinder` dùng CollisionGrid thật
- [x] 2c. `PlaceholderMap` giữ fallback
- [x] 2d. Spawn snap + warp detection
- [x] 2e. Ledge/Surf/Grass client
- [x] 3a. `WorldRoom` room per map + `mapLoader.loadAll()`
- [x] 3b. `move` validate + speed limit
- [x] 3c. `change_map` handler
- [x] 3d. `onJoin` spawn từ ServerMap
- [x] 3e. `ColyseusManager.sendChangeMap`
- [x] 3f. Converter trích warp (code 201) + set bit WARP
- [ ] 4. Đồng bộ register/MAPs/Admin/DB migration
- [x] Cập nhật `project_status.md`

### Fix — Tileset Nội thất & Terrain Tag (2026-10-02)

> Chi tiết: [`fix-plan.md`](./fix-plan.md) — mục **1.1** và **1.2** (✅ xong), mục **2** (không cần), mục **3** (chưa làm).

- **Vấn đề 1 — Terrain tag nhầm ledge (đã fix 2026-10-02):** converter map tag `2` (Grass) và `10` (TallGrass) → `LEDGE_SOUTH`, gây ra "mỏm đá ảo" chặn đi ở ô **(6,11)→(6,10)** Lappet Town. Đã sửa theo bảng `TerrainTag` chính thức của Essentials. Lappet Town giờ **0 ledge / 7 ô grass**, flag `(6,11)` = `9` (WALKABLE|GRASS).
- **Vấn đề 2 — Tileset hardcode `Outdoor.png` (đã fix 2026-10-02):** `convert_essentials_map.py` đọc `@tileset_name` từ `Tilesets.rxdata` thay vì hardcode:
  - Map nội thất (`players-house`, `pokemon-lab`, `daisys-house` — tileset gốc `Interior general`) → emit `assets/tilesets/Interior general.png`, `imageheight: 8032`, `tilecount: 2008`.
  - Map ngoại thành (`lappet-town`, `route-1` — tileset gốc `Outside`) → giữ `Outdoor.png`, sửa `imageheight` 22080 → **16096**, `tilecount` 5520 → **4024** (đúng kích thước file thật, verify bằng `inspect_image.py`).
  - Điều kiện chọn: `is_interior = (map_type == "interior") or ("interior" in ts_name.lower())`.
- **Đã re-convert 4 map:** `lappet-town`, `players-house`, `pokemon-lab`, `daisys-house` — warp và events giữ nguyên (3/3/1/1 warps).
- **Mục 2 của fix-plan (sửa `admin.js` + `TiledMapLoader.ts`) không cần áp dụng:** cả hai đã phân biệt tileset qua chuỗi `ts.image.includes('Interior')` — chỉ là converter trả sai đường dẫn nên chúng mới rơi về `Outdoor.png`.
- **Mục 3 của fix-plan — Tối ưu chuyển động (✅ 2026-10-02):**
  - **Delta Grid-Step:** `WorldScene` không còn `setPosition(center)` tức thì mỗi ô. `stepTo()` ghi lại `stepStartX/Y` + `stepTargetX/Y` + `stepDir`, bật `isWalking`; `advanceStep(delta)` nội suy về đích với tốc độ `WALK_SPEED_PX = (TILE_SIZE / MOVE_COOLDOWN_MS) * 1000` ≈ 213.3 px/s (đúng 1 ô / 1 nhịp 150ms), tới sai số < 1px thì snap & xử lý.
  - `onTileEntered()` (warp + grass) **chuyển từ `stepTo` sang `advanceStep`** → chỉ chạy khi đã ở tâm ô.
  - **Input Buffering:** bấm phím lúc đang trượt → lưu `bufferedDir`; tới tâm ô là nối bước ngay (không chờ nhịp cooldown). `handleInputDirection` có guard `isWalking`.
  - **Reset state** ở `switchMap`, `teleportPlayer`, `onMoveRejected`, `jumpLedge` (`isWalking`, `bufferedDir`, `nextStepAt`) để không trôi về đích cũ khi bị teleport/reject.
  - **`PlayerSprite.animateWalk(delta, moving, walkProgress)`** — chọn frame theo % quãng đường (0→1), fallback timer nếu không truyền progress. Khi đang trượt, `update` không gọi thêm `animateWalk` lần 2.
  - **LERP remote player:** `syncRemotePlayers` chỉ set `targetX/targetY` (không snap), `interpolateRemotePlayers(delta)` nội suy với `t = min(delta/100, 1)`.
  - Lưu ý kỹ thuật: `Phaser.Math.Approach` không có trong typings → dùng `Phaser.Math.Linear(x, target, min(step/total, 1))` (tương đương, có clamp).
  - ✅ `pnpm run typecheck` 4/4 sạch; ✅ `vite build` thành công. ⬜ Test tay độ mượt (WASD zíc-zắc) chưa làm.

---

## 10. Kế hoạch Tiếp theo (Roadmap & Next Steps)

> **Ưu tiên hiện tại: Plan 38** (xem mục 9) — hệ thống di chuyển tile-based, va chạm, warp & lưu toạ độ. Các mục bên dưới nằm trong Plan 38 hoặc sau Plan 38.

1. **Hệ thống Cổng Dịch chuyển Tự động (Warp Interaction):** ✅ *Đã nằm trong Plan 38 (Phase 2d/3c)* — kiểm tra `getWarpAt` sau mỗi bước, gửi `change_map`, server validate warp rồi rejoin room mới.
2. **Hệ thống NPC & Hội thoại (NPC Interaction & Dialogue):**
   - Đọc dữ liệu sự kiện từ bản đồ Essentials để spawn NPC trên Client.
   - Thêm khung hội thoại tương tác (Dialogue Box) phong cách RPG kinh điển khi tương tác bằng phím Space/Enter hoặc click chuột.
3. **Hoàn thiện Sàn đấu Pokémon (BattleScene Integration):**
   - Kết nối `BattleScene.ts` với `BattleRoom` của Colyseus server.
   - Hiển thị sprite Pokémon mặt trước / mặt sau trích xuất từ dữ liệu chuẩn.
   - Hiện thực hoá lượt đánh, thanh máu động, hiệu ứng kỹ năng và kinh nghiệm (EXP).
