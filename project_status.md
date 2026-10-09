# Project Status — Pixelmon (Pokémon MMORPG)

> **Cập nhật lần cuối: 2026-10-09 17:46**
>
> **File này là Single Source of Truth (SSOT)** cho toàn bộ dự án — AI Agent và lập trình viên
> đọc đây để nắm kiến trúc + trạng thái ngay tức thì. Lịch sử chi tiết từng plan đã nén vào **Mục 9**;
> kế hoạch tiếp theo ở **Mục 10**.
>
> **Trạng thái hiện tại:** ✅ Typecheck 4/4 sạch · ✅ `build` 3/3 · ✅ Server+Client chạy (port 2567/5173).
> **Cải tiến & Sửa lỗi mới:**
> - **Hệ Thống Pokédex Toàn Diện (Database + Server API + Client PokedexModal):**
>   - Bảng cơ sở dữ liệu `pokedex` (PostgreSQL) lưu trữ tiến độ `seen` và `caught` cho từng người chơi.
>   - Tự động ghi nhận `seen` khi chạm trán Pokémon đối thủ trong trận đấu và `caught` khi ném bóng bắt thành công hoặc sở hữu trong Party / PC Box.
>   - Giao diện `PokedexModal` sang trọng 720×520 px: Header đèn sensor cyan phát sáng, thống kê tiến độ thời gian thực (X gặp / Y bắt / 898 loài), tìm kiếm tên/số Dex, lọc 3 tab (Tất cả / Đã gặp / Đã bắt), lọc 18 hệ nguyên tố, danh sách cuộn mượt mà, khung chi tiết loài với bệ battler sprite to rõ, nút phát tiếng kêu Cry (`SoundManager.playCry`), 6 thanh Base Stats đo lường màu sắc và chuỗi cây tiến hoá tương tác.
> - **Maps Lớn — Hệ Thống Bản Đồ Vùng Essen (TownMapModal / World Map):**
>   - Trích xuất dữ liệu địa lý toàn bộ vùng Essen vào `packages/shared/data/town_map.json` với 26 điểm địa danh và tuyến đường kết nối.
>   - Giao diện `TownMapModal` 600×480 px: Bản đồ trung tâm 480×320 px, con trỏ Player nhấp nháy định vị vị trí hiện tại theo thời gian thực (`getTownMapCoords`), các điểm POI phân cấp với khung ngắm tương tác, tra cứu loài Pokémon hoang dã xuất hiện tại từng khu vực từ `encounters.json`.
> - **Tinh Chỉnh Giao Diện Chuẩn Xác & Hợp Logic:**
>   - Đồng bộ TopMenu: Nhấp biểu tượng Pokédex mở `PokedexModal`, nhấp Bản đồ mở `TownMapModal`, tự động cập nhật đèn viền active và đóng modal cũ khi mở modal mới.
>   - Hệ thống phím tắt trực quan: `D` (Pokédex), `M` (Bản đồ thế giới), `B` (Túi đồ), `P` (Đội hình), `H` (Hướng dẫn), `ESC` (Đóng modal).
>   - Âm thanh retro: Mở Pokédex phát `gui_pokedex_open`, mở Town Map phát `gui_menu_open`, đóng phát `gui_menu_close`.
>   - Lệnh chat mới: `/pokedex` (`/dex`), `/map` (`/townmap`).
> - **Rà Soát & Khắc Phục Lỗi Logic & Giao Diện Toàn Diện (Audit & Bug Fixes):**
>   - **Khắc phục lỗi kích hoạt trận đấu Trainer**: Đồng bộ tên sự kiện giữa client (`start_trainer_battle`) và server (`trainer_battle` / `start_trainer_battle`), hỗ trợ tra cứu linh hoạt `trainerId`, `npcId`, hoặc `trainerName` trong `WorldRoom`.
>   - **Trích xuất & hiển thị NPC chính xác trên toàn bộ 13 bản đồ**: Nâng cấp bộ chuyển đổi `convert_essentials_map.py` và `build-server-map.ts` tự động nhận diện các event nhân vật từ RMXP, gán đúng `type: "npc_spawn"`, trích xuất lời thoại gốc (loại bỏ escape codes), phân loại trainer và gán đúng sprite tương ứng (`brock`, `mom`, `oak`, `daisy`, `kurt`, `nurse`, `scientist`, `namerater`, `youngster`, `guide`, `citizen`). Đã khắc phục triệt để lỗi không có NPC nào xuất hiện trên map.
>   - **Sửa lỗi hiển thị Battle Log trong trận Trainer**: Cập nhật `atkLabel` trong `BattleRoom.executeMove` hiển thị chuẩn danh tính huấn luyện viên đối thủ (`"Brock's Geodude used Tackle!"`) thay vì log nhầm `"The wild Geodude"`.
>   - **Tối ưu SoundManager audio loading**: Lắng nghe sự kiện tải riêng biệt `filecomplete-audio-${key}`, kiểm tra trạng thái `load.isLoading()` tránh xung đột và cảnh báo loader chạy song song.
> - **Hệ Thống Trainer NPC Battle & Phần Thưởng Chiến Thắng (Colyseus + Phaser 3):**
>   - Đã đồng bộ và nạp 20 Trainers từ PBS Essentials (`packages/shared/data/trainers.json`): Brock, Camper Liam, Youngster Ben, Rocket Grunts, Rival Blue,...
>   - Server `BattleRoom`: Tự động nhận diện trận đấu Trainer (`isTrainer: true`), khởi tạo đúng danh tính đối thủ (`foe.playerId = 'trainer'`), khóa quyền bắt bóng Poké Ball đối với Pokémon đã có chủ, thưởng tiền `rewardMoney` vào database người chơi và phát broadcast qua Presence khi hoàn thành.
>   - World Server `WorldRoom`: Khởi tạo trận đấu Trainer qua `initiateTrainerBattle`, sinh đội hình chuẩn cấp độ và moveset từ template, đồng bộ danh sách `defeatedTrainers` và lắng nghe sự kiện `trainer_defeated`.
> - **Khắc Phục Toàn Diện 100% Item Icons Còn Thiếu:**
>   - Kiểm tra và liên kết toàn bộ 693 vật phẩm trong `packages/shared/data/items.json` với kho asset.
>   - 106 đĩa TM/HM được gán tự động sang đĩa theo hệ chiêu thức tương ứng (`machine_<type>.png`, `machine_hm_<type>.png`).
>   - 175 vật phẩm còn lại (đá tiến hoá, kẹo exp, hoá thạch, đĩa bộ nhớ, mật hoa...) được liên kết chính xác sang sprite hợp lệ (`shinystone.png`, `rarecandy.png`, v.v.). Tỷ lệ icon hợp lệ đạt **100% (693/693)**.
> - **Hệ Thống NPC Cooldown & Quản Lý Trạng Thái Trainer Bị Đánh Bại:**
>   - Quản lý trạng thái NPC thông minh trên `WorldScene`: lưu danh sách Trainer đã bị đánh bại vào `defeatedTrainers` (persist qua LocalStorage theo user) và ghi nhận thời gian cooldown tương tác (3s chống spam, 60s tái đấu).
>   - Tương tác thông minh: Khi nói chuyện với NPC Trainer đã thắng, NPC sẽ phát thoại chúc mừng thay vì khiêu chiến lại.
> - **Hệ Thống Lệnh Debug Mới Cho Trainer & NPC:**
>   - `/trainer <id>`: Kích hoạt trực tiếp trận đấu với bất kỳ trainer nào (VD: `/trainer camper_liam`, `/trainer leader_brock_brock`).
>   - `/npclist`: Quét và liệt kê chi tiết toàn bộ NPC trên bản đồ hiện tại kèm toạ độ, phân loại, trạng thái đã đánh bại và thời gian cooldown còn lại.
>   - `/resetnpc [id|all]`: Xoá trạng thái đã đánh bại của một NPC hoặc toàn bộ NPC, đặt lại cooldown ngay lập tức.
>   - `/cooldown <seconds>`: Điều chỉnh thời gian cooldown tương tác NPC trực tiếp trong runtime.
> - **SoundManager Nền Tảng Cho Game Client (`apps/client/src/audio/SoundManager.ts`):**
>   - Nạp các file âm thanh từ `packages/shared/assets/audio/`: BGM (`battle_trainer`, `battle_wild`, `battle_victory_trainer`, `title`...) và SE (`gui_menu_open`, `battle_throw`, `battle_ball_shake`, `battle_catch_click`, `battle_flee`...).
>   - Tích hợp tự động vào `BattleModal` và `WorldScene` mang lại trải nghiệm âm thanh sống động.
> - **Điều Chỉnh Hoàn Chỉnh Lớp Decoration & Overhead Theo RMXP Priorities:**
>   - Đã tái cấu trúc bộ chuyển đổi `convert_essentials_map.py` và render `TiledMapLoader.ts` theo đúng kiến trúc RPG Maker XP:
>     - **Ground (depth 10):** Tầng nền gạch, thảm cỏ cơ bản (`z=0`, priority 0).
>     - **Decoration (depth 12):** Các vật thể trang trí trên mặt đất/sàn nhà vẽ **dưới nhân vật** (`priority == 0` từ `z=1` hoặc `z=2`): thảm sàn, bàn, ghế, tủ, hoa cỏ, rào chắn. Đã giải quyết triệt để lỗi chiếc ghế/bàn che mất mẹ hay NPC trong nhà, cũng như rào chắn bị đẩy nhầm lên lớp trên.
>     - **Overhead (depth 30):** Các vật thể che trên đầu nhân vật (`priority > 0` từ `z=1` hoặc `z=2`): tán cây, mái nhà, đèn trần cao.
>   - Chuyển đổi và đồng bộ lại toàn bộ 13 bản đồ (Region 1 + Cedolan City + Indoors), build lại `packages/shared/data/maps/server/` và `.tmj` đồng bộ 100%.
> - **Import Hoàn Chỉnh Hệ Thống Nội Thất (Indoors) Cedolan City:**
>   - Đã chuyển đổi và kết nối toàn bộ 6 bản đồ nội thất của đại thành phố Cedolan từ Essentials v21.1:
>     - `cedolan-poke-center` (Map 009, 20×15): Pokémon Center trung tâm kèm Y tá Joy (`Nurse Joy`).
>     - `cedolan-gym` (Map 010, 20×17): Nhà thi đấu Cedolan Gym kèm Gym Leader Brock.
>     - `pokemon-institute` (Map 011, 20×15): Viện nghiên cứu Pokémon kèm nhà khoa học hoá thạch Carl (`Scientist Carl`).
>     - `cedolan-condo` (Map 012, 20×15): Khu chung cư Cedolan Condo kèm chuyên gia đổi tên (`Name Rater`).
>     - `game-corner` (Map 013, 20×32): Sòng bài Rocket Game Corner & khu đổi thưởng lớn.
>     - `cedolan-dept-1f` (Map 014, 20×17): Tầng 1 Trung tâm Thương mại Cedolan Dept Store với 2 cửa đôi & thang máy.
>   - Hệ thống warp 2 chiều tự động: Cửa ngoài thành phố Cedolan City bước vào trong nhà, và thảm cửa trong nhà bước ngược ra đúng mặt phố.
>   - Đăng ký đầy đủ toàn bộ 13 bản đồ vào `MAPS` constant và `CollisionGrid` client/server, biên dịch sạch sẽ qua `pnpm run build:map`.
> - **Mở rộng Bản đồ Vùng 1 — Import Kurt's House (Map 006) & Cedolan City (Map 007):**
>   - Đã chuyển đổi hoàn chỉnh 2 bản đồ tiếp theo sau Route 1 từ Pokémon Essentials v21.1:
>     - `kurts-house` (20×15): Căn nhà nội thất của thợ làm bóng Kurt, liên kết cửa tại `(11, 6)` trên Route 1 và cửa ra tại `(6, 8)` trong nhà; tích hợp NPC Kurt (`NPC 18`) với lời thoại chế tạo Poké Ball.
>     - `cedolan-city` (60×43): Đô thị trung tâm sầm uất phía Bắc Route 1, kết nối 4 cổng warp 2 chiều `(18..21, 0)` trên Route 1 sang `(16..19, 42)` của Cedolan City; tích hợp các NPC tuần tra (Officer Jenny, Citizen).
>   - Cập nhật tự động hệ thống warp 2 chiều giữa Route 1, Kurt's House và Cedolan City.
>   - Đăng ký đầy đủ vào `MAPS` constant và `CollisionGrid` client/server, tự động biên dịch lại qua `pnpm run build:map`.
> - **NPC Cốt truyện, Spawns & Hệ thống Hội thoại Retro (Region 1 / Essentials v21.1):**
>   - Đã đồng bộ toàn bộ dữ liệu Encounter chính xác từ PBS Essentials v21.1 (`encounters.txt`) cho Vùng 1 (`route-1`, `lappet-town`).
>   - Trích xuất và nạp sprite NPC gốc RMXP 32×48 chuẩn (`oak`, `mom`, `daisy`, `guide`, `youngster`).
>   - Đặt NPC đúng vị trí cốt truyện Pokémon: Giáo sư Oak (Pokemon Lab), Mẹ (Player's House), Daisy (Daisy's House), Người hướng dẫn (Lappet Town), Youngster Joey (Route 1).
>   - Tích hợp va chạm NPC: Nhân vật không thể đi xuyên qua NPC (`canEnterTile` chặn ô chứa NPC).
>   - Hệ thống hội thoại `DialogueModal`: Hiệu ứng typewriter gõ từng chữ chân thực, avatar, hỗ trợ phím Space/Enter hoặc Click để nói chuyện (bấm trực tiếp lên NPC hoặc quay mặt vào NPC và bấm Space).
> - Hoàn thiện trải nghiệm Túi đồ (`BagModal`), Dropdown phân loại và Cơ chế Trang bị / Sử dụng vật phẩm:
>   - **Khắc phục triệt để lỗi Dropdown không chọn được:** Bổ sung lớp `backdropZone` chặn đóng menu khi click ra ngoài mà không cản trở tương tác danh sách phân loại; loại bỏ xung đột với `canvasClick`; đưa dropdown container lên layer trên cùng (`bringToTop`).
>   - **Tinh chỉnh tỷ lệ & Padding đối xứng hoàn mỹ:**
>     - Hàng trên: Ô Search (280px) và Dropdown (286px) cách nhau 10px, tổng chiều rộng khớp chuẩn 576px.
>     - Cột trái: Lưới 5×5 (270×270px) + Thanh phân trang (270×28px), tổng chiều cao 306px.
>     - Cột phải: Khung chi tiết (286×306px) cân xứng tuyệt đối với đáy cột bên trái.
>   - **Cơ chế Dùng (USE) & Trang bị (HOLD) chuẩn chỉnh qua Mini Party Box (`PartySelectModal`):**
>     - Bấm **USE**: Luôn mở Mini Party Box để người chơi chọn trực quan Pokémon muốn áp dụng; tự động lọc thông minh: đối với vật phẩm hồi sinh (`Revive`, `Max Revive`) cho phép chọn Pokémon đã ngất (`filterAlive: false`), các vật phẩm hồi máu/buff/tiến hoá chỉ chọn Pokémon còn sống (`filterAlive: true`).
>     - Bấm **HOLD (EQUIP)**: Luôn mở Mini Party Box chọn bất kỳ Pokémon nào trong đội hình (`filterAlive: false`) kèm gợi ý `Gán vật phẩm cho Pokémon nào?`. Phía server xử lý swap item chuẩn xác qua DB transaction (thu hồi item cũ về túi, gắn item mới vào Pokémon) và realtime cập nhật lại giao diện túi đồ.
> - Hỗ trợ vật phẩm hồi sinh (`Revive`, `Max Revive`) ngay trong trận chiến (`BattleRoom` & `BattleModal`):
>   - Sửa lỗi server chặn cứng `Revive can only be used outside battle`: chuyển sang hồi sinh trực tiếp cho Pokémon được chọn trong đội (hồi 50% max HP với Revive, 100% với Max Revive, xoá trạng thái bất thường).
>   - Phía Client: Tự động mở Mini Party Box (`PartySelectModal`) khi chọn Revive, kiểm tra điều kiện mục tiêu phải là Pokémon đã ngất (`currentHp <= 0`), ngăn chặn dùng nhầm lên Pokémon còn sống.
>   - Bổ sung Revive vào danh mục `medicine` và hiển thị tóm tắt hiệu ứng chi tiết trong Battle Bag.
> - Khắc phục triệt để lỗi cơ chế Pokémon fainted (ngất/gục) trong trận đấu (`BattleRoom`):
>   - Bảo vệ chuyển đổi trạng thái (state machine): Ngăn chặn triệt để tình trạng race condition gọi `nextTurn()` đè mất phase `'switch'` khi Pokémon bị đánh bại trong mọi tình huống (sau lượt chiêu, đổi Pokémon, bỏ chạy, dùng vật phẩm, ném bóng).
>   - Khởi tạo trận đấu thông minh: Tự động chọn Pokémon còn sống (`currentHp > 0`) đầu tiên trong đội hình thay vì mặc định vị trí 0, tránh tình trạng vào trận với Pokémon đã ngất.
>   - Khóa thao tác khi fainted: Chặn gửi chiêu hoặc auto-chọn chiêu từ `turnTimer` khi Pokémon hiện tại đã gục; bắt buộc chuyển sang màn hình chọn đổi Pokémon.
>   - Bảo vệ ngoài map (`WorldRoom`): Chặn kích hoạt wild encounter nếu toàn bộ Pokémon trong đội của người chơi đều đã ngất (`aliveCount === 0`).
> - Tinh chỉnh giao diện Mini Party Box (`PartySelectModal`): mở rộng chiều ngang cân đối (264px slot, 292px modal), phân tầng thông tin rõ ràng (Tên + Giới tính + Lv bên trái, Badge trạng thái PAR/PSN/BRN/FRZ/SLP/FNT góc phải, thanh HP bar tách biệt với chỉ số máu HP/MaxHP).
> - Căn giữa nút Huỷ (Cancel), tự động tính toán padding/offset hoàn toàn đối xứng, bổ sung hiệu ứng hover viền neon cyan hiện đại.
> - Tái sử dụng `PartySelectModal` (mini party box) khi bấm vào vật phẩm hồi phục/chữa trạng thái trong Battle Bag: hiển thị popup chọn Pokémon cụ thể trong đội 6 con (kèm live HP, level, icon, trạng thái).
> - Server & Client hỗ trợ `battle_item` với `targetIndex`: áp dụng hiệu ứng heal/cure_status chính xác cho Pokémon được chọn trong đội và đồng bộ cập nhật database.
> - Giữ mở cửa sổ Bag trong Wild Battle khi ném bóng / dùng item để người chơi không phải bấm lại liên tục.
> - Khoá hiển thị & thao tác các vật phẩm không được dùng trong PvP / PvE Trainer Battle (Poké Ball).
> - Điều chỉnh nhịp độ trận đấu: Giãn cách 1100ms giữa 2 chiêu thức, hiệu ứng rung giật & chớp nhấp nháy 5 lần khi Pokémon nhận sát thương trước khi chiêu tiếp theo thi triển.
> - Fix bắt Pokémon không lưu vào DB / PC Box do sai định dạng JSONB của cột `nature`.
> **Tiếp theo:** **Plan 44g..44j, Plan 45 & Plan 47 (PvP) hoàn tất** — Xem Mục 10: Ưu tiên tiếp theo cho NPC & Hội thoại, Âm thanh BGM/SFX và PvP trade.

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
| **Admin Dashboard** | Users, Sprites, Game Data, Maps (interactive canvas preview), Items & Trades | ✅ |
| **Đa ngôn ngữ (i18n)** | Song ngữ VI/EN, 300+ key, toggle 1-nút trong Settings | ✅ |
| **Di chuyển** | Tile-based + delta grid-step + input buffering + A* | ✅ |
| **Warp & collision** | Server-authoritative, 8 warp khép kín, ledge 4 hướng, grass/surf, **passage 4 hướng (Plan 46)**, **Overhead walkable + render che trên player** | ✅ |
| **Debug tools** | Tab `🛠 Debug` (Settings), overlay grid/collision/warp/passage, CLI, 4 widget | ✅ |
| **Wild encounter + Battle** | `battle_init` token → `BattleModal` popup + `BattleRoom` combat thật · **Hệ thống bắt Pokémon Gen 3–8/Essentials hoàn chỉnh + Battle Scene Retro-Modern Dark UI + Khung Bag trong trận có Search, Phân loại 4 tab & xem hiệu ứng** | ✅ |
| **Chat lệnh debug** | Ô nhập cố định trong ChatLog, route `/` → `handleDebugCommand`, **`/spawn [tên|dex] [lv] [shiny] [key=val...]`**, `/tile` `/clear` `/debug …` | ✅ |
| **Items / Evolution / Store** | Plan 45 — Phase 0–7 hoàn tất (Database, Inventory Service, StoreModal, Evolution, Trade NPC, Admin Dashboard) | ✅ |
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
├── docs/                           # Tài liệu kỹ thuật, nghiên cứu và kế hoạch triển khai
│   ├── plans/                      # Lưu trữ chi tiết các kế hoạch đã triển khai
│   ├── sprite-import-guide.md      # Hướng dẫn import sprite
│   └── tiled-workflow.md           # Quy trình thiết kế & build map với Tiled
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
│       ├── formulas/               # combat, stats, generator, encounter, learnset, mapruntime, evolution, items |
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
│           ├── items/              # inventory.service.ts (± item trong transaction) + bagApi.ts (REST túi đồ)
│           ├── store/              # store.service.ts (mua/bán, tiền trong transaction)
│           ├── evolution/          # evolution.service.ts (tryEvolve/useStone/force/reverse/level/friendship/holdItem)
│           ├── events/             # eventLog.ts (ghi pokemon_events: xp/level_up/evolve/item_used/trade/catch/money)
│           ├── world/              # Colyseus WorldRoom (move, warp, encounter, chat, debug, item/store/trade/mod)
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
            ├── TopMenu.ts          # Toolbar (Bag, Dex, Team, Store, Trade, Settings, Debug)
            ├── BagModal.ts         # 🎒 Túi đồ (Plan 45) — dùng/gán item, nhóm pocket
            ├── StoreModal.ts       # 🏪 Cửa hàng buy/sell (Plan 45)
            ├── TradeModal.ts       # 🤝 Giao dịch NPC (Plan 45)
            ├── EvolveModal.ts      # ✨ Tiến hoá (Plan 45) — nhận message `evolved`
            ├── PartySelectModal.ts # 📋 Mini party box — chọn Pokémon cho switch/dùng item/gán item
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
- **`PartySelectModal`** (Plan 45) — mini party box dùng chung cho mọi tác vụ chọn Pokémon ngoài trận (dùng item, gán item, `/switch`). 6 slot: icon + Lv + HP bar + badge 🎒 held item.
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

