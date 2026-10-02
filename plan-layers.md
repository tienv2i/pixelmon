# Fix Plan — Hệ thống Layer Bản đồ Hoàn Chỉnh

> Ngày: **2026-10-02**
> **Root cause đã xác minh:** Converter `convert_essentials_map.py` đọc `@data` **đúng** — RMXP thật sự chỉ có 3 lớp `z=0/1/2`. Nhưng vì chỉ có 3 lớp, converter map 1:1 sang Ground/Decoration/Overhead **không đủ** để tách ngọn cây, nóc nhà, tường, cột, bảng hiệu. Cấu trúc 3 lớp của RMXP không phản ánh đúng depth drawing.

---

## 0. Xác minh fact (đã chạy xong)

| Fact | Kết quả |
|---|---|
| `zsize` trong `Map002.rxdata` | **3** (z=0/1/2) |
| Converter đọc `@data` | ✅ **Đúng** (đúng indexing, đúng dim) |
| RMXP `z=0` @ (6..11, 3..7) | `401 401 401 401 401 401` → **Ground/đường mòn** |
| RMXP `z=1` @ (6..11, 3..7) | `1960 1961 1962 1963 1964` → **Tường nhà (Decoration)** |
| RMXP `z=2` @ (6..11, 3..7) | `0 0 0 0 0 0` → **Trống** (chưa đủ lớp!) |
| Cột ngọn cây @ (0..3, 0..7) | `z=0=808..811` + `z=1=0` + `z=2=0` → **chỉ 1 lớp, không tách canopy/trunk** |
| Autotile used @ z=0 | `tid 260,268,274,276,278,280` (8 cells) → converter map về **gid 411 cứng** |
| Autotile dùng ở z=1, z=2 | 0 |

→ **Kết luận:** Converter đúng về indexing, nhưng **3 lớp của RMXP không đủ** để tách ngọn cây (canopy) / nóc nhà (roof) / tường / cột. Cần converter sinh thêm lớp.

---

## 1. Mục tiêu

1. **Tách layers theo ngữ nghĩa depth**, không theo `z` RMXP:
   - **Ground** (depth 10): đường mòn, mặt nước, cỏ nền, nền sàn nhà
   - **Decoration** (depth 12): tường, cột, lan can, hàng rào, bảng hiệu, chuồng Poké
   - **Overhead** (depth 30): ngọn cây, nóc nhà, mái hiên, tán lá
   - **Autotile** (depth 11, 2-direction 4-way merge): nước biển, bờ cát, thác — **render bằng autotile engine**
2. **Admin có tab "Layer Editor" riêng** để preview, chỉnh, và re-export maps.
3. **Auto-classify** mỗi ô → lớp đích, dựa trên `terrain_tag` + `passage` + adjacency heuristic.
4. Typecheck 4/4 packages + `vite build` OK.

---

## 2. Phân tích hiện trạng (5 maps)

### 2.1 Layer phân bố thực tế

| Map | Ground cells | Decoration cells | Overhead cells | `z=2` RMXP |
|---|---|---|---|---|
| `lappet-town` | 672/672 | 112 | **13** | 13 (chỉ có bụi) |
| `route-1` | 864/864 | 94 | **34** | 34 |
| `players-house` | 465/465 | 106 | **15** | 15 |
| `pokemon-lab` | 300/300 | 85 | **3** | 3 |
| `daisys-house` | 300/300 | 59 | **8** | 8 |

**Vấn đề:** `z=2` (Overhead) gần như trống → không có ngọn cây, không có nóc nhà ở lớp trên. Tất cả nằm ở Ground (canopy) hoặc Decoration (roof).

### 2.2 Ô `passage=0x00` (walkable) nằm TRÊN mái nhà / GIỮA tán cây

Dùng vision audit đã cho:

| Vị trí | Passage (RMXP gốc) | Hậu quả |
|---|---|---|
| `y=3, x=7` (mái đỉnh) | `0x00` | **Đi được trên mái** |
| `y=4, x=7..11` (mái trên) | `0x00` | **Đi được trên mái** |
| `y=1, x=0..3` (giữa tán cây) | `0x00` | **Đi được giữa tán cây** |
| `y=5..7, x=7..11` (tường nhà) | `0x0f` | ✅ Đúng (blocked) |

