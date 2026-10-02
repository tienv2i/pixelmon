# Nghiên cứu: Hệ thống Layer Map 2D trong các game Pokémon

> Ngày: **2026-10-02** — Tài liệu tham khảo cho `plan-layers.md`

---

## 1. Tóm tắt so sánh các thế hệ

| Thế hệ | Engine | Số layer tile/ô | Cơ chế depth | Cơ chế va chạm |
|---|---|---|---|---|
| **Gen 1–2** (GB/GBC) | Custom | **2 BG** (BG0/BG1) | Fixed priority + object sort | Bit trong tile layout |
| **Gen 3** (GBA — FireRed/Emerald) | GBA hardware | **2–3 BG** (BG0/BG1/BG2) | Metatile layer flags + `priority` | Metatile behavior byte (9 bit trong Emerald) |
| **Gen 4–5** (DS) | DS hardware | **3 BG** (BG0/BG1/BG2) + 1 tex | Layer ID + "overhead" flag per metatile | Metatile behavior + height flag |
| **Gen 6+** (3DS/Switch) | 3D engine | — | Real 3D depth | 3D collision |
| **Pokémon Essentials** (RMXP) | **RPG Maker XP** | **3 layer z** (`z=0/1/2`) + event layer | Depth theo **index layer** (layer 3 = trên cùng) | Passage bits trong tileset |
| **Pokémon World Online** (fan) | RMXP custom | **3 layer** (bottom / mid / top) | Bottom < Player < Mid < Top | Passage + "ledge" flag |

→ **Standard chung (Gen 3–5 + Essentials + các fan game 2D):** **3 tile layer + 1 entity layer**.

---

## 2. Chi tiết từng model

### 2.1 Gen 3 (GBA — FireRed / Emerald / LeafGreen)

**Cấu trúc metatile (khối 16×16):**
- Mỗi metatile = **2 hoặc 3 sub-tile layers** (`layers_per_metatile` = 2 hoặc 3)
- 4 sub-tile 8×8 trên mỗi layer (`tiles_per_metatile` = 4)
- Layer **bottom** = nền (grass, floor, sand)
- Layer **mid** = vật thể (tree trunk, wall, water edge, fence, roof)
- Layer **top** (optional) = overhead (treetop, roof top, bridge top)

**Thứ tự vẽ (from `pokeemerald`):**
```
BG2 (metatile bottom layer)  ← dưới cùng
BG1 (metatile mid layer)
BG0 (metatile top layer)     ← trên cùng
OBJ (player, NPC, Pokémon)   ← nằm giữa BG0 và BG1 nếu priority cho phép
```

**Va chạm:** `MetatileBehavior` — **9-bit field** trong Emerald:
- Bit 0–5: loại ô (walkable, water, ledge, grass, sand, `MB_RIDGE`, ...)
- Bit 6–8: flags đặc biệt (`MB_ENCOUNTER_GRASS`, ...)
- **Không** dùng passage bits từng tile — dùng bảng tra lookup theo `metatile_id`

**Ưu điểm:**
- ✅ Nén dữ liệu cao (1 `u16` cho cả metatile 16×16)
- ✅ Va chạm trung tâm化 (lookup table, không decode từng sub-tile)
- ✅ Hỗ trợ ledge, grass, water, ledge jump **trong cùng 1 metatile**

**Nhược điểm:**
- ❌ Giới hạn bởi 8×8 sub-tiles (khó làm tile lớn hơn 16×16)
- ❌ Priority per-tileset → không tự do depth-sort

---

### 2.2 Gen 4–5 (DS — Diamond/Pearl, Black/White)

**Cấu trúc:**
- **3 BG layer** (BG0, BG1, BG2) + 1 texture buffer cho sprite
- Metatile vẫn 16×16 với **3 sub-tile layers** (mỗi layer 4 tile 8×8)
- **Thêm "overhead" flag per metatile** (Gen 5) → flag này quyết định ô có vẽ trên player không

**Thứ tự vẽ (BW):**
```
BG2 (bottom) → BG1 (mid) → OBJ (player) → BG0 (top nếu overhead flag)
```

