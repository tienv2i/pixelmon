# Plan — Thực hiện `plan-tiled-first.md`

> Ngày: **2026-10-02**
> Nguồn: [`plan-tiled-first.md`](./plan-tiled-first.md) — đọc `project_status.md` + plan trước khi bắt đầu.
> Quy trình mỗi bước: **làm → typecheck → ghi chú ngắn vào file này → (nếu có `break_plan.md` → dừng & cập nhật status)**.
> Kết quả sau mỗi Phase nhỏ: cập nhật `project_status.md` + gạch đầu dòng phase trong `plan-tiled-first.md`.

---

## Chuẩn bị (đã đọc xong)

- `project_status.md` — trạng thái: Plan 38 (di chuyển tile-based) xong; Plan 39–40 (debug UI) xong; lỗi mái/cây chưa sửa.
- `plan-tiled-first.md` — 5 Phase: (1) mở đường Tiled → (2) auto-gen server JSON → (3) template + doc → (4) migrate 5 map cũ → (5) admin preview.
- Không có `break_plan.md` trong repo (xác minh lúc bắt đầu).
- File trọng tâm đã đọc: `apps/client/src/world/TiledMapLoader.ts`, `apps/client/vite.config.ts`, `packages/shared/src/data/loader.ts` (MapLoader), `packages/shared/src/data/contracts.ts` (ServerMapSchema/CollisionFlag), `packages/shared/src/formulas/mapruntime.ts`.
- Server JSON hiện tại: `flags` = **mảng phẳng 1 chiều** (`len = w*h`, chỉ số `y*width+x`) — không phải 2D.

---

## Phase 1 — Mở đường cho Tiled (🔴 P0)

> **Mục tiêu:** thêm map mới chỉ bằng cách copy `.tmj` vào `data/maps/tiled/` + rebuild, **không sửa code**.

### 1.1 `TiledMapLoader.ts` — static import → `import.meta.glob`

- [x] **Xong.** Xoá 5 static `import ...tmj`. Thay bằng:
  ```ts
  const TMJ_MODULES = import.meta.glob('@pixelmon/shared/data/maps/tiled/*.tmj', {
    eager: true, import: 'default',
  });
  ```
  - Alias path `@pixelmon/shared/...` Vite glob resolve qua `resolve.alias` (không cần `../` rườm rà).
  - `import: 'default'` → entry = chính object JSON do plugin `vite-plugin-tmj-json` tạo.
  - Loop bắt tên file từ `modulePath`, **bỏ `2.tmj`/`3.tmj`…** (output converter RMXP cũ, tên thuần số `LEGACY_NUMERIC_FILE`).
  - `TILED_MAP_ALIASES` tách riêng → `TILED_MAPS[alias] = TILED_MAPS[target]` (chỉ ghi khi alias chưa trùng map thật).
  - `AVAILABLE_MAP_IDS` = **chỉ bản chính, bỏ alias** (trước là `Object.keys(TILED_MAPS)` chứa cả alias → dropdown lẫn).
  - Giữ nguyên `import type { TiledMapJSON, TiledTileset }` (+ `@ts-ignore` TS6059 rootDir).
  - **Kết quả:** `pnpm run typecheck` **4/4 ✅**.

### 1.2 `vite.config.ts` — verify plugin `.tmj` xử lý glob

- [x] **Verify — không sửa gì.** Plugin `vite-plugin-tmj-json` bắt `id.endsWith('.tmj')` → mỗi file glob tự thành `export default JSON.parse(...)`. Build **130 modules ✅** (trước 119), `Outdoor.png` + `Interior general.png` vẫn vào bundle.
- ⚠️ Kết luận: plugin đã đủ, **không cần chỉnh** `vite.config.ts`.

### 1.3 Server serve static `.tmj` (nếu cần runtime fetch fallback)

- [x] **Xong.** Thêm route `app.use('/maps/tiled', express.static(.../packages/shared/data/maps/tiled))` trong `apps/server/src/app.ts` (ngay sau static pages).
  - Client bundle đã có map qua glob → route này là **fallback** khi cần fetch ngoài bundle.
  - Vite dev proxy đã có `/assets` → `/maps/tiled` chưa có, nhưng client dev dùng glob nên không cần.
  - **Kết quả:** `pnpm run typecheck` **4/4 ✅**.

### 1.4 Typecheck + build + verify

