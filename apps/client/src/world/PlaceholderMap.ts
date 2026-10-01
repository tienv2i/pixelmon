import Phaser from 'phaser';
import { TILES_SHEET, TILE_INDEX, TEX_TILE as T, TEX } from '../scenes/BootScene';

/** Map placeholder: 60×45 tile (1920×1440px) — lớn hơn viewport 1280×960 để camera trượt được. */
export const MAP_COLS = 60;
export const MAP_ROWS = 45;
export const MAP_W = MAP_COLS * T;
export const MAP_H = MAP_ROWS * T;

/** Deterministic hash từ toạ độ — tránh random mỗi lần load. */
function hash(x: number, y: number): number {
  const n = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  return ((n ^ (n >> 13)) >>> 0) % 1000;
}

/**
 * Lưới walkable của map placeholder — dùng cho pathfinding (click-to-move).
 * 1 = đi được, 0 = bị chặn (nước / tường nhà / cây).
 */
let walkGrid: Uint8Array | null = null;

/** Tile có thể đi không? Tọa độ theo grid (col, row), ngoài map = false. */
export function isWalkableTile(col: number, row: number): boolean {
  if (!walkGrid) return true;
  if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) return false;
  return walkGrid[row * MAP_COLS + col] === 1;
}

/** Tọa độ pixel (giữa tile) → grid col/row. */
export function pixelToTile(x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x / T), row: Math.floor(y / T) };
}

/** Toạ độ pixel từ grid col/row (giữa tile). */
export function tileToPixel(col: number, row: number): { x: number; y: number } {
  return { x: col * T + T / 2, y: row * T + T / 2 };
}

/**
 * Vẽ vùng map tượng trưng bằng `createBlankLayer` (O(1) draw call thay vì 1200 Image).
 * Các lớp: nền grass → path → water → trang trí (tree/roof/...).
 */
export function buildPlaceholderMap(scene: Phaser.Scene): Phaser.Tilemaps.TilemapLayer {
  const map = scene.make.tilemap({
    tileWidth: T,
    tileHeight: T,
    width: MAP_COLS,
    height: MAP_ROWS,
  });

  const tiles = map.addTilesetImage('tiles', TILES_SHEET, T, T, 0, 0);
  if (!tiles) throw new Error('PlaceholderMap: addTilesetImage failed');
  const layer = map.createBlankLayer('main', tiles);
  if (!layer) throw new Error('PlaceholderMap: createBlankLayer failed');

  const gi = (key: string): number => TILE_INDEX[key] ?? 0;
  const pathI = gi(TEX.path);
  const grassI = gi(TEX.grass);
  const grassAltI = gi(TEX.grassAlt);
  const waterI = gi(TEX.water);
  const treeI = gi(TEX.tree);
  const flowerI = gi(TEX.flower);
  const roofI = gi(TEX.roof);
  const wallI = gi(TEX.wall);
  const doorI = gi(TEX.door);

  // 1) Nền grass xen kẽ 2 biến thể
  for (let y = 0; y < MAP_ROWS; y++) {
    for (let x = 0; x < MAP_COLS; x++) {
      layer.putTileAt(hash(x, y) % 7 === 0 ? grassAltI : grassI, x, y, false);
    }
  }

  // 2) Đường ngang (y=20..21) + đường dọc (x=28..29)
  for (let x = 0; x < MAP_COLS; x++) {
    layer.putTileAt(pathI, x, 20, false);
    layer.putTileAt(pathI, x, 21, false);
  }
  for (let y = 0; y < MAP_ROWS; y++) {
    layer.putTileAt(pathI, 28, y, false);
    layer.putTileAt(pathI, 29, y, false);
  }

  // 3) Hồ nước ở góc dưới-trái
  for (let y = 34; y < 42; y++) {
    for (let x = 4; x < 16; x++) {
      layer.putTileAt(waterI, x, y, false);
    }
  }

  // 4) Cụm nhà (roof + wall + door)
  const houses = [
    { x: 44, y: 6, w: 7, h: 5 },
    { x: 52, y: 16, w: 6, h: 5 },
    { x: 8, y: 6, w: 6, h: 5 },
  ];
  for (const h of houses) {
    for (let yy = 0; yy < h.h; yy++) {
      for (let xx = 0; xx < h.w; xx++) {
        const ax = h.x + xx;
        const ay = h.y + yy;
        if (ax >= MAP_COLS || ay >= MAP_ROWS) continue;
        const isRoof = yy === 0 || (yy === 1 && xx >= 1 && xx < h.w - 1);
        layer.putTileAt(isRoof ? roofI : wallI, ax, ay, false);
      }
    }
    // cửa
    const dx = h.x + Math.floor(h.w / 2);
    const dy = h.y + h.h - 1;
    layer.putTileAt(doorI, dx, dy, false);
  }

  // 5) Cây rải deterministic (không đè lên path/water/nhà)
  for (let y = 2; y < MAP_ROWS - 2; y++) {
    for (let x = 2; x < MAP_COLS - 2; x++) {
      if (hash(x + 11, y + 7) % 23 !== 0) continue;
      if (y === 20 || y === 21 || x === 28 || x === 29) continue; // path
      if (x >= 4 && x <= 15 && y >= 34 && y <= 41) continue; // water
      let inHouse = false;
      for (const h of houses) {
        if (x >= h.x - 1 && x <= h.x + h.w && y >= h.y - 1 && y <= h.y + h.h) {
          inHouse = true;
          break;
        }
      }
      if (inHouse) continue;
      layer.putTileAt(treeI, x, y, false);
    }
  }

  // 6) Hoa rải rác
  for (let y = 2; y < MAP_ROWS - 2; y++) {
    for (let x = 2; x < MAP_COLS - 2; x++) {
      if (hash(x + 3, y + 91) % 17 !== 0) continue;
      if (y === 20 || y === 21 || x === 28 || x === 29) continue;
      layer.putTileAt(flowerI, x, y, false);
    }
  }

  // 7) Build lưới walkable cho pathfinding.
  //    Tile có hình vật cản (nước/tường/cây/mái) = 0; path + grass = 1.
  const BLOCKED = new Set<number>([waterI, treeI, roofI, wallI]);
  walkGrid = new Uint8Array(MAP_COLS * MAP_ROWS);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const tile = layer.getTileAt(col, row);
      const idx = tile ? tile.index : grassI;
      walkGrid[row * MAP_COLS + col] = BLOCKED.has(idx) ? 0 : 1;
    }
  }

  return layer;
}
