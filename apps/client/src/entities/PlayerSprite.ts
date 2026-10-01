import Phaser from 'phaser';
import { TILE_SIZE } from '@pixelmon/shared';
import { C, FONT } from '../ui/theme';

const DIRS = ['down', 'up', 'left', 'right'] as const;
export type Dir = (typeof DIRS)[number];

/**
 * Frame index trong sheet. Hỗ trợ 2 dạng sheet:
 * - 12 frame (4 hướng × 3 frame): legacy trainer sheet
 * - 16 frame (4 hướng × 4 frame): hero sheet mới import
 */
function frameIndex(dir: Dir, frame: number): number {
  const dirIdx = DIRS.indexOf(dir);
  // Mặc định 3 frame/dir (legacy). Sheet hero dùng 4 frame/dir → tính lại.
  const framesPerDir = 3;
  return dirIdx * framesPerDir + frame;
}

/**
 * Frame index cho sheet 4 hướng × 4 frame (hero sprite mới).
 * Layout: 0-3 = down, 4-7 = left, 8-11 = right, 12-15 = up.
 */
function heroFrameIndex(dir: Dir, frame: number): number {
  const dirIdx = DIRS.indexOf(dir);
  return dirIdx * 4 + frame;
}

/**
 * Đăng ký animation đi bộ. Gọi 1 lần (WorldScene create) trước khi tạo sprite.
 * Hỗ trợ cả 2 sheet: 12-frame (3f/dir) và 16-frame (4f/dir).
 */
export function registerPlayerAnims(scene: Phaser.Scene, sheetKey: string, frameCount = 12): void {
  const animKey = `walk-${sheetKey}`;
  if (scene.anims.exists(animKey)) return;
  const framesPerDir = frameCount / 4;
  DIRS.forEach((dir) => {
    for (let i = 0; i < framesPerDir; i++) {
      const idx = frameCount === 16 ? heroFrameIndex(dir, i) : frameIndex(dir, i);
      scene.anims.create({
        key: `${animKey}-${dir}-${i}`,
        frames: [{ key: sheetKey, frame: idx }],
        frameRate: 1,
        repeat: -1,
      });
    }
  });
}

export class PlayerSprite extends Phaser.GameObjects.Sprite {
  private nameText!: Phaser.GameObjects.Text;
  private shadow!: Phaser.GameObjects.Image;
  private dir: Dir = 'down';
  private walkFrame = 0;
  private walkTimer = 0;
  private hue: number;
  /** 12-frame legacy (3f/dir) hay 16-frame hero (4f/dir). */
  private frameCount: number;

  constructor(scene: Phaser.Scene, x: number, y: number, sheetKey: string, hueSeed = 0, frameCount = 12) {
    super(scene, x, y, sheetKey, frameIndex('down', 0));
    scene.add.existing(this);
    this.setOrigin(0.5, 0.7);
    this.setDepth(10);
    this.hue = hueSeed;
    this.frameCount = frameCount;

    this.shadow = scene.add
      .image(x, y + 2, 'shadow')
      .setDepth(9)
      .setAlpha(0.6);

    this.nameText = scene.add
      .text(x, y - TILE_SIZE - 4, 'Player', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: C.text,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(11);
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
    this.dir = d;
    if (d === 'left') this.setFlipX(true);
    else this.setFlipX(false);
    this.walkFrame = 0;
    const idx = this.frameCount === 16 ? heroFrameIndex(d, 0) : frameIndex(d, 0);
    this.setFrame(idx);
  }

  getDirection(): Dir {
    return this.dir;
  }

  /** Tint nhẹ để phân biệt người chơi (hash hueSeed). */
  applyHue(hue: number): void {
    this.hue = hue;
    this.setTint(hue);
  }

  /** Bước chân animation (gọi mỗi frame trong update). */
  animateWalk(deltaMs: number, moving: boolean): void {
    if (!moving) {
      this.walkTimer = 0;
      const idx = this.frameCount === 16 ? heroFrameIndex(this.dir, 0) : frameIndex(this.dir, 0);
      this.setFrame(idx);
      return;
    }
    this.walkTimer += deltaMs;
    if (this.walkTimer >= 150) {
      this.walkTimer = 0;
      const maxFrame = this.frameCount === 16 ? 4 : 3;
      this.walkFrame = (this.walkFrame + 1) % maxFrame;
      const idx = this.frameCount === 16
        ? heroFrameIndex(this.dir, this.walkFrame)
        : frameIndex(this.dir, this.walkFrame);
      this.setFrame(idx);
    }
  }

  setPosition(x: number, y: number): this {
    super.setPosition(x, y);
    // Phaser's Sprite constructor gọi setPosition() trong lúc super() —
    // lúc đó nameText/shadow chưa được gán → cần guard.
    this.nameText?.setPosition(x, y - TILE_SIZE - 4);
    this.shadow?.setPosition(x, y + 2);
    return this;
  }

  destroy(fromScene?: boolean): void {
    this.nameText?.destroy();
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
