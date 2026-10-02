# Project Status — Pixelmon (Pokémon MMORPG)

> Cập nhật lần cuối: **2026-10-02** (**Tính năng Đa ngôn ngữ (i18n) Toàn bộ Client** — dictionary 285 key VI/EN trong `apps/client/src/i18n/index.ts`, toggle 1-nút trong Settings > Hệ thống, tự động refresh Text bound qua `mkText()`; đơn giản hoá nhãn Settings bỏ chú thích lặp; thêm setting Anti-aliasing (text hết mờ); fix DebugModal layout/relayout/double icon; typecheck 4/4 sạch)  
> **2026-10-02 (bổ sung):** Plan 41 Phase 5 — Admin Maps: route `POST /api/admin/maps/:id/regenerate` + `computeMapStats()` + nút "♻️ Regenerate JSON" + card "Thống kê Map"; typecheck 4/4 sạch)  
> **2026-10-02 (bổ sung):** Plan 41 Phase 3 — Tiled template `templates/pixelmon-map-template.tmj` + doc `docs/tiled-workflow.md`; fix bug `mapId is not defined` trong `deriveCollision`.  
> **2026-10-02 (bổ sung):** Plan 41 Phase 2 — `pnpm run build:map <id>` sinh server JSON từ `.tmj`; ⚠️ heuristic thuần layer sai 27% vì RMXP `passages`/`terrain_tags` là per-tile mà TMJ không lưu → cần tile property ở Phase 4; server JSON cũ đã restore.  
> **2026-10-02 (bổ sung):** Plan 41 Phase 1 — Tiled-first: `TiledMapLoader.ts` chuyển static import → `import.meta.glob`, thêm route static `/maps/tiled` trên Express; thêm map mới chỉ bằng copy `.tmj` + rebuild, không sửa code; typecheck 4/4 sạch.  
> **2026-10-02 (bổ sung):** Sửa lỗi di chuyển Lappet Town 6,11→6,10: chuyển terrain tag 10 từ LEDGE_SOUTH sang GRASS theo script Essentials `TerrainTag` (`:TallGrass, :id_number=>10`); tag 2 cũng đổi sang GRASS; 7 ô ledge → 0; typecheck 4/4 sạch)  
> **2026-10-02 (bổ sung):** Sửa converter hardcode tileset `Outdoor.png` cho mọi map → đọc `@tileset_name` từ RMXP, emit đúng `Interior general.png` (256×8032, 2008 tiles) cho 3 map nội thất; re-convert 4 map; `lappet-town.tmj` sửa imageheight 22080→16096, tilecount 5520→4024. Xem `fix-plan.md` mục 1.1/1.2.  
> **2026-10-02 (bổ sung 2):** Chuyển di chuyển từ **snap 32px** sang **Delta Grid-Step** (nội suy trượt ô theo delta) + **Input Buffering** (`bufferedDir`) + **LERP remote player**. Xem `fix-plan.md` mục 3.1/3.2.  
> **2026-10-02 (bổ sung 3):** Di chuyển bảng debug (`DebugModal.ts`) vào **tab `🛠 Debug` của Settings Panel** — tab chỉ hiện cho tài khoản `moderator` trở lên; thêm công cụ **Grid Overlay** & **Coordinate Tracking**; icon Debug Toolbar trên TopMenu có thể ẩn/hiện. Xem mục 4.2.  
> **2026-10-02 (bổ sung 4):** Sửa 3 lỗi di chuyển & vị trí đứng theo `fix-plan-2.md` (double-step, độ trễ, chân lơ lửng) + sửa frame đi bộ nhảy quá nhanh (26fps → ~6.7fps). Xem mục 9.  
> **2026-10-02 (bổ sung 5):** Mở rộng tab `🛠 Debug` — thêm **2 overlay** (Vùng va chạm, Điểm warp) + **3 nút bật/tắt lớp tilemap** (Nền/Trang trí/Che trên) + 2 lệnh CLI `/overlay`, `/layer`.  
> **2026-10-02 (bổ sung 6):** **Tách rời hệ thống Debug Client thành các module chuyên biệt:**  
> - Phục hồi `SettingsPanel.ts` về trạng thái nguyên bản sạch sẽ (không còn code debug rải rác).  
> - Tạo `DebugModal.ts` (580×480) gồm 2 phần: Tab 1 (Thông tin hệ thống thời gian thực có các nút `[ 📌 Ghim ]` trên từng card + thanh Action bar `📌 Mở Panel Tracking` & `👻 Đi xuyên tường`) & Tab 2 (Bật/tắt Overlay, Tilemap layers, Speed, Teleport nhanh).  
> - Tạo `DebugConsole.ts` (380×290, dock bên phải tương tự Chat): hỗ trợ lịch sử lệnh (ArrowUp/Down) và bộ lệnh phong phú (`/help`, `/map`, `/pos`, `/server`, `/noclip`, `/speed`, `/tp`, `/overlay`, `/layer`, `/clear`).  
> - Nâng cấp `DebugTrackerWidget.ts` (250×156) thành **modal không titlebar** (`showTitleBar: false`), neo bên cạnh phải màn hình game (`top-right`), theo dõi tracking liên tục (Bản đồ, Toạ độ chuột, Toạ độ nhân vật, Camera, FPS) và có nút toggle Xuyên tường (NOCLIP) trực quan.  
> - **Cơ chế Stack tự động cột phải (`layoutRightColumn`):** Quản lý toàn bộ panel cạnh phải theo dạng STACK dọc (`InfoPanel` ➔ `Minimap` ➔ `DebugTrackerWidget` ➔ `DebugConsole`), tự động dồn xuống / trượt lên khi bất kỳ panel nào đóng/mở.  
> - Hoàn thiện cơ chế **NOCLIP** trong `WorldScene.ts`: đi xuyên qua mọi va chạm (tường, nước, đá...) và bỏ qua reject vị trí từ server khi bật Noclip.  
> - `pnpm run typecheck` 4/4 packages sạch sẽ 100%.  
> **2026-10-02 (bổ sung 7):** **Lưu trọn bộ Settings & Toạ độ người dùng khi Login / Logout:**  
> - **Lưu toạ độ & map:** Sửa `apps/server/src/modules/auth/login.ts` trả về `player: { x, y, mapId, direction }`; `ColyseusManager.ts` lưu `savedLocation`, tự động tham gia đúng room `mapId` đã lưu; `WorldScene.ts` nạp đúng map đã lưu và spawn chuẩn xác; cập nhật toạ độ khi di chuyển, dịch chuyển, đổi map, đóng tab (`beforeunload`) và xác nhận đăng xuất (`confirmLogout`).  
> - **Lưu & phục hồi Settings:** Tạo `SettingsStorage.ts` quản lý `pixelmon.settings` (HUD profile/clock/party/chat/minimap/miniMode, Gameplay names/targetMarker/grid/autoRun/scrollToZoom/moveButton, Audio bgm/sfx, System lang, Zoom gameZoom); `SettingsPanel.ts` tự động nạp khi mở game, lưu realtime khi thay đổi và khôi phục chuẩn khi reset; `WorldScene.ts` áp dụng các cài đặt hiển thị HUD/Zoom ngay khi khởi tạo scene.  
> - `pnpm run typecheck` 4/4 packages sạch sẽ 100%.  
> **2026-10-02 (bổ sung 8):** **Bổ sung Top Drag Padding cho thư viện `UiModal` & Áp dụng cho khung Party:**  
> - Thêm tuỳ chọn `topDragPadding` và `showDragGrip` vào `UiModal.ts`: tạo một khoảng đệm ở trên đỉnh panel dùng làm vùng kéo rê (drag handle) khi modal không dùng Title Bar (`showTitleBar: false`). Vùng này không có title text hay bất kỳ nút bấm nào, có vạch grip handle tinh tế ở giữa tự động highlight khi hover/drag.  
> - Áp dụng vào khung Party (`PartyStrip.ts`): đặt `topDragPadding: 14`, `showDragGrip: true`, `draggable: true`, `docked: false` — cho phép người chơi dễ dàng kéo thả di chuyển khung danh sách Pokémon trong đội hình đi khắp màn hình một cách tự nhiên.  
> - `pnpm run typecheck` 4/4 packages sạch sẽ 100%.  
> **2026-10-02 (bổ sung 9):** **Hoàn thiện đồng bộ vị trí Noclip & Teleport (không bị giật lùi về vị trí cũ):**  
> - **Server:** `WorldRoom.handleMove` nhận flag `noclip: true`, cho phép cập nhật vị trí xuyên tường trong bounds map mà không reject, lưu realtime vào state & database; khi noclip tắt, nếu ô đích là walkable (`grid.walkable`), server chấp nhận vị trí đích và không bao giờ kéo lùi người chơi về quá khứ; bổ sung handler `teleport` cập nhật toạ độ tức thì và ghi nhận DB.  
> - **Client:** `ColyseusManager.sendMove` truyền cờ `noclip`; thêm `sendTeleport`; `WorldScene.ts` đồng bộ toạ độ lên server khi di chuyển noclip, khi bật/tắt noclip (`setNoclip`), khi teleport (`teleportPlayer`) và khi đổi map (`switchMap`).  
> - `pnpm run typecheck` 4/4 packages sạch sẽ 100%.  
> **2026-10-02 (bổ sung 10):** **Tái cơ cấu Debug UI & Stack Panel 2 Cột Trái/Phải & Double-Click Reset Modal:**  
> - **DebugModal:** Chuyển nút bật/tắt Đi xuyên tường (NOCLIP) vào chung với nhóm Bật/Tắt công cụ debug (Tab 2); gỡ bỏ action bar thừa ở Tab 1; cả 4 card thông tin hệ thống (Bản đồ, Nhân vật, Toạ độ/Chuột, Hiệu năng/Server) đều trang bị nút ghim `[ 📌 Ghim ]` riêng biệt để mở / đóng 4 panel widget độc lập neo bên cột phải.  
> - **DebugInfoWidgets:** Tạo 4 panel widget chuyên biệt (`DebugMapWidget`, `DebugPlayerWidget`, `DebugCoordWidget`, `DebugPerfWidget`) dạng modal không titlebar (`topDragPadding: 16`, `showDragGrip: true`), neo vào stack cột phải, có thể kéo thả tự do hoặc double-click để bay về stack.  
> - **UiModal:** Bổ sung xử lý double-tap / double-click trên thanh kéo (cả header và top drag padding) giúp modal lập tức tự động trở về vị trí mặc định (`resetPosition()`, `isCustomPositioned()`).  
> - **Stack Panel Cột Trái (`layoutLeftColumn`):** Nâng cấp xếp cột trái theo cơ chế Auto-Stack (Player HUD ➔ PartyStrip), tự động dồn từ trên xuống; PartyStrip hỗ trợ double-click reset position bay về đúng vị trí dưới HUD.  
> - **Stack Panel Cột Phải (`layoutRightColumn`):** Hỗ trợ dồn stack liên tục cho toàn bộ widget (InfoPanel ➔ Minimap ➔ Tracker ➔ Map ➔ Player ➔ Coord ➔ Perf ➔ Console).  
> - `pnpm run typecheck` 4/4 packages sạch sẽ 100%.  
> **2026-10-02 (bổ sung 11):** **Tinh chỉnh Chế độ Mini (PlayerHud, InfoPanel, PartyStrip) & Lưu Trọn Bộ Cài Đặt Zoom:**  
> - **PlayerHud Mini Mode:** Thu gọn về kích thước vuông 48×48px, chỉ hiển thị Avatar căn giữa; ẩn toàn bộ Tên và Số tiền (Money & Real Money).  
> - **InfoPanel Mini Mode:** Thu gọn về 54×50px; hiển thị Biểu tượng thời tiết to rõ ở trên (22px), khung giờ ở dưới dạng số tinh gọn (bỏ title `Poke:` / `Real:`, chỉ hiển thị `HH:mm`); ẩn vạch ngăn cách.  
> - **PartyStrip Mini Mode:** Thu gọn về chiều ngang 48px (khớp thẳng hàng tuyệt đối với `PlayerHud`), slot 38×38px; chỉ hiển thị Icon Pokémon và thanh EXP phía dưới chân Pokémon; ẩn toàn bộ Tên và Cấp độ (Level).  
> - **Khắc phục lưu Cài đặt Zoom sau khi refresh:**  
>   - Bổ sung `uiZoom` vào `SettingsStorage.ts` (`UserSettings.zoom.uiZoom`), đồng bộ hai chiều với `localStorage`.  
>   - Đồng bộ `UiZoomManager` với `SettingsStorage` (`load()` và `persist()`).  
>   - Sửa `WorldScene.setupCameraFollow`: loại bỏ lệnh ghi đè `cam.setZoom(1)`, nạp trực tiếp giá trị `gameZoom` đã lưu từ `SettingsStorage` vào camera ngay khi tạo scene.  
> **2026-10-02 (bổ sung 12):** **Bổ sung Mốc neo Render Game View (9 mốc) & Modal Chọn công cụ Lớn Tối ưu Di động (Select Tools Modal):**  
> - **Game View Anchor (9 mốc):** Thêm tuỳ chọn trong tab Gameplay của `SettingsPanel.ts` với ma trận 3×3 nút trực quan (`top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`); lưu trữ bền vững trong `SettingsStorage.ts`; `WorldScene.ts` tự động điều chỉnh camera bounds (căn cạnh/góc khi viewport lớn hơn map) và camera follow offset (dịch chuyển tầm nhìn khi map lớn).  
> - **Select Tools Modal (`SelectToolsModal.ts`):** Chuyển đổi panel icon mini dẹt dẹt cũ của `TopMenu.ts` thành modal lớn căn giữa màn hình (`UiModal`, `lockUi: true`), tiêu đề "SELECT TOOLS", nút tắt ✕ ở góc trên phải; trang bị danh sách công cụ dạng thẻ lớn (chiều cao 56px, icon pixel art 30px to rõ, font đậm, kèm mô tả) tối ưu vượt trội cho thao tác cảm ứng trên điện thoại di động và màn hình nhỏ.  
> - `pnpm run typecheck` 4/4 packages sạch sẽ 100%.  
> **2026-10-02 (bổ sung 13):** **Bổ sung Mouse Tracking (làm dấu ô chuột lướt ngang) & Tô sậm ô đích đến (Destination Marker) vào Cài đặt:**  
> - **Sửa lỗi Click-to-Move & Depth bị map che khuất & Tracking liên tục:**  
>   - Sửa lỗi trong `UiModal.ts`: `overlayBlocker` (zone che toàn màn hình khi modal `lockUi: true`) khi đóng `close()` trước đây chỉ gọi `setVisible(false)` mà không gọi `disableInteractive()`, dẫn đến zone vô hình chặn các tương tác chuột (pointerdown) trên màn hình game. Đã sửa gọi `disableInteractive()` khi đóng và `setInteractive()` khi mở.  
>   - Khắc phục triệt để lỗi `hoverGfx` và `destGfx` có depth cũ (6, 7) thấp hơn các lớp tilemap (Ground depth 10, Overhead depth 30) nên bị map che mất; nâng depth lên **35** (`hoverGfx`) và **34** (`destGfx`) nằm ngay trên mọi lớp bản đồ nhưng dưới HUD (depth 100+); thêm vào danh sách `getWorldObjects()` và cập nhật liên tục trong `update()` vòng lặp game.  
>   - Đảm bảo tính năng **Click-to-Move** hoạt động chuẩn xác 100%, không bị đứng yên:  
>     - Hỗ trợ cả **Chuột trái (LMB), Chuột phải (RMB) và Touch cảm ứng**, không bị giới hạn lệch tuỳ chọn `moveButton`.  
>     - Lọc `isUiClick` đệ quy qua cây container cha (bỏ qua những container đang ẩn `visible = false`).  
>     - Sửa thuật toán `Pathfinder.ts`: nếu điểm xuất phát hoặc vị trí lưu DB nằm trong vật cản (do tắt noclip trong tường), tự động tìm `nearestWalkable` để thoát tường và tiếp tục dẫn đường mượt mà đến đích.  
>     - Tối ưu vòng lặp `update()` và `advanceAlongPath()`: kích hoạt bước đi ngay lập tức trong frame click (`nextStepAt = 0`), duy trì cờ `this.moving = true` và animation bước chân xuyên suốt lộ trình; chỉ xoá marker đích đến khi nhân vật đã thực sự hoàn thành bước cuối cùng tới tâm ô đích.  
> - **Mouse Tracking (`WorldScene.updateHoverTile`):** Khi chuột lướt ngang trên bản đồ thế giới, ô tile dưới con trỏ được đánh dấu trực quan bằng nền mờ và viền pixel art 4 góc L (cyan nếu ô đi được, đỏ nhạt nếu ô bị chặn/tường/nước).  
> - **Destination Marker (`WorldScene.drawDestination`):** Khi người chơi click di chuyển tới, ô đích đến được tô sậm đen (65% opacity), bao quanh bởi viền kép neon cyan sắc nét và chấm tâm chỉ định điểm đến.  
> - **Tích hợp vào Settings (`SettingsStorage.ts` & `SettingsPanel.ts`):** Bổ sung 2 tuỳ chọn checkbox độc lập trong tab Gameplay (`mouseTracking` và `targetMarker`), tự động lưu vào `localStorage` và cập nhật trực tiếp hiệu ứng đồ hoạ theo thời gian thực.  
> - `pnpm run typecheck` 4/4 packages sạch sẽ 100%.  
> **2026-10-02 (bổ sung 14):** **Tính năng Đa ngôn ngữ (i18n) Toàn bộ Client — song ngữ VI/EN, chỉ hiển thị 1 trong 2 ngôn ngữ tại một thời điểm:**  
> - **Tạo module i18n (`apps/client/src/i18n/index.ts`):** từ điển **285 key** dạng tuple `[vi, en]` bao phủ toàn bộ UI (Settings, Debug, Chat, Help, Login, HUD, modal, thông báo WorldScene, lệnh CLI...); API: `t(key)` lấy chuỗi, `tr(text, key)` bind Text → tự dịch khi đổi ngôn ngữ, `mkText(scene, key, style, x?, y?)` tạo Text đã bind, `setLang/getLang/initLang`, `onLangChange(fn)` đăng ký callback, `isI18nKey()` type-guard.  
> - **Cơ chế refresh:** `setLang()` phát event → `refreshBoundTexts()` tự cập nhật mọi Text tạo qua `mkText()`/`tr()`; 9 modal đăng ký `onLangChange(() => this.setTitle(t(...)))` (dọn subscription trong `destroy()`); `SelectToolsModal` render lại grid, `TopMenu.ICONS` là getter động, `DebugModal` refresh label tab.  
> - **Khởi tạo:** `main.ts` gọi `initLang()` trước `new Phaser.Game()` đọc `pixelmon.settings.system.lang` (fallback `pixelmon.lang` cũ, mặc định `vi`).  
> - **Settings > Hệ thống:** nút toggle **1 duy nhất** hiển thị đúng ngôn ngữ đang dùng (bấm để đổi VI↔EN) — không hiển thị song song 2 nút; lưu qua `SettingsStorage.setLanguage()` → `saveSettings` + `setLang()`.  
> - **Đơn giản hoá nhãn Settings:** bỏ chú thích lặp trong ngoặc `(Player Names)`, `(Mini HUD)`, `(Grid Overlay)`... ở tab Giao diện/Lối chơi/Âm thanh.  
> - **Setting Anti-aliasing mới** (fix chữ mờ): `system.antialias` mặc định `true` trong `SettingsStorage`; `main.ts` đọc qua `loadRenderQuality()` → config `antialias`/`pixelArt` lúc boot; checkbox "Làm mịn chữ & hình" + ghi chú ở tab Hệ thống; báo chat "áp dụng khi tải lại (F5)" vì chỉ đọc lúc boot; `resetAllSettings` khôi phục kèm.  
> - **Fix DebugModal "bị loạn":** 6 object (`txtMapMain`, `txtPlayerMain`, `txtPerf`, `lbl1-3`) thiếu toạ độ → chồng ở (0,0); `renderTabButtons()` đồng bộ lại text + zone; thêm `override relayout()` (super + renderTabButtons) cho resize/UI-zoom; fix **double icon** tab (key i18n đã chứa emoji, không ghép thêm `def.icon`); button/pin label chuyển sang `mkText` (tự đổi ngôn ngữ).  
> - Xác minh: `pnpm run typecheck` **4/4 sạch**; quét script 0 chuỗi VI hardcode còn sót trong code client.  
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
| **Công cụ Debug Client** | Tách riêng: `DebugModal` (2 tab info & features), `DebugConsole` (bên phải), `DebugTrackerWidget` (chuột, player, NOCLIP) | ✅ Pass |
| **Đa ngôn ngữ Client (i18n)** | Song ngữ VI/EN, chỉ hiển thị 1 ngôn ngữ tại một thời điểm; 285 key trong `i18n/index.ts`, toggle 1-nút trong Settings > Hệ thống, tự refresh Text qua `mkText()` | ✅ Pass |
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
        ├── main.ts                 # Cấu hình Phaser (Phaser.CANVAS, Scale.RESIZE; antialias/pixelArt đọc từ Settings)
        ├── i18n/
        │   └── index.ts            # Từ điển song ngữ VI/EN (285 key): t/tr/mkText/setLang/initLang/onLangChange
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
            ├── PlayerHud.ts        # Bảng thông tin nhân vật, avatar, tiền tệ
            ├── InfoPanel.ts        # Poke Time (6x) & Real Time, biểu tượng thời tiết lớn
            ├── PartyStrip.ts       # Thẻ Pokémon mini card 86px rộng rãi (icon 28x28 + HP bar)
            ├── ChatLog.ts          # Khung chat draggable bên dưới
            ├── SettingsModal.ts    # Bảng cài đặt âm thanh, giao diện, ngôn ngữ, camera zoom
            │                        #   └─ tab `🛠 Debug`: overlay Grid/Collision/Warp, toggle 3 lớp tilemap, CLI
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