**Đây chính là lỗi "lối đi giữa nóc nhà" và "khoảng trống giữa các phần cây".**

---

## 3. Thiết kế hệ thống Layer

### 3.1 Quy ước depth (Client — `TiledMapLoader.ts`)

```
Depth 10: Ground        — mặt đất phẳng (đường, cỏ nền, sàn, nền nước)
Depth 11: Autotile      — autotile 4-way (nước, bờ, thác) [nếu tách]
Depth 12: Decoration    — tường, cột, lan can, bảng, hàng rào
Depth 15: Canopy Low    — tán cây thấp (bụi, bụi cỏ cao)
Depth 20: Player / NPC
Depth 25: Trunk Shadow  — bóng đổ / chân cột (nếu có)
Depth 30: Overhead      — ngọn cây, nóc nhà, mái hiên, tán trên
Depth 35: Overhead Overlay — hiệu ứng mưa/nắng trên mái (optional)
Depth 40: Debug Overlay (grid, warp, collision)
```

**Nguyên tắc:** Nếu 1 ô `x, y` có nội dung ở **Overhead** → depth 30 luôn render **sau** player (depth 20), nên player đi lên ô `y-1` sẽ bị che bởi ngọn cây / nóc nhà.

### 3.2 Cấu trúc TMJ mới (backwards-compatible)

```jsonc
{
  "width": 32, "height": 21,
  "tilewidth": 32, "tileheight": 32,
  "layers": [
    { "id": 1, "name": "Ground",       "type": "tilelayer", "data": [...], "properties": [{"name": "z", "type": "int", "value": 0}] },
    { "id": 2, "name": "Decoration",   "type": "tilelayer", "data": [...], "properties": [{"name": "z", "type": "int", "value": 1}] },
    { "id": 3, "name": "Overhead",     "type": "tilelayer", "data": [...], "properties": [{"name": "z", "type": "int", "value": 2}] },
    { "id": 4, "name": "Objects",      "type": "objectgroup", "objects": [...] },
    // ⬇️ MỚI (Phase 2+)
    { "id": 5, "name": "Collision",    "type": "objectgroup", "objects": [...] }  // optional debug
  ],
  "properties": [
    { "name": "layerSchema", "type": "string", "value": "v2" }
  ],
  "tilesets": [...]
}
```

**Backwards compat:** Client kiểm tra `layerSchema === 'v2'` → nếu không, fallback logic 3-layer cũ.

### 3.3 Auto-classify algorithm (Converter — Phase 1)

Đối với mỗi ô `(x, y, z)` từ RMXP, quyết định lớp đích:

```
function classifyCell(x, y, z, tid, passage, terrainTag, aboveTid, belowTid):
    # 1. Autotile (tid < 384)
    if tid < 384:
        return "Autotile", gid = autotileGid(tid, x, y)

    # 2. Terrain tag quyết định (đã có mapping)
    if terrainTag in (2, 10):           # Grass / TallGrass
        return "Decoration"             # trên Ground
    if terrainTag in (6, 8):            # Water / Waterfall
        return "Autotile"

    # 3. Passage 0x0f → blocked → có thể là tường/nhà
    if (passage & 0x0f) == 0x0f:
        # Nếu là tầng z=0 và aboveTid >= 384 (có nội dung z=1) → đây là đất/nền
        if z == 0 and aboveTid >= 384:
            return "Ground"
        # Ngược lại là tường/roof
        if z == 1 and passage == 0x0f:
            return "Decoration"

    # 4. Passage 0x00 → walkable
    if passage == 0x00:
        # Nằm dưới ngọn cây? Kiểm tra tile trên (z=0 có trên ở z=1?)
        if z == 0:
            # Cây: tid 800..811 là tree canopy (đã audit)
            if 800 <= tid <= 819:
                # Cây phân tầng: row y=0 → Overhead (ngọn), y>0 → Decoration (thân/cành)
                if (y % 3) == 0:
                    return "Overhead"     # ngọn
                else:
                    return "Decoration"   # thân
            # Nhà: z=0 là Ground
            return "Ground"
        if z == 1:
            # Tường nhà → Decoration
            return "Decoration"
        if z == 2:
            return "Overhead"

    # 5. Default
    return "Ground"
```