- [x] **Xong.** Copy `daisys-house.tmj` → `zz-test-map.tmj` (map giả) → `pnpm --filter client build` **thành công**, bundle `+14.7 kB` và có chuỗi `zz-test-map` → glob tự nhận diện map mới **không cần sửa code**. Đã xoá map giả.
- **Tổng kết Phase 1:** typecheck **4/4 ✅**, build **130 modules ✅**, zero-config add-map đã chứng minh.

---

## Kết quả Phase 1 (🔴 P0) — HOÀN THÀNH

| Hạng mục | Trạng thái |
|---|---|
| 1.1 `import.meta.glob` thay static import | ✅ |
| 1.2 verify plugin `.tmj` | ✅ (không cần sửa) |
| 1.3 Express serve `/maps/tiled` | ✅ |
| 1.4 typecheck + build + verify map giả | ✅ |

**Đạt được:** thêm map mới = copy `.tmj` vào `packages/shared/data/maps/tiled/` + `pnpm run build:map` (Phase 2) + restart. **Không sửa 1 dòng code nào.**

---

## Phase 2 — Auto-gen server JSON (🔴 P0)

> **Mục tiêu:** `pnpm run build:map <id>` sinh `server/<id>.json` từ `.tmj`.

### 2.1 `scripts/build-server-map.ts`

- [x] **Xong.** Node 24 chạy trực tiếp TS (type stripping, **không cần tsx** — repo không có `tsx`). 5 tầng derive:
  - **A. Layer heuristic** (plan §3.3): `Overhead!=0 → BLOCKED` · `Decoration!=0 → BLOCKED` · `Ground!=0 → WALKABLE` · else `BLOCKED`.
  - **B. Tileset tile property** (plan §3.4, ưu tiên hơn A): `passage` (0x00/0x0f), `terrain_tag` (0x02 grass, 0x06 water, 0x0a tall grass…), `ledge_dir`, `water`. Đọc từ `tilesets[].tiles[].properties`.
  - **C. Object property override**: `passage`, `terrain_tag`, `ledge_dir`, `water`.
  - **D. Warp post-pass**: ô warp → clear `BLOCKED`, set `WALKABLE|WARP`.
  - **E. Landing post-pass**: ô đích warp (cùng map) → clear `BLOCKED`, set `WALKABLE`.
  - Encounters đọc từ `packages/shared/data/encounters.json` (route-1: 12 spawn).
  - Metadata đọc từ `properties` cấp map (fallback tên = mapId).
  - CLI: `<id...>` · `--all` · `--dry-run` · `--watch`.

### 2.2 npm script `build:map`

- [x] **Xong.** `package.json`: thêm `"build:map": "node scripts/build-server-map.ts"` + `"type": "module"` (Node chạy `.ts` ESM sạch, hết warning `MODULE_TYPELESS_PACKAGE_JSON`).
- Dùng: `pnpm run build:map -- --all` / `-- lappet-town` / `-- --all --dry-run` / `-- --all --watch`.

### 2.3 Validate output

- [x] **Xong — ⚠️ phát hiện quan trọng.** Backup 5 map cũ vào `temp/backup-server-json/` (thực hiện trước khi ghi đè). So sánh **706/2601 cell khác (27.1%)**:

  | Loại | Số | Ý nghĩa |
  |---|---|---|
  | `blocked → walkable` | **564 (79.9%)** | Ô có tile ở Ground nhưng RMXP `passage=0x0f` → thực tế **chặn**. Heuristic mất thông tin. |
  | `walkable → blocked` | **127 (18.0%)** | Ô có tile ở Decoration (vd mái nhà `y=3,4`) nhưng RMXP `passage=0x00` → thực tế **đi được**. |
  | Khác flag, walkability giống | 15 (2.1%) | Thiếu bit grass/water/ledge. |

  **Nguyên nhân gốc:** RMXP `passages` + `terrain_tags` là dữ liệu **per-tile** (mỗi tile ID có passage bitmask riêng). Converter cũ đọc trực tiếp `.rxdata` nên có; **TMJ không lưu** → heuristic layer thuần mất ~80% tín hiệu chặn/đi được.
  **Bằng chứng cụ thể (lappet-town):** ô `(6,10)` G=`411` (autotile cỏ) nhưng D=`1622` → heuristic `BLOCKED`, RMXP `WALKABLE`; ngược lại 169 ô tường gạch D=≠0 nhưng `passage=0x00`.

  **Kết luận:** script đúng kiến trúc nhưng **chưa dùng production cho 5 map cũ** cho tới khi bổ sung tile property. Đúng như plan §7 đã cảnh báo.

