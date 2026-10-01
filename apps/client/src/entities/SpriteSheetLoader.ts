import type Phaser from 'phaser';

/**
 * Loader sheet sprite từ thư viện (admin) — dùng cho sprite user được gán.
 *
 * Sheet trong `sprite_catalog` có 2 layout, phân biệt bằng `frameCount`:
 *
 * | frameCount | layout         | frame name       | cut (frame F)         |
 * | ---------- | -------------- | ---------------- | --------------------- |
 * | 12 (3f/hd) | ngang 12 frame | `${di}_${f}`      | `F*(di*3+f), 0`       |
 * | 16 (4f/hd) | lưới 4×4       | `${di}_${f}`      | `F*f, F*di`           |
 *
 * ⚠️ Đây là lỗi âm thầm đã gặp nhiều lần:
 * - Truyền index phẳng `F*(di*4+i)` cho sheet 4×4 → vượt 256 → Phaser clamp về 0
 *   → **toàn bộ frame trỏ ô 0_0**, sprite không bao giờ đổi hướng.
 * - Nhầm layout 1D với 2D → hướng quay sai (xem `docs/sprite-import-guide.md`).
 *
 * Hàng = hướng theo `HERO_DIRS` = `['down','up','left','right']`, phải khớp PNG.
 */
export const DIRS = ['down', 'up', 'left', 'right'] as const;

/** Frame name trong texture (dùng cho `setFrame`). */
export function spriteFrameName(dirIndex: number, frame: number): string {
  return `${dirIndex}_${frame}`;
}

/**
 * Load 1 sheet từ URL và đăng ký frame con theo layout đúng với `frameCount`.
 * Trả `key` texture dùng được, hoặc `null` nếu load lỗi.
 */
export async function loadSpriteSheet(
  scene: Phaser.Scene,
  key: string,
  url: string,
  frameSize: number,
  frameCount: number,
): Promise<string | null> {
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Xoá texture cũ nếu có (đổi sprite giữa lúc load lại world)
        if (scene.textures.exists(key)) scene.textures.remove(key);
        scene.textures.addImage(key, img);

        const tex = scene.textures.get(key);
        if (tex && tex.source.length > 0) {
          const F = frameSize;
          const perDir = Math.max(1, Math.floor(frameCount / 4));
          DIRS.forEach((_, di) => {
            for (let f = 0; f < perDir; f++) {
              // 2D (16 frame, 4×4): x = cột, y = hàng. 1D (12 frame): offset ngang.
              const cutX = frameCount >= 16 ? F * f : F * (di * perDir + f);
              const cutY = frameCount >= 16 ? F * di : 0;
              tex.add(spriteFrameName(di, f), 0, cutX, cutY, F, F);
            }
          });
        }
        resolve();
      };
      img.onerror = () => reject(new Error(`sprite load failed: ${url}`));
      img.src = url;
    });
    return key;
  } catch (err) {
    console.warn('[sprite] cannot load', url, err);
    return null;
  }
}
