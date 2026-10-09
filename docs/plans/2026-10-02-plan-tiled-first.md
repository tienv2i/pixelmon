# Plan — Hệ thống Maps: Tiled Map Editor là nguồn chính

> Ngày: **2026-10-02**
> **Quyết định:** Dùng **Tiled Map Editor** làm công cụ vẽ map duy nhất. Không xây editor riêng trong Admin.
> Thay thế `plan-layers.md` (hướng converter-heuristic) bằng hướng này.

---

## 0. Quyết địng & Lý do

| Lựa chọn | Kết luận |
|---|---|
| **Tiled Map Editor** | ✅ **Chọn** — tool chuẩn, miễn phí, hỗ trợ n layer, quen thuộc |
| Editor riêng trong Admin | ❌ Bỏ — phải tự viết canvas/paint/undo, tốn hàng chục giờ, kém hơn Tiled |
| Converter RMXP heuristic | ⚠️ Chỉ dùng **1 lần** để migrate 5 map cũ |

**Lý do chính:**
1. RMXP chỉ có 3 slot `z` → cây/nhà không tách được. Tiled cho phép **tạo bao nhiêu lớp tuỳ ý**.
2. Quy tắc cộng đồng (PWO / Gen 5) dùng `bottom / mid / top` — trong Tiled đó là 3 tile layer bình thường.
3. Tiled export `.tmj` = JSON chuẩn, client đã đọc được.

---

## 1. Trạng thái hiện tại (đã xác minh)

### 1.1 Pipeline

```
Tiled (.tmj)  ──►  packages/shared/data/maps/tiled/*.tmj
                         │
                         ├─► Client: TiledMapLoader.ts  (static import ❌)
                         │
                         └─► Server: packages/shared/data/maps/server/*.json
                                    (phải viết tay ❌)
```

### 1.2 3 blocker đã xác định

| # | Blocker | Vấn đề |
|---|---|---|
| **B1** | `TiledMapLoader.ts:5-13` | Static import 5 map → thêm map mới phải sửa code + rebuild |
| **B2** | Server JSON | Tiled không sinh `collision.flags` + `objects[]` → phải viết tay |
| **B3** | Tên layer | Converter emit `Ground/Decoration/Overhead`, Tiled mặc định khác |

### 1.3 Dữ liệu 5 map hiện có

| Map | Kích thước | Ground | Decoration | Overhead | Ghi chú |
|---|---|---|---|---|---|
| `lappet-town` | 32×21 | 672 | 112 | **13** | Overhead gần rỗng |
| `route-1` | 28×30 | 864 | 94 | **34** | |
| `players-house` | 15×15 | 465 | 106 | **15** | |
| `pokemon-lab` | 10×10 | 300 | 85 | **3** | |
| `daisys-house` | 10×10 | 300 | 59 | **8** | |

**Bug đã xác minh:** `passage=0x00` trên ô mái nhà (`y=3,4`) và giữa tán cây (`y=1`) → player đi lên mái / xuyên rừng.

---

## 2. Mục tiêu

1. **Vẽ map trong Tiled** → save `.tmj` → game đọc được ngay.
2. **Tự động sinh server JSON** từ `.tmj` (không viết tay).
3. **Quy chuẩn template Tiled** để mọi map mới đúng format.
4. **Migrate 5 map cũ** sang format mới (thêm lớp, sửa collision mái/cây).
5. **Admin tab riêng** chỉ để preview + regenerate + xem collision — **không** vẽ tile.

---

## 3. Thiết kế

### 3.1 Cấu trúc TMJ chuẩn (template Tiled)

```
layers:
  1. Ground      (tilelayer)   — cỏ, sàn, cát, đáy nước, đường mòn
  2. Decoration  (tilelayer)   — thân cây, tường, lan can, cửa sổ, bảng hiệu, ledge
  3. Overhead    (tilelayer)   — ngọn cây, mái nhà, mái cầu, dòng nước chảy
  4. Objects     (objectgroup)  — warp, event, NPC spawn
```

**Depth (client):**

| Layer | Depth | Vẽ |
|---|---|---|
| Ground | 10 | dưới player |
| Decoration | 12 | dưới player |
| Player / NPC | 20 | — |
| Overhead | 30 | **trên player** |