### 4.2 Tab Debug trong Settings Panel (`SettingsPanel.ts` — Phím tắt `F3` / `F2`)
Đã **dời toàn bộ nội dung `DebugModal.ts` cũ vào tab `🛠 Debug` của Settings Panel** và xoá `DebugModal.ts`.
**Phân quyền:** tab chỉ xuất hiện khi tài khoản có quyền `moderator` trở lên (role đọc từ `POST /api/auth/me`,
lưu ở `pixelmon.role`, so sánh qua thang `player=0 < moderator=1 < admin=2`). Tài khoản `banned` không bao giờ đủ quyền.

Nội dung tab gồm 4 nhóm:
1. **Công cụ hiển thị (Overlay & Layer):**
   - *Hiện thanh công cụ Debug trên Menu (Debug Toolbar)* — ẩn/hiện icon 🐞 trên TopMenu, persists `pixelmon.debugToolbar`. Tắt => ẩn hẳn phím tắt F3/F2 & icon.
   - *Lưới toạ độ ô (Grid Overlay)* — lưới 32px phủ toàn map (màu `#00cec9`, lưới chính mỗi 8 ô màu `#fdcb6e`, chấm đỏ = điểm spawn), depth `31`. Dùng chung với checkbox ở tab **Lối chơi**, persist `pixelmon.debugGrid`.
   - *Theo dõi toạ độ (Coordinate Tracking)* — nhãn `[cột, hàng]  x,y  IDLE|WALK|SLIDING` bám theo nhân vật, depth `33`, đặt phía trên bảng tên. Persist `pixelmon.debugTracking`.
   - *Vùng va chạm (Collision Overlay)* — **mới**, depth `31.5`: tô đỏ ô `BLOCKED`, xanh dương ô `WATER`, xanh lá ô `GRASS`, cam ô `LEDGE` (kèm mũi tên hướng rơi). Ưu tiên kiểm tra `BLOCKED` **trước** vì nước sâu/thác mang cờ `WATER|BLOCKED`. Persist `pixelmon.debugCollision`.
   - *Điểm chuyển map (Warp Overlay)* — **mới**, depth `32`: viền + chấm tím/vàng ở mọi ô có `type==='warp'`, đối chiếu nhanh với server JSON. Persist `pixelmon.debugWarp`.
   - *Lớp bản đồ (Tilemap Layers)* — **mới**: 3 nút toggle ON/OFF `Nền` (Ground) / `Trang trí` (Decoration) / `Che trên` (Overhead) bật/tắt `TilemapLayer.setVisible()` — kiểm tra lỗi "nhân vật bị che" hay "thiếu trang trí" không cần sửa code. Persist `pixelmon.debugLayer.<ground|decoration|overhead>` (mặc định `true`).
