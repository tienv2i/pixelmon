# Tiled Workflow — Vẽ map cho Pixelmon

> **Nguồn sự thật duy nhất:** Tiled Map Editor. Không vẽ trong Admin, không sửa code để thêm map.
> Plan: [`plan-tiled-first.md`](./plan-tiled-first.md) · Tiến độ: [`plan-tiled-first-progress.md`](./plan-tiled-first-progress.md)

---

## 1. Tổng quan pipeline

```
Tiled (.tmj)  ──►  packages/shared/data/maps/tiled/<id>.tmj
                        │
                        ├─► Client: TiledMapLoader.ts  (import.meta.glob — tự động)
                        │
                        └─► Server: pnpm run build:map <id>
                                   └─► packages/shared/data/maps/server/<id>.json
```

**Thêm map mới = 3 bước, không sửa code:**

```bash
# 1. Vẽ map trong Tiled (mở template, paint, đặt warp)
# 2. Save → copy vào data/maps/tiled/
cp my-map.tmj packages/shared/data/maps/tiled/

# 3. Auto-gen server JSON
pnpm run build:map my-map

# 4. Restart
./scripts/pm.sh restart
```

---

## 2. Template

**`templates/pixelmon-map-template.tmj`** — mở trong Tiled → `File → Save As` → đặt tên `<id>.tmj`.

Template đã cài sẵn:
- 4 layer đúng tên: `Ground` / `Decoration` / `Overhead` / `Objects`
- Tileset `outdoor` trỏ `assets/tilesets/Outdoor.png` (32×32, 8 cột)
- 1 object `Warp example` với properties mẫu
- Map properties: `name`, `mapType`, `music`, `weather`, `description`

> **Lưu ý:** Tiled cũng xuất `.tmx` (XML). Pipeline hiện chỉ đọc **`.tmj` (JSON)** — luôn chọn `File → Export As → Tiled JSON (.tmj)`.

---

## 3. Quy ước tên layer (BẮT BUỘC)

| Layer | Tên | Vai trò | Depth client |
|---|---|---|---|
| 1 | `Ground` | Cỏ, sàn, cát, đáy nước, đường mòn | 10 |
| 2 | `Decoration` | Thân cây, tường, lan can, cửa sổ, bảng hiệu, ledge | 12 |
| 3 | `Overhead` | Ngọn cây, mái nhà, mái cầu, dòng nước chảy | 30 |
| 4 | `Objects` | Warp, event, NPC spawn | — |

**Tên layer phải khớp** (không phân biệt hoa/thường) vì `build-server-map.ts` dùng tên để phân loại. Tên khác → collision sai.

---

## 4. Quy ước Warp (object layer `Objects`)

Mỗi object warp trong Tiled:

| Field | Giá trị |
|---|---|
| `name` | tên tùy ý (vd "Home door") |
| `type` | `warp` |
| `x`, `y` | pixel (Tiled tự quy đổi sang tile) |
| `properties` | `toMap` (string), `toX` (int), `toY` (int), `direction` (string, optional) |

**Ví dụ:**
```json
{
  "id": 1, "name": "Home door", "type": "warp",
  "x": 256, "y": 224, "width": 32, "height": 32,
  "properties": [
    {"name": "toMap", "type": "string", "value": "players-house"},
    {"name": "toX", "type": "int", "value": 3},
    {"name": "toY", "type": "int", "value": 8},
    {"name": "direction", "type": "string", "value": "up"}
  ]
}
```

`direction`: `up` / `down` / `left` / `right` (bỏ trống = giữ hướng hiện tại).

**Object khác warp:** đặt `type` là `event` (hoặc để trống) → server JSON ghi `type: "event"`.

---

## 5. Quy ước Collision

### 5.1 Heuristic tự động (mặc định)

`build-server-map.ts` derive từ layer:

```
Overhead != 0   → BLOCKED
Decoration != 0 → BLOCKED
Ground != 0     → WALKABLE
else            → BLOCKED
```

**Đủ cho 95% trường hợp.** Nhưng **mất dữ liệu per-tile** (RMXP `passages`/`terrain_tags`) → map phức tạp cần bổ sung bằng tile property.

