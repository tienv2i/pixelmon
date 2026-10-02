import Phaser from 'phaser';
import { TILE_SIZE } from '@pixelmon/shared';
import { C, FONT } from '../ui/theme';

const DIRS = ['down', 'up', 'left', 'right'] as const;
export type Dir = (typeof DIRS)[number];

/** Số frame đi bộ mỗi hướng: sheet trainer cũ = 3, sheet hero = 4. */
const FRAMES_PER_DIR = { legacy: 3, hero: 4 } as const;

/** Chu kỳ đổi 1 frame đi bộ (ms). ~6.7 fps, khớp nhịp bước chân pixel-art. */
const WALK_FRAME_MS = 150;

/**
 * KHÔNG dùng `setFlipX` để làm hướng trái: sheet đã có frame trái/phải riêng
 * biệt (và frame này được khôi phục màu thật + alpha khi cắt từ ảnh gốc nền
 * trắng) — lật sẽ chỉ làm sprite sai hướng.
 *
 * Đăng ký animation đi bộ. Gọi 1 lần (WorldScene create) trước khi tạo sprite.
 * Hỗ trợ cả 2 sheet: 12-frame (3f/dir) và 16-frame (4f/dir).
 */
export function registerPlayerAnims(scene: Phaser.Scene, sheetKey: string, frameCount = 12): void {
  const animKey = `walk-${sheetKey}`;
  if (scene.anims.exists(animKey)) return;
  const sheet: keyof typeof FRAMES_PER_DIR = frameCount === 16 ? 'hero' : 'legacy';
  const framesPerDir = FRAMES_PER_DIR[sheet];
  DIRS.forEach((dir) => {
    for (let i = 0; i < framesPerDir; i++) {
      scene.anims.create({
        key: `${animKey}-${dir}-${i}`,
        frames: [{ key: sheetKey, frame: frameName(dir, i) }],
        frameRate: 1,
        repeat: -1,
      });
    }
  });
}

/**
 * Tên frame trong texture, dùng để `texture.get(...)` / `setFrame(...)`.
 *
 * Quan trọng: frame trong sheet được đăng ký bằng NAME string (vd `0_0`, `0_1`,
 * `1_2`, ...), KHÔNG phải index số. Truyền number vào `texture.get(number)`
 * sẽ tra `frames[number]` → undefined và báo lỗi
 * "Texture <key> has no frame <n>". Vì vậy mọi nơi đều phải dùng name.
 */
function frameName(dir: Dir, frame: number): string {
  return `${DIRS.indexOf(dir)}_${frame}`;
}