2. **Thông số realtime** (cập nhật mỗi frame khi tab đang mở):
   - *Map Info*: mã slug, tên, kích thước (Tiles & Pixels), tên tileset, số layer, số warp.
   - *Coordinates*: toạ độ Pixel `(X, Y)`, toạ độ Tile `[TileX, TileY]`, Hướng, Trạng thái, Speed, FPS, toạ độ Camera, Zoom.
3. **Công cụ điều khiển:** 5 nút *Quick Teleport*, 4 mức *Speed Multiplier* (`1x`–`5x`), và *Console CLI* với ô gõ lệnh HTML đặt ngay dưới khung log:

   | Lệnh | Chức năng |
   | --- | --- |
   | `/tp <x> <y>` | Dịch chuyển nhân vật đến toạ độ pixel |
   | `/tp <mapId>` | Chuyển map (VD: `/tp pokemon-lab`) |
   | `/speed <hệ_số>` | Đổi tốc độ di chuyển (VD: `/speed 3`) |
   | `/pos` | Xem toạ độ chi tiết hiện tại |
   | `/overlay <grid\|collision\|warp> <on\|off>` | Bật/tắt overlay (thiếu `on/off` → báo trạng thái) |
   | `/layer <ground\|decoration\|overhead> <on\|off>` | Ẩn/hiện 1 lớp tilemap |
   | `/help`, `/clear` | Trợ giúp / xoá lịch sử lệnh |