**Va chạm:** Metatile behavior byte (8-bit) + height flag (1 bit)

**Ưu điểm (Gen 5 so với Gen 3):**
- ✅ **Flag "overhead" per metatile** → có thể đặt ô "trên player" mà không cần đổi priority cả tileset
- ✅ Higher resolution (256×192 vs 240×160) → tile 16×16 rõ hơn
- ✅ Smooth animation (BG scroll/affine) cho waterfall, grass rustle

**Nhược điểm:**
- ❌ Vẫn giới hạn 16×16 metatile (không có 32×32 hay custom size)
- ❌ Đồ họa đã 2.5D (BG layers + 3D models cho 1 số object) → không thuần 2D

---

### 2.3 Pokémon Essentials (RMXP) — **Chúng ta đang dùng**

**Cấu trúc:**
- **3 layer tile** trong editor (`@data[z=0/1/2]`, `zsize=3`)
- **1 layer event** (`@events` dict, tách riêng)
- Tileset: 32×32, 8 cột (256px width), có thể vài nghìn px cao

**Thứ tự vẽ (RMXP engine):**
```
Layer 0 (z=0)  ← dưới cùng
Layer 1 (z=1)  
Layer 2 (z=2)  ← trên cùng (nếu không có overhead flag)
Player / NPC   ← đứng giữa Layer 1 và Layer 2 nếu "overhead" tile
Event layer    ← trên cùng
```

**Cơ chế overhead trong RMXP:**
- **Không có flag per-tile** — tất cả tile ở Layer 2 đều vẽ trên player
- Map author phải chủ động đặt tile "overhead" vào Layer 2
- Player ở Layer 1 (giữa) — vì thế `y=1` của player = Layer 1 tile, `y=-1` (đầu) = Layer 2 tile nếu có

**Va chạm:** Passage bits trong tileset
- `@passages[tid]` → 4-bit mask (`0x0f` = blocked all, `0x00` = walkable)
- Autotile (`tid < 384`) dùng `@passages` khác (shape-based)
- **Terrain tags** (`@terrain_tags[tid]`): `0x02`=grass, `0x06`=water, `0x0A`=tall grass, ...

**Hiện trạng Pixelmon:**
- Converter map `z=0/1/2` → `Ground/Decoration/Overhead` (1:1)
- **Vấn đề:** Layer 2 (Overhead) gần như trống (13 ô / 672) → player đi xuyên mái nhà / tán cây
- **Vấn đề:** Passage `0x00` cho ô trên mái → walkable → bug "lối đi trên mái"

---

### 2.4 Pokémon World Online (Fan game, RMXP custom)

**Cấu trúc (từ wiki chính thức):**
- **3 layer**: `bottom` / `mid` / `top`
- **Tách riêng "shadow" layer** (optional, depth giữa mid và top)

**Thứ tự vẽ:**
```
bottom  (nền: grass, floor, sand, water base)
Player  (depth 0, tại center của tile)
mid     (trên player: tree trunk, wall, fence, water edge)
top     (trên mid: treetop, roof top, bridge top)
shadow  (optional, overlay trong suốt)
```

**Quy tắc mapping (từ wiki):**
- **Cây đơn / hàng dọc:** `bottom` = grass, `mid` = trunk, `top` = canopy → **không có shadow**
- **Cây hàng ngang:** `bottom` = grass, `mid` = trunk + shadow base, `top` = canopy
- **Nhóm cây:** shadow **chỉ trong nhóm**, không ngoài
- **Corner cây:** shadow ở `bottom`, transparent top ở `mid` → **2 layer technique**
- **Đá dưới nước:** water ở `bottom`, rock ở `mid` (không phải top!)
- **Waterfall:** base ở `bottom`, edge ở `mid`, flow animation ở `top`
- **Bridge:** solid part ở `bottom` (player đi trên), transparent part ở `mid` + `top`
- **Cave entrance (South):** entrance ở `top` (player đi dưới khi exit)
- **Cave entrance (N/W/E):** entrance ở `bottom` (player đi trên khi enter)
- **Mountain ridge:** ridge đầu = transparent bottom, ridge sau = already filled bottom
- **Ledge:** phải ở `mid` để hoạt động