### 3.2 Quy ước Object (warp)

Trong Tiled, object layer `Objects`, mỗi object:

| Field | Giá trị |
|---|---|
| `name` | tên tùy ý |
| `type` | `warp` |
| `x`, `y` | pixel (Tiled tự quy đổi) |
| `properties` | `toMap` (string), `toX` (int), `toY` (int) |

### 3.3 Quy ước Collision

Server JSON `collision.flags` — mỗi ô 1 byte:

| Bit | Ý nghĩa |
|---|---|
| `0x01` | WALKABLE |
| `0x02` | WATER |
| `0x04` | BLOCKED |
| `0x08` | GRASS |
| `0x10` | LEDGE (bit 4 = có ledge) |
| `0x20/0x40/0x60` | hướng ledge (2-bit field) |
| `0x80` | WARP |

**Derive từ TMJ (heuristic):**

```
for each cell (x, y):
    if Overhead[x,y] != 0:        → BLOCKED, clear WALKABLE
    elif Decoration[x,y] != 0:    → BLOCKED, clear WALKABLE
    elif Ground[x,y] != 0:        → WALKABLE
    else:                          → BLOCKED
```

> Heuristic này **đủ cho 95% trường hợp**. Trường hợp đặc biệt (cầu trong suốt, hang động) chỉnh tay trong Tiled bằng custom property `passage`.

### 3.4 Custom properties trong Tiled (optional, cho trường hợp đặc biệt)

| Property | Áp dụng cho | Ý nghĩa |
|---|---|---|
| `passage` | tile | Override collision (0x00 walkable, 0x0f blocked) |
| `terrain_tag` | tile | `0x02`=grass, `0x06`=water, `0x0a`=tall grass |
| `ledge_dir` | tile | `down` / `up` / `left` / `right` |

---

## 4. Các Phase

### Phase 1 — Mở đường cho Tiled (🔴 P0)

**Mục tiêu:** Thêm map mới chỉ bằng cách copy file + chạy 1 lệnh.

- [x] **1.1** `TiledMapLoader.ts` — đổi static import → `import.meta.glob`
  ```typescript
  const TMJ_MODULES = import.meta.glob('@pixelmon/shared/data/maps/tiled/*.tmj', {
    eager: true, import: 'default',
  });
  export const TILED_MAPS: Record<string, TiledMapJSON> = {};
  for (const [path, mapJson] of Object.entries(TMJ_MODULES)) {
    const id = path.split('/').pop()!.replace('.tmj', '');
    if (/^\d+$/.test(id)) continue; // bỏ output cũ 2.tmj / 5.tmj...
    TILED_MAPS[id] = mapJson as TiledMapJSON;
  }
  ```
  > ✅ 2026-10-02 — hoàn thành. Xem `plan-tiled-first-progress.md` Phase 1.
- [x] **1.2** `vite.config.ts` — đảm bảo plugin `.tmj` xử lý glob (đã có, verify)
  > ✅ 2026-10-02 — verify, plugin `vite-plugin-tmj-json` chạy đúng, **không cần sửa**.
- [x] **1.3** Server serve static `.tmj` qua Express (nếu cần runtime fetch fallback)
  > ✅ 2026-10-02 — thêm `app.use('/maps/tiled', express.static(...))` trong `apps/server/src/app.ts`.
- [x] **1.4** Typecheck + build + verify: thêm 1 map giả vào `tiled/` → client nhận diện
  > ✅ 2026-10-02 — copy `zz-test-map.tmj` → build nhận diện, typecheck 4/4 sạch.

**Effort:** ~2h

---

### Phase 2 — Auto-gen server JSON (🔴 P0)

**Mục tiêu:** `pnpm run build:map <id>` tạo `server/<id>.json` từ `.tmj`.

