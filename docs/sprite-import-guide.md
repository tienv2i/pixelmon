# Hướng dẫn quy trình Import Sprite

Quy trình chuẩn để thêm một sprite nhân vật (4 hướng × 4 frame) vào game.

---

## 0. Yêu cầu

- Ảnh nguồn PNG, **lưới 4 hàng × 4 cột** (16 frame).
  - Hàng = hướng, Cột = frame đi bộ.
  - Background: nền trắng (sẽ tự tách) **hoặc** đã có alpha.
- Python venv của repo: `.venv/bin/python3` (có Pillow + numpy).
- **KHÔNG** đọc/copy file từ ngoài `/mnt/data/AI-Agent/pixelmon`.

---

## 1. Chuẩn bị ảnh nguồn

Đặt ảnh vào thư mục:

```
sprites_import/<ten_anh>.png
```

Ví dụ: `sprites_import/ninja-red.png`

> Ảnh nên là lưới đều 4×4. Nếu nguồn là ảnh 1D (dải ngang 1024×64) hoặc
> lệch, phải tự ghép lại thành lưới trước khi chạy tool.

---

## 2. Chạy tool cắt sprite

```bash
cd /mnt/data/AI-Agent/pixelmon
.venv/bin/python3 scripts/tools/build_spritesheet.py sprites_import/<ten_anh>.png \
  --name hero_64 \
  --verify \
  --preview /tmp/preview.png \
  --also-32
```

> ⚠️ **`--preview` KHÔNG PHẢI TUỲ CHỌN.** Lỗi đảo hướng là lỗi **âm thầm**:
> script vẫn báo "16/16 frame có nội dung ✓", typecheck vẫn sạch, và tên frame
> trong console vẫn đúng (`down/0_1`) vì tên do code quyết định chứ không phải do
> ảnh. **Chỉ mở preview bằng mắt mới phát hiện được.** Luôn mở ảnh preview và
> đối chiếu trước khi báo xong.

**Tùy chọn:**

| Flag | Ý nghĩa | Mặc định |
|---|---|---|
| `--name` | Tên file output (không `.png`) | `hero_64` |
| `--frame` | Size 1 frame (px) | `64` |
| `--dir-order` | **Thứ tự hàng của ẢNH NGUỒN** | `down,left,right,up` |
| `--rows` | Khai tay `y0-y1,...` nếu auto-detect sai | tự dò |
| `--cols` | Khai tay `x0-x1,...` nếu auto-detect sai | tự dò |
| `--already-alpha` | Nguồn đã có alpha, bỏ qua unmatte | `off` |
| `--verify` | Báo lỗi nếu có frame trống | `off` |
| `--preview` | Ghi ảnh preview có nhãn hướng | `off` |
| `--also-32` | Xuất thêm sheet 32px | `off` |

Output mặc định: `packages/shared/assets/sprites/<name>.png`

### ⚠️ Thứ tự hàng — nơi dễ sai nhất

**Hai thứ tự khác nhau, phải phân biệt rõ:**

| | Thứ tự | Ý nghĩa |
|---|---|---|
| **Ảnh nguồn** (`--dir-order`) | `down, left, right, up` | Thứ tự hàng trong file PNG bạn đưa vào |
| **Sheet game** (cố định) | `down, up, left, right` | Layout chuẩn, khớp `DIRS` |

Tool tự **đảo hàng** từ thứ tự nguồn sang thứ tự game. Đây chính là chỗ từng
sai: khi bỏ bước remap, sheet sinh ra y hệt ảnh nguồn → nhấn ↑ thì nhân vật
quay sang trái, nhấn ← thì quay sang phải, nhấn → thì quay lưng.

**Đã xác minh layout ảnh nguồn** (mở bằng mắt `main.png` và `ninja-red.png`):
hàng 0 = mặt trước, hàng 3 = lưng, hàng 1/2 = hai mặt bên.

Nếu ảnh nguồn của bạn khác, khai lại:

```bash
--dir-order down,left,right,up
```

### Đối chiếu preview

Mở ảnh `--preview` và kiểm tra đúng 4 dòng:

| Nhãn trong preview | Phải thấy |
|---|---|
| `0:down` | mặt trước (thấy mắt) |
| `1:up` | lưng (không thấy mặt) |
| `2:left` | mặt bên trái |
| `3:right` | mặt bên phải |

---

## 3. Đăng ký frame trong code

### 3a. Nếu **thay** sheet `hero_64` hiện có

