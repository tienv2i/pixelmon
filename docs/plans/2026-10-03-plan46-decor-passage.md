# Plan 46 — Decoration mặc định BLOCKED + Mở rộng `passage` theo hướng

> **Trạng thái:** ✅ ĐÃ IMPLEMENT (2026-10-03) — xem checklist ở mục 6.
> **Ngày:** 2026-10-03
> **Phạm vi:** `scripts/build-server-map.ts`, `packages/shared/src/data/contracts.ts`,
> `packages/shared/src/formulas/mapruntime.ts`, `apps/server/src/modules/world/CollideGrid.ts`,
> `apps/client/src/world/CollisionGrid.ts`, `apps/client/src/scenes/WorldScene.ts`,
> `packages/shared/data/maps/server/*.json`

---

## 1. Vấn đề hiện tại

### 1.1 `passage` chỉ hỗ trợ nhị phân

`build-server-map.ts` (bước B, `deriveCollision`) chỉ kiểm:

```ts
const isBlocked = [gPass, dPass, hPass].some(
  (p) => p !== undefined && (p & 0x0f) === 0x0f,
);
```

→ Chỉ `0x0F` mới `BLOCKED`; mọi giá trị khác (`0x00`, `0x08`, `0x0D`, `0x09`…) đều thành **walkable toàn phần**.

Theo chuẩn RMXP, `passage` là **bitmask 4 hướng**:

| Bit | Giá trị | Hướng |
| :--- | :--- | :--- |
| 0 | `0x01` | Down (xuống) |
| 1 | `0x02` | Left (trái) |
| 2 | `0x04` | Right (phải) |
| 3 | `0x08` | Up (lên) |
| — | `0x0F` | Chặn cả 4 |

**Kết quả trong repo (kiểm 2026-10-03):** các giá trị `passage` đang có: `0`, `15`, `13`, `9`, `64`, `143`.
- `9` (`0b1001`), `13` (`0b1101`) → walkable cả 4 hướng (sai ý nghĩa).
- `64` (`0b1000000`) → walkable.
- `143` (`0b10001111`) → `& 0x0f = 15` → BLOCKED.

→ **Không tile nào chặn được từng hướng.** Bậc thềm/bốn tường thấp không thể làm bằng `passage`.

### 1.2 `terrain_tag` / `spawn_zone` ở Decoration gây nhiễu

Bước B hiện đọc `terrain_tag` (từ **Ground**) nhưng `spawn_zone` thì quét **cả 3 layer**
(`gProps`, `dProps`, `hProps`). Ô Decoration mang `spawn_zone=1` sẽ bị set `GRASS` → thành vùng spawn,
trong khi đó ô đó là vật cản.

**Nguyên tắc mới:** *Decoration mặc định BLOCKED — trừ khi tile có `passage` walkable, hoặc là ledge.*

### 1.3 Bit trong `flags` đã dùng hết

`packages/shared/src/data/contracts.ts` (dòng 223–242) + schema `flags: z.number().int().min(0).max(255)`:

| Bit | Hằng | Ý nghĩa |
| :--- | :--- | :--- |
| 0 | `WALKABLE = 0x01` | đi được |
| 1 | `WATER = 0x02` | nước (cần surf) |
| 2 | `BLOCKED = 0x04` | chặn |
| 3 | `GRASS = 0x08` | cỏ (gây encounter) |
| 4 | `LEDGE = 0x10` | ledge |
| 5–6 | `LEDGE_DIR_MASK = 0x60` | hướng rơi ledge (2 bit) |
| 7 | `WARP = 0x80` | cổng warp |

→ 8/8 bit đã dùng. Passage per-direction cần **4 bit nữa** ⇒ phải mở rộng `flags` lên **uint16**.

---

## 2. Quyết định thiết kế

| Hạng mục | Quyết định |
| :--- | :--- |
| Encode passage | **Mở rộng `flags` lên uint16** (bits 8–11), giữ 8 bit cũ nguyên vẹn (tương thích ngược) |
| Nguồn `terrain_tag` | Chỉ đọc từ **Ground** (đã đúng) |
| Nguồn `spawn_zone` | Chỉ đọc từ **Ground** (đổi — hiện quét cả 3 layer) |
| Nguồn `ledge_dir` | Quét cả 3 layer (giữ nguyên — có thể nằm ở Decoration) |
| Decoration mặc định | **BLOCKED** (heuristic bước A giữ nguyên) |
| Tương thích dữ liệu cũ | `0` = đi cả 4 hướng, `0x0F` = chặn cả 4 hướng → hành vi **không đổi** |

### 2.1 Bit mới