export class PlayerSprite extends Phaser.GameObjects.Sprite {
  private nameText!: Phaser.GameObjects.Text;
  private shadow!: Phaser.GameObjects.Image;
  private dir: Dir = 'down';
  private walkFrame = 0;
  private walkTimer = 0;
  private hue: number;
  /** Sheet nào đang dùng: 'legacy' (12 frame) hay 'hero' (16 frame). */
  private sheet: keyof typeof FRAMES_PER_DIR;
  /** Đang lướt nước (Surf)? */
  private surfing = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    sheetKey: string,
    hueSeed = 0,
    frameCount = 12,
  ) {
    super(scene, x, y, sheetKey, frameName('down', 0));
    scene.add.existing(this);
    // `y` là TÂM Ô (tileCenter = col*32+16, row*32+16) → MẶT ĐẤT (đáy ô) ở y + 16.
    // Ghim ĐÁY FRAME (chân) vào đáy ô để nhân vật đứng đúng mặt đất thay vì
    // lơ lửng ở đường giữa ô:
    // - hero (frame 64px):  originY = (64-16)/64 = 0.75
    // - legacy (frame 32px): originY = (32-16)/32 = 0.5
    this.sheet = frameCount === 16 ? 'hero' : 'legacy';
    this.setOrigin(0.5, this.sheet === 'hero' ? 0.75 : 0.5);
    this.setDepth(10);
    this.hue = hueSeed;

    // Bóng đặt ngay dưới chân (đáy ô = y + 16, hình bầu dục nằm phía dưới 1px).
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
    // hero: đỉnh đầu nằm ở y - 48 (64px × originY 0.75) → bảng tên đặt ở y - 52.
    return this.sheet === 'hero' ? 52 : TILE_SIZE + 4;
  }

  /**
   * Khoảng cách từ tâm nhân vật lên đáy bảng tên — để WorldScene đặt
   * nhãn debug tracking (Settings > Debug) phía trên bảng tên, không đè lên nó.
   */
  get nameOffsetY(): number {
    return this.getNameOffsetY();
  }

  setDisplayName(name: string): void {
    this.nameText?.setText(name);
  }

  /** Trả về shadow + nameText — cần để WorldScene ignore 2 camera đúng cách. */
  getChildObjects(): Phaser.GameObjects.GameObject[] {
    return [this.shadow, this.nameText];
  }

  setDirection(dir: string): void {
    const d = DIRS.includes(dir as Dir) ? (dir as Dir) : 'down';
    // Chỉ reset walkFrame khi thực sự ĐỔI hướng — nếu reset mỗi tick thì
    // animateWalk không bao giờ advance được frame đi bộ (luôn nhảy về 0).
    if (d !== this.dir) {
      this.walkFrame = 0;
      this.walkTimer = 0;
      this.dir = d;
      this.setFrame(frameName(d, 0));
    }
  }

  getDirection(): Dir {
    return this.dir;
  }

  /**
   * Đổi sang sheet khác (sprite user được gán trong admin, load bất đồng bộ).
   * Giữ nguyên hướng/frame hiện tại để không nhảy về mặc định khi đổi sheet.
   */
  swapSheet(sheetKey: string, frameCount = 12): void {
    if (!this.scene.textures.exists(sheetKey)) return;
    this.sheet = frameCount === 16 ? 'hero' : 'legacy';
    this.setTexture(sheetKey, frameName(this.dir, this.walkFrame));
    // Sheet mới có thể khác frame size → canh lại originY để chân luôn đứng đáy ô (y+16)
    this.setOrigin(0.5, this.sheet === 'hero' ? 0.75 : 0.5);
    this.nameText?.setPosition(this.x, this.y - this.getNameOffsetY());
    this.shadow?.setPosition(this.x, this.y + 15);
  }

  /** Tint nhẹ để phân biệt người chơi (hash hueSeed). */
  applyHue(hue: number): void {
    this.hue = hue;
    this.setTint(hue);
  }

  /**
   * Bật/tắt trạng thái lướt nước (Surf).
   * Hiện dùng tint xanh nhạt làm dấu hiệu trực quan; khi có sprite surf riêng
   * chỉ cần `swapSheet()` sang sheet đó.
   */
  setSurfing(on: boolean): void {
    if (this.surfing === on) return;
    this.surfing = on;
    if (on) {
      this.setTint(0x9ecbff);
    } else {
      this.clearTint();
    }
  }

  isSurfing(): boolean {
    return this.surfing;
  }

  /**
   * Nhảy ledge: chạy tween 1 hop (2 ô) rồi snap về đích. Trong lúc nhảy không
   * xử lý input (WorldScene đặt `isJumping`).
   */
  jumpTo(targetX: number, targetY: number, dir: Dir, durationMs = 220, onDone?: () => void): void {
    this.setDirection(dir);
    this.walkFrame = 0;
    this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        this.nameText?.setPosition(this.x, this.y - this.getNameOffsetY());
        this.shadow?.setPosition(this.x, this.y + 15);
      },
      onComplete: () => {
        this.setPosition(targetX, targetY);
        onDone?.();
      },
    });
  }

  /**
   * Bước chân animation (gọi mỗi frame trong update).
   *
   * `walkProgress` = tiến trình bước chân trên ô hiện tại (0.0 → 1.0). Khi có
   * progress, frame được chọn theo % quãng đường → bước chân luôn khớp với
   * khoảng cách thực tế đã đi (WorldScene nội suy grid-step), không bị trôi
   * frame khi tốc độ lệch. Bỏ trống → fallback sang timer `WALK_FRAME_MS`.
   */
  animateWalk(deltaMs: number, moving: boolean, walkProgress = 0): void {
    const maxFrame = FRAMES_PER_DIR[this.sheet];
    if (!moving) {
      this.walkTimer = 0;
      this.walkFrame = 0;
      this.setFrame(frameName(this.dir, 0));
      return;
    }

    // Khớp frame theo tiến trình ô (0.0 -> 1.0).
    if (walkProgress > 0) {
      const frameIndex = Math.min(Math.floor(walkProgress * maxFrame), maxFrame - 1);
      this.walkFrame = frameIndex;
      this.walkTimer = 0;
      this.setFrame(frameName(this.dir, frameIndex));
      return;
    }

    // Fallback timer nếu không truyền progress.
    this.walkTimer += deltaMs;
    if (this.walkTimer >= WALK_FRAME_MS) {
      this.walkTimer = 0;
      this.walkFrame = (this.walkFrame + 1) % maxFrame;
      this.setFrame(frameName(this.dir, this.walkFrame));
    }
  }

  setPosition(x: number, y: number): this {
    super.setPosition(x, y);
    // Phaser's Sprite constructor gọi setPosition() trong lúc super() —
    // lúc đó nameText/shadow chưa được gán → cần guard.
    this.nameText?.setPosition(x, y - this.getNameOffsetY());
    this.shadow?.setPosition(x, y + 15);
    return this;
  }

  destroy(fromScene?: boolean): void {
    this.nameText?.destroy();
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