> 🔧 **Fix 2026-10-10 (panel debug):** `DebugConsole` mất ô nhập lệnh sau close→mở lại (`removeInput()` xoá DOM, `show()` không tạo lại — đã tạo lại khi thiếu) · card Server + perf widget bỏ số liệu bịa (`Ping: <20ms`/`15`, `players: 1`) → dùng trạng thái kết nối + số người trong room thật, ping hiện `—` (chưa có cơ chế đo). Còn dead-code: `onTeleport`/input X-Y trong DebugModal không có UI gọi (teleport toạ độ chỉ còn qua `/tp` console).

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
        nature TEXT, gender TEXT,
        held_item TEXT,                    -- Plan 45: item đang cầm trên Pokémon
        friendship SMALLINT DEFAULT 70)    -- Plan 45: friendship (evolution)

-- sprite_catalog: thư viện sprite (12/16 frame chuẩn)
sprite_catalog(id UUID PK, name UNIQUE, mode, sheet_url, source_url, frames JSONB,
               frame_w, frame_h, frame_count, created_by, timestamps)

-- inventory: TÚI ĐỒ (Plan 45 — ĐÃ DÙNG, xem modules/items/inventory.service.ts)
inventory(owner_id UUID → users, item_id TEXT, quantity INT, PRIMARY KEY(owner_id,item_id))

