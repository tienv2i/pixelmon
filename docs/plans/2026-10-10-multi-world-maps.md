# Multi-World Maps — Plan (2026-10-10)

> Trạng thái: **P0 xong một phần (2026-10-10)** — `worlds.json` có `essen-classic`
> (legacy, 13 map cũ) + `vibe-world` (draft, chưa có map); `WorldSchema`,
> `ServerMap.worldId` (default essen-classic), `MapLoader.listWorlds/getWorld/
> listMapsOfWorld` + validate fallback. Còn lại (warp cổng, admin UI, content) theo phases.
> Vấn đề: 17 map hiện tại trộn nhiều nguồn (Essen hand-made + Cedolan/Pallet import
> Essentials + interiors rời rạc) — phong cách lệch nhau ("tạp nham"). Mục tiêu: dựng
> **world mới với bộ maps + assets mới**, **giữ nguyên world cũ** chơi được song song.

## 0. Khái niệm World

- **World = 1 vùng chơi khép kín**: bộ maps + asset pack (tileset) + điểm spawn riêng.
- World cũ → `worldId: 'essen-classic'` (giữ nguyên toàn bộ, đóng băng content, chỉ fix bug).
- World mới → `worldId: 'essen'` (làm lại từ đầu, đồng bộ phong cách).
- Player ở world nào thì chỉ warp trong world đó; chuyển world qua **cổng định danh**
  (bến tàu / máy bay / portal — 1 warp đặc biệt có `targetWorld`).

## 1. Data model

- `packages/shared/data/maps/worlds.json` — registry:
  ```json
  [{ "id": "essen-classic", "name": {"vi":"Essen (Cũ)","en":"Essen (Classic)"},
     "spawnMap": "lappet-town", "assetPack": "classic", "status": "legacy" },
   { "id": "essen", "name": {"vi":"Essen","en":"Essen"},
     "spawnMap": "essen-pallet", "assetPack": "essen-v1", "status": "active" }]
  ```
- `ServerMap` + zod `ServerMapSchema`: thêm `worldId: string` (default `essen-classic`
  cho map cũ — migration không đụng dữ liệu).
- `MAPS` constants (`packages/shared/src/constants/maps.ts`): thêm `worldId` từng map.
- `map_tree.json`: thêm tầng world (world → parent map → child).
- Warp: thêm `targetWorld?` — warp thường cùng world; warp cổng có `targetWorld` + `targetMap`.
- Encounter/npc_dialogue theo map như cũ (không đổi format, chỉ lọc theo world khi cần).

## 2. Assets (namespacing, không đè asset cũ)

- `packages/shared/data/maps/tiled/<worldId>/*.tmj` + tileset `assets/worlds/<worldId>/…`.
- Client `TiledMapLoader`: resolve path theo `worldId` của map (fallback `classic`).
- Tileset chuẩn giữ nguyên (32×32, 8 cột) để dùng chung pipeline `build-server-map.ts`.
- Quy ước đặt tên map mới: `<world>-<tên>` (vd `essen-pallet`, `essen-route-1`) — tránh
  đụng id map cũ.

## 3. Server

- `mapLoader` đọc `worlds.json`; validate `worldId` mọi map (lạ → rơi về `essen-classic` + warn).
- WorldRoom: filter thêm theo world (warp cổng = đổi `mapId` + `worldId` → client rejoin).
- Player (`players.map_id`) thêm cột `world_id` (default `essen-classic`) — resume đúng world.
- Spawn mới / `/tp` không args → spawn của world hiện tại, không hardcode lappet-town.

## 4. Trang admin (thay đổi chính user yêu cầu)

- **World switcher** trên tab Maps: dropdown chọn world → list/detail/stats chỉ hiện map thuộc world đó.
- **Tạo world mới**: form (id, tên VI/EN, assetPack, spawnMap, status active/draft) → ghi `worlds.json`.
- **Gán/chuyển map sang world**: edit `worldId` trong trang detail map (validate warp liên world).
- **Cảnh báo warp gãy**: khi chuyển map khác world mà warp cũ không có `targetWorld` → báo đỏ, gợi ý tạo cổng.
- **Regenerate theo world**: nút regenerate hiện tại chạy theo map — thêm filter world + nút "regenerate cả world".
- **i18n**: key mới `w.*` (world, assetPack, spawn, draft/active/legacy, cổng liên world…) vào `i18n.js` (đã có pattern params).

## 5. Client

- TownMapModal: nhóm theo world (tab hoặc header world), chỉ hiện world hiện tại + cổng đi world khác.
- Minimap/InfoPanel: không đổi (đọc theo map).
- Debug: `/tp <map>` tự resolve world; thêm `/world <id>` chuyển nhanh (moderator+).

## 6. Phases

| Phase | Việc | Xong khi |
|---|---|---|
| P0 | `worlds.json` + `worldId` (schema/constants/map_tree) + default `essen-classic` | typecheck, game chạy như cũ |
| P1 | Loader validate + `players.world_id` + warp cổng + spawn theo world | chuyển world bằng warp cổng được |
| P2 | Admin: switcher + tạo world + gán map + cảnh báo warp + regenerate theo world + i18n | quản trị world hoàn toàn trên admin |
| P3 | Client: TownMap theo world + `/world` + asset namespacing | world mới nạp asset riêng |
| P4 | Content world `essen` (map đầu: town + route + lab) | chơi được world mới từ đầu |

**Không làm:** merge/gộp map cũ sang mới (giữ 2 world song song), world PvP-only riêng, instanced map theo party.

## 7. Chờ chốt

1. Tên + phong cách world mới (tiếp tục Essen hay region mới hoàn toàn)?
2. World cũ `essen-classic` đóng băng content hay vẫn cho sửa nhỏ qua admin?
3. Cổng liên world đặt ở đâu (map nào mỗi bên)?