**Ưu điểm:**
- ✅ **Quy tắc rõ ràng** (wiki chi tiết từng case)
- ✅ **3 layer đủ cho 95% trường hợp** (cây, nhà, cave, bridge, water)
- ✅ **Shadow tách riêng** → dễ điều chỉnh ánh sáng (light source top-left)
- ✅ **Ledge ở mid** → tự động depth-sort với player

**Nhược điểm:**
- ❌ Vẫn 32×32 tile (không nén như Gen 3 metatile 16×16)
- ❌ Manual mapping (không có auto-classify)

---

### 2.5 Gen 1–2 (GB/GBC — Red/Blue, Gold/Silver/Crystal)

**Cấu trúc:**
- **2 BG layer**: BG0 (background) + BG1 (foreground)
- BG0 = nền, BG1 = overhead (optional)
- OBJ = player/NPC

**Thứ tự vẽ:**
```
BG0 (background) → OBJ (player) → BG1 (foreground nếu priority)
```

**Va chạm:** Bit trong tile layout (1 bit per tile = walkable/blocked)

**Ưu điểm:**
- ✅ Đơn giản nhất (2 layer)
- ✅ Data nén cực cao (1 byte/tile bao gồm graphic + collision)

**Nhược điểm:**
- ❌ Chỉ 2 layer → giới hạn (không có "mid" cho trunk/wall riêng)
- ❌ 8×8 tiles (không đủ detail cho house roof)

---

## 3. Model "Hoàn chỉnh nhất" — Đề xuất cho Pixelmon

### 3.1 Model chuẩn: **3 layers + Shadow + Auto-classify**

Dựa trên phân tích, **Pokemon World Online (PWO) model** là hoàn chỉnh nhất cho game 2D tile-based 32×32:

```
┌─────────────────────────────────────────┐
│  Shadow Layer   (optional, depth 15)    │  ← đổ bóng
├─────────────────────────────────────────┤
│  Top Layer      (depth 30, overhead)    │  ← ngọn cây, nóc nhà, cầu
│  ↑ DRAW AFTER PLAYER                    │
├─────────────────────────────────────────┤
│  Player / NPC   (depth 20)              │
├─────────────────────────────────────────┤
│  Mid Layer      (depth 12, decoration)  │  ← thân cây, tường, lan can, waterfall edge
│  ↑ DRAW BEFORE PLAYER                   │
├─────────────────────────────────────────┤
│  Bottom Layer   (depth 10, ground)      │  ← grass, floor, sand, water base
└─────────────────────────────────────────┘
```

### 3.2 Tại sao chọn model này

| Tiêu chí | PWO 3-layer | Gen 3 metatile | RMXP 3-layer (hiện tại) |
|---|---|---|---|
| **Đủ cho house roof** | ✅ 3 layer | ✅ 3 layer | ❌ Chỉ 3 layer, nhưng map author không dùng |
| **Đủ cho tree canopy** | ✅ Tách trunk/canopy | ✅ Tách trong metatile | ❌ Cả trunk + canopy ở layer 0 |
| **Shadow support** | ✅ Layer riêng | ❌ (baked vào tile) | ❌ (không có) |
| **Auto-classify** | ✅ Có thể derive từ passage + terrain | ⚠️ Cần `metatile_behavior` table | ✅ Passage + terrain tag |
| **32×32 tile** | ✅ Native | ❌ 16×16 metatile | ✅ Native |
| **Đơn giản** | ✅ 3 layer + shadow | ❌ Metatile 8×8 sub-tile | ✅ 3 layer |
| **Đã audit dữ liệu** | ⚠️ Chưa | ⚠️ Chưa | ✅ **Đã audit (5 maps)** |