4. **Khung log output** + nút *Nhập lệnh CLI*, *Sao chép toạ độ*, *Xoá log*.

**Kết nối:** `SettingsPanel` nhận `canAccessDebug`, `onToggleDebugToolbar`, `onToggleGrid`, `onToggleCoordTracking`,
`onToggleCollision`, `onToggleWarp`, `onToggleMapLayer(key,v)`, `onDebugTeleport/SwitchMap/SetSpeed/RunCommand` từ `WorldScene`.
`openDebugTab()` mở Settings thẳng vào tab Debug (Icon toolbar trên TopMenu cũng gọi thẳng vào đây).

**Điều phối trạng thái & vòng đời:**
- Types dùng chung ở `SettingsPanel`: `MapLayerKey`, `MAP_LAYER_KEYS`, `MAP_LAYER_LABELS`, interface `DebugToolState` (WorldScene import sang dùng).
- `syncDebugTools()` áp **toàn bộ** state (toolbar/grid/collision/warp/tracking/3 layer) sau khi `setupDebugTools()`.
- `switchMap()` gọi lại `drawGrid()` + `drawCollisionOverlay()` + `drawWarpOverlay()` + áp lại `setMapLayerVisible()` cho map mới (layers vừa bị destroy & tạo lại).
- Overlay được `registerWorldObject()` → `uiCam.ignore()`, tránh render đôi 2 camera.
- Chỉ số object trong `layoutDebugTab` khai báo bằng hằng `I_TOOLS/I_CHK/I_LBL_LAYERS/I_LAYERS/I_MAP/I_PLAYER/I_TP/I_SPEED/I_CLI/I_LOG` (khớp thứ tự `push` của `buildDebugTab`, tổng 83 obj) — **không** dùng magic number rải rác.
- Do modal khoá cứng `MODAL_H=580`, 5 checkbox xếp **2 cột** (`colW = w/2`); tổng chiều cao content ≈ 532 + `contentContainer.y=36` = **568 < 580** (còn 12px lề).
- Reset Settings khôi phục cả 5 checkbox lẫn 3 nút toggle layer (đăng ký qua `checkboxSetters` với key `debugLayer.<key>`).

### 4.3 Hệ thống Đa ngôn ngữ (i18n) Toàn bộ Client — Song ngữ VI/EN

> **Nguyên tắc cốt lõi:** UI **chỉ hiển thị 1 trong 2 ngôn ngữ** tại một thời điểm — không bao giờ thấy song song VI + EN.

- **Module:** `apps/client/src/i18n/index.ts` — từ điển **285 key** dạng tuple `['tiếng Việt', 'English']`, bao phủ toàn bộ: Settings (4 tab), DebugModal/DebugConsole/DebugTracker/DebugInfoWidgets, ChatLog, InfoPanel, PlayerHud, TopMenu, PartyStrip, HelpModal, ConfirmModal, SelectToolsModal, PcBoxModal, PokemonSummaryModal, LoginScene, BootScene, WorldScene (logout/tile/noclip/`/help`), ColyseusManager (401).
- **API chính:**

  | Hàm | Vai trò |
  |---|---|
  | `t(key)` | Lấy chuỗi ngôn ngữ hiện tại |
  | `mkText(scene, key, style, x?, y?)` | Tạo `Phaser.Text` **đã bind key** → tự đổi khi đổi ngôn ngữ |
  | `tr(text, key)` | Bind 1 Text có sẵn vào key |
  | `setLang(lang)` / `getLang()` | Đổi / đọc ngôn ngữ, phát event |
  | `onLangChange(fn)` | Đăng ký callback khi đổi ngôn ngữ (trả về `unsubscribe`) |
  | `initLang()` | Gọi 1 lần trong `main.ts` **trước** `new Phaser.Game()` |
  | `isI18nKey(s)` | Type-guard kiểm tra key tồn tại |