**Cải tiến so với hiện tại:** Không map thẳng `z → layer` nữa, mà dùng **nội dung + passage + terrain tag**.

### 3.4 Autotile handling (Phase 3 — nếu muốn anim)

- Đọc `Tilesets.rxdata` → `@autotiles` array (38 entries đầu)
- Mỗi autotile có shape (47 pattern): extract từng frame → tạo autotile sheet riêng
- Converter emit `{ "name": "autotile_water", "type": "autotile", "shapes": [...] }`
- Client `TiledMapLoader` render autotile bằng `Phaser.Tilemaps.Tileset` với `tileProperties` + animation

**Ưu tiên:** Autotile chỉ 8 cells ở Lappet Town → **không cần Phase 3 ngay**, có thể để static (giống hiện tại) và mở rộng sau.

---

## 4. Các Phase cụ thể

### **Phase 1 — Converter v2: Tách layers tự động (Ưu tiên #1)**

**Mục tiêu:** `convert_essentials_map.py` emit TMJ với 4+ layers (Ground / Decoration / Overhead / Autotile) thay vì map thẳng `z`.

**Task:**

- [ ] **1.1** Hàm `classifyCell(x, y, z, tid, passage, terrainTag, neighbors) -> layer_name`
  - Input: raw RMXP data + Tilesets metadata
  - Output: `'ground' | 'decoration' | 'overhead' | 'autotile'`
  - Logic: heuristic ở §3.3 (dựa trên passage + terrain tag + tree-region detection)
  - Unit test: 5 maps đã convert, so sánh số cell per layer

- [ ] **1.2** Sửa converter: `tmj_layers = ["Ground", "Decration", "Overhead"]` → **dynamic** `set()` of layers
  - Ghi `layer.properties` với `z` original
  - Đảm bảo `data.length === width * height` cho mọi layer (0 nếu ô không thuộc layer đó)

- [ ] **1.3** Sửa depth mapping trong `TiledMapLoader.ts`:
  ```typescript
  const layerDepthMap: Record<string, number> = {
    'ground': 10,
    'decoration': 12,
    'overhead': 30,
    'autotile': 11,      // nếu có
    'canopy': 15,        // optional
  };
  ```

- [ ] **1.4** Re-convert 5 maps với v2:
  ```bash
  python3 scripts/tools/convert_essentials_map.py 2 lappet-town "Lappet Town" --type town
  python3 scripts/tools/convert_essentials_map.py 3 players-house "Player's House" --type interior
  # ... 5 maps
  ```

- [ ] **1.5** Xác minh:
  - [ ] `pnpm run typecheck` 4/4 packages clean
  - [ ] `vite build` OK
  - [ ] Rasterize `.tmj` → PNG → vision check: **không còn "lối đi trên mái"** (player không walkable ở cells có Overhead)
  - [ ] Admin canvas preview render đúng

**Deliverable:**
- `scripts/tools/convert_essentials_map.py` (v2, ~600 lines)
- 5 maps re-converted trong `packages/shared/data/maps/tiled/`
- `apps/client/src/world/TiledMapLoader.ts` updated depth logic
- `project_status.md` mục mới "Plan 41 — Layer System"

---

### **Phase 2 — Admin Maps: Tab Layer Editor (Ưu tiên #2)**

**Mục tiêu:** Admin có tab riêng để preview layers, toggle từng lớp, và re-classify cells.

**Task:**

- [ ] **2.1** Thêm tab **"Layer Editor"** vào `admin.html` (tab thứ 6 sau Maps)
  - Left panel: dropdown chọn map + preview canvas 3-layer với toggle
  - Right panel: grid 20×20 cells, mỗi ô hiển thị 3 lớp (Ground/Deco/Overhead) với color code
  - Bottom: buttons [Classify] [Export] [Reset]

- [ ] **2.2** API endpoint mới `POST /api/admin/maps/:id/reclassify`
  ```typescript
  // maps.ts thêm
  export async function reclassifyMap(req, res) {
    const { id } = req.params;
    const serverMap = JSON.parse(await readFile(join(MAPS_SERVER_DIR, `${id}.json`)));
    // Gọi Python classifier (Phase 1 function)
    const result = await execFileAsync(pythonExe, [
      'scripts/tools/classify_map.py',
      id,
      '--output', 'packages/shared/data/maps/tiled/...tmj'
    ]);
    res.json({ success: true, stats: result });
  }
  ```