```
PASSAGE (block-direction) — chỉ có ý nghĩa khi ô KHÔNG BLOCKED toàn phần.
Bit 8  PASS_DOWN  0x0100   không đi được xuống   (RMXP passage bit 0)
Bit 9  PASS_LEFT  0x0200   không đi được trái    (RMXP passage bit 1)
Bit 10 PASS_RIGHT 0x0400   không đi được phải    (RMXP passage bit 2)
Bit 11 PASS_UP    0x0800   không đi được lên     (RMXP passage bit 3)

PASS_DIR_MASK = 0x0F00
PASS_ALL      = 0x0F00    (= passage 0x0F → chặn 4 hướng)
```

**Quy ước ánh xạ RMXP → bit:**

| `passage` | Bit RMXP | Hướng chặn | Bit mới |
| :--- | :--- | :--- | :--- |
| `0x01` | 0 | Down | `PASS_DOWN` |
| `0x02` | 1 | Left | `PASS_LEFT` |
| `0x04` | 2 | Right | `PASS_RIGHT` |
| `0x08` | 3 | Up | `PASS_UP` |
| `0x0F` | 0–3 | cả 4 | `PASS_ALL` ⇒ `BLOCKED` |

> **Lưu ý chiều:** theo chuẩn RMXP, bit `1` nghĩa là **không cho đi** theo hướng đó
> (tức `passages[tile]` là *tập hướng bị chặn*). Bit cao (`0x40`, `0x80`) là cờ khác của
> RMXP — **bỏ qua** (không map sang), vì `build-server-map.ts` chỉ mask `0x0f`.

**Không thay đổi:** ô có `passage = 0x0F` vẫn set `BLOCKED` (không dùng 4 bit mới) — giữ hành vi cũ.

---

## 3. Các bước thực hiện

### Bước 1 — `contracts.ts`: mở rộng schema + hằng mới

**File:** `packages/shared/src/data/contracts.ts` (dòng 223–248)

1. Thêm 4 hằng `PASS_DOWN/LEFT/RIGHT/UP`, `PASS_DIR_MASK`, `PASS_ALL` vào `CollisionFlag`.
2. Đổi schema `flags: z.array(z.number().int().min(0).max(255))` → `.max(65535)`.
3. Comment giải thích 16-bit layout (8 bit cũ + 4 bit passage + 4 bit dự phòng).

```ts
export const CollisionFlag = {
  // ── Byte thấp (8 bit cũ — giữ nguyên để tương thích) ──
  WALKABLE: 0x01, WATER: 0x02, BLOCKED: 0x04, GRASS: 0x08,
  LEDGE: 0x10, LEDGE_DIR_MASK: 0x60,
  LEDGE_SOUTH: 0x10 | 0x00, LEDGE_NORTH: 0x10 | 0x20,
  LEDGE_WEST: 0x10 | 0x40,  LEDGE_EAST: 0x10 | 0x60,
  WARP: 0x80,
  // ── Byte cao (bit 8-15) ──
  /** Hướng bị chặn (theo `passage` của RMXP). 0 = đi được cả 4 hướng. */
  PASS_DOWN: 0x0100, PASS_LEFT: 0x0200,
  PASS_RIGHT: 0x0400, PASS_UP: 0x0800,
  PASS_DIR_MASK: 0x0f00, PASS_ALL: 0x0f00,
} as const;

export const CollisionLayerSchema = z.object({
  name: z.string().default('collision'),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  flags: z.array(z.number().int().min(0).max(65535)),  // uint16
});
```

### Bước 2 — `build-server-map.ts`: sinh bit passage

**File:** `scripts/build-server-map.ts` — `deriveCollision()` (bước B)

1. Thêm hằng `PASS_DOWN/LEFT/RIGHT/UP` cạnh `GRASS`/`WATER`/`BLOCKED` (dòng ~31–34).
2. Thêm bảng ánh xạ:

```ts
/** passage (RMXP bitmask) → bit PASS_* trong collision.flags. */
const PASSAGE_TO_PASS_FLAG: Record<number, number> = {
  0x01: PASS_DOWN, 0x02: PASS_LEFT, 0x04: PASS_RIGHT, 0x08: PASS_UP,
};
```

3. Trong vòng lặp derive, tính `passFlag`:

```ts
// Passage (RMXP 4-bit): 0 = đi cả 4 hướng, 0x0f = chặn cả 4 hướng.
// Ô nào trong 3 layer CÓ passage → lấy giá trị đó (Ground ưu tiên).
// Ô nào không có passage nào → coi như passage = 0 (đi được cả 4 hướng).
const passSrc = [gPass, dPass, hPass].find((p) => p !== undefined) ?? 0;
const passLow = passSrc & 0x0f;
const passAll = [gPass, dPass, hPass].some((p) => p !== undefined && (p & 0x0f) === 0x0f);
```