Không cần sửa gì — `BootScene.loadHeroSheet()` tự đọc
`@pixelmon/shared/assets/sprites/hero_64.png`. File mới ghi đè là xong.

Kiểm tra lại sau khi chạy (trong browser console hoặc qua Playwright):

```js
window.__game.textures.get('hero_sheet').frames['3_0']
// phải cho cutX=192, cutY=192 (với frame 64, grid 4×4)
```

### 3b. Nếu **thêm sheet mới** (khác `hero_64`)

Thêm một key mới trong `TEX` (BootScene.ts):

```ts
export const TEX = {
  // ...các key khác
  heroNinja: 'hero_ninja_sheet',
} as const;
```

Đăng ký frame — **lưu ý 2 lỗi từng gặp**:

```ts
// Gắn file .url để Vite trả về URL
import ninjaSheetUrl from '@pixelmon/shared/assets/sprites/hero_ninja.png?url';

private async loadNinjaSheet(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.textures.addImage(TEX.heroNinja, img);
      const tex = this.textures.get(TEX.heroNinja);
      if (tex && tex.source.length > 0) {
        const F = HERO_FRAME_SIZE; // 64
        HERO_DIRS.forEach((_, di) => {
          for (let i = 0; i < 4; i++) {
            // ✅ 2D: x = cột (F*i), y = hàng (F*di)
            tex.add(`${di}_${i}`, 0, F * i, F * di, F, F);
          }
        });
      }
      resolve();
    };
    img.onerror = () => reject(new Error('hero_ninja.png load failed'));
    img.src = ninjaSheetUrl;
  });
}
```

> **LỖI THƯỜNG GẶP #1 — truyền 1D thay vì 2D**
> ```ts
> tex.add(`${di}_${i}`, 0, F * (di * 4 + i), 0, F, F);   // ❌ index vượt 256
> ```
> Sheet giờ là lưới 4×4 (256×256), không phải dải ngang (1024×64). Chỉ số
> `di*4+i` vượt quá 256 → Phaser clamp về 0 → **tất cả frame trỏ ô 0_0**,
> sprite không bao giờ đổi hướng.

> **LỖI THƯỜNG GẶP #2 — thứ tự hướng lệch**
> `HERO_DIRS` (BootScene) **và** `DIRS` (PlayerSprite) phải giống hệt nhau
> và khớp thứ tự hàng của PNG. Sai → nhân vật quay nhầm hướng.

Sửa `WorldScene` để nhận sheet mới:

```ts
// Thay vì chỉ 2 nhánh hero/trainer, kiểm tra theo key sheet thực sự dùng
const sheetKey = this.textures.exists(TEX.heroNinja) ? TEX.heroNinja : TEX.hero;
const frameCount = 16;
registerPlayerAnims(this, sheetKey, frameCount);
```

---

## 4. Các lỗi đã biết (kiểm tra trước khi báo ok)

### 4a. `Texture <key> has no frame <n>` (n ≈ 1..15)

**Nguyên nhân:** truyền **number index** vào `setFrame()`.

Phaser đăng ký frame dưới dạng **name string** (`'0_0'` … `'3_3'`).
`texture.get(4)` tra `frames[4]` → `undefined`.

**Sửa:** dùng helper `frameName(dir, frame)` trong `PlayerSprite.ts`:

```ts
// ✅
this.setFrame(frameName(this.dir, this.walkFrame));
// ❌
this.setFrame(4);
```

### 4b. Sprite **không đổi hướng** nhưng frame name vẫn đúng

Đọc đúng nhánh property của Frame:

```js
// x/y là rendering offset → LUÔN 0 (sai nếu dùng để kiểm tra)
f.x, f.y            // ❌ luôn 0,0

// toạ độ cắt thật trong texture grid
f.cutX, f.cutY      // ✅ phải phân bố đều theo lưới
```

Nếu `cutX/cutY` đều = 0 → xem lại Lỗi thường gặp #1 ở trên.

### 4c. **Walk cycle không advance** — luôn nhảy về frame `*_0`

**Nguyên nhân:** `setDirection()` reset `walkFrame = 0` **mỗi tick**.

**Sửa:** chỉ reset khi **thực sự đổi hướng**:

```ts
if (d !== this.dir) {
  this.walkFrame = 0;
  this.walkTimer = 0;
  this.dir = d;
  this.setFrame(frameName(d, 0));
}
```

### 4d. **Sai hướng trái/phải** vì lật ngang

