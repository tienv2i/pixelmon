import Phaser from 'phaser';
import { C } from '../ui/theme';
import { ColyseusManager } from '../network/ColyseusManager';
import { DEV_CREDENTIALS, DEV_MODE } from '../config';
// @ts-ignore -- file PNG import qua Vite, trả về URL
import heroSheetUrl from '@pixelmon/shared/assets/sprites/hero_64.png?url';

export const TEX = {
  grass: 'tile_grass',
  grassAlt: 'tile_grass_alt',
  path: 'tile_path',
  water: 'tile_water',
  tree: 'tile_tree',
  flower: 'tile_flower',
  roof: 'tile_roof',
  wall: 'tile_wall',
  door: 'tile_door',
  trainer: 'trainer_sheet',
  shadow: 'shadow',
  px: 'px',
  pokemon: 'pokemon',
  pokemonFoe: 'pokemon_foe',
  hero: 'hero_sheet',
  tilesetOutdoor: 'tileset_outdoor',
} as const;

/** Chiều rộng/ncao 1 tile trong texture (px). */
export const TEX_TILE = 32;

/** Frame size trong texture hero sheet (64×64 mỗi frame). */
export const HERO_FRAME_SIZE = 64;

/**
 * Thứ tự hướng của hero sheet (16 frame = 4 hướng × 4 frame).
 *
 * Phải khớp với `DIRS` trong `entities/PlayerSprite.ts` và với thứ tự hàng
 * của file PNG (`packages/shared/assets/sprites/hero_64.png`, sinh từ
 * `sprites_import/main.png`).
 *
 * CŨNG LÀ LỖI GỐC: version trước khai `['down','left','right','up']` trong khi
 * PlayerSprite dùng `['down','up','left','right']` → sprite quay sai hướng.
 */
export const HERO_DIRS = ['down', 'up', 'left', 'right'] as const;

/**
 * Tiles sheet cho Tilemap: gom tất cả tile 32×32 vào 1 texture ngang.
 * Index trong sheet = vị trí của tile đó.
 */
export const TILES_SHEET = 'world_tiles';