- **Cơ chế tự refresh:** `setLang()` → `refreshBoundTexts()` duyệt mọi Text đã bind cập nhật lại nội dung; các modal (9 cái) đăng ký `onLangChange(() => this.setTitle(t(...)))` và dọn subscription trong `destroy()`; `SelectToolsModal` render lại grid; `TopMenu.ICONS` là **getter động** trả `t(key)` nên nhãn toolbar luôn khớp; `DebugModal` refresh label tab qua `unsubTabs`.
- **Switcher trong Settings > Hệ thống:** **1 nút toggle duy nhất** hiển thị đúng ngôn ngữ hiện tại (`Tiếng Việt` / `English`), bấm để đổi — lưu qua `SettingsStorage` (`system.lang`, fallback key cũ `pixelmon.lang`, mặc định `vi`).
- **Kết quả kiểm tra:** quét script 0 chuỗi VI hardcode còn sót trong code client; `pnpm run typecheck` 4/4 sạch.
- **Kèm theo:** đơn giản hoá nhãn Settings (bỏ chú thích lặp `(Player Names)`, `(Mini HUD)`...), thêm setting **Anti-aliasing** (`system.antialias`, mặc định `true`, đọc lúc boot ở `main.ts` → fix chữ mờ).

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

### Plan 39 — Chuyển bảng Debug vào tab Settings & thêm công cụ debug Map/Di chuyển (2026-10-02)

**Yêu cầu:** dời bảng debug vào module Settings thành 1 tab riêng, chỉ hiện khi user có quyền moderator trở lên; trong đó có tuỳ chọn hiện thanh công cụ debug; thêm tuỳ chọn hiển thị công cụ debug map & di chuyển (grid, tracking toạ độ).

- **Phân quyền role trên client (mới):** `ColyseusManager` đọc `role` từ response login + `/api/auth/me`, lưu `pixelmon.role` (kèm `saveSession/restoreSession/clearSession`), expose `role` + `hasDebugAccess()`. Thang quyền: `player(0) < moderator(1) < admin(2)`; `banned` không nằm trong thang → luôn `false`. `setProfileFromMe()` gộp cả role + sprite.
- **Tab Debug mới** trong `SettingsPanel`: `visibleTabKeys()` trả về 5 tab nếu `canAccessDebug` (chia đều `tabW = (MODAL_W-32)/5`), ngược lại 4 tab như cũ. `buildDebugTab()` dựng toàn bộ nội dung; `layoutDebugTab()` xếp dọc bằng con trỏ `curY`.
- **Port 100% nội dung `DebugModal.ts`** vào tab (Map Info, Coordinates, Quick Teleport ×5, Speed ×4, CLI `/tp` `/speed` `/pos` `/help` `/clear`, nút copy toạ độ, xoá log). **Xoá file `DebugModal.ts`.**
- **Công cụ mới:**
  - *Debug Toolbar toggle* → `TopMenu.setIconVisible(key, visible)` + `hiddenIcons: Set<string>`; `visibleIcons()`/`visibleIndexOf()` dùng cho cả 2 nhánh layout (normal & mini popup); `IconButton` thêm getter `key`/`visible` và cờ `currentVisible`. Fix luôn `setActive()` (trước đó index theo `ICONS[i]` → sai khi ẩn icon).
  - *Grid Overlay* → `gridOverlay: Graphics`, `drawGrid()` vẽ lưới 32px (`#00cec9` 0.35) + lưới chính mỗi 8 ô (`#fdcb6e` 0.8) + chấm đỏ ở spawn. Vẽ lại trong `switchMap`. Chia sẻ với checkbox "Grid Overlay" ở tab Lối chơi qua `setGridShared()` (2 checkbox luôn đồng bộ, 1 nguồn persist `pixelmon.debugGrid`).
  - *Coordinate Tracking* → `coordTracker: Text` bám nhân vật, hiển thị `[col, row]  x,y  IDLE|WALK|SLIDING`, có stroke đen.
- **Sửa lỗi phát hiện khi test:**
  1. Grid/tracker depth `15`/`35` bị tầng `Overhead` (depth **30**) của tilemap che → nâng lên `DEBUG_GRID_DEPTH=31` / `DEBUG_TRACKER_DEPTH=33` (hằng số có chú thích).
  2. Nhãn tracking đè lên bảng tên → thêm getter `PlayerSprite.nameOffsetY`, đặt ở `y - nameOffsetY - 18`.
  3. `syncDebugTools()` gọi quá sớm (trước khi `topMenu`/`gridOverlay` được tạo) → chuyển xuống ngay sau `setupDebugTools()`.
  4. `layoutDebugTab` xếp nút theo `tpW`/`cliW` cố định → lệch chồng nhau; đổi sang xếp theo **chiều rộng thật** từng nút (`_dbgSize.w` qua `debugButtonWidth()`).
  5. Ô gõ lệnh CLI (HTML input) nhảy lên sát đỉnh màn hình → lưu `logBoxLayout` lúc layout và đặt input bằng `modalContainer.getWorldTransformMatrix()` (bắt buộc, vì modal scale theo UI Zoom ~143%; tính tay bằng `contentContainer.x/y` là sai).
  6. `MODAL_H` 430 → **580** (đủ chứa tab Debug). Lưu ý: **không tăng tiếp**, vượt 580 là tràn đáy màn hình ở UI Zoom mặc định.
  7. Xung đột `onToggleGrid` (đã có sẵn ở tab Lối chơi) → bỏ bản khai báo trùng, dùng chung 1 callback.
- **API công khai mới của `SettingsPanel`:** `updateDebugInfo()`, `log()`, `openDebugTab()`, `getDebugState()`, `getActiveTab()`, `setDebugCheckbox()`.
- **Phím tắt:** `F3`/`F2` và icon Debug trên TopMenu đều gọi `WorldScene.openDebugTab()` (từ chối + báo chat nếu thiếu quyền).
- ✅ `pnpm run typecheck` 4/4 sạch; ✅ `vite build` thành công.
- ✅ Đã test trên trình duyệt: role `player` → **không thấy** tab Debug; role `admin` → thấy tab; grid + tracking hiển thị đúng & persist qua reload; toggle toolbar ẩn/hiện icon Debug trên TopMenu (relayout không lệch); F3 mở đúng tab Debug; realtime map/coords cập nhật mỗi frame.

### Plan 40 — Mở rộng tab Debug: Overlay va chạm, Overlay warp & bật/tắt lớp tilemap (2026-10-02)

**Yêu cầu:** chỉnh lại phần debug, thêm tính năng hiển thị các overlay và các chức năng bật/tắt lớp bản đồ.

**1. Overlay mới (WorldScene):**
- `collisionOverlay: Graphics` (depth `31.5`) — `drawCollisionOverlay()` duyệt toàn bộ ô, tô theo cờ `CollisionGrid`:
  - 🔴 `BLOCKED` (tường/cây/đá) — fill `#ff7675` 0.5
  - 🔵 `WATER` (cần Surf) — fill `#74b9ff` 0.45
  - 🟢 `GRASS` (gây encounter) — fill `#55efc4` 0.4
  - 🟠 `LEDGE` (vách nhảy 1 chiều) — fill `#fdcb6e` 0.5 + mũi tên hướng rơi
  - **Ưu tiên kiểm tra `BLOCKED` trước** vì nước sâu/thác mang cờ `WATER|BLOCKED` — vẽ xanh dương sẽ gây hiểu nhầm là đi được.