-- Plan 45 — bảng mới (đã migrate idempotent):
-- pokemon_events: nhật ký event (event feed + audit + chống gian lận)
pokemon_events(id UUID PK DEFAULT gen_random_uuid(), user_id UUID, pokemon_id UUID,
               kind TEXT,                    -- xp_gain|level_up|evolve|item_used|trade|catch|money
               payload JSONB DEFAULT '{}', created_at TIMESTAMPTZ)

-- pokemon_evolution_history: lịch sử tiến hoá (from → to, method, ai ép)
pokemon_evolution_history(id UUID PK, pokemon_id UUID, user_id UUID,
                          from_species_id TEXT, to_species_id TEXT, method TEXT,
                          moderator_id UUID, created_at TIMESTAMPTZ)

-- trade_sessions: session trade (giữ sẵn cho PvP — Phase 4b)
trade_sessions(id UUID PK, a_user_id UUID, b_user_id UUID,
               status TEXT DEFAULT 'pending', expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
```

> ✅ **Migration Plan 45 đã áp** (idempotent, chạy trong `initDatabase()`): thêm `pokemon.held_item`,
> `pokemon.friendship` + 3 bảng `pokemon_events` · `pokemon_evolution_history` · `trade_sessions`.

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
| Items | `GET` | `/api/inventory` (túi đồ đã enrich) · `/api/inventory/money` · `/api/inventory/events` (event feed) · `/api/inventory/store` (STORE_STOCK) | User |
| Items Admin (P7) | `GET` | `/api/admin/items/overview` · `/api/admin/items/top-spenders` · `/api/admin/evolution/history` · `/api/admin/events` | Admin |
| Static | `GET` | `/maps/tiled/*.tmj` (route Tiled-First) | Công khai |

### 7.2 Colyseus Rooms (`ws://localhost:2567`)
| Room | Giới hạn | Message nhận | Trách nhiệm |
| :--- | :---: | :--- | :--- |
| **`world`** (1/map) | 50 | `move` · `teleport` · `change_map` · `chat` · `debug_spawn` · **`use_item`** · **`hold_item`** · **`store_action`** · **`trade`** · **`mod_action`** | Validate bước, roll encounter, flush DB, broadcast chat, ±item/đổi tiền/tăng level/ép tiến hoá (Plan 45) |
| **`battle`** | 2 | `battle_move` · `battle_switch` · `battle_run` · `battle_catch` · `battle_item` · `battle_forfeit` | Combat theo lượt, calcDamage, EXP + level-up + auto-evolve + eventLog, ghi DB |
| Message nhận từ server | | `player_moved_map` · `move_rejected` · `battle_init` · `debug_msg` · `battle_need_switch` · `chat` · **`bag_update`** · **`evolved`** | Client xử lý |

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
| **45** | **Items/Evolution/Tiền tệ/Trade** — Phase 0 foundation (ItemSchema+`pocket`, `formulas/evolution.ts` thay `evolveSpecies` hỏng, migration idempotent) · Phase 1 items (`inventory.service` transaction, `GET /api/inventory`, `resolveItemEffect` registry, dùng ngoài trận, **`battle_item` thật**) · Phase 2 store (buy/sell transaction, `PlayerState.money` sync HUD, `STORE_STOCK`, `StoreModal`) · Phase 3 evolution (`tryEvolve` recompute stats, hook sau level-up, `eventLog`, stone qua `use_item`) · Phase 5 modtools (`/forceevolve` `/reverseevolve` `/leveldown` `/levelup` `/forcefriend`, role check + audit log) · Phase 6 UI (`BagModal`/`StoreModal`/`TradeModal`/`EvolveModal`, +60 key VI/EN) | ✅ server + client core |
| **45b** | **Fix double-render modal** — `UiModal` tạo sau `setupUiCamera()` không được add vào `getHudObjects()` → cả world camera lẫn UI camera render → 2 khung chồng nhau (chỉ click phần nhỏ). Fix: thêm 4 modal Plan 45 vào `getHudObjects()` + gỡ lệnh `registerHudObject()` no-op (chạy trước `uiCam` tồn tại). Kiểm chứng bằng `cameraFilter=1` + `cameras.main.renderList` không còn modal | ✅ |
| **45c** | **`PartySelectModal`** — mini party box dùng chung chọn Pokémon ngoài trận (dùng item / gán item / `/switch`). `WorldScene.openPartySelect()` helper · `BagModal` dùng picker · lệnh `/switch <slot>` + `swapPartySlots()` | ✅ |
| **45d** | **Phase 6 UI hoàn tất** — `StoreModal` nối endpoint `GET /api/inventory/store` (fix placeholder $0) · `PartyStrip` badge 🎒 held item (mini+normal) · `PokemonSummaryModal` tab thứ 4 **"Vật phẩm"** (đeo/tháo + nút Mở Túi đồ, `onOpenBag` callback) · `BattleModal` menu **BAG** (mode `bag`, fetch `fetchInventory` → `sendBattleItem`) — grid FIGHT/POKEMON/BAG/BALL/RUN, keyboard 3=BAG/4=BALL/5=RUN · `bag_update` → `loadPlayerPokemon()` sync held_item · i18n +8 key | ✅ |
| **45e** | **Phase 7 Admin Dashboard — Items & Trades** — API mới: `GET /api/admin/items/overview` (phân bố túi đồ), `/items/top-spenders` (top tiền), `/evolution/history` (lịch sử tiến hoá + moderator), `/events` (event feed filter theo kind) · Tab "🎒 Vật phẩm & Giao dịch" với 4 sub-tab (phân bố / top tiền / lịch sử tiến hoá / nhật ký sự kiện) · i18n +20 key admin. Verify qua curl: 1406 ô đồ, 192k item, 693 loại, 6 người chơi có đồ | ✅ |
| **45f** | **Battle: bỏ nút BALL riêng, gộp vào khung BAG** — grid lệnh còn 2×2 FIGHT/POKÉMON/BAG/RUN (keyboard 1–4); khung BAG liệt kê item trong battle, **ball xếp đầu** (nền tím, ném qua `battle_item` — server đã trừ item + validate ownership), có nút cuộn ▲▼ khi item nhiều, chặn đá tiến hoá/rare candy/lucky egg (server từ chối trong battle) · server `battle_catch` (legacy) nay gọi `handleBattleItem` → hết bug ném ball miễn phí · xoá `sendBattleCatch` + key i18n `BATTLE_BALL` | ✅ |
| **44g** | **Nâng cấp lệnh `/spawn` ngắn gọn & chi tiết + dọn dẹp repo** — parser `parseSpawnCommand` linh hoạt (ngắn gọn: `/spawn pikachu 50 s`, chi tiết: `level=50 shiny=true nature=timid held=light-ball iv=31 moves=... hp=1`) · tìm kiếm thông minh `findSpecies` + gợi ý `suggestSpecies` · trợ giúp `/spawn help` · giữ nguyên thuộc tính custom khi bắt thành công · dọn dẹp các file rác mồ côi (`demo-daisys-house.tmj`, `scaffold_archive_sep30`, `temp/`, screenshot cũ), tổ chức file md vào `docs/` | ✅ |
| **44h** | **Hoàn thiện tính năng Bắt Pokémon toàn diện** — Chuẩn hóa công thức bắt Gen 3–8/Essentials (sửa lỗi tỷ lệ 0 khi full HP) · Đầy đủ hệ số các loại Ball (Net/Dive/Nest/Repeat/Timer/Quick/Dusk/Fast/Level/Master...) · Cơ chế tính số lần lắc (0..3 shakes) + Critical Capture · Diễn hoạt ném bóng parabol, hút Pokémon, rơi nảy đất, lắc bóng $\pm 24^\circ$, hiệu ứng sao vàng (caught) hoặc bung bóng (break free) · Modal tổng kết chiến lợi phẩm kèm nút đổi biệt danh (nickname) tức thì · Lưu DB an toàn: chống trùng `party_slot`, lưu `poke_ball`, hiệu ứng Heal/Friend/Luxury Ball, ghi nhật ký `logCatch` | ✅ |
| **45g** | **Tối ưu hiển thị Item Party & Tiền tố `S.` cho Shiny** — Thay thế emoji 🎒 đè tràn text bằng dấu vát góc trên bên trái (corner notch) và viền vàng hổ phách cạnh trái slot · Không che chữ Lv hay icon · Thêm tiền tố `S. ` ở phía trước tên và cấp độ cho Pokémon Shiny đồng bộ xuyên suốt `PartyStrip`, `PartySelectModal`, `PokemonSummaryModal`, `BattleModal` | ✅ |
| **44j** | **Tối ưu giao diện khung dùng Item trong trận** — Tái cấu trúc khung BAG trong `BattleModal`: thanh tìm kiếm thời gian thực (Search bar) tìm theo tên / hiệu ứng (HTML input bám toạ độ, chống nuốt phím tắt battle khi gõ, nút ✕ xóa nhanh) · Phân loại 4 tab trực quan (Tất cả / Bóng 🔴 / Thuốc 🧪 / Buff ⚔️) kèm bộ đếm số lượng realtime · Thiết kế thẻ vật phẩm 34px chuyên nghiệp (icon sprite/emoji, tên, hiệu ứng tóm tắt song ngữ VI/EN `+50 HP`/`Tỉ lệ bắt ×2.0`, pill badge số lượng `×N`) · Phân trang 6 thẻ/trang + cuộn chuột (mouse wheel) · Empty state thông minh có nút "↺ Đặt lại bộ lọc" · +8 i18n key | ✅ |

**Bug đã fix đáng chú ý (Plan 38–45c):** terrain tag 2/10 bị gán nhầm ledge → grass · `resolveSpawnTile` (warp bị chia 32 → rơi góc trái) · Vite dep cache thiếu export → đen màn hình · `rebuildIndex` mất 4 map · battle render 2 khung · listener leak `onStateChange` · marker `/tile` hiện 2 ô (thiếu `uiCam.ignore`) · `is_terrain` trả sai do `grass_zone` inject · `passage=13` bị bỏ qua (walkable toàn phần) · **modal Plan 45 render 2 khung chồng nhau** (thiếu `getHudObjects()`) · **script server treo** do import barrel `config/index.js` kéo Redis giữ event loop · **tràn khung preview Item** (`PokemonSummaryModal` tab Vật phẩm lòi khỏi modal 8px; `BagModal` & `StoreModal` preview tràn đáy 18px và tràn viền phải — tái cấu trúc layout 560×400 cân xứng 100%) · **tràn text ô Party do emoji item** (bỏ 🎒, chuyển sang corner notch + viền cạnh trái; hiển thị tiền tố `S.` chuẩn cho shiny) · **kẹt lượt đánh server** (`checkResolveTurn` kiểm tra `foe.selectedMove < 0` trong trận wild khiến chiêu thức người chơi không bao giờ kích hoạt lượt đánh; sửa thành chỉ kiểm tra `ally.selectedMove < 0` vì foe là AI) · **tương tác skill & item card** (tách zone cuộn chuột, luôn tạo interactive zone cho `moveRow` bất kể `info` đã nạp xong hay chưa).

---

## 10. Kế hoạch Tiếp theo (Roadmap)

### 🎯 Ưu tiên hiện tại: **Plan 45 — Items, Evolution, Tiền tệ, Trade** — ✅ **HOÀN THÀNH** (Phase 0–7)
> **Chi tiết đầy đủ:** [`.plans/plan-45-items-evolution.md`](./.plans/plan-45-items-evolution.md) (gitignored, local)
>
> ✅ **Plan 45 đã hoàn thành 2026-10-07** — Phase 0–7 xong. Xem Mục 9 (Plan 45/45b/45c/45d/45e).

**Chẩn đoán đã verify:** `inventory` table tồn tại nhưng **không module nào dùng** · `Item.effect = None`
(693 item) · đá tiến hoá là `category:'misc'` (**0 item `evolution`**) · `pocket` bị `ItemSchema` strip ·
`evolveSpecies()` **hỏng (luôn `return null`)** · `players.money` có DEFAULT 5000 nhưng **không code ±** ·
`pokemon.held_item` chưa có cột · không có bảng log event/evolution.

| Phase | Nội dung | Trạng thái |
| :---: | :--- | :--- |
| **0** | Foundation: `ItemSchema`+`pocket` · `formulas/evolution.ts` (`resolveEvolution()` thay `evolveSpecies` hỏng) · migration idempotent (`held_item`, `friendship`, `pokemon_events`, `pokemon_evolution_history`, `trade_sessions`) | ✅ |
| **1** | **Items**: `inventory.service` (transaction) · `GET /api/inventory` · cầm đồ · `resolveItemEffect()` registry (heal/revive/cure/restore_pp/buff/catch_ball/evo_stone/exp_boost/level_up) · dùng ngoài trận · **`battle_item` thật** (tốn lượt) | ✅ |
| **2** | **Store + tiền**: buy/sell transaction (SELECT FOR UPDATE) · sync `PlayerState.money` → HUD realtime · `STORE_STOCK` · `StoreModal` + `GET /api/inventory/store` | ✅ |
| **3** | **Evolution**: `tryEvolve()` recompute stats/moves · hook sau mọi level-up (world + battle) · `eventLog` (xp/level/evolve) · stone qua `use_item` · everstone chặn level/friendship | ✅ |
| **4** | **Trade giả lập**: NPC trade (server tự set cờ, client không gửi) → kích hoạt `method:'trade'` (18 species) · `TradeModal` · **PvP trade (Phase 4b) chưa** | ✅ v1 |
| **5** | **Công cụ moderator**: `/forceevolve` · `/reverseevolve` · `/leveldown` · `/levelup` · `/forcefriend` (role check + log `moderator_id`) | ✅ |
| **6** | **UI/i18n**: `BagModal` · `StoreModal` · `TradeModal` · `EvolveModal` · `PartySelectModal` · tab Vật phẩm Summary · badge 🎒 PartyStrip · menu BAG BattleModal · `StoreModal` nối endpoint · i18n +8 key | ✅ |
| **7** | **Admin dashboard** tab "Items & Trades": inventory distribution · top tiền · lịch sử tiến hoá (kèm moderator) · event log (filter kind) — API `GET /api/admin/items/overview` · `/items/top-spenders` · `/evolution/history` · `/events` | ✅ |

**Thứ tự đề xuất:** 0 → 1 → 2 → 3 → 5 → 4 → 6 → (7)
**Chống gian lận đã tính:** server luôn join `owner_id = session.userId` cho mọi read/write item ·
mọi ± tiền trong transaction (SELECT FOR UPDATE) · `levelDown` recompute stats + clamp HP ·
trade flag do server quyết định · force/reverse chỉ moderator và có audit log.

**Script dev mới (Plan 45):**
- `pnpm --filter server exec tsx src/scripts/seed-inventory.ts <username>` — seed túi đồ cơ bản (idempotent).
- `pnpm --filter server exec tsx src/scripts/grant-demo-items.ts [username...]` — grant **toàn bộ 693 item** (100 mỗi loại, ball **1000**); mặc định `admin` + `tienv2i`.
- `pnpm --filter server exec tsx src/scripts/verify-demo-items.ts [username]` — kiểm tra số lượng.
- ⚠ **Script server phải import `pool` từ `../config/database.js`** (KHÔNG dùng barrel `config/index.js`) — barrel kéo `redis.ts` connect → giữ event loop → process treo. Kết thúc script bằng `process.exit(0)`.

### 🎯 Trạng thái hoàn thành: **Plan 44g..44j, Plan 45 & Plan 47 (PvP)** — ✅ **HOÀN THÀNH**
>
> ✅ **Plan 44g:** Lệnh `/spawn` linh hoạt ngắn gọn/chi tiết + Dọn dẹp repo.
> ✅ **Plan 44h:** Hệ thống Bắt Pokémon toàn diện (công thức Gen 3–8/Essentials, mọi loại ball, shakes, critical capture, diễn hoạt parabol & lắc bóng, modal đổi nickname, DB an toàn).
> ✅ **Plan 44i:** Tối ưu hoá Battle Scene (Retro-Modern Dark UI dịu mắt, anti-glare, bệ đứng Pokémon chính hãng, team ball indicators, 4 action buttons tông tối thanh lịch).
> ✅ **Plan 44j:** Tối ưu giao diện khung sử dụng Item trong trận (Search realtime, 4 tabs phân loại, thẻ item hiệu ứng + số lượng, cuộn chuột, chống nuốt phím tắt).
> ✅ **Plan 45:** Items, Evolution, Tiền tệ, Trade, Admin Items (Phase 0–7 hoàn tất).
> ✅ **Plan 47 — PvP Battle (Đấu người chơi thực):**
>    - **Luật PvP:** không dùng Poké Ball, không bỏ chạy (chỉ được **đầu hàng**), không nhận EXP; người thắng nhận thưởng **₽200**.
>    - Điều kiện thách đấu: **level cap ≤ 30** và chênh lệch level giữa 2 bên **≤ 10**; map phải bật cờ `pvp: true` (hiện `route-1`).
>    - Thách đấu qua lệnh chat **`/battle <username>`** hoặc click chuột vào người chơi cùng map (popup xác nhận 2 chiều, TTL + cooldown phía server).
>    - Lượt đánh **đồng thời (simultaneous-turn)** — mỗi client nhận seat riêng (`ally`/`foe`) qua message `battle_seat`, server resolve cả 2 lượt cùng lúc.
>    - Fix mất quyền điều khiển nhân vật: `PokedexModal` isOpen bug, `BattleModal` room lifecycle (onLeave/onError safety net), `startBattle` watchdog + ESC; `UiModal` tách overlay dimming khỏi input blocker (`lockGameOnly`) để modal không nuốt HUD.
>
> ✅ **Fix điều khiển (session 2026-10-10):** hết khoá cứng nhân vật sau khi mở modal / vào trận — xem `f9938830 fix(ui): keep player control when opening overlay modals`.

---

### 🛡️ Hardening EXP/EV/Evolve & Admin Security (2026-10-10)

Audit read-only toàn bộ hệ EXP/EV/Evolve + admin đã phát hiện và **sửa** 8 lỗi:

| # | Mức | Vấn đề | Cách sửa |
| :---: | :--- | :--- | :--- |
| 1 | 🔴 Cao | `fluctuating` dùng 1 polynomial sai → EXP **âm** ở L50 (≈ −50 558); 14 species spawn sai | Viết lại curve 3 tier canonical |
| 2 | 🟠 TB | `erratic` tier 3/4 sai → 25 species lên level chậm | `n³·⌊(1911−10n)/3⌋/500` + `n³(160−n)/100` |
| 3 | 🔴 Cao | `loadBattleParty` SELECT thiếu `ivs/evs/nature/held_item` → stat bị ghi đè sai vĩnh viễn khi lên level | Thêm cột + `heldItem` mapping |
| 4 | 🔴 Cao | DB lưu `nature` là JSONB **object**, code đọc như string → `getNatureMod` luôn miss → tính stat theo `hardy` oan | `normalizeNature()` / `natureNameOf()` bóc `.name` |
| 5 | 🔴 Cao | `movesAfterEvolve` lưu `string[]` trong khi reader chỉ nhận object → **Pokémon mất sạch moveset** sau tiến hoá | Trả `MoveSlot[]`, fallback move cũ khi learnset rỗng |
| 6 | 🔴 Cao | `resolveEvolution` check `level` trước `item`: Eevee Lv16+ dùng Water Stone → **leafeon** (mất đá + sai loài) | Khi có `usedItemId` → ưu tiên `item` |
| 7 | 🟠 TB | Lucky Egg trừ 1 item khỏi túi nhưng **không áp** multiplier → mất trắng | `grantExp` nhân theo held item; `exp_boost` trang bị thật |
| 8 | 🔴 Cao | Admin XSS: username/sprite-name nằm trong `onclick` JS string (escape `'` **không đủ** vì HTML-decode trước khi JS chạy) | `data-*` + event delegation |

**Xác minh #1/#2:** đối chiếu **100 level × 6 growth curve = 599/599** khớp bảng Bulbapedia (đã parse wikitext gốc để lấy đúng hệ số, tránh đọc sai công thức từ render LaTeX).

**Xác minh #3/#4:** gọi thật `loadBattleParty()` trên DB → `natureName` là string đúng (`rash`/`timid`/…), `ivs/evs` đầy đủ, `moves=4`.

**Xác minh #6:** Eevee Lv20 + Water Stone → **vaporeon** ✅ (trước: leafeon). Các path khác (level/friendship/move) không đổi.

**Admin security:**
- Chuyển users-table + sprites-table khỏi `onclick` inline sang `data-*` + event delegation (đọc dataset).
- `esc()` bọc thêm `'`, escape field của warp (TMJ admin upload) trước khi vào `innerHTML`.
- 7 chỗ `.catch(function(){})` → `loadFail()` (console.warn + hiện lỗi inline).
- Thêm `middleware/security.ts`: rate-limit login **10 lần/15 phút/IP**, register **5 lần/giờ/IP** (429 + `Retry-After`); CSP + `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy`.
  - ⚠ `script-src` còn `'unsafe-inline'` vì admin.js dùng onclick attribute; siết `'self'` thuần cần refactor thêm — tách riêng.

**Còn tồn đọng (không sửa lần này):** trainer EXP (`players.exp`) chưa implement · `PartyStrip`/`PokemonSummaryModal` hiển thị EXP sai convention · `MAX_EV_TOTAL` chưa áp trong `gainEv` · `SpeciesSchema` thiếu `evYields`.

### 🌙 Hệ thống Ngày/Đêm + Thời tiết + Happiness/Evolve theo giờ (2026-10-10)

Đồng hồ/thời tiết trước đây là **client-side giả lập** (`new Date()` local + weather random theo seed), encounter gọi `rollEncounter(table, {}, 1)` với **ctx rỗng** nên filter `timeOfDay`/`weather` chưa bao giờ chạy, `friendship` không bao giờ tăng → `eevee→espeon` unreachable và **umbreon không tồn tại trong data**.

| # | Hệ thống | Triển khai |
| :--- | :--- | :--- |
| 1 | **World clock SSOT** (`formulas/worldClock.ts`) | `TIME_SCALE` x6, epoch cố định (toàn cục, restart không nhảy giờ), `phaseAt` (dawn 5–7 / day 7–18 / dusk 18–20 / night 20–5), `worldClockAt/Now`, `msUntilNextPhase` |
| 2 | **Weather deterministic** | `weatherFor(mapId, mapWeather, day, block)` — 8 block/ngày, hash FNV-1a; `ServerMap.weather` làm override tuyệt đối, không đặt → pool nắng-chiếm-đa-số |
| 3 | **Server broadcast** | `WorldClockService` (10s/nhịp, chỉ sync khi đổi) → `WorldState.timeOfDay/weather/gameMinutes`; stop khi room dispose |
| 4 | **Encounter theo giờ/thời tiết** | WorldRoom truyền ctx thật vào `rollEncounter` |
| 5 | **Evolution `time`** | Schema `method:'time'` + `timeOfDay[]`; `entrySatisfied` check phase + `minFriendship` (mặc định 160); thứ tự `time` trước `friendship`; everstone chặn cả `time` |
| 6 | **Data eevee** | espeon → `time` dawn/day; **thêm umbreon** → `time` dusk/night; **xoá** 2 entry level-16 leafeon/glaceon sai mainline (chặn đứng espeon/umbreon vì `level` resolve trước `time`) |
| 7 | **Happiness tracking** (`pokemon/friendship.ts`) | `FRIENDSHIP_DELTA`: thắng +1 / thua −1 / gục −2 / bỏ chạy −2; daily tick +1 toàn bộ Pokémon mỗi ngày game; bậc `friendshipTier` |
| 8 | **Client** | `InfoPanel.setServerClock()` (chưa sync → giữ giả lập cũ); `WorldScene.syncWorldClock` + overlay tối (night 0.38 / dusk-dawn 0.14, chỉ camera world render); Pokedex hiện `❤+DAWN/DAY…` |

**Xác minh:** `pnpm run typecheck` 4/4 · JSON hợp lệ · restart server+client sạch, `/health` OK, `game data loaded: 898 species` (zod parse pass hết entry `time` mới).

---
> ✅ **Đã hoàn thành:** PvP Battle (Plan 47) — xem Mục 9.

1. **NPC & Hội thoại (Dialogue System):**
   - Spawn NPC từ event data map hoặc server database.
   - Dialogue Box phong cách RPG retro (hỗ trợ phân trang lời thoại, avatar NPC, phím Space/Enter/click chuột).
   - Trainer NPC challenge (đấu huấn luyện viên tự động khi bước vào tầm nhìn).
2. **Âm thanh & Âm nhạc (Audio System):**
   - SoundManager BGM cho từng khu vực bản đồ (Lappet Town, Route 1, Pokémon Center...).
   - Nhạc nền trận đấu chiến đấu hoang dã & huấn luyện viên.
   - SFX hiệu ứng âm thanh (va chạm chiêu thức, ném bóng, lên level, fainted).
3. ~~**PvP Battle (Đấu người chơi thực qua Colyseus):**~~ — ✅ **ĐÃ HOÀN THÀNH (Plan 47)**:
   - ~~Thách đấu người chơi khác trên bản đồ (`/battle username` hoặc click chuột).~~
   - ~~Đồng bộ lượt đánh 2 chiều giữa 2 client.~~
   - Phần mở rộng còn lại: **PvP trade (Phase 4b)**, ranking/Elo, lưu lịch sử trận.
4. **Hoàn thiện dữ liệu Tiled & Mở rộng Thế giới:**
   - Vẽ `spawn_zone=1` cho vùng cỏ `lappet-town`.
   - Kết nối Route 2, Viridian City / Viridian Forest và các hang động tiếp theo.