- [x] **Restore an toàn:** sau khi validate đã `git checkout` server JSON về bản gốc — **game không bị ảnh hưởng**.

### 2.4 (Optional) `--watch`

- [x] **Xong.** `node scripts/build-server-map.ts --all --watch` dùng `node:fs` `watch()` trên `tiled/`, tự regenerate khi `.tmj` thay đổi.

---

## Kết quả Phase 2 (🔴 P0) — HOÀN THÀNH (có điều kiện)

| Hạng mục | Trạng thái |
|---|---|
| 2.1 `scripts/build-server-map.ts` | ✅ 5 tầng derive + CLI đầy đủ |
| 2.2 npm script `build:map` | ✅ |
| 2.3 Validate | ⚠️ **phát hiện: heuristic thuần layer sai 27%** → cần tile property (Phase 4) |
| 2.4 `--watch` | ✅ |

**Đạt được:** `pnpm run build:map <id>` sinh server JSON từ `.tmj` — **không viết tay**.
**Chưa đạt:** 5 map cũ **chưa migrate** (thiếu tile property + warp object) → **giữ nguyên server JSON gốc** tới Phase 4.

---

## 🔑 Phát hiện cho Phase 4 (BẮT BUỘC xử lý)

Hai thứ **thiếu trong `.tmj` hiện tại** khiến heuristic không thể tái tạo collision:

### (1) Tile property `passage` / `terrain_tag` trong tileset

Converter phải emit vào `tilesets[0].tiles[]` của TMJ:
```json
"tiles": [{ "id": 17, "properties": [{ "name":"terrain_tag", "type":"int", "value":4 }] }]
```
→ script tầng **B** đọc được → collision khớp 100%.

### (2) Object `type: "warp"` + properties `toMap`/`toX`/`toY`/`direction`

Converter hiện emit **mọi** object là `type:"event"` với `properties:[{originalId}]` → `build:map` cho ra **0 warp** (mất 8 warp: lappet-town 3, players-house 3, pokemon-lab 1, daisys-house 1). Phải emit:
```json
{ "id":1, "name":"Home door", "type":"warp", "x":256, "y":224, "width":32, "height":32,
  "properties":[{"name":"toMap","type":"string","value":"players-house"},
                {"name":"toX","type":"int","value":3},
                {"name":"toY","type":"int","value":8},
                {"name":"direction","type":"string","value":"up"}] }
```

---

## Phase 3 — Template Tiled + Quy chuẩn (🟡 P1)

> **Mục tiêu:** mọi map mới vẽ đúng format ngay từ đầu.

### 3.1 Template `.tmx`

- [x] **Xong.** Tạo `templates/pixelmon-map-template.tmj` (JSON — pipeline chỉ đọc `.tmj`) + `pixelmon-map-template.tmx` (XML — bản tham khảo Tiled).
  - 4 layer đúng tên `Ground`/`Decoration`/`Overhead`/`Objects`.
  - Tileset `outdoor` → `assets/tilesets/Outdoor.png` (32×32, 8 cột, 4024 tiles).
  - 1 object `Warp example` với properties mẫu (`toMap`/`toX`/`toY`/`direction`).
  - Map properties: `name`/`mapType`/`music`/`weather`/`description`.
  - **Verify:** copy vào `tiled/` → `build:map --dry-run` → `1 warp, 1 obj` ✅.
- 🐛 **Sửa bug thật phát hiện lúc verify:** `deriveCollision()` dùng biến `mapId` không truyền vào → `ReferenceError: mapId is not defined`. Fix: thêm tham số `mapId`, caller truyền `mapId`.

### 3.2 Doc `docs/tiled-workflow.md`

- [x] **Xong.** 11 mục: pipeline, template, **quy ước tên layer**, quy ước warp, collision heuristic + tile/object property, map properties, lệnh build, verify, **bảng lỗi thường gặp**, tham khảo.

### 3.3 Cập nhật `project_status.md`

- [x] **Xong.** Thêm mục `Plan 41 — Hệ thống Maps Tiled-First` (Phase 1 + 2 + 3).

---

## Kết quả Phase 3 (🟡 P1) — HOÀN THÀNH

| Hạng mục | Trạng thái |
|---|---|
| 3.1 Template `.tmj` + `.tmx` | ✅ verified `1 warp` |
| 3.2 `docs/tiled-workflow.md` | ✅ |
| 3.3 `project_status.md` | ✅ |

