# Kế hoạch & Hướng dẫn sửa lỗi chi tiết (Comprehensive Fix Plan)

Tài liệu này bao gồm chẩn đoán, nguyên nhân gốc rễ và **hướng dẫn sửa mã nguồn cụ thể từng file (Before / After)** cho 3 vấn đề:
1. **Sửa lỗi Tileset cho Map Nội thất** (`Player's house`, `Daisy's house`, `Pokémon Lab`). — ✅ **Đã sửa (2026-10-02)**
2. **Sửa lỗi "Mỏm đá ảo" tại ô `[6, 11]` Lappet Town** (TerrainTag 10 TallGrass bị map nhầm thành Ledge). — ✅ **Đã sửa (2026-10-02)**
3. **Tối ưu hóa chuyển động nhân vật** (Triệt tiêu hiện tượng di chuyển khựng/giật camera bằng Delta Grid-Step & Input Buffering). — ✅ **Đã sửa (2026-10-02)**

> **Trạng thái cập nhật 2026-10-02:** Toàn bộ plan đã hoàn tất. Mục 1 (1.1 + 1.2) sửa tileset nội thất + terrain tag; mục 2 không cần áp dụng vì `admin.js` và `TiledMapLoader.ts` đã tự phân biệt Interior/Outdoor qua chuỗi `ts.image`; mục 3 chuyển sang Delta Grid-Step + Input Buffering + LERP remote player.

---

