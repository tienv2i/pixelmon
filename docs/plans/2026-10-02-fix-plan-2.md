# Kế hoạch sửa lỗi di chuyển & hiển thị nhân vật (Fix Plan 2)

Tài liệu này bao gồm phân tích nguyên nhân gốc rễ và hướng dẫn sửa đổi chi tiết (Before / After) cho 3 vấn đề di chuyển và hiển thị sprite người chơi:
1. **Lỗi bước đi 2 ô (Double-stepping):** Mỗi lần người chơi chỉ bấm nhấp (tap) phím điều hướng một lần, nhân vật lại bước tới 2 ô.
2. **Độ trễ di chuyển quá cao (High Latency & Sluggish Movement):** Tốc độ phản hồi phím chậm chạp, nhân vật di chuyển lề mề, bị trôi dạt và khựng ở cuối ô.
3. **Vị trí đứng của nhân vật bị cao (Foot Placement Issue):** Bàn chân và bóng của nhân vật bị cắm ở đường ngang giữa ô thay vì đứng trên mặt đất (đáy ô).

---

# MỤC LỤC
- [I. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)](#i-phân-tích-nguyên-nhân-gốc-rễ-root-cause-analysis)
  - [1. Vấn đề 1: Bấm 1 lần đi 2 ô (Double-Stepping)](#1-vấn-đề-1-bấm-1-lần-đi-2-ô-double-stepping)
  - [2. Vấn đề 2: Độ trễ di chuyển quá cao & chuyển động lề mề](#2-vấn-đề-2-độ-trễ-di-chuyển-quá-cao--chuyển-động-lề-mề)
  - [3. Vấn đề 3: Vị trí chân nhân vật ở giữa ô, đứng cao hơn thực tế](#3-vấn-đề-3-vị-trí-chân-nhân-vật-ở-giữa-ô-đứng-cao-hơn-thực-tế)
- [II. KẾ HOẠCH SỬA CHI TIẾT TỪNG FILE](#ii-kế-hoạch-sửa-chi-tiết-từng-file)
  - [File 1: `apps/client/src/scenes/WorldScene.ts`](#file-1-appsclientsrcscenesworldscenets)
  - [File 2: `apps/client/src/entities/PlayerSprite.ts`](#file-2-appsclientsrcentitiesplayerspritets)
- [III. CHECKLIST KIỂM THỬ & NGHIỆM THU](#iii-checklist-kiểm-thử--nghiệm-thu)

---

# I. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1. Vấn đề 1: Bấm 1 lần đi 2 ô (Double-Stepping)
* **File liên quan:** `apps/client/src/scenes/WorldScene.ts` (các dòng 1282–1298 và 1486–1503)
* **Cơ chế gây lỗi:**
  1. Khi người chơi gõ một phím trên bàn phím (single tap), thời gian ngón tay nhấn giữ phím trong thực tế luôn kéo dài từ **100ms đến 200ms**.
  2. Tại frame đầu tiên ($t = 0$), phím được phát hiện `isDown`, nhân vật kích hoạt bước 1 (`handleInputDirection`), chuyển cờ `isWalking = true`.
  3. Tại các frame tiếp theo ($t = 16\text{ms} \dots 140\text{ms}$), hàm `update()` chạy liên tục ở 60 FPS. Trong lúc bước 1 đang diễn ra và phím vẫn còn bị giữ:
     ```ts
     } else if (keyDirection && walking) {
       // Đang trượt ô — đệm hướng lại để nối bước ngay khi tới tâm ô.
       this.bufferedDir = keyDirection;
       this.heldDir = keyDirection;
       this.moving = true;
     }
     ```
     Biến `this.bufferedDir` bị ghi nhận hướng vừa bấm.
  4. Khi người chơi nhả phím:
     ```ts
     if (!keyDirection) this.heldDir = null;
     ```
     Code chỉ xoá `heldDir = null`, **hoàn toàn không xoá `bufferedDir`**!
  5. Khi bước 1 chạm đích, hàm `advanceStep()` kết thúc và kiểm tra buffer:
     ```ts
     const next = this.bufferedDir;
     this.bufferedDir = null;
     if (next && !this.isJumping && this.handleInputDirection(next)) {
       return true;
     }
     ```
     Vì `this.bufferedDir` vẫn còn lưu hướng phím của cú tap trước đó, hàm lập tức ép nhân vật bước tiếp **bước thứ 2**!

---

### 2. Vấn đề 2: Độ trễ di chuyển quá cao & chuyển động lề mề
* **File liên quan:** `apps/client/src/scenes/WorldScene.ts` (hàm `advanceStep`, các dòng 1260–1285)
* **Cơ chế gây lỗi:**
  1. Hằng số nhịp bước thiết kế là `MOVE_COOLDOWN_MS = 150ms/ô` (~6.7 ô/s), tương ứng vận tốc lý tưởng `WALK_SPEED_PX = 213.33 px/s`.
  2. Tuy nhiên, logic cập nhật vị trí mỗi frame trong `advanceStep()` lại sử dụng:
     ```ts
     const step = (WorldScene.WALK_SPEED_PX * delta) / 1000;
     const total = Phaser.Math.Distance.Between(this.stepStartX, this.stepStartY, this.stepTargetX, this.stepTargetY);
     const t = total > 0 ? Math.min(step / total, 1) : 1;
     this.player.setPosition(
       Phaser.Math.Linear(this.player.x, this.stepTargetX, t),
       Phaser.Math.Linear(this.player.y, this.stepTargetY, t),
     );
     ```
  3. Ở 60 FPS, $t = \frac{step}{total} \approx 0.11$. Việc truyền `this.player.x` vào `Phaser.Math.Linear(player.x, targetX, t)` biến phép tính thành **suy giảm hàm mũ (Exponential Decay / Asymptotic Smoothing)**:
     - Mỗi frame nhân vật chỉ tiến thêm được $11\%$ quãng đường *còn lại*.
     - Quãng đường nhích được mỗi frame: Frame 1 nhích 3.5px, Frame 10 nhích 1.1px, Frame 20 chỉ nhích 0.3px...
     - Càng về gần đích, nhân vật trôi càng chậm và phải mất tới **500ms – 650ms** (~35-40 frame) mới đạt điều kiện `remaining <= 1.0`!
  4. **Hệ quả:**
     - Thời gian đi 1 ô bị kéo dài gấp 3-4 lần thời gian thiết kế (từ 150ms thành hơn 500ms).
     - Trong suốt hơn nửa giây đó, nhân vật bị khoá cứng trong `isWalking = true`. Input phím tiếp theo không được phản hồi ngay lập tức, xoay người hay dừng bước đều bị trễ nặng nề.

---

### 3. Vấn đề 3: Vị trí chân nhân vật ở giữa ô, đứng cao hơn thực tế
* **File liên quan:** `apps/client/src/entities/PlayerSprite.ts` (các dòng 71–85)
* **Cơ chế gây lỗi:**
  1. Quy ước toạ độ trong toàn bộ kiến trúc project (Server `CollideGrid.ts`, Database, và Client `WorldScene.tileCenter`):
     $$\text{tileCenter} = (col \times 32 + 16, row \times 32 + 16)$$
     Toạ độ $(player.x, player.y)$ là **TÂM Ô (Tile Center)**.
  2. Chiều cao của 1 ô là $32\text{px}$:
     - Đỉnh ô (Top): $row \times 32 = y - 16$
     - Tâm ô (Center): $row \times 32 + 16 = y$
     - Đáy ô (Mặt đất / Ground): $row \times 32 + 32 = y + 16$
  3. Trong `PlayerSprite.ts`:
     ```ts
     this.sheet = frameCount === 16 ? 'hero' : 'legacy';
     this.setOrigin(0.5, this.sheet === 'hero' ? 1.0 : 0.7);
     this.shadow = scene.add.image(x, y + 2, 'shadow');
     ```
  4. Frame sprite hero có kích thước 64×64px, bàn chân nằm sát đáy frame ($y = 64$).
     - Khi đặt `origin.y = 1.0`, Phaser ghim đáy frame (chân nhân vật) chính xác vào toạ độ $y$ của sprite.
     - Nhưng $y$ của sprite lại là $row \times 32 + 16$ (**TÂM Ô**)!
     - Kết quả: Bàn chân nhân vật và cái bóng (`shadow` ở $y + 2$) bị đặt đúng vào **đường xích đạo ngang của ô**, lơ lửng cao hơn mặt đất (đáy ô) tới $16\text{px}$!

---

# II. KẾ HOẠCH SỬA CHI TIẾT TỪNG FILE

### File 1: `apps/client/src/scenes/WorldScene.ts`

#### 1. Sửa hàm `advanceStep(delta)`:
Chuyển từ phép lerp tiệm cận sang **vận tốc tuyến tính không đổi (Constant Linear Velocity)** bằng `Phaser.Math.MoveTowards` để đảm bảo bước đi hoàn tất chính xác trong 150ms.

```ts
// TRƯỚC KHI SỬA (WorldScene.ts dòng 1260-1285):
  private advanceStep(delta: number): boolean {
    if (!this.isWalking) return false;

    const step = (WorldScene.WALK_SPEED_PX * delta) / 1000;
    const total = Phaser.Math.Distance.Between(
      this.stepStartX, this.stepStartY, this.stepTargetX, this.stepTargetY,
    );
    // Approach: tiến tới đích đúng `step` px, không bao giờ vượt qua (clamp t ≤ 1).
    const t = total > 0 ? Math.min(step / total, 1) : 1;
    this.player.setPosition(
      Phaser.Math.Linear(this.player.x, this.stepTargetX, t),
      Phaser.Math.Linear(this.player.y, this.stepTargetY, t),
    );

    const remaining = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.stepTargetX, this.stepTargetY,
    );
    const progress = total > 0 ? 1 - remaining / total : 1;
    this.player.animateWalk(delta, true, progress);

    if (remaining > 1.0) return true;

    // Đã tới tâm ô đích — snap chính xác rồi xử lý logic sau bước.
    this.player.setPosition(this.stepTargetX, this.stepTargetY);
    this.isWalking = false;
...
```

```ts
// SAU KHI SỬA:
  private advanceStep(delta: number): boolean {
    if (!this.isWalking) return false;

    const step = (WorldScene.WALK_SPEED_PX * delta) / 1000;
    const newX = Phaser.Math.MoveTowards(this.player.x, this.stepTargetX, step);
    const newY = Phaser.Math.MoveTowards(this.player.y, this.stepTargetY, step);
    this.player.setPosition(newX, newY);

    const total = Phaser.Math.Distance.Between(
      this.stepStartX, this.stepStartY, this.stepTargetX, this.stepTargetY,
    );
    const remaining = Phaser.Math.Distance.Between(
      newX, newY, this.stepTargetX, this.stepTargetY,
    );
    const progress = total > 0 ? Math.min(Math.max(1 - remaining / total, 0), 1) : 1;
    this.player.animateWalk(delta, true, progress);

    if (remaining > 0.01) return true;

    // Đã tới tâm ô đích — snap chính xác rồi xử lý logic sau bước.
    this.player.setPosition(this.stepTargetX, this.stepTargetY);
    this.isWalking = false;
...
```

#### 2. Sửa xử lý phím và buffer trong `update(time, delta)`:
- Xoá `this.bufferedDir = null` khi người chơi nhả phím (`!keyDirection`).
- Chỉ kích hoạt buffer nối bước nếu phím vẫn đang thực sự được giữ hoặc người chơi đã ấn một phím mới.

```ts
// TRƯỚC KHI SỬA (WorldScene.ts dòng 1474-1503):
    // Bỏ giữ phím → reset trạng thái.
    if (!keyDirection) this.heldDir = null;

    // Ưu tiên nội suy trượt ô — mọi input khác chờ tới tâm ô rồi xử lý.
    const walking = this.advanceStep(delta);

    if (keyDirection && !this.isJumping && !walking) {
      if (this.movePath.length > 0) this.cancelAutoMove();
      // Chỉ animate walk khi thật sự bước được ô (tránh đứng đánh võng trước tường).
      let stepped = false;

      // Bước nếu là lần bấm đầu tiên HOẶC đã qua nhịp MOVE_COOLDOWN_MS.
      const firstPress = this.heldDir !== keyDirection;
      if (firstPress || this.time.now >= this.nextStepAt) {
        this.nextStepAt = this.time.now + MOVE_COOLDOWN_MS;
        stepped = this.handleInputDirection(keyDirection);
      } else {
        stepped = true; // vẫn trong nhịp bước vừa thực hiện → giữ anim
      }
      this.heldDir = keyDirection;
      this.bufferedDir = null;
      this.moving = stepped;
    } else if (keyDirection && this.isJumping) {
      this.moving = true;
    } else if (keyDirection && walking) {
      // Đang trượt ô — đệm hướng lại để nối bước ngay khi tới tâm ô.
      this.bufferedDir = keyDirection;
      this.heldDir = keyDirection;
      this.moving = true;
    }
```

```ts
// SAU KHI SỬA:
    // Bỏ giữ phím → xoá cả heldDir lẫn bufferedDir để không tự ý bước thêm ô thứ 2 khi nhấp phím (tap).
    if (!keyDirection) {
      this.heldDir = null;
      this.bufferedDir = null;
    }

    // Ưu tiên nội suy trượt ô — mọi input khác chờ tới tâm ô rồi xử lý.
    const walking = this.advanceStep(delta);

    if (keyDirection && !this.isJumping && !walking) {
      if (this.movePath.length > 0) this.cancelAutoMove();
      let stepped = false;

      const firstPress = this.heldDir !== keyDirection;
      if (firstPress || this.time.now >= this.nextStepAt) {
        this.nextStepAt = this.time.now + MOVE_COOLDOWN_MS;
        stepped = this.handleInputDirection(keyDirection);
      } else {
        stepped = true;
      }
      this.heldDir = keyDirection;
      this.bufferedDir = null;
      this.moving = stepped;
    } else if (keyDirection && this.isJumping) {
      this.moving = true;
    } else if (keyDirection && walking) {
      // Chỉ đệm hướng khi phím vẫn đang tiếp tục được giữ
      this.bufferedDir = keyDirection;
      this.heldDir = keyDirection;
      this.moving = true;
    }
```

---

### File 2: `apps/client/src/entities/PlayerSprite.ts`

Cân chỉnh `originY` và vị trí `shadow` để chân nhân vật tiếp đất đúng đáy ô ($y + 16$):
- Với sheet `hero` (64×64 frame): $\text{originY} = \frac{64 - 16}{64} = 0.75$.
- Với sheet `legacy` (32×32 frame): $\text{originY} = \frac{32 - 16}{32} = 0.5$.
- Vị trí bóng (`shadow`): dời từ $y + 2$ xuống $y + 16$ (hoặc $y + 14$).
- Bảng tên `nameText`: tính toán lại khoảng cách từ đỉnh đầu nhân vật.

```ts
// TRƯỚC KHI SỬA (PlayerSprite.ts dòng 73-100):
    this.sheet = frameCount === 16 ? 'hero' : 'legacy';
    this.setOrigin(0.5, this.sheet === 'hero' ? 1.0 : 0.7);
    this.setDepth(10);
    this.hue = hueSeed;

    this.shadow = scene.add
      .image(x, y + 2, 'shadow')
      .setDepth(9)
      .setAlpha(0.6);

    this.nameText = scene.add
      .text(x, y - this.getNameOffsetY(), 'Player', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: C.text,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(11);
  }

  private getNameOffsetY(): number {
    return this.sheet === 'hero' ? 68 : TILE_SIZE + 4;
  }
```

```ts
// SAU KHI SỬA:
    this.sheet = frameCount === 16 ? 'hero' : 'legacy';
    // Đáy ô ở y + TILE_SIZE/2 (y + 16).
    // - hero (64px): originY = 48/64 = 0.75 -> đáy frame (chân) rơi trúng y + 16 (mặt đất đáy ô)
    // - legacy (32px): originY = 16/32 = 0.5 -> đáy frame rơi trúng y + 16
    this.setOrigin(0.5, this.sheet === 'hero' ? 0.75 : 0.5);
    this.setDepth(10);
    this.hue = hueSeed;

    // Bóng nhân vật đặt ngay dưới chân (y + 16 px)
    this.shadow = scene.add
      .image(x, y + 15, 'shadow')
      .setDepth(9)
      .setAlpha(0.6);

    this.nameText = scene.add
      .text(x, y - this.getNameOffsetY(), 'Player', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: C.text,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(11);
  }

  private getNameOffsetY(): number {
    // Với originY = 0.75: đỉnh đầu sprite 64px ở y - 48px -> đặt tên ở y - 52px
    return this.sheet === 'hero' ? 52 : TILE_SIZE + 4;
  }
```

Và cập nhật các hàm `setPosition`, `swapSheet`, `jumpTo` trong `PlayerSprite.ts` để đồng bộ vị trí bóng `y + 15`:
```ts
// SAU KHI SỬA (setPosition và jumpTo):
  setPosition(x: number, y: number): this {
    super.setPosition(x, y);
    this.nameText?.setPosition(x, y - this.getNameOffsetY());
    this.shadow?.setPosition(x, y + 15);
    return this;
  }

  swapSheet(sheetKey: string, frameCount = 12): void {
    if (!this.scene.textures.exists(sheetKey)) return;
    this.sheet = frameCount === 16 ? 'hero' : 'legacy';
    this.setTexture(sheetKey, frameName(this.dir, this.walkFrame));
    this.setOrigin(0.5, this.sheet === 'hero' ? 0.75 : 0.5);
    this.nameText?.setPosition(this.x, this.y - this.getNameOffsetY());
  }
```

---

# III. CHECKLIST KIỂM THỬ & NGHIỆM THU

Sau khi áp dụng kế hoạch, tiến hành kiểm tra trên trình duyệt:

- [ ] **Test Nhấp phím 1 lần (Single Tap):** Nhấn nhả nhanh phím Mũi tên hoặc WASD một lần $\rightarrow$ Nhân vật chỉ bước đúng **1 ô duy nhất**, dừng lại dứt khoát tại tâm ô kế tiếp, không tự động bước sang ô thứ 2.
- [ ] **Test Giữ phím liên tục (Hold):** Giữ phím điều hướng $\rightarrow$ Nhân vật bước đi liên tục, nhịp bước đều đặn $150\text{ms/ô}$ không bị khựng, khi thả phím ra nhân vật dừng ngay tại ô đang bước tới (không overshoot thêm ô tiếp theo).
- [ ] **Test Độ trễ và Cảm giác chuyển động:** Nhân vật di chuyển với tốc độ hằng số dứt khoát, không còn hiện tượng "trôi lờ đờ" ở cuối ô; đổi hướng trái/phải phản hồi ngay lập tức.
- [ ] **Test Vị trí đứng và Bàn chân:** Bật Grid Debug overlay trong game $\rightarrow$ Bàn chân và bóng của nhân vật chạm sát đường kẻ đáy của ô hiện tại, phần thân trên chiếm ô hiện tại và nhô lên ô phía trên tự nhiên theo đúng phối cảnh RPG 2.5D chuẩn.
- [ ] **Test Nhảy Ledge:** Đứng trên gờ mỏm đá và nhảy xuống $\rightarrow$ Hiệu ứng tween 2 ô tiếp đất mượt mà, bóng và chân đáp đúng vị trí đáy ô.