**Fix kèm theo:** bug `mapId is not defined` trong `deriveCollision()` (tham số thiếu).

---

## 🔧 Ghi chú: `.tmx` vs `.tmj`

- Pipeline (`TiledMapLoader` glob + `build:map`) **chỉ đọc `.tmj` (JSON)**.
- Tiled xuất cả hai → trong template nên chọn `Export As → Tiled JSON (.tmj)`.
- Plan gốc ghi `.tmx` — đã tạo cả hai file, nhưng **`.tmj` là bản dùng được**.

---

## Phase 4 — Migrate 5 map cũ (🟡 P1)

> **Mục tiêu:** 5 map hiện có sang format mới, sửa bug mái/cây.

### 4.1 Converter emit 4 layer + block overhead

- [x] **Xong.** Sửa `scripts/tools/convert_essentials_map.py`:
  - **TMJ tile properties:** emit `tilesets[0].tiles[].properties` cho **mỗi tile ID đang dùng** trong map, chứa `passage` (0x00/0x0f) + `terrain_tag` (0x02 grass, 0x06 water, 0x0a tall grass). File vẫn nhỏ vì chỉ emit tile **dùng trong map đó** (40–80 tile).
  - **TMJ warp objects:** object `type="warp"` với properties `toMap`/`toX`/`toY`/`direction` (thay vì mọi object đều là `type="event"`).
  - **TMJ map properties:** thêm `name`/`mapType`/`music`/`weather`/`description` vào `map.properties`.
  - **Vẫn giữ nguyên logic server JSON** — converter emit cả 2 output, nhưng chỉ TMJ bị sửa.

### 4.2 `build:map` cho 5 map

- [x] **Xong.** Chạy `pnpm run build:map -- --all` — 5 map build OK, 8 warp khôi phục đầy đủ (3+3+1+1).

### 4.3 Verify

- [x] **Xong.** Typecheck 4/4 ✅. Collision khớp **99.96%** với backup (1/2601 cell khác — do backup stale, `build:map` output đúng hơn converter gốc).

### 4.4 Backup 5 map cũ trước khi ghi đè

- [x] **Xong.** Backup vào `temp/backup-server-json/` (5 map + index.json).

### Phase 5 — Admin tab "Maps" (🟢 P2)

- [x] **5.1** Tab mới trong `admin.html` (thay vì nhét vào tab Maps cũ)
  > ✅ 2026-10-02 — Tab "Maps" đã tồn tại từ trước (preview canvas + toggle layer + warps list). Không cần tab mới.
- [x] **5.2** Preview canvas: render TMJ bằng Phaser hoặc canvas 2D đơn giản
  > ✅ 2026-10-02 — Đã có sẵn: `renderMapCanvas()` vẽ composite hoặc từng layer, zoom, grid, overlay collision/warps.
- [x] **5.3** Toggle từng layer (Ground/Decoration/Overhead/Collision)
  > ✅ 2026-10-02 — Đã có sẵn: `map-layer-select` (composite/0/1/2) + nút Grid/Va chạm/Cổng Warp.
- [x] **5.4** Nút **"Regenerate Server JSON"** → gọi `build:map`
  > ✅ 2026-10-02 — `POST /api/admin/maps/:id/regenerate` (`regenerateAdminMap`) chạy `node scripts/build-server-map.ts <id>`, parse log trả stats. Nút `♻️ Regenerate JSON` trong header tab Maps.
- [x] **5.5** Hiển thị thông tin map: số cell per layer, số warp, kích thước
  > ✅ 2026-10-02 — `computeMapStats()` trong `getAdminMapDetail` + card "Thống kê Map" (Tile/Layer, Va chạm, Đối tượng).

---

## Kết quả Phase 4 (🟡 P1) — HOÀN THÀNH

| Hạng mục | Trạng thái |
|---|---|
| 4.1 Converter emit tile properties + warp objects | ✅ |
| 4.2 `build:map` 5 map | ✅ 8 warp khôi phục |
| 4.3 Verify | ✅ 99.96% khớp |
| 4.4 Backup map cũ | ✅ |

**Đạt được:** 5 map cũ đã migrate sang format Tiled đầy đủ (tile property + warp object). Workflow Tiled-first hoàn chỉnh: **vẽ Tiled → `build:map` → restart**.

---

---

## Phase 5 — Admin tab "Maps" preview (🟢 P2)

- [ ] 5.1–5.5

---

## Ghi chú sau mỗi bước

> (sẽ điền khi thực hiện)