- `warpOverlay: Graphics` (depth `32`) — `drawWarpOverlay()` vẽ viền + chấm tím/vàng ở mọi ô `getWarpAt()` trả về warp, đối chiếu nhanh với `objects[].type==='warp'` trong server JSON.
- Cả 2 đều `registerWorldObject()` → `uiCam.ignore()` (tránh render đôi 2 camera), và được vẽ lại trong `switchMap()`.

**2. Bật/tắt lớp tilemap (WorldScene):**
- `setMapLayerVisible(key, visible)` — duyệt `tiledLayers`, khớp tên layer `.toLowerCase().includes(key)` → `layer.setVisible()`.
- `layerVisibility: Record<MapLayerKey, boolean>` giữ state; `switchMap()` áp lại cho map mới (layers vừa bị destroy & tạo lại).
- `getLayerVisibility()` expose cho Settings đọc.

**3. SettingsPanel — tab Debug:**
- Thêm 2 checkbox: *Vùng va chạm (Collision)*, *Điểm chuyển map (Warp)* — persist `pixelmon.debugCollision` / `pixelmon.debugWarp`.
- Thêm 3 nút toggle ON/OFF `Nền` / `Trang trí` / `Che trên` (helper `createToggleBtn` — tự đổi màu xanh lá khi ON, xám khi OFF, nhãn `✔/✖`). Persist `pixelmon.debugLayer.<key>` (mặc định `true`).
- Types dùng chung: `MapLayerKey`, `MAP_LAYER_KEYS`, `MAP_LAYER_LABELS`, interface `DebugToolState` (WorldScene import sang).
- **Refactor layout:** chỉ số object khai báo bằng hằng `I_TOOLS/I_CHK/I_LBL_LAYERS/I_LAYERS/I_MAP/I_PLAYER/I_TP/I_SPEED/I_CLI/I_LOG` (tổng 83 obj) thay vì magic number rải rác. 5 checkbox xếp **2 cột** (`colW = w/2`) để tiết kiệm chiều cao — modal khoá cứng `MODAL_H=580`, xếp dọc 5 checkbox sẽ tràn đáy.
- Chiều cao content mới ≈ 532 + `contentContainer.y=36` = **568 < 580** (còn 12px lề).
- Reset Settings khôi phục cả 5 checkbox lẫn 3 nút toggle layer (đăng ký qua `checkboxSetters` với key `debugLayer.<key>`).
- `setGridShared()` chuyển `private` → `public` (lệnh CLI `/overlay grid` gọi được).

**4. CLI mới (WorldScene.handleDebugCommand):**
- `/overlay <grid|collision|warp> <on|off>` — thiếu tham số 2 → báo trạng thái hiện tại.
- `/layer <ground|decoration|overhead> <on|off>` — ẩn/hiện 1 lớp tilemap.
- Cập nhật `/help` + placeholder ô gõ lệnh.

**5. Sửa lỗi phát hiện khi code:**
- `MAP_LAYER_KEYS`/`MAP_LAYER_LABELS` định nghĩa 2 lần (WorldScene + SettingsPanel) → gộp về SettingsPanel, WorldScene import sang.
- `checkboxSetters` đăng ký 2 lần với key khác nhau (`debugLayer.<key>` vs `<key>`) → thống nhất dùng `toggleKey` truyền vào `createToggleBtn`.
- Nhãn checkbox dài ("Hiện thanh công cụ Debug trên Menu (Debug Toolbar)") tràn cột 254px → rút ngắn ("Toolbar Debug trên Menu", "Lưới toạ độ ô (Grid)", ...).

- ✅ `pnpm run typecheck` 4/4 sạch; ✅ `vite build` thành công (119 modules).
- ⬜ Test trên trình duyệt (overlay hiển thị đúng màu, toggle layer ẩn/hiện đúng, persist qua reload) — chưa chạy.

### Fix Plan 2 — Sửa 3 lỗi di chuyển & vị trí đứng của nhân vật (2026-10-02)

Nguồn: `fix-plan-2.md`. Đã sửa đủ 3 vấn đề.

**1. Bấm 1 lần đi 2 ô (Double-stepping)** — `WorldScene.update()`
- Nguyên nhân: khi nhả phím, code chỉ xóa `heldDir` mà **quên xóa `bufferedDir`**. Cú tap (~100–200ms) để lại hướng trong buffer → `advanceStep()` tới tâm ô tự ép bước ô thứ 2.
- Sửa: `if (!keyDirection) { this.heldDir = null; this.bufferedDir = null; }`.
- Kết quả: tap = đúng 1 ô, dừng dứt khoát. Giữ phím vẫn đệm hướng & nối bước liên tục như cũ.

**2. Độ trễ / chuyển động lề mề** — `WorldScene.advanceStep(delta)`
- Nguyên nhân: `Phaser.Math.Linear(player.x, targetX, step/total)` là **lerp tiệm cận**, mỗi frame chỉ ăn ~11% quãng đường *còn lại* → 1 ô (32px) mất **500–650ms** thay vì 150ms, nhân vật trôi lờ đờ ở cuối ô và khoá cứng `isWalking` (input trễ nặng).
- Sửa: chuyển sang vận tốc **tuyến tính không đổi** — mỗi frame tiến đúng `step` px rồi snap khi chạm đích. Ngưỡng hoàn thành siết `remaining > 1.0` → `> 0.01`.
- **Lưu ý:** `Phaser.Math.MoveTowards` **không tồn tại** trong typings Phaser 3.90 (chỉ có `Linear`) → tự thêm helper `moveTowards(from, to, maxDelta)` (có `Math.sign`, không vượt đích) ở top-level `WorldScene.ts`.
- Kết quả: 1 ô = đúng 150ms (`WALK_SPEED_PX ≈ 213.3 px/s`), `animateWalk` nhận `progress` tuyến tính 0→1 nên chân đúng nhịp.

**3. Vị trí đứng lơ lửng ở giữa ô** — `PlayerSprite.ts`
- Nguyên nhân: `(x, y)` là **TÂM Ô** ⇒ mặt đất (đáy ô) ở `y + 16`. Nhưng `setOrigin(0.5, 1.0)` ghim đáy frame (chân) vào `y` ⇒ chân + bóng nằm ở đường giữa ô, lơ lửng 16px.
- Sửa:
  - `setOrigin(0.5, 0.75)` cho sheet `hero` (frame 64px, `(64-16)/64`), `0.5` cho `legacy` (frame 32px, `(32-16)/32`).
  - Bóng: `y + 2` → **`y + 15`** ở **cả 4 nơi** (constructor, `setPosition`, `swapSheet`, onUpdate của `jumpTo`) — sót 1 chỗ là bóng lệch vị trí khi nhân vật đi/nhảy.
  - `getNameOffsetY()`: `68` → **`52`** (đỉnh đầu ở `y - 48`, bảng tên đặt `y - 52`).
  - `swapSheet()` cũng phải đổi originY theo công thức mới (trước đây hardcode `1.0`/`0.7`) và cập nhật lại shadow.
- Hệ quả phụ: nhãn tracking toạ độ (Settings > Debug) tự dịch theo vì đã dùng `player.nameOffsetY`.

- ✅ `pnpm run typecheck` 4/4 sạch; ✅ `vite build` thành công.
- ⬜ Checklist nghiệm thu trình duyệt mục III của `fix-plan-2.md` (tap 1 ô / giữ phím / độ trễ / bàn chân đúng đáy ô / nhảy ledge) — chưa chạy.