4. Ghép `flag`:

```ts
const grassFlag = terrainFlag | (spawnSrc ? GRASS : 0);   // spawn chỉ từ Ground
if (passAll) {
  // passage 0x0f → BLOCKED toàn phần (giữ hành vi cũ)
  flag = (flag & ~WALKABLE) | BLOCKED;
} else {
  // Ô đi được nhưng có hướng bị chặn
  flag = (flag & ~BLOCKED) | WALKABLE | PASSAGE_TO_PASS_FLAG_ALL[passLow];
}
```

> ⚠️ **Thứ tự ưu tiên:** `BLOCKED` (tường) > `LEDGE` > `GRASS` > `PASS_DIR`.
> Ô `BLOCKED` thì không cần `PASS_DIR` (đã chặn hết). Ô `LEDGE` walkable → vẫn gắn `PASS_DIR`
> được nhưng logic ledge (`canJumpLedge`) kiểm trước.

5. **`spawn_zone` chỉ đọc từ Ground** (đổi từ quét 3 layer):

```ts
const spawnZone = gProps && propNumFromMap(gProps, 'spawn_zone') === 1 ? GRASS : 0;
```

6. Bỏ phần `else if (isBlocked)` cũ, thay bằng nhánh `passAll` ở trên (logic `passage` thay thế
   nhánh `isBlocked` — vì `isBlocked` vốn chỉ là `passage & 0x0f === 0x0f`).

> **Tương thích:** tile không có property `passage` nào → `passSrc = 0` → `passLow = 0` → `passFlag = 0`
> → `WALKABLE`, **không chặn hướng nào**. Hành vi giống hệt hiện tại.

### Bước 3 — `build-server-map.ts`: object override

Cùng file, khối object override (dòng ~298) — cập nhật để dùng bit mới:

```ts
const passage = propNum(o, 'passage');
if (passage !== undefined) {
  const low = passage & 0x0f;
  if (low === 0x0f) flags[i] = (flags[i] & ~WALKABLE) | BLOCKED;
  else flags[i] = (flags[i] & ~BLOCKED) | WALKABLE | PASSAGE_TO_PASS_FLAG_ALL[low];
}
```

### Bước 4 — `mapruntime.ts`: hàm tra hướng

**File:** `packages/shared/src/formulas/mapruntime.ts`

Thêm 3 hàm (SSOT dùng chung client & server):

```ts
/** Ô có chặn hướng `dir` không? (dùng bit PASS_*) */
export function isDirBlocked(map: ServerMap, x: number, y: number, dir: Dir): boolean;

/** Ô đi được theo hướng `dir` không? (BLOCKED / PASS_* / WATER / GRASS...) */
export function canStep(map: ServerMap, x: number, y: number, dir: Dir, opts?: WalkableOptions): boolean;

/** Tất cả 4 hướng bị chặn? (tương đương BLOCKED) */
export function isPassageAll(map: ServerMap, x: number, y: number): boolean;
```

Export qua `packages/shared/src/formulas/index.ts`.

### Bước 5 — `CollideGrid.ts` (server): chặn theo hướng khi validate

**File:** `apps/server/src/modules/world/CollideGrid.ts`

1. Thêm method:

```ts
/** Ô đi được theo hướng `dir` không? */
steppable(x: number, y: number, dir: Dir, opts: WalkableOptions = {}): boolean {
  return canStep(this.map, x, y, dir, opts);
}
```

2. Cập nhật `validateStep()` — sau khi kiểm walkable, thêm kiểm hướng:

```ts
// Bước đơn: chặn nếu hướng bị PASS_* chặn
if (isSingleStep) {
  if (grid.ledge(from.x, from.y)) return { ok: false, reason: 'on_ledge_must_hop' };
  if (!grid.walkable(to.x, to.y, opts)) return { ok: false, reason: 'destination_blocked' };
  if (isDirBlocked(grid.map, to.x, to.y, hopDirOf(dx, dy)))
    return { ok: false, reason: 'direction_passage_blocked' };
  return { ok: true, to };
}
```

> **Lưu ý:** hướng kiểm là hướng **từ `to` về `from`** hay **từ `from` về `to`**?
> Theo chuẩn RMXP, `passages[tile]` là hướng bị chặn **tại ô đó** — nghĩa là khi
> đứng ở `to`, có được bước sang `from` không. Cần chốt lại khi implement và viết test.

### Bước 6 — `CollisionGrid.ts` + `WorldScene.ts` (client)

**File:** `apps/client/src/world/CollisionGrid.ts` — mirror `steppable()` của server.

**File:** `apps/client/src/scenes/WorldScene.ts` — `canEnterTile()` hiện chỉ nhận `(col, row)`,
**không có tham số hướng**. Cần:

