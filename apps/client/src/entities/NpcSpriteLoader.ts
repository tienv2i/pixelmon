import type Phaser from 'phaser';

/**
 * Load NPC spritesheet chuẩn RMXP (128x192, 4 cột x 4 hàng, 32x48 mỗi frame).
 * Hướng trong RMXP (từ trên xuống dưới):
 * Hàng 0: Down
 * Hàng 1: Left
 * Hàng 2: Right
 * Hàng 3: Up
 */
export async function loadNpcSpriteSheet(
  scene: Phaser.Scene,
  key: string,
  url: string,
): Promise<string | null> {
  if (scene.textures.exists(key)) return key;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      scene.textures.addImage(key, img);
      const tex = scene.textures.get(key);
      if (tex && tex.source.length > 0) {
        const frameW = 32;
        const frameH = 48;
        // DIRS map: 0 = down, 1 = up, 2 = left, 3 = right
        const dirRowMap = [0, 3, 1, 2]; // row index tương ứng với [down, up, left, right]
        dirRowMap.forEach((rowIdx, di) => {
          for (let col = 0; col < 4; col++) {
            const cutX = col * frameW;
            const cutY = rowIdx * frameH;
            tex.add(`${di}_${col}`, 0, cutX, cutY, frameW, frameH);
          }
        });
      }
      resolve(key);
    };
    img.onerror = () => {
      console.warn(`[NpcLoader] Failed to load NPC sprite: ${url}`);
      resolve(null);
    };
    img.src = url;
  });
}
