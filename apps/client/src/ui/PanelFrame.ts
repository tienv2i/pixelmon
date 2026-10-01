import { C, FONT } from '../ui/theme';

/** Kích thước panel frame. */
export const PANEL_PAD = 8;

/** Vẽ khung panel (9-slice đơn giản bằng Graphics). Luôn screen-fixed (scrollFactor 0). */
export function drawPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  depth = 100,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  // shadow
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(x + 3, y + 3, w, h, 4);
  // bg
  g.fillStyle(C.panel, 0.94);
  g.fillRoundedRect(x, y, w, h, 4);
  // border
  g.lineStyle(1, C.border, 0.95);
  g.strokeRoundedRect(x, y, w, h, 4);
  return g;
}

/** Tạo label tiêu đề nhỏ (top-left trong panel). Luôn screen-fixed. */
export function panelTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  depth = 101,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontSize: '12px',
      fontFamily: FONT.mono,
      color: C.muted,
    })
    .setOrigin(0, 0)
    .setDepth(depth)
    .setScrollFactor(0);
}