- [x] **2.1** Script `scripts/build-server-map.ts` — ✅ 2026-10-02. Node 24 chạy trực tiếp TS (không cần tsx). 5 tầng derive: layer heuristic → tileset tile property → object property → warp post-pass → landing post-pass. CLI: `<id>` / `--all` / `--dry-run` / `--watch`.
- [x] **2.2** Đăng ký npm script trong `package.json` — ✅ 2026-10-02. `"build:map": "node scripts/build-server-map.ts"` + `"type": "module"`.
- [x] **2.3** Validate output — ✅ 2026-10-02. **⚠️ Phát hiện: heuristic thuần layer sai 27%** (564 ô `blocked→walkable` + 127 ô `walkable→blocked`). Nguyên nhân: RMXP `passages`/`terrain_tags` là per-tile, TMJ không lưu. **Cần tile property (Phase 4)**. Server JSON cũ đã restore, game không ảnh hưởng.
- [x] **2.4** (Optional) Watch mode: `--watch` tự regenerate khi Tiled save — ✅ 2026-10-02.

**Effort:** ~3h

---

### Phase 3 — Template Tiled + Quy chuẩn (🟡 P1)

**Mục tiêu:** Mọi map mới vẽ đúng format ngay từ đầu.

- [x] **3.1** Tạo `templates/pixelmon-map-template.tmx` hoặc `.tmx` template:
  - 4 layer đúng tên: `Ground / Decoration / Overhead / Objects`
  - Tileset trỏ tới `Outdoor.png` + `Interior general.png`
  - Object type `warp` với properties mẫu
  > ✅ 2026-10-02 — tạo `pixelmon-map-template.tmj` (JSON, dùng được) + `.tmx` (XML, tham khảo). Verified `build:map --dry-run` → `1 warp`.
- [x] **3.2** Viết doc `docs/tiled-workflow.md`:
  - Cách tạo map mới từ template
  - Quy ước tên layer
  - Quy ước warp object
  - Custom properties nào dùng khi nào
  > ✅ 2026-10-02 — 11 mục, có bảng lỗi thường gặp.
- [x] **3.3** Thêm vào `project_status.md`
  > ✅ 2026-10-02 — mục `Plan 41 — Hệ thống Maps Tiled-First` (Phase 1–3).

**Effort:** ~1h

---

### Phase 4 — Migrate 5 map cũ (🟡 P1)

**Mục tiêu:** 5 map hiện có sang format mới, sửa bug mái/cây.

- [x] **4.1** Chạy converter **1 lần** với chế độ mới:
  - Đọc `.rxdata` → phân loại ô theo quy tắc PWO (bottom/mid/top)
  - Emit TMJ 4 layer (Ground/Decoration/Overhead/Objects)
  - Post-process: ô có Overhead → `BLOCKED`
  > ✅ 2026-10-02 — converter emit tile properties (`passage`/`terrain_tag`) + warp objects (`type:"warp"` + `toMap`/`toX`/`toY`/`direction`) + map properties. Xem `plan-tiled-first-progress.md` Phase 4.
- [x] **4.2** Chạy `build:map` cho 5 map → sinh server JSON mới
  > ✅ 2026-10-02 — 5 map build OK, 8 warp khôi phục.
- [x] **4.3** Verify:
  - [x] `pnpm run typecheck` clean
  - [x] Rasterize → vision check: mái nhà có tile ở Overhead
  - [x] Collision: `y=3,4` (mái) và `y=1` (cây) → `BLOCKED`
  > ✅ 2026-10-02 — typecheck 4/4, collision 99.96% khớp.
- [x] **4.4** Backup 5 map cũ trước khi ghi đè
  > ✅ 2026-10-02 — backup vào `temp/backup-server-json/`.

**Effort:** ~3h

---

### Phase 5 — Admin tab "Maps" (🟢 P2)

**Mục tiêu:** Preview + regenerate + xem collision. **Không** vẽ tile.

- [x] **5.1** Tab mới trong `admin.html` (thay vì nhét vào tab Maps cũ)
  > ✅ 2026-10-02 — Tab "Maps" đã tồn tới từ trước (preview canvas + toggle layer + warps list). Không cần tab mới.
- [x] **5.2** Preview canvas: render TMJ bằng Phaser hoặc canvas 2D đơn giản
  > ✅ 2026-10-02 — Đã có sẵn: `renderMapCanvas()` vẽ composite hoặc từng layer, zoom, grid, overlay collision/warps.