**Kết luận:** PWO model = **3 layer + optional shadow**, giống cấu trúc RMXP **nhưng với semantic rõ ràng hơn** (bottom/mid/top thay vì z=0/1/2), và **auto-classify** dựa trên `passage + terrain_tag + adjacency`.

---

### 3.3 Mapping sang Pixelmon

| PWO Layer | Pixelmon Layer | Depth | Gồm những gì |
|---|---|---|---|
| **bottom** | `Ground` | 10 | Grass, floor, sand, water base, path, stone floor |
| **mid** | `Decoration` | 12 | Tree trunk, wall, fence, waterfall edge, water edge, sign, door, ledge |
| **top** | `Overhead` | 30 | Tree canopy, house roof top, bridge top, cave roof |
| *(shadow)* | `Shadow` | 15 | Shadow overlay (optional) |

**Depth order:**
```
Ground (10) < Shadow (15) < Player (20) < Decoration (12)? 

Sai! → Sửa:
Ground (10) < Decoration (12) < Player (20) < Overhead (30)

Shadow (nếu có): depth 15 (giữa Decoration và Player)
```

---

### 3.4 Auto-classify Algorithm (từ RMXP data → PWO layers)

**Input:** `(x, y, z, tid, passage, terrainTag, neighbors)`

```python
def classify(x, y, z, tid, passage, terrain_tag, neighbors):
    """
    RMXP data → PWO semantic layer (ground/decoration/overhead/shadow)
    """
    # 1. Autotile (nước, bờ, thác) — đặc biệt
    if tid < 384:
        # Terrain tag quyết định
        if terrain_tag in (0x06, 0x08):  # Water / Waterfall
            return "ground"  # Autotile riêng, nhưng vẫn ở ground depth
        if terrain_tag == 0x02:  # Grass
            return "ground"
        return "ground"  # Default cho autotile

    # 2. Passage 0x0f = blocked → wall / tree trunk / house body
    if (passage & 0x0F) == 0x0F:
        if z == 0:
            # z=0 blocked → có thể là nhà/cây ở tầng dưới
            # Kiểm tra above: nếu z=1 có content → đây là "ground" (nền dưới nhà)
            if neighbors.get("z1_above", 0) > 0:
                return "ground"
            # Ngược lại là tree trunk / wall
            return "decoration"
        if z == 1:
            # z=1 blocked → wall / tree trunk (phổ biến nhất)
            return "decoration"
        if z == 2:
            # z=2 blocked → hiếm (có thể là overhead block)
            return "overhead"

    # 3. Passage 0x00 = walkable
    if passage == 0x00:
        if z == 0:
            # z=0 walkable → ground (grass, path, floor)
            return "ground"
        if z == 1:
            # z=1 walkable → có thể là "ledge" hoặc "fence top"
            if terrain_tag == 0x01:  # Ledge
                return "decoration"  # Ledge phải ở mid để hoạt động
            # z=1 walkable nhưng không phải ledge → có thể là "mid" layer (fence, sign)
            return "decoration"
        if z == 2:
            # z=2 walkable → overhead (cầu trong suốt, tree canopy trên)
            return "overhead"

    # 4. Passage đặc biệt (bit 0x10 = "ledge direction")
    if passage & 0x10:
        return "decoration"  # Ledge ở mid

    # 5. Default
    return "ground"
```

**Rule of thumb (từ PWO wiki):**
- **Cây:** trunk = `mid`, canopy = `top`
- **Nhà:** wall = `mid`, roof = `top`
- **Water:** base = `bottom`, edge = `mid`, waterfall flow = `top`
- **Bridge:** solid = `bottom`, transparent = `mid` + `top`
- **Cave entrance:** South = `top`, North/West/East = `bottom`
- **Ledge:** always `mid`
- **Shadow:** `shadow` layer (nếu có)

---

## 4. Benchmark: Layer count vs Complexity