**4. (Bổ sung sau khi chơi tay) Frame đi bộ nhảy quá nhanh** — `PlayerSprite.ts` (commit `194a58c9`)
- Nguyên nhân: sau khi sửa lỗi #2, 1 ô = **150ms**; `animateWalk` quét thẳng `floor(progress * maxFrame)` → **4 frame/150ms = 26fps**, lướt nhanh mắt thường không thấy.
- Sửa: tích luỹ **chu kỳ đi bộ** thay vì quét theo progress mỗi ô — tính `delta` của `progress` (xử lý cả lúc ô mới bắt đầu `walkProgress` reset về 0: `1 - lastWalkProgress + walkProgress`) rồi cộng vào `walkCycle`:
  - `walkCycle = (walkCycle + delta / maxFrame) % 1` → **1 chu kỳ = `maxFrame` ô** = mỗi ô advance đúng **1 frame** ≈ `WALK_FRAME_MS` (150ms, ~6.7fps).
  - Frame chỉ `setFrame` khi `frameIndex` đổi (tránh set lại frame trùng mỗi tick).
  - Reset `walkCycle`/`lastWalkProgress` ở **3 chỗ**: `!moving`, `setDirection` (đổi hướng — nếu không, quay lưng sẽ giữ nguyên frame cũ), `jumpTo` (nhảy ledge).
  - Tham số `walkProgress` mặc định đổi `0` → **`-1`**: `0` là progress hợp lệ (đầu ô), `0` trùng điều kiện `> 0` cũ → nhánh fallback timer không bao giờ chạy.
- Tính từ **quãng đường** chứ không thời gian → đổi Speed Multiplier ở tab Debug vẫn khớp nhịp chân.
- ✅ typecheck 4/4 + `vite build` OK.

### Plan 41 — Hệ thống Maps Tiled-First: thêm map chỉ bằng copy file (2026-10-02)

> Plan chi tiết: [`plan-tiled-first.md`](./plan-tiled-first.md). Tiến độ từng bước: [`plan-tiled-first-progress.md`](./plan-tiled-first-progress.md).
> **Mục tiêu:** Tiled Map Editor là nguồn vẽ map duy nhất — thêm map mới **không phải sửa code**.

#### Phase 1 — Mở đường cho Tiled (✅ hoàn thành)

**Vấn đề:** `TiledMapLoader.ts` static import cứng 5 file `.tmj` → thêm map mới phải sửa code + rebuild.

**Đã làm:**
- **`TiledMapLoader.ts`:** xoá 5 static `import ...tmj`, thay bằng `import.meta.glob('@pixelmon/shared/data/maps/tiled/*.tmj', { eager: true, import: 'default' })`.
  - Alias path resolve qua `resolve.alias` (không cần đường dẫn tương đối rườm rà).
  - Bỏ file `.tmj` tên thuần số (`2.tmj`, `5.tmj`… — output cũ của converter RMXP) qua regex `/^\d+$/`.
  - `TILED_MAP_ALIASES` tách riêng; alias chỉ ghi khi chưa trùng map thật.
  - `AVAILABLE_MAP_IDS` giờ chỉ trả **bản chính** (trước `Object.keys(TILED_MAPS)` trả cả alias).
- **`apps/server/src/app.ts`:** thêm route static `/maps/tiled` → `packages/shared/data/maps/tiled` (runtime fetch fallback).
- **`vite.config.ts`:** verify, plugin `vite-plugin-tmj-json` xử lý glob đúng, **không cần sửa**.

**Xác minh:** `pnpm run typecheck` 4/4 sạch · `pnpm --filter client build` 130 modules thành công · copy map giả `zz-test-map.tmj` vào thư mục → **tự động được nhận diện** (bundle +14.7kB) không cần sửa code, đã dọn map giả.

**Đạt được:** workflow thêm map mới giờ là: copy `.tmj` vào `packages/shared/data/maps/tiled/` → (Phase 2) `pnpm run build:map <id>` → restart. Không cần RMXP, không cần sửa code.

#### Phase 2 — Auto-gen server JSON (✅ hoàn thành, có điều kiện)

**Mục tiêu:** `pnpm run build:map <id>` sinh `server/<id>.json` từ `.tmj`, không viết tay.

**Đã làm:**
- **`scripts/build-server-map.ts` (mới):** Node 24 chạy trực tiếp TypeScript (type stripping — repo **không có** `tsx`). 5 tầng derive:
  1. Layer heuristic (plan §3.3): `Overhead≠0→BLOCKED` · `Decoration≠0→BLOCKED` · `Ground≠0→WALKABLE`.
  2. Tileset tile property (plan §3.4, ưu tiên): `passage` (0x00/0x0f), `terrain_tag` (0x02 grass / 0x06 water / 0x0a tall grass), `ledge_dir`, `water`.
  3. Object property override (`passage`/`terrain_tag`/`ledge_dir`/`water`).
  4. Warp post-pass: ô warp → `WALKABLE|WARP`, clear `BLOCKED`.
  5. Landing post-pass: ô đích warp (cùng map) → `WALKABLE`.
  - Encounters đọc từ `data/encounters.json` (route-1: 12 spawn). Metadata từ `properties` cấp map.
  - CLI: `<id...>` · `--all` · `--dry-run` · `--watch`.
- **`package.json`:** thêm `"build:map": "node scripts/build-server-map.ts"` + `"type": "module"`.

**Xác minh:** `pnpm run build:map -- --all` chạy sạch · typecheck 4/4 ✅ · backup 5 map cũ vào `temp/backup-server-json/`.

**⚠️ Phát hiện quan trọng (2.3):** So với server JSON cũ, heuristic thuần layer **sai 706/2601 ô (27.1%)**:
- 564 ô (79.9%) `blocked→walkable` — ô có tile ở Ground nhưng RMXP `passage=0x0f`.
- 127 ô (18.0%) `walkable→blocked` — ô mái nhà `y=3,4` / giữa tán cây có tile Decoration nhưng `passage=0x00`.

**Nguyên nhân gốc:** RMXP `passages` + `terrain_tags` là dữ liệu **per-tile**; TMJ **không lưu**. Converter cũ đọc `.rxdata` nên có đủ. → **Phải thêm tile property vào tileset trong TMJ (Phase 4)**; script tầng B đã sẵn sàng đọc.
**Bảo mật:** server JSON đã `git checkout` restore — game không bị ảnh hưởng, 8 warp giữ nguyên.

**Phát hiện thứ 2:** converter hiện emit **mọi** object là `type:"event"` → `build:map` cho ra **0 warp** (mất 8 warp). Converter Phase 4.1 phải emit `type:"warp"` + properties `toMap`/`toX`/`toY`/`direction`.

#### Phase 3 — Template Tiled + Quy chuẩn (✅ hoàn thành)

**Đã làm:**
- **`templates/pixelmon-map-template.tmj`** (JSON — pipeline chỉ đọc `.tmj`) + `.tmx` (XML, tham khảo). 4 layer đúng tên, tileset `outdoor`, 1 warp mẫu, map properties. Verified `build:map --dry-run` → `1 warp`.
- **`docs/tiled-workflow.md`:** 11 mục — pipeline, template, quy ước tên layer, quy ước warp, collision heuristic + tile/object property, map properties, lệnh build, verify, bảng lỗi thường gặp.
- **Fix bug:** `deriveCollision()` dùng `mapId` không truyền vào → `ReferenceError`. Đã thêm tham số.

**Lưu ý:** Tiled xuất cả `.tmj` (JSON) và `.tmx` (XML), nhưng pipeline chỉ đọc `.tmj` → template nên dùng `.tmj`.