- [ ] **2.3** Client preview:
  - `[ ] Ground` / `[ ] Decoration` / `[ ] Overhead` checkboxes
  - Click cell → highlight 3 lớp, show `tid / passage / terrainTag`
  - Color code: Ground=green, Decoration=orange, Overhead=blue

- [ ] **2.4** Export button → download `.tmj` với schema `layerSchema: v2`

- [ ] **2.5** Typecheck + `vite build` + test admin manual

**Deliverable:**
- `apps/server/public/admin.html` (tab mới)
- `apps/server/public/js/admin.js` (functions `initLayerEditor`, `toggleLayer`, `classifyMap`)
- `apps/server/public/css/admin.css` (styles cho layer grid)
- `apps/server/src/modules/admin/maps.ts` (endpoint `reclassify`)

---

### **Phase 3 — Autotile Engine (Ưu tiên #3, optional)**

**Mục tiêu:** Xử lý autotile `tid < 384` với 4-way merge (nước, bờ, thác).

**Task:**

- [ ] **3.1** Extract autotile shapes từ `Tilesets.rxdata`
  - `@autotiles` array (38 entries đầu) → mỗi entry là `bitmask` → shape index (0-47)
  - Tạo autotile sheet PNG: 47 frames × 32×32 (hoặc 4×4 grid nếu dùng simpler)

- [ ] **3.2** Converter v2.1: nếu `tid < 384` → emit `type: "autotile"` layer với shape bitmask per cell

- [ ] **3.3** Client `TiledMapLoader`: render autotile bằng `Phaser.Tilemaps` + `tileProperties.animated`

- [ ] **3.4** Đổi autotile hardcoded `gid 411` (8 cells Lappet Town) → đúng shape

- [ ] **3.5** Typecheck + `vite build` + vision check: nước chảy, bờ 4-way khớp

**Deliverable:**
- `packages/shared/assets/autotiles/*.png` (extract từ `Tilesets.rxdata`)
- `scripts/tools/extract_autotiles.py` (mới)
- Converter v2.1 với autotile support
- Client renderer updated

---

### **Phase 4 — Fix Collision cho cells Walkable trên Overhead (Ưu tiên #1.5, cần làm song song Phase 1)**

**Mục tiêu:** Nếu 1 cell có nội dung ở **Overhead** (depth 30), set `passage = 0x0f` (blocked) để player không đi lên mái/tán cây.

**Task:**

- [ ] **4.1** Trong converter, sau khi classify xong → **post-process**:
  ```python
  for y in range(h):
      for x in range(w):
          overhead_gid = overhead_layer[y * w + x]
          if overhead_gid != 0:
              # Có nội dung ở Overhead → block cell
              collision_flags[y * w + x] |= BLOCKED
              collision_flags[y * w + x] &= ~WALKABLE  # clear WALK
  ```

- [ ] **4.2** Re-convert 5 maps → verify:
  - [ ] Không còn cells walkable ở `y=3,4` (trên mái) — Lappet Town
  - [ ] Không còn cells walkable ở `y=1` (giữa tán cây)
  - [ ] Admin collision overlay → đỏ ở các cells có Overhead

- [ ] **4.3** Typecheck + `vite build`

**Deliverable:**
- Converter v2 với post-process blocking
- 5 maps re-converted với collision flags mới
- `project_status.md` ghi chú bug fix

---

## 5. Ưu tiên & Thứ tự thực hiện

| Phase | Priority | Effort | Dependencies |
|---|---|---|---|
| **Phase 1** (Converter v2) | 🔴 **P0** | Medium (~2-3h) | None |
| **Phase 4** (Fix collision) | 🔴 **P0** | Low (~1h) | Phase 1 (cần biết cells nào Overhead) |
| **Phase 2** (Admin Layer Editor) | 🟡 **P1** | High (~4-5h) | Phase 1 |
| **Phase 3** (Autotile engine) | 🟢 **P2** | High (~5-6h) | Phase 1 (optional) |

**Gợi ý thứ tự:**
1. **Phase 1** (converter v2) → có layers mới
2. **Phase 4** (fix collision) → chặn walkable trên Overhead
3. Verify bằng vision (rasterize + check)
4. **Phase 2** (Admin Layer Editor) → UI chỉnh tay
5. **Phase 3** (Autotile) → polish cuối