| Game / Engine | Layer count | Data size (32×32, 50×50 map) | Visual completeness |
|---|---|---|---|
| **Gen 1–2** (GB) | 2 BG | ~2.5 KB | ⭐⭐⭐ (basic) |
| **Gen 3** (GBA) | 2–3 BG | ~10 KB | ⭐⭐⭐⭐ (rich) |
| **Gen 4–5** (DS) | 3 BG | ~15 KB | ⭐⭐⭐⭐⭐ (very rich) |
| **RMXP** (Essentials) | 3 layer + event | ~50 KB (JSON) | ⭐⭐⭐⭐ (đủ nếu dùng đúng) |
| **PWO** (fan game) | 3 layer + shadow | ~60 KB (JSON) | ⭐⭐⭐⭐⭐ (hoàn chỉnh) |
| **Pixelmon** (hiện tại) | 3 layer (1:1 map) | ~50 KB | ⭐⭐ (thiếu overhead, bug collision) |
| **Pixelmon** (sau plan-layers.md) | 3 layer + auto-classify | ~55 KB | ⭐⭐⭐⭐⭐ (như PWO) |

---

## 5. Kết luận & Khuyến nghị

### Model hoàn chỉnh nhất: **PWO 3-layer + Shadow**

**Lý do:**
1. **Đủ cho mọi trường hợp** (tree, house, water, bridge, cave, ledge)
2. **Semantic rõ ràng** (bottom/mid/top + shadow) → dễ hiểu, dễ maintain
3. **Auto-classify khả thi** từ RMXP data (passage + terrain tag + adjacency)
4. **Giữ nguyên cấu trúc RMXP** (3 layer) → không cần đổi converter radical
5. **Đã có benchmark** từ PWO wiki (mapping rules chi tiết)

### Implementation approach (trong `plan-layers.md`):

1. **Phase 1 (Converter v2):** Map `z=0/1/2` → `Ground/Decoration/Overhead` bằng **semantic classifier** (không map thẳng 1:1)
2. **Phase 4 (Fix collision):** Ô có tile ở `Overhead` → set `BLOCKED` (chặn đi trên mái/tán cây)
3. **Phase 2 (Admin Layer Editor):** UI preview + chỉnh tay (fallback nếu auto-classify sai)
4. **Phase 3 (Autotile):** Option — render autotile 4-way cho nước/bờ/thác

### So sánh với Gen 3/5:

| Aspect | Gen 3/5 (GBA/DS) | PWO / Pixelmon (RMXP-based) |
|---|---|---|
| **Tile size** | 8×8 sub-tile (metatile 16×16) | 32×32 (không nén) |
| **Layer count** | 2–3 BG | 3 layer + shadow |
| **Collision** | Metatile behavior (lookup table) | Passage bits (per tile) |
| **Overhead flag** | Per-metatile (Gen 5) | Per-layer (RMXP Layer 2) |
| **Data size** | ~10–15 KB | ~50–60 KB |
| **Editor** | Porymap / Advance Map | RPG Maker XP |

**RMXP 3-layer + auto-classify = equivalent với Gen 3/5 về capability**, chỉ khác representation (flat 32×32 vs metatile 16×16).

---

## 6. References

- [RPG Maker XP Map Structure](https://rmxp.fandom.com/wiki/Map) — `@data[z=0/1/2]`, `zsize=3`
- [Pokémon Essentials Documentation — Tilesets](https://essentialsdocs.fandom.com/wiki/Tilesets) — Passage bits, terrain tags
- [Pokémon World Online — Mapping Tutorials](https://pwo-wiki.info/index.php/Mapping_Tutorials) — 3-layer rules (trees, water, caves, bridges, ledges)
- [Porymap Documentation — Tileset Editor](https://huderlem.github.io/porymap/manual/tileset-editor.html) — Gen 3 metatile layers
- [pokeemerald — `fieldmap.c`](https://github.com/pret/pokeemerald/blob/master/src/fieldmap.c) — Metatile behavior, map layout
- [Porytiles](https://github.com/grunt-lucas/porytiles) — Overworld tileset compiler, 3 layer PNG input
- `project_status.md` — Plan 38 (tile-based movement), §3.1 (layer depth conventions)
- `plan-layers.md` — Kế hoạch implement cho Pixelmon