#### Phase 4 — Migrate 5 map cũ (✅ hoàn thành)

**Đã làm:**
- **`convert_essentials_map.py`:**
  - Emit `tilesets[0].tiles[].properties` cho **mỗi tile đang dùng trong map** (chứa `passage` + `terrain_tag`) → `build:map` tầng B đọc được, tái tạo đúng collision converter gốc. File vẫn nhỏ vì chỉ emit tile dùng trong map đó (40–80 tile).
  - Emit object `type:"warp"` + properties `toMap`/`toX`/`toY`/`direction` (trước đây mọi object là `type:"event"` → `build:map` cho ra 0 warp).
  - Thêm `map.properties`: `name`/`mapType`/`music`/`weather`/`description`.
- **`build:map` cải tiến:**
  - Tầng B đọc passage trên **cả 3 layer** (Ground/Decoration/Overhead) — khớp semantics converter gốc (`BLOCKED` nếu bất kỳ layer nào có `passage 0x0f`).
  - Thêm **tầng F: cross-map landing post-pass** — ô đích warp từ map khác cũng set `WALKABLE` (tương đương `_patch_cross_map_landings()` của converter).
  - Fix: `propNumFromMap`/`propStrFromMap`/`propBoolFromMap` — `propsOf` trả `Map`, các helper cũ đọc `o.properties` (luôn `undefined`).

**Xác minh:**
- `pnpm run typecheck` **4/4 ✅**
- `pnpm run build:map -- --all` → 5 map OK, **8 warp khôi phục** (lappet-town 3, players-house 3, pokemon-lab 1, daisys-house 1)
- Collision khớp **99.96%** với `temp/backup-server-json/` — chỉ 1 ô lệch: `lappet-town (3,8)` có `passage=15` (chặn) nhưng backup ghi `WALKABLE` → **backup stale, `build:map` output đúng**.

**Đạt được:** workflow Tiled-first hoàn chỉnh — **vẽ trong Tiled → `pnpm run build:map <id>` → `./scripts/pm.sh restart`**. Không cần RMXP, không cần sửa code.

#### Phase 5 — Admin tab "Maps" (✅ hoàn thành)

**Đã làm:**
- **Backend:** route `POST /api/admin/maps/:id/regenerate` → `regenerateAdminMap()` trong `apps/server/src/modules/admin/maps.ts`. Kiểm tra `.tmj` tồn tại (404 `TMJ_NOT_FOUND` nếu chưa lưu trong Tiled), chạy `node scripts/build-server-map.ts <id>` (timeout 30s), parse log `✅ slug: WxH, N warp, M obj, K spawn` → trả `stats`.
- **Stats:** `computeMapStats()` (mới) trả về:
  - `layers: [{name, cells}]` — số ô **thực sự có tile** (không tính gid=0) cho từng tilelayer
  - `tilePropsCount` — số tile trong tileset có properties (`passage`/`terrain_tag`)
  - `collision: {total, walkable, blocked, water, grass, ledge, warp}` — phân bố bit `CollisionFlag`
  - `objects: {total, warps, events}`, `encounters`
- **Frontend (`admin.html`):** nút `♻️ Regenerate JSON` trong header tab Maps + card mới **"Thống kê Map"** (3 tbody: Tile/Layer, Va chạm, Đối tượng).
- **Frontend (`admin.js`):** `renderMapStats(stats)` gọi trong `populateMapSidebar()`; handler nút Regenerate (confirm → POST → alert kèm stats → `loadMaps()` refresh).

**Lưu ý:** 5.1–5.3 (tab mới, preview canvas, toggle layer) **đã tồn tại sẵn** từ trước Phase 5 → không làm lại.

**Xác minh:**
- `pnpm run typecheck` **4/4 ✅**
- `node scripts/build-server-map.ts daisys-house` và `--all` chạy OK — output khớp chính xác regex backend parse.

### Plan 42 — Đa ngôn ngữ (i18n) Toàn bộ Client, setting Anti-aliasing & Fix DebugModal (2026-10-02)

**Yêu cầu:** hoàn thiện tính năng song ngữ trong Settings, đảm bảo chỉ hiển thị 1 trong 2 ngôn ngữ; mở rộng ra toàn bộ UI client; đơn giản hoá nhãn settings kỳ lạ; thêm setting anti-alias (text đang quá mờ); sửa giao diện khung debug bị loạn.

**1. Hệ thống i18n (`apps/client/src/i18n/index.ts` — mới):**
- Từ điển **285 key** dạng tuple `[vi, en]` bao phủ toàn bộ UI client (xem mục 4.3).
- API: `t()`, `tr()`, `mkText()` (bind Text → tự refresh khi đổi ngôn ngữ), `setLang/getLang/initLang`, `onLangChange()`, `isI18nKey()`.
- `main.ts` gọi `initLang()` trước `new Phaser.Game()`; đọc `pixelmon.settings.system.lang` (fallback `pixelmon.lang` cũ, mặc định `vi`).
- `setLang()` → `refreshBoundTexts()` tự cập nhật mọi Text đã bind; 9 modal đăng ký `onLangChange` refresh title (dọn trong `destroy()`); `SelectToolsModal` render lại grid; `TopMenu.ICONS` getter động; `DebugModal` refresh label tab.

**2. Settings > Hệ thống — switcher 1 nút:**
- Nút toggle **duy nhất** hiển thị đúng ngôn ngữ đang dùng (bấm để đổi VI↔EN) — không hiển thị song song 2 nút.
- `setLanguage()` → `saveSettings` + `setLang(lang)`; `resetAllSettings` khôi phục kèm.

**3. Đơn giản hoá nhãn:** bỏ chú thích lặp trong ngoặc ở tab Giao diện/Lối chơi/Âm thanh — VD `Hiện tên người chơi khác (Player Names)` → `Hiện tên người chơi`, `Giao diện tối giản (Chế độ Mini HUD)` → `Giao diện thu gọn (Mini HUD)`, `Tỉ lệ Giao diện (UI Zoom):` → `Tỉ lệ giao diện:`.

**4. Setting Anti-aliasing (fix chữ mờ):**
- Nguyên nhân: `main.ts` hardcode `antialias: false, pixelArt: true`.
- `SettingsStorage`: thêm `system.antialias` (mặc định `true`, đọc/merge/reset đầy đủ).
- `main.ts`: `loadRenderQuality()` đọc setting → config `antialias`/`pixelArt` lúc boot.
- `SettingsPanel`: section "CHẤT LƯỢNG HIỂN THỊ (RENDERING)" + checkbox + ghi chú; `WorldScene` báo chat "áp dụng khi tải lại (F5)" (chỉ đọc lúc boot).

**5. Fix DebugModal bị loạn:**
- 6 object thiếu toạ độ (`txtMapMain`, `txtPlayerMain`, `txtPerf`, `lbl1-3`) → chồng ở (0,0); đã truyền đúng toạ độ.
- `renderTabButtons()` đồng bộ lại `text` + `zone` mỗi lần gọi; thêm `override relayout()` (super + renderTabButtons) cho resize/UI-zoom.
- Fix **double icon** tab: key i18n đã chứa emoji (`📊`, `⚙️`) → bỏ ghép thêm `def.icon`.
- `createSimpleButton` + `pinTxt` + label tab chuyển sang `mkText` (tự đổi ngôn ngữ).

**Xác minh:** `pnpm run typecheck` **4/4 sạch**; quét script 0 chuỗi VI hardcode còn sót trong code client.

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