```ts
private canEnterTile(col: number, row: number, dir?: Dir): boolean {
  ...
  if (dir && this.collision.isDirBlocked(col, row, dir)) return false;
  return this.collision.isWalkable(col, row, { canSurf: this.surfing });
}
```

Cập nhật call-site ở `handleInputDirection()` / `advanceAlongPath()` truyền `dir` vào.

### Bước 7 — Debug overlay + lệnh debug

1. `drawCollisionOverlay()` — vẽ thêm viền/mũi tên cho ô có `PASS_DIR` khác 0 (màu tím `#a29bfe`),
   hiển thị 1 chấm nhỏ ở cạnh bị chặn.
2. `/tile <x> <y>` — thêm dòng `Passage dir` in ra các hướng bị chặn.
3. `/debug passage` — tô overlay toàn bộ ô có `PASS_DIR` khác 0 (để kiểm hàng loạt).

### Bước 8 — Rebuild + kiểm chứng

```bash
pnpm run typecheck     # 4/4
pnpm run build:map     # rebuild 5 map (flags giờ có thể > 255)
./scripts/pm.sh restart
```

**Kiểm chứng dữ liệu:**
- Script kiểm `flags` không còn giá trị `null`/NaN, `<= 65535`.
- Đếm ô có `PASS_DIR != 0` trước/sau: **kỳ vọng = 0** (vì không tile nào có `passage`
  ngoài `0`/`0x0F` → hành vi game **không đổi**), xác nhận không phá vỡ bản đồ.
- `/tile` trên vài ô Decoration có `passage=0` → vẫn walkable.
- `/tile` trên ô Decoration có `passage=15` → vẫn BLOCKED.

---

## 4. Tác động & rủi ro

| Rủi ro | Mức | Xử lý |
| :--- | :--- | :--- |
| `flags` > 255 → JSON/schema lỗi | Cao | Bước 1 đổi schema **trước** khi build |
| Client/server lệch logic hướng | Cao | Cùng dùng `formulas/mapruntime.ts` (SSOT) |
| Hướng kiểm ngược (`to` vs `from`) | Trung bình | Chốt + test bằng `/tile` + đi thử 4 hướng |
| Ledge + PASS_DIR cùng tồn tại | Thấp | `canJumpLedge` kiểm trước `isDirBlocked` |
| JSON map to hơn | Thấp | Uint16 vẫn nhỏ hơn nhiều so với string |
| Dữ liệu cũ (chưa rebuild) lỗi | Trung bình | Bắt buộc chạy `build:map` sau khi deploy |

---

## 5. Ngoài phạm vi (không làm trong plan này)

- Sửa 1 ô Decoration cụ thể nào đó (chờ bạn vẽ `passage` trong Tiled).
- `ledge` chặn hướng đi ngược (hiện ledge chỉ "bắt buộc nhảy 2 ô theo 1 hướng").
- Vẽ lại `spawn_zone` cho `lappet-town` (0 ô GRASS — cần vẽ trong Tiled).

---

## 6. Checklist hoàn thành

- [x] B1 `contracts.ts`: 4 hằng `PASS_*` + schema `max(65535)`
- [x] B2 `build-server-map.ts`: `PASSAGE_TO_PASS_FLAG`, `passAll`, `spawn_zone` chỉ Ground
- [x] B3 `build-server-map.ts`: object override dùng bit mới
- [x] B4 `mapruntime.ts`: `isDirBlocked` / `canStep` / `isPassageAll` + export
- [x] B5 `CollideGrid.ts` (server): `steppable()` + `dirBlocked()` + `validateStep()`
- [x] B6 client `CollisionGrid.ts` + `WorldScene.canEnterTile(dir)` + `Pathfinder.TileCollider(fromCol,fromRow)`
- [x] B7 debug overlay (dải tím cạnh bị chặn) + `/tile` in `passage chặn:` + `/debug passage <dir|all|none>`
- [x] B8 `pnpm run typecheck` 4/4 · `build:map` · `pm.sh restart`
- [x] Cập nhật `docs/tiled-workflow.md` (bảng property + mục 5.2b)
- [x] Cập nhật `project_status.md`

**Kết quả kiểm chứng (2026-10-03):**
- `flags > 255`: chỉ **2 ô** — `(23,10)` & `(24,10)` route-1, tile Deco `gid=829` có `passage=13` →
  `0x0D11` = PASS_DOWN|PASS_RIGHT|PASS_UP|LEDGE|WALKABLE (trước đây bỏ qua → walkable toàn phần).
- Các map khác `max=129` (0x81 = WALKABLE|WARP) → không đổi hành vi.
- `typecheck` 4/4 · `build:map` 5/5 · server restart OK.