Không dùng `setFlipX(true)` cho hướng trái nếu sheet **đã có frame left
thật**. Chỉ dùng flip khi source chỉ có một hàng hướng và bạn phải lật.

### 4e. 🔴 **Nhân vật quay nhầm hướng khi đổi phím** (lỗi âm thầm nhất)

**Triệu chứng** (ví dụ cụ thể đã gặp):

| Nhấn | Thấy |
|---|---|
| ↓ | đúng (mặt trước) |
| ↑ | **mặt bên trái** |
| → | **lưng** |
| ← | **mặt bên phải** |

**Nguyên nhân:** sheet có thứ tự hàng **y hệt ảnh nguồn** (`down, left, right,
up`) trong khi code giả định layout chuẩn (`down, up, left, right`). Nghĩa là
bước **remap/đảo hàng bị thiếu** khi cắt.

**Vì sao KHÔNG có công cụ nào bắt được lỗi này:**

- `--verify` chỉ kiểm frame **không trống** → 16/16 vẫn ✓
- `typecheck` sạch → `DIRS` vẫn đúng thứ tự
- Console vẫn hiện `up / 1_1` → vì **tên frame do code quyết định**, không phải
  do ảnh
- Walk cycle vẫn advance `0_0→0_1→0_2→0_3` bình thường

**→ Chỉ cách duy nhất: MỞ ẢNH PREVIEW BẰNG MẮT.**

Dấu hiệu nhận biết từ triệu chứng: nếu ↓ đúng mà ↑←→ đều sai thì thứ tự hàng
chính là thứ tự ảnh nguồn. Sửa bằng `--dir-order` hoặc sửa remap trong tool.

**Quy tắc chặn lỗi:** mọi lần sinh sheet phải chạy kèm `--preview`, mở ảnh,
đối chiếu 4 dòng nhãn (`0:down` mặt trước, `1:up` lưng, `2:left`, `3:right`)
**trước** khi báo hoàn thành.

---

## 5. Checklist xác nhận

```bash
# 1. Typecheck
npx tsc --noEmit -p apps/client/tsconfig.json

# 2. Chạy lại client
bash scripts/pm.sh restart client

# 3. Kiểm tra frame coords
#    expect: 0_0=>(0,0) 1_0=>(0,64) 2_0=>(0,128) 3_0=>(0,192)
```

```js
// 4. Console — không được còn "Texture has no frame"
window.__game.textures.get('hero_sheet').frames['3_0']
// 5. Walk advance — 6 mẫu liên tiếp phải thấy *_0→*_1→*_2→*_3→*_0
```

Kiểm tra bằng mắt trong game (Playwright):

| Hướng | Frame mong đợi | Nội dung |
|---|---|---|
| ↓ | `0_*` | mặt trước |
| ↑ | `1_*` | lưng |
| ← | `2_*` | mặt bên trái |
| → | `3_*` | mặt bên phải |

**Cách kiểm 4 hướng trong game (đã dùng và hiệu quả):**

```js
// Di chuyểi tới góc vắng người, rồi đóng băng từng hướng và chụp lại
ws.animateWalk = () => {};                       // tắt tự đổi frame
ws.player.setFrame(di + '_0');                   // di = 0..3
```

Rồi crop quanh vị trí player trên màn hình:

```js
const ws = window.__game.scene.getScene('World');
({ sx: ws.player.x - ws.cameras.main.scrollX,
   sy: ws.player.y - ws.cameras.main.scrollY })
```

Ghép 4 ảnh lại thành dải có nhãn rồi **mở xem** — đây mới là bước xác nhận
cuối cùng. Đừng tin frame name trong console.

---

## 6. Không chạy test

Theo `AGENTS.md`: **KHÔNG tự ý chạy test** (`pnpm test`, `vitest`, `jest`).
Chỉ chạy `typecheck` và kiểm tra thủ công bằng browser.

---

## 7. File liên quan

| File | Vai trò |
|---|---|
| `scripts/tools/build_spritesheet.py` | Cắt sprite nguồn → sheet 4×4 |
| `sprites_import/*.png` | Ảnh nguồn nguyên bản |
| `packages/shared/assets/sprites/hero_64.png` | Sheet xuất ra (256×256) |
| `apps/client/src/scenes/BootScene.ts` | `TEX`, `HERO_DIRS`, `loadHeroSheet()` |
| `apps/client/src/entities/PlayerSprite.ts` | `DIRS`, `frameName()`, `setDirection()` |
| `apps/client/src/scenes/WorldScene.ts` | Chọn sheet + `registerPlayerAnims()` |