---

## 6. Rủi ro & Mitigation

| Rủi ro | Mitigation |
|---|---|
| Auto-classify sai (đưa nhầm Ground → Overhead) | Admin Layer Editor cho phép chỉnh tay sau |
| Breaking change: `layerSchema: v2` chưa tương thích ngược | Client fallback: nếu không có `layerSchema`, dùng logic 3-layer cũ |
| Autotile shapes sai (47 pattern không khớp) | Phase 3 optional — nếu fail thì giữ static `gid 411` (hiện tại đã OK) |
| Performance: nhiều layer hơn → draw calls tăng | Chỉ tăng từ 3 → 4 layers, Phaser batch rendering OK (~5-10% overhead) |
| Re-convert mất manual edits (nếu có) | Backup `packages/shared/data/maps/tiled/*.tmj` trước khi re-run |

---

## 7. Verification Checklist (cho từng Phase)

### Sau Phase 1 (Converter v2):
- [ ] `pnpm run typecheck` 4/4 packages clean
- [ ] `vite build` thành công
- [ ] 5 `.tmj` mới có `layers.length >= 3` (Ground + Deco + Overhead, có thể thêm Autotile)
- [ ] Rasterize `.tmj` → PNG → vision check:
  - [ ] Lappet Town: mái nhà có tile ở Overhead (depth 30)
  - [ ] Lappet Town: tán cây có tile ở Overhead
  - [ ] Không còn "lối đi trên mái" (cần Phase 4)
- [ ] Admin canvas preview render đúng 3 lớp

### Sau Phase 4 (Fix collision):
- [ ] `server/lappet-town.json` → `collision.flags`:
  - [ ] `y=3, x=7..11` → `BLOCKED (0x04)`, không còn `WALK (0x01)`
  - [ ] `y=4, x=7..11` → `BLOCKED`
  - [ ] `y=1, x=0..3` (giữa tán cây) → `BLOCKED`
- [ ] Client spawn → thử đi lên mái → **bị chặn**

### Sau Phase 2 (Admin Layer Editor):
- [ ] Mở `http://localhost:2567/admin` → tab "Layer Editor"
- [ ] Preview canvas toggle 3 lớp OK
- [ ] Click cell → hiển thị `tid / passage / terrainTag` đúng
- [ ] Button "Re-classify" → gọi API → re-convert thành công
- [ ] Export `.tmj` download OK

---

## 8. Files cần sửa

### Phase 1 (Converter v2):
- `scripts/tools/convert_essentials_map.py` — `classifyCell()`, dynamic layers
- `apps/client/src/world/TiledMapLoader.ts` — depth mapping mới
- `packages/shared/data/maps/tiled/*.tmj` (5 files) — re-convert

### Phase 4 (Fix collision):
- `scripts/tools/convert_essentials_map.py` — post-process blocking
- `packages/shared/data/maps/server/*.json` (5 files) — re-convert

### Phase 2 (Admin Layer Editor):
- `apps/server/public/admin.html` — tab mới
- `apps/server/public/js/admin.js` — `initLayerEditor()`, `reclassifyMap()`
- `apps/server/public/css/admin.css` — layer grid styles
- `apps/server/src/modules/admin/maps.ts` — endpoint `POST /maps/:id/reclassify`

### Phase 3 (Autotile engine):
- `scripts/tools/extract_autotiles.py` — mới
- `packages/shared/assets/autotiles/*.png` — extract shapes
- `scripts/tools/convert_essentials_map.py` — v2.1 autotile support
- `apps/client/src/world/TiledMapLoader.ts` — autotile renderer

---

## 9. Related Plans

- `fix-plan.md` mục 1.1/1.2 — tileset interior (đã xong)
- `fix-plan.md` mục 3 — delta grid-step movement (đã xong)
- `project_status.md` Plan 38 — tile-based movement (đã xong)
- **Plan mới này** — Plan 41: Layer System (chưa có trong `project_status.md`)

---

**Kết thúc plan.** Bắt đầu với **Phase 1** (converter v2) + **Phase 4** (fix collision) song song để có ngay fix cho bug "lối đi trên mái" và "khoảng trống giữa cây".