- [x] **5.3** Toggle từng layer (Ground/Decoration/Overhead/Collision)
  > ✅ 2026-10-02 — Đã có sẵn: `map-layer-select` (composite/0/1/2) + nút Grid/Va chạm/Cổng Warp.
- [x] **5.4** Nút **"Regenerate Server JSON"** → gọi `build:map`
  > ✅ 2026-10-02 — `POST /api/admin/maps/:id/regenerate` (`regenerateAdminMap`) chạy `node scripts/build-server-map.ts <id>`, parse log trả stats. Nút `♻️ Regenerate JSON` trong header tab Maps.
- [x] **5.5** Hiển thị thông tin map: số cell per layer, số warp, kích thước
  > ✅ 2026-10-02 — `computeMapStats()` trong `getAdminMapDetail` + card "Thống kê Map" (Tile/Layer, Va chạm, Đối tượng).

**Effort:** ~3h

---

## 5. Thứ tự thực hiện

```
Phase 1 (mở đường)     ──►  Phase 2 (auto-gen)  ──►  Phase 3 (template)
                                                        │
                                                        ▼
                                              Phase 4 (migrate 5 map cũ)
                                                        │
                                                        ▼
                                              Phase 5 (Admin preview)
```

**Ưu tiên:** Phase 1 → 2 → 4 (có map chạy đúng) → 3 → 5.

---

## 6. Workflow sau khi xong

```bash
# 1. Vẽ map trong Tiled (mở template, paint, đặt warp)
# 2. Save → copy vào data/maps/tiled/
cp my-map.tmj packages/shared/data/maps/tiled/

# 3. Auto-gen server JSON
pnpm run build:map my-map

# 4. Thêm vào index.json (hoặc để build:map tự thêm)
# 5. Restart
./scripts/pm.sh restart
```

**Không cần RMXP, không cần Python, không cần sửa code.**

---

## 7. Rủi ro & Mitigation

| Rủi ro | Mitigation |
|---|---|
| `import.meta.glob` không hoạt động với `.tmj` | Fallback: runtime `fetch('/maps/tiled/${id}.tmj')` |
| Heuristic collision sai ở map phức tạp | Custom property `passage` trong Tiled để override |
| Tiled export format khác version | Pin Tiled version trong doc, validate khi build |
| 5 map cũ migrate xong vẫn còn lỗi nhỏ | Admin preview để phát hiện, sửa tay trong Tiled |
| Performance: nhiều layer hơn | 4 layer thay vì 3 → overhead nhỏ, Phaser batch OK |

---

## 8. Files cần sửa/tạo

| File | Thao tác | Phase |
|---|---|---|
| `apps/client/src/world/TiledMapLoader.ts` | Sửa: glob thay static import | 1 |
| `apps/client/vite.config.ts` | Verify plugin `.tmj` | 1 |
| `scripts/build-server-map.ts` | **Mới** | 2 |
| `package.json` | Thêm script `build:map` | 2 |
| `templates/pixelmon-map-template.tmx` | **Mới** | 3 |
| `docs/tiled-workflow.md` | **Mới** | 3 |
| `scripts/tools/convert_essentials_map.py` | Sửa: emit 4 layer + block overhead | 4 |
| `packages/shared/data/maps/tiled/*.tmj` | Re-convert 5 map | 4 |
| `packages/shared/data/maps/server/*.json` | Re-gen 5 map | 4 |
| `apps/server/public/admin.html` | Thêm tab | 5 |
| `apps/server/public/js/admin.js` | Thêm preview logic | 5 |
| `project_status.md` | Cập nhật | 3 |

---

## 9. Tổng kết

| Phase | Effort | Priority |
|---|---|---|
| 1 — Mở đường cho Tiled | ~2h | 🔴 P0 |
| 2 — Auto-gen server JSON | ~3h | 🔴 P0 |
| 3 — Template + quy chuẩn | ~1h | 🟡 P1 |
| 4 — Migrate 5 map cũ | ~3h | 🟡 P1 |
| 5 — Admin preview | ~3h | 🟢 P2 |
| **Tổng** | **~12h** | |

**Kết quả:** Hệ thống maps ổn định, vẽ map bằng Tiled, thêm map mới không cần sửa code.

---

**Kết thúc plan.**
