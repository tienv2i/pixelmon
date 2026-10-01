# Archive Status & Plan History (Plan 0 - Plan 18)

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
3. Thanh công cụ **neo ở góc màn hình** _hoặc_ **kéo được tự do** → 2 chế độ: **Nép (docked)** / **Tự do (floating)**.
4. Có chế độ **ẩn hết tất cả** thanh công cụ.

**Thiết kế:**

- **`UiZoomManager`** (đã có) = UI zoom, `+`/`-`, lưu `localStorage['pixelmon.uiZoom']`.
- **Game zoom** = `cameras.main.zoom`, scroll wheel, tách qua **camera UI riêng** (`uiCam`) → HUD không bị ảnh hưởng.
- **`HudManager` (MỚI)** — trung tâm điều phối HUD, thay `Toolbar` đã bị xóa. Giữ state:
  - `mode: 'docked' | 'floating'` (phím `F`)
  - `visibility: 'normal' | 'mini' | 'hidden'` (phím `H` → cycle)
  - auto-mini: viewport `< 720×540` → ép mini (khi quay lại kích thước lớn → trở về `normal`)
  - Đăng ký các **thanh công cụ** (PlayerHud, PartyStrip, ChatLog, Minimap, InfoPanel, TopMenu, MenuPanel)
    - **góc neo** (`anchor: 'tl'|'tr'|'bl'|'br'|'top'|'bottom'`), auto neo lại về góc khi chuyển về `docked`.
  - **Ẩn tất cả** = set visibility `hidden` cho mọi thanh + **tự ẩn HudManager**.
- **Drag (chế độ floating):** `PanelFrame.makeDraggable()` — kéo bằng **title bar**, clamp trong viewport,
  lưu toạ độ `localStorage['pixelmon.hud.<id>']`. Chế độ `docked` → bỏ drag + về góc.

| #   | File                       | Nội dung                                                                          |
| --- | -------------------------- | --------------------------------------------------------------------------------- |
| 1   | `src/ui/HudManager.ts`     | **MỚI** — state modes + registry thanh công cụ + auto-mini + anchor/drag + hidden |
| 2   | `src/ui/PanelFrame.ts`     | thêm `makeDraggable()` / `clearDraggable()` (title bar, clamp, persist)           |
| 3   | `src/ui/Minimap.ts`        | thêm `setAnchor()` + `getBounds()`; wire `setHudMode()` từ HudManager             |
| 4   | `src/ui/ChatLog.ts`        | thêm `getBounds()`; wire `setHudMode()`                                           |
| 5   | `src/ui/PlayerHud.ts`      | thêm `getBounds()`, `setHudMode()` (mini → avatar+money ngắn)                     |
| 6   | `src/ui/PartyStrip.ts`     | thêm `getBounds()`, `setHudMode()` (mini → ẩn title, slot nhỏ)                    |
| 7   | `src/ui/InfoPanel.ts`      | thêm `getBounds()`, `setHudMode()` (mini → chỉ giờ)                               |
| 8   | `src/ui/TopMenu.ts`        | thêm `getBounds()`, `setHudMode()` (mini → icon nhỏ)                              |
| 9   | `src/ui/MenuPanel.ts`      | thêm toggle cho **Neo/Tự do**, **Ẩn tất cả**, **Mini/Normal**, nút Game Zoom      |
| 10  | `src/scenes/WorldScene.ts` | tạo `HudManager`, wire các thanh, phím `F`/`H`/`Shift+H`, auto-mini, drag         |
| 11  | `src/ui/UiZoomManager.ts`  | (giữ) — có thể thêm nút +/- trong MenuPanel                                       |

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