export const TILE_INDEX: Record<string, number> = {
  [TEX.grass]: 0,
  [TEX.grassAlt]: 1,
  [TEX.path]: 2,
  [TEX.water]: 3,
  [TEX.tree]: 4,
  [TEX.flower]: 5,
  [TEX.roof]: 6,
  [TEX.wall]: 7,
  [TEX.door]: 8,
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.makeTextures();
    this.makeTrainerSheet();
    this.makeTilesSheet();
    // Hero sheet mới (sprite nhân vật mặc định từ game_pack) — load async
    this.loadHeroSheet();
  }

  create() {
    const network = ColyseusManager.getInstance();

    // Ưu tiên 1: DEV_MODE → đăng nhập tự động bằng tài khoản admin
    if (DEV_MODE) {
      network
        .connect(DEV_CREDENTIALS.username, DEV_CREDENTIALS.password)
        .then(() => this.scene.start('World'))
        .catch((err: unknown) => {
          console.warn('[dev] auto-login failed, fallback to Login:', err);
          this.scene.start('Login');
        });
      return;
    }

    // Ưu tiên 2: còn phiên đăng nhập trong localStorage → vào thẳng World
    // (đây là fix cho lỗi "refresh trang bị đá ra khỏi game")
    if (network.hasSession()) {
      network
        .resume()
        .then((ok) => this.scene.start(ok ? 'World' : 'Login'))
        .catch(() => this.scene.start('Login'));
      return;
    }

    // Không có phiên → hiện màn hình login
    this.scene.start('Login');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Sinh texture từ một hàm vẽ (nhận Graphics). */
  private gen(name: string, w: number, h: number, paint: (g: Phaser.GameObjects.Graphics) => void) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    paint(g);
    g.generateTexture(name, w, h);
    g.clear();
    g.destroy();
  }

  /**
   * Load hero sheet 16 frame (4 hướng × 4 frame, 64×64 mỗi frame = 256×256).
   * Sheet đã có sẵn ở `@pixelmon/shared/assets/sprites/hero_64.png`, được sinh
   * từ `sprites_import/main.png` bởi script cắt spritesheet.
   *
   * LƯU Ý THỨ TỰ: `HERO_DIRS` phải khớp CHÍNH XÁC với `DIRS` trong
   * `entities/PlayerSprite.ts` và với layout hàng của file PNG.
   * Sai thứ tự → nhân vật quay đầu sang hướng khác.
   */
  private async loadHeroSheet(): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.textures.addImage(TEX.hero, img);
          // Đăng ký 16 frame con
          const tex = this.textures.get(TEX.hero);
          if (tex && tex.source.length > 0) {
            // Sheet là lưới 4×4 (256×256) — KHÔNG phải dải ngang 1024×64.
            // Layout hàng theo `HERO_DIRS` (down, up, left, right):
            //   row 0 = down (0_0..0_3)
            //   row 1 = up   (1_0..1_3)
            //   row 2 = left (2_0..2_3)
            //   row 3 = right(3_0..3_3)
            const F = HERO_FRAME_SIZE;
            HERO_DIRS.forEach((_, di) => {
              for (let i = 0; i < 4; i++) {
                // x = cột, y = hàng — CŨNG LÀ LỖI GỐC trước đây truyền dải 1D
                // (F*(di*4+i)) làm index vượt quá 256 → clamp về 0 → toàn bộ
                // frame trỏ về ô 0_0 nên sprite không đổi hướng.
                tex.add(`${di}_${i}`, 0, F * i, F * di, F, F);
              }
            });
          }
          resolve();
        };
        img.onerror = () => reject(new Error('hero_64.png load failed'));
        img.src = heroSheetUrl;
      });
      console.log('[boot] hero sheet loaded');
    } catch (err) {
      console.warn('[boot] hero sheet unavailable, using legacy trainer sheet:', err);
    }
  }

  private makeTextures(): void {
    const T = TEX_TILE;

    // 1x1 trắng — dùng chung cho Graphics.fillRect / fillStyle
    this.gen(TEX.px, 1, 1, (g) => g.fillStyle(C.white, 1).fillRect(0, 0, 1, 1));

    // --- Grass: nền + vài cọng, có 2 biến thể để xen kẽ ---
    for (const [key, base, speck] of [
      [TEX.grass, C.grass, C.grassAlt],
      [TEX.grassAlt, C.grassAlt, C.grass],
    ] as const) {
      this.gen(key, T, T, (g) => {
        g.fillStyle(base, 1).fillRect(0, 0, T, T);
        g.fillStyle(speck, 0.55);
        g.fillRect(4, 6, 3, 6);
        g.fillRect(19, 3, 3, 5);
        g.fillRect(11, 20, 3, 7);
        g.fillRect(26, 17, 3, 6);
      });
    }

    // --- Path: đất + sỏi ---
    this.gen(TEX.path, T, T, (g) => {
      g.fillStyle(C.path, 1).fillRect(0, 0, T, T);
      g.fillStyle(0x000000, 0.12);
      g.fillRect(6, 8, 5, 3);
      g.fillRect(21, 19, 6, 3);
      g.fillRect(13, 26, 4, 2);
      g.fillStyle(0xffffff, 0.1);
      g.fillRect(2, 16, 4, 2);
    });

    // --- Water: sóng ---
    this.gen(TEX.water, T, T, (g) => {
      g.fillStyle(C.water, 1).fillRect(0, 0, T, T);
      g.fillStyle(0xffffff, 0.22);
      g.fillRect(2, 8, 12, 3);
      g.fillRect(18, 18, 12, 3);
      g.fillStyle(0x1c6fa8, 0.5);
      g.fillRect(8, 14, 10, 2);
    });

    // --- Tree: thân + tán (vẽ theo thứ tự để tán đè lên thân) ---
    this.gen(TEX.tree, T, T, (g) => {
      g.fillStyle(C.grass, 1).fillRect(0, 0, T, T);
      g.fillStyle(0x6b4423, 1).fillRect(14, 20, 5, 10);
      g.fillStyle(C.tree, 1);
      g.fillCircle(16, 14, 11);
      g.fillStyle(0x2ecc71, 0.7);
      g.fillCircle(12, 10, 5);
      g.fillStyle(0x000000, 0.12);
      g.fillCircle(21, 18, 4);
    });

    // --- Flower: 1 bông trên cỏ ---
    this.gen(TEX.flower, T, T, (g) => {
      g.fillStyle(C.grass, 1).fillRect(0, 0, T, T);
      g.fillStyle(C.flower, 1);
      g.fillCircle(16, 13, 4);
      g.fillStyle(0xf1c40f, 1);
      g.fillCircle(16, 13, 2);
      g.fillStyle(C.tree, 1);
      g.fillRect(15, 16, 2, 8);
    });

    // --- Roof: mái nhà ---
    this.gen(TEX.roof, T, T, (g) => {
      g.fillStyle(C.roof, 1).fillRect(0, 0, T, T);
      g.fillStyle(0x000000, 0.18);
      g.fillRect(0, 14, T, 2);
      g.fillRect(0, 26, T, 2);
      g.fillStyle(0xffffff, 0.1);
      g.fillRect(2, 3, 28, 2);
    });

    // --- Wall: tường nhà ---
    this.gen(TEX.wall, T, T, (g) => {
      g.fillStyle(C.wall, 1).fillRect(0, 0, T, T);
      g.fillStyle(0x000000, 0.16);
      g.fillRect(0, 15, T, 2);
      g.fillRect(15, 0, 2, T);
      g.fillRect(0, 0, 2, 15);
    });

    // --- Door: cửa ---
    this.gen(TEX.door, T, T, (g) => {
      g.fillStyle(0x000000, 0.25).fillRect(4, 4, 24, 28);
      g.fillStyle(C.door, 1).fillRect(6, 6, 20, 26);
      g.fillStyle(0xf1c40f, 1).fillCircle(21, 20, 2);
    });

    // --- Shadow: ellipse dưới chân ---
    this.gen(TEX.shadow, 24, 12, (g) => {
      g.fillStyle(C.shadow, 0.28).fillEllipse(12, 6, 24, 12);
    });

    // --- Legacy placeholder textures (BattleScene, WorldScene fallback) ---
    this.gen('player', T, T, (g) => g.fillStyle(0x4a90d9, 1).fillRect(0, 0, T, T));
    this.gen('grass', T, T, (g) => g.fillStyle(C.grass, 1).fillRect(0, 0, T, T));
    this.gen('dirt', T, T, (g) => g.fillStyle(C.path, 1).fillRect(0, 0, T, T));

    // --- Pokemon placeholder (giữ như cũ cho BattleScene) ---
    this.gen(TEX.pokemon, 32, 32, (g) => g.fillStyle(0xe74c3c, 1).fillCircle(16, 16, 16));
    this.gen(TEX.pokemonFoe, 32, 32, (g) => g.fillStyle(0xf1c40f, 1).fillCircle(16, 16, 16));
  }

  /**
   * Gom 9 tile 32×32 vào 1 sheet ngang (288×32) để Tilemap dùng 1 texture duy nhất.
   * Thứ tự phải khớp với `TILE_INDEX`.
   */
  private makeTilesSheet(): void {
    const F = TEX_TILE;
    const order = [
      TEX.grass,
      TEX.grassAlt,
      TEX.path,
      TEX.water,
      TEX.tree,
      TEX.flower,
      TEX.roof,
      TEX.wall,
      TEX.door,
    ];
    const sheet = this.textures.createCanvas(TILES_SHEET, F * order.length, F);
    if (!sheet) return;
    const ctx = sheet.getContext();
    order.forEach((key, i) => {
      const tex = this.textures.get(key);
      if (!tex) return;
      ctx.drawImage(tex.getSourceImage() as HTMLCanvasElement, F * i, 0);
    });
    sheet.refresh();
  }

  /**
   * Trainer sheet: 4 hướng (down, up, left, right) × 3 frame = 12 frame ngang.
   * Mỗi frame 32×32 → texture 384×32. Sprite origin (0.5, 0.7) để chân khớp tile.
   *
   * LƯU Ý: `textures.createCanvas()` tạo texture chỉ có frame `__BASE` (toàn bộ dải).
   * Phải đăng ký 12 frame con bằng `texture.add()` — nếu không, mọi Sprite sẽ vẽ
   * cả 12 trainer cạnh nhau thay vì 1 frame.
   */
  private makeTrainerSheet(): void {
    const F = 32;
    const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
    const skin = 0xf1c40f;
    const hair = 0x3b2f2f;
    const shirt = 0x4a90d9;
    const pants = 0x2c3e50;

    // Tạo sheet canvas trước, ghép từng frame vào
    const sheet = this.textures.createCanvas(TEX.trainer, F * 12, F);
    if (!sheet) return;
    const ctx = sheet.getContext();

    // index frame để vẽ chân đúng phase
    const leg = (g: Phaser.GameObjects.Graphics, i: number, dx: number) => {
      const lift = i === 1 ? -3 : 0;
      g.fillStyle(pants, 1);
      g.fillRect(dx + 8, 22 + lift, 6, 9);
      g.fillRect(dx + 18, 22 - lift, 6, 9);
    };

    for (const [di, dir] of dirs.entries()) {
      for (let i = 0; i < 3; i++) {
        const tmpKey = `${TEX.trainer}_${dir}_${i}`;
        const g = this.make.graphics({ x: 0, y: 0 }, false);

        if (dir === 'down') {
          leg(g, i, 0);
          g.fillStyle(shirt, 1).fillRect(8, 12, 16, 11);
          g.fillStyle(skin, 1).fillRect(9, 3, 14, 10);
          g.fillStyle(hair, 1).fillRect(9, 1, 14, 5);
          g.fillStyle(0x000000, 1);
          g.fillRect(13, 8, 2, 2);
          g.fillRect(18, 8, 2, 2);
        } else if (dir === 'up') {
          leg(g, i, 0);
          g.fillStyle(shirt, 1).fillRect(8, 12, 16, 11);
          g.fillStyle(skin, 1).fillRect(9, 3, 14, 10);
          g.fillStyle(hair, 1).fillRect(9, 2, 14, 10);
        } else if (dir === 'left') {
          leg(g, i, 0);
          g.fillStyle(shirt, 1).fillRect(10, 12, 14, 11);
          g.fillStyle(skin, 1).fillRect(8, 3, 12, 10);
          g.fillStyle(hair, 1).fillRect(8, 1, 12, 5);
          g.fillStyle(0x000000, 1).fillRect(10, 8, 2, 2);
        } else {
          leg(g, i, 0);
          g.fillStyle(shirt, 1).fillRect(8, 12, 14, 11);
          g.fillStyle(skin, 1).fillRect(12, 3, 12, 10);
          g.fillStyle(hair, 1).fillRect(12, 1, 12, 5);
          g.fillStyle(0x000000, 1).fillRect(20, 8, 2, 2);
        }

        g.generateTexture(tmpKey, F, F);
        g.clear();
        g.destroy();

        // ghép frame vào sheet
        const frameTex = this.textures.get(tmpKey);
        if (frameTex && frameTex.source.length > 0) {
          ctx.drawImage(frameTex.getSourceImage() as HTMLCanvasElement, F * (di * 3 + i), 0);
        }
        this.textures.remove(tmpKey);
      }
    }

    sheet.refresh();

    // Đăng ký 12 frame con theo thứ tự (di*3 + i) — khớp với frameIndex() của PlayerSprite.
    const tex = this.textures.get(TEX.trainer);
    dirs.forEach((_, di) => {
      for (let i = 0; i < 3; i++) {
        tex.add(`${di}_${i}`, 0, F * (di * 3 + i), 0, F, F);
      }
    });
  }
}