### 5.2 Tile property (bổ sung cho trường hợp đặc biệt)

Trong Tiled, chọn tile trong tileset → `Properties` → thêm property:

| Property | Type | Ý nghĩa |
|---|---|---|
| `passage` | int | `0x00` = walkable, `0x0f` = blocked (override heuristic) |
| `terrain_tag` | int | `0x02` = grass, `0x06` = water, `0x0a` = tall grass |
| `ledge_dir` | string | `down` / `up` / `left` / `right` |
| `water` | bool | true = ô nước |

**Cách thêm:** trong Tiled, mở `Tileset` panel → chọn tile → thêm property. Tiled lưu vào `tilesets[].tiles[].properties` trong `.tmj`.

### 5.3 Object property override

Trên object trong layer `Objects`, thêm property tương tự (`passage`, `terrain_tag`, `ledge_dir`, `water`) → override collision tại ô đó.

---

## 6. Custom properties trong Tiled (optional)

| Property | Áp dụng cho | Ý nghĩa |
|---|---|---|
| `passage` | tile / object | Override collision (0x00 walkable, 0x0f blocked) |
| `terrain_tag` | tile / object | `0x02`=grass, `0x06`=water, `0x0a`=tall grass |
| `ledge_dir` | tile / object | `down` / `up` / `left` / `right` |
| `water` | tile / object | true = ô nước |

---

## 7. Map properties (metadata)

Trong Tiled: `Map → Map Properties` → thêm:

| Property | Type | Mặc định | Ý nghĩa |
|---|---|---|---|
| `name` | string | mapId | Tên hiển thị |
| `mapType` | string | `town` | `town` / `route` / `dungeon` / `gym` / `interior` / `battle` |
| `music` | string | mapId | BGM |
| `weather` | string | `sunny` | Thời tiết |
| `description` | string | — | Mô tả |

---

## 8. Lệnh build

```bash
# Build 1 map
pnpm run build:map lappet-town

# Build tất cả map trong tiled/
pnpm run build:map -- --all

# Dry-run (không ghi, chỉ báo cáo)
pnpm run build:map -- --all --dry-run

# Watch mode (tự regenerate khi Tiled save)
pnpm run build:map -- --all --watch
```

Script: `scripts/build-server-map.ts` (Node 24 chạy trực tiếp TS, không cần tsx).

---

## 9. Kiểm tra sau khi build

```bash
# Xem kết quả
cat packages/shared/data/maps/server/<id>.json | python3 -m json.tool | head -30

# Verify collision (so sánh với bản cũ)
python3 -c "
import json
old = json.load(open('temp/backup-server-json/<id>.json'))
new = json.load(open('packages/shared/data/maps/server/<id>.json'))
of = old['collision']['flags']; nf = new['collision']['flags']
diff = sum(1 for a,b in zip(of,nf) if a!=b)
print(f'{diff}/{len(of)} cells khác ({100*diff/len(of):.1f}%)')
"
```

---

## 10. Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `TMJ không tồn tại` | File `.tmj` chưa copy vào `tiled/` | Copy file vào `packages/shared/data/maps/tiled/` |
| `Unexpected token '<'` | File là `.tmx` (XML) chứ không phải `.tmj` (JSON) | Export lại dạng JSON trong Tiled |
| `mapId is not defined` | Bug script (đã fix) | Đảm bảo dùng bản mới nhất |
| Collision sai ở ô đặc biệt | Thiếu tile property | Thêm `passage`/`terrain_tag` vào tile trong Tiled |
| Warp không hoạt động | Object thiếu `type: "warp"` hoặc properties | Kiểm tra properties `toMap`/`toX`/`toY` |

---

## 11. Tham khảo

- Plan đầy đủ: [`plan-tiled-first.md`](./plan-tiled-first.md)
- Tiến độ: [`plan-tiled-first-progress.md`](./plan-tiled-first-progress.md)
- Script: `scripts/build-server-map.ts`
- Template: `templates/pixelmon-map-template.tmj`
- CollisionFlag: `packages/shared/src/data/contracts.ts`