# MỤC LỤC
- [I. SỬA SCRIPT IMPORT & DỮ LIỆU MAPS](#i-sửa-script-import--dữ-liệu-maps) — ✅ xong
  - [1.1 Sửa `scripts/tools/convert_essentials_map.py`](#11-sửa-scriptstoolsconvert_essentials_mappy) — ✅ xong
  - [1.2 Chạy lệnh re-convert các map bị ảnh hưởng](#12-chạy-lệnh-re-convert-các-map-bị-ảnh-hưởng) — ✅ xong
- [II. SỬA KHÂU RENDER TRONG ADMIN & CLIENT](#ii-sửa-khâu-render-trong-admin--client) — ⬜ không cần (đã tự động đúng)
  - [2.1 Sửa `apps/server/public/js/admin.js`](#21-sửa-appsserverpublicjsadminjs) — ⬜ không cần
  - [2.2 Sửa `apps/client/src/world/TiledMapLoader.ts`](#22-sửa-appsclientsrcworldtiledmaploaderts) — ⬜ không cần
- [III. TỐI ƯU HÓA CHUYỂN ĐỘNG (DELTA GRID-STEP & INPUT BUFFER)](#iii-tối-ưu-hóa-chuyển-động-delta-grid-step--input-buffer) — ✅ xong
  - [3.1 Sửa `apps/client/src/entities/PlayerSprite.ts`](#31-sửa-appsclientsrcentitiesplayerspritets) — ✅ xong
  - [3.2 Sửa `apps/client/src/scenes/WorldScene.ts`](#32-sửa-appsclientsrcscenesworldscenets) — ✅ xong
- [IV. CÁC BƯỚC TEST & XÁC NHẬN HOÀN TẤT](#iv-các-bước-test--xác-nhận-hoàn-tất)

---

# I. SỬA SCRIPT IMPORT & DỮ LIỆU MAPS

### 1.1 Sửa `scripts/tools/convert_essentials_map.py`

#### Vấn đề 1: Nhầm lẫn Terrain Tag (Nguyên nhân gây mỏm đá ảo tại ô [6, 11])
Tại dòng 76–90, `Tag 2` (Grass) và `Tag 10` (TallGrass) bị gán nhầm thành `LEDGE_SOUTH`.

**Sửa lại đoạn `TERRAIN_TAG_TO_FLAG` (dòng 76–94):**
```python
# Trước khi sửa:
TERRAIN_TAG_TO_FLAG = {
    1:  WALKABLE | LEDGE_SOUTH,  # Ledge (jump down)   passage 0x07
    2:  WALKABLE | LEDGE_SOUTH,  # Ledge               passage 0x40
    3:  WALKABLE,                # Sand                passage 0x00
    4:  BLOCKED,                 # Rock (chặn ~92%)     passage 0x0f
    ...
    10: WALKABLE | LEDGE_SOUTH,  # Ledge               passage 0x40 (Lappet Town, 6 tiles)
}

# Sau khi sửa:
TERRAIN_TAG_TO_FLAG = {
    1:  WALKABLE | LEDGE_SOUTH,  # Ledge (chỉ duy nhất tag 1 là mỏm đá nhảy)
    2:  WALKABLE | GRASS,        # Grass (cỏ thường)
    3:  WALKABLE,                # Sand
    4:  BLOCKED,                 # Rock
    5:  WATER,                   # DeepWater
    6:  WATER,                   # StillWater
    7:  WATER,                   # Water
    8:  WATER | BLOCKED,         # Waterfall
    9:  WATER,                   # WaterfallCrest
    10: WALKABLE | GRASS,        # TallGrass (bụi cỏ cao gặp pokemon hoang dã)
    11: WATER,                   # UnderwaterGrass
    12: WALKABLE,                # Ice
    13: WALKABLE,                # Neutral
    14: WALKABLE | GRASS,        # SootGrass
    15: WALKABLE,                # Bridge
    16: WALKABLE,                # Custom passage 0x00
}
```

#### Vấn đề 2: Hardcode Tileset `Outdoor.png` cho mọi map — ✅ ĐÃ SỬA (2026-10-02)
Tại hàm `convert()` (khoảng dòng 118 và dòng 257–271):

**Đã thêm logic đọc tên tileset từ RMXP** (biến `tileset_image/tileset_name/tileset_w/tileset_h/tileset_count`):
```python
# Sau dòng: tid = attrs["@tileset_id"]; ts_data = tilesets[tid]
raw_ts_name = ts_data.attributes.get("@tileset_name", "")
ts_name = raw_ts_name.decode("utf-8", errors="ignore") if isinstance(raw_ts_name, bytes) else str(raw_ts_name)

is_interior = (map_type == "interior") or ("interior" in ts_name.lower())
if is_interior:
    tileset_image = "assets/tilesets/Interior general.png"
    tileset_name = "interior_general"
    tileset_w = 256
    tileset_h = 8032
    tileset_count = 2008
else:
    tileset_image = "assets/tilesets/Outdoor.png"
    tileset_name = "outdoor"
    tileset_w = 256
    tileset_h = 16096
    tileset_count = 4024
```

**Đã cập nhật cấu trúc `tilesets` trong `tmj_json`** (dòng 278–291) để dùng các biến trên thay vì hardcode. Kích thước đã verify bằng `inspect_image.py`: `Outdoor.png` = 256×16096 (4024 tiles), `Interior general.png` = 256×8032 (2008 tiles).

---

### 1.2 Chạy lệnh re-convert các map bị ảnh hưởng — ✅ ĐÃ CHẠY (2026-10-02)

Chạy các lệnh CLI sau trong terminal dự án (dùng Python trong `.venv`):
```bash
# 1. Re-convert Lappet Town (xoá cờ Ledge ảo ở ô 6,11)
.venv/bin/python3 scripts/tools/convert_essentials_map.py 2 lappet-town "Lappet Town" --type town

# 2. Re-convert Player's House (chuyển sang tileset Interior general)
.venv/bin/python3 scripts/tools/convert_essentials_map.py 3 players-house "Player's House" --type interior

# 3. Re-convert Pokémon Lab (chuyển sang tileset Interior general)
.venv/bin/python3 scripts/tools/convert_essentials_map.py 4 pokemon-lab "Pokemon Lab" --type interior

# 4. Re-convert Daisy's House (chuyển sang tileset Interior general)
.venv/bin/python3 scripts/tools/convert_essentials_map.py 8 daisys-house "Daisy's House" --type interior
```

**Kết quả thực tế (2026-10-02):**
```
Successfully converted Map 002 -> lappet-town (32x21) | warps=3 | events=1
Successfully converted Map 003 -> players-house (31x15) | warps=3 | events=11
Successfully converted Map 004 -> pokemon-lab (20x15) | warps=1 | events=10
Successfully converted Map 008 -> daisys-house (20x15) | warps=1 | events=5
```

**Kiểm chứng:**
- `players-house.tmj`, `pokemon-lab.tmj`, `daisys-house.tmj` giờ dùng `"image": "assets/tilesets/Interior general.png"`, `imageheight: 8032`, `tilecount: 2008`, `name: "interior_general"`.
- `lappet-town.tmj` sửa `imageheight` 22080 → 16096, `tilecount` 5520 → 4024 (đúng kích thước thật của `Outdoor.png`).
- `lappet-town.json`: 7 ô flag `17` (0x11 = WALKABLE|LEDGE_SOUTH) → `9` (0x09 = WALKABLE|GRASS); ledge count 0, grass count 7.

---

# II. SỬA KHÂU RENDER TRONG ADMIN & CLIENT

> **⏭️ Mục II KHÔNG CẦN THIẾT — đã bỏ qua có chủ đích (2026-10-02).**
> Lý do: cả `admin.js` lẫn `TiledMapLoader.ts` đã tự phân biệt Interior/Outdoor **qua chuỗi `ts.image`**
> (`tsPath.includes('Interior')` / `ts.image.includes('Interior')`). Trước đây chúng không hoạt động
> chỉ vì converter hardcode `Outdoor.png` cho mọi map. Sau khi converter emit đúng đường dẫn
> `Interior general.png`, cả hai render tự động chọn đúng tileset mà không cần sửa code.
> Nếu sau này cần hardening (ví dụ map interior không chứa chữ "Interior" trong tên file),
> mới quay lại áp dụng 2.1/2.2.

### 2.1 Sửa `apps/server/public/js/admin.js`

Tại dòng 2420–2439 và 2465–2466:

**Cập nhật hàm `ensureTilesetImage` nhận thêm `mapType`:**
```javascript
// Trước khi sửa:
var tilesetCache = {};
function ensureTilesetImage(tsPath, cb) {
  var src = '/assets/tilesets/Outdoor.png';
  if (tsPath && (tsPath.includes('Interior') || tsPath.includes('interior'))) {
    src = '/assets/tilesets/Interior general.png';
  }
  // ...
}

// Sau khi sửa:
var tilesetCache = {};
function ensureTilesetImage(tsPath, mapType, cb) {
  var isInterior = (tsPath && (tsPath.includes('Interior') || tsPath.includes('interior'))) || (mapType === 'interior');
  var src = isInterior ? '/assets/tilesets/Interior general.png' : '/assets/tilesets/Outdoor.png';

  if (tilesetCache[src] && tilesetCache[src].complete) {
    cb(tilesetCache[src]);
    return;
  }
  var img = new Image();
  img.src = src;
  img.onload = function () {
    tilesetCache[src] = img;
    cb(img);
  };
  img.onerror = function () {
    console.error('Failed to load tileset image:', src);
  };
}
```

**Tại hàm `renderMapCanvas()` (dòng 2465):**
```javascript
// Trước khi sửa:
var tsPath = (tiled && tiled.tilesets && tiled.tilesets[0]) ? tiled.tilesets[0].image : '';
ensureTilesetImage(tsPath, function (tsImg) { ... });

// Sau khi sửa:
var tsPath = (tiled && tiled.tilesets && tiled.tilesets[0]) ? tiled.tilesets[0].image : '';
ensureTilesetImage(tsPath, m.mapType, function (tsImg) { ... });
```

---

### 2.2 Sửa `apps/client/src/world/TiledMapLoader.ts`

Tại dòng 87–90:
```typescript
// Trước khi sửa:
const isInterior = ts.image.includes('Interior') || ts.name.includes('interior');

// Sau khi sửa (an toàn hơn, kiểm tra cả thuộc tính mapType nếu có):
const isInterior =
  ts.image.includes('Interior') ||
  ts.name.includes('interior') ||
  (mapJson as any).properties?.some((p: any) => p.name === 'mapType' && p.value === 'interior');
```

---

# III. TỐI ƯU HÓA CHUYỂN ĐỘNG (DELTA GRID-STEP & INPUT BUFFER)

> **✅ ĐÃ ÁP DỤNG (2026-10-02)** — typecheck 4/4 sạch, `vite build` thành công.
> **Các điểm KHÁC so với bản kế hoạch ban đầu** (đã lưu ý khi code):
> 1. Tên biến dùng `stepStartX/Y`, `stepTargetX/Y`, `stepDir` (đọc rõ hơn `startPixelX`/`currentStepDir`).
> 2. `Phaser.Math.Approach` **không tồn tại** trong typings Phaser của dự án → dùng
>    `Phaser.Math.Linear(x, target, min(step / total, 1))` (tương đương Approach, có clamp chống vượt).
> 3. `onTileEntered` (warp / grass encounter) **chuyển từ `stepTo` sang `advanceStep`** — chỉ chạy khi
>    đã tới tâm ô, nên toạ độ luôn chuẩn tâm ô.
> 4. Thêm guard `if (this.isWalking) return false` trong `handleInputDirection` và reset
>    `isWalking`/`bufferedDir`/`nextStepAt` ở `switchMap`, `teleportPlayer`, `onMoveRejected`, `jumpLedge`.
> 5. Khi đang trượt, `update()` **không** gọi thêm `animateWalk` (tránh fallback timer ghi đè
>    frame đã chọn theo progress).

### 3.1 Sửa `apps/client/src/entities/PlayerSprite.ts`

Cải tiến hàm `animateWalk` để nhận biết tiến trình bước đi ($0.0 \to 1.0$), giúp bước chân ăn khớp 100% với khoảng cách di chuyển:

```typescript
// Sửa hàm animateWalk:
animateWalk(deltaMs: number, moving: boolean, walkProgress = 0): void {
  const maxFrame = FRAMES_PER_DIR[this.sheet];
  if (!moving) {
    this.walkTimer = 0;
    this.setFrame(frameName(this.dir, 0));
    return;
  }

  // Khớp frame theo tiến trình ô (0.0 -> 1.0):
  if (walkProgress > 0) {
    const frameIndex = Math.min(Math.floor(walkProgress * maxFrame), maxFrame - 1);
    this.setFrame(frameName(this.dir, frameIndex));
    return;
  }

  // Fallback timer nếu không truyền progress:
  this.walkTimer += deltaMs;
  if (this.walkTimer >= WALK_FRAME_MS) {
    this.walkTimer = 0;
    this.walkFrame = (this.walkFrame + 1) % maxFrame;
    this.setFrame(frameName(this.dir, this.walkFrame));
  }
}
```

---

### 3.2 Sửa `apps/client/src/scenes/WorldScene.ts`

Đây là nơi chuyển từ **Snap 32px** sang **Delta Grid-Step** mượt mà.

#### 1. Khai báo thuộc tính mới:
```typescript
// Trạng thái trượt mượt giữa 2 ô:
private isWalking = false;
private startPixelX = 0;
private startPixelY = 0;
private targetPixelX = 0;
private targetPixelY = 0;
private currentStepDir: Dir = 'down';
private bufferedDir: Dir | null = null;
private static readonly WALK_SPEED_PX = (TILE_SIZE / MOVE_COOLDOWN_MS) * 1000; // ≈ 213.3 px/s
```

#### 2. Cải tiến hàm `stepTo`:
Không gọi `setPosition(center.x, center.y)` ngay lập tức. Thay vào đó bắt đầu trạng thái trượt ô:
```typescript
private stepTo(tileX: number, tileY: number, dir: Dir): void {
  const center = this.tileCenter(tileX, tileY);
  this.startPixelX = this.player.x;
  this.startPixelY = this.player.y;
  this.targetPixelX = center.x;
  this.targetPixelY = center.y;
  this.currentStepDir = dir;
  this.isWalking = true;
  this.player.setDirection(dir);

  // Cập nhật trạng thái surf
  const inWater = this.collision.isWater(tileX, tileY);
  if (inWater !== this.surfing) {
    this.surfing = inWater;
    this.player.setSurfing(inWater);
  }

  this.sendMoveThrottled(center.x, center.y, dir);
}
```

#### 3. Cập nhật vị trí trong `update(time, delta)`:
```typescript
// Trong update():
if (this.isWalking) {
  const step = (WorldScene.WALK_SPEED_PX * delta) / 1000;
  this.player.x = Phaser.Math.Approach(this.player.x, this.targetPixelX, step);
  this.player.y = Phaser.Math.Approach(this.player.y, this.targetPixelY, step);
  this.player.setPosition(this.player.x, this.player.y); // đồng bộ nameText và shadow

  // Tính % quãng đường đã đi trên ô hiện tại
  const totalDist = Phaser.Math.Distance.Between(this.startPixelX, this.startPixelY, this.targetPixelX, this.targetPixelY);
  const remainingDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.targetPixelX, this.targetPixelY);
  const progress = totalDist > 0 ? (1 - remainingDist / totalDist) : 1;

  this.player.animateWalk(delta, true, progress);

  // Đã tới tâm ô đích (sai số <= 1px):
  if (remainingDist <= 1.0) {
    this.player.setPosition(this.targetPixelX, this.targetPixelY);
    this.isWalking = false;

    const tileX = Math.floor(this.targetPixelX / TILE_SIZE);
    const tileY = Math.floor(this.targetPixelY / TILE_SIZE);
    this.onTileEntered(tileX, tileY, this.currentStepDir);

    // Nối bước ngay lập tức nếu đang có phím giữ / phím đệm:
    const nextDir = keyDirection || this.bufferedDir;
    if (nextDir && this.handleInputDirection(nextDir)) {
      this.isWalking = true;
    }
  }
} else {
  this.player.animateWalk(delta, false);
}
```

#### 4. Thêm LERP cho Remote Players:
Trong `WorldScene.ts`:
```typescript
// Trong update(): nội suy vị trí cho người chơi khác
this.remotePlayers.forEach((rp: any) => {
  if (rp.targetX !== undefined && rp.targetY !== undefined) {
    rp.x = Phaser.Math.Linear(rp.x, rp.targetX, 0.2);
    rp.y = Phaser.Math.Linear(rp.y, rp.targetY, 0.2);
    rp.setPosition(rp.x, rp.y);
  }
});

// Trong syncRemotePlayers(state):
state.players.forEach((ps: any, sessionId: string) => {
  // ...
  let rp = this.remotePlayers.get(sessionId) as any;
  if (rp) {
    rp.targetX = ps.x;
    rp.targetY = ps.y;
    if (ps.direction) rp.setDirection(ps.direction);
  }
});
```

---

# IV. CÁC BƯỚC TEST & XÁC NHẬN HOÀN TẤT

> **Kết quả kiểm chứng tự động (2026-10-02):** `pnpm run typecheck` → 4/4 package sạch;
> `vite build` → thành công. Các test cần thao tác tay trên trình duyệt (mục 1 phần cuối,
> mục 2, mục 3) được đánh dấu ⬜ để kiểm tra khi chạy game.

1. **Test kiểm tra Lappet Town (Ô [6, 11])**: ✅ **Đã verify bằng script**
   - Chạy lệnh kiểm tra cờ va chạm:
     ```bash
     python3 -c "import json; d=json.load(open('packages/shared/data/maps/server/lappet-town.json')); print('Flag at (6,11):', d['collision']['flags'][11*32+6])"
     ```
   - Kết quả mong muốn: `1` (`WALKABLE`) hoặc `9` (`WALKABLE | GRASS`), **không còn cờ `17` (`0x11`)**.
   - ✅ **Kết quả thực tế: `9`** (WALKABLE|GRASS). Ledge count = 0, grass count = 7.
   - ⬜ Vào game điều khiển nhân vật đi qua lại tự do giữa `[6, 11]` và `[6, 10]`.

2. **Test kiểm tra Admin Map Viewer**: ⬜ Chưa test thủ công
   - Truy cập `http://localhost:2567/admin.html` $\to$ Quản lý Maps.
   - Chọn lần lượt: `Player's house`, `Daisy's house`, `Pokémon Lab`.
   - Xác nhận: Canvas hiển thị đúng sàn gỗ, thảm, giường, bàn ghế, cầu thang, PC; không còn cây cỏ nham nhở.

3. **Test kiểm tra độ mượt chuyển động**: ⬜ Chưa test thủ công
   - Chạy Client (`http://localhost:5173`), dùng WASD chạy liên tục và đổi hướng zíc-zắc.
   - Xác nhận: Chuyển động lướt đều 60 FPS, camera trôi êm như bơ, không còn giật khựng từng nấc 32px.

4. **Typecheck toàn bộ monorepo**: ✅ **Đã chạy — 4/4 package sạch, 0 lỗi**
   - Chạy `pnpm run typecheck` đảm bảo 100% không phát sinh lỗi types ở cả client, server và shared package.
