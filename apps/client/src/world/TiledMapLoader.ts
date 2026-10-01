import Phaser from 'phaser';
// Kiểu `*.png?url` đã khai báo trong `src/vite-env.d.ts` → không cần ts-ignore.
import outdoorTilesetUrl from '@pixelmon/shared/assets/tilesets/Outdoor.png?url';
import palletTownMap from '@pixelmon/shared/data/maps/tiled/pallet-town.tmj';
import map1Map from '@pixelmon/shared/data/maps/tiled/map-1.tmj';
import map3Map from '@pixelmon/shared/data/maps/tiled/map-3.tmj';
import interiorLabMap from '@pixelmon/shared/data/maps/tiled/interior-lab.tmj';
import interiorPlayerHouseMap from '@pixelmon/shared/data/maps/tiled/interior-player-house.tmj';
import interiorRivalHouseMap from '@pixelmon/shared/data/maps/tiled/interior-rival-house.tmj';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059: type nằm ngoài rootDir của client (packages/shared/data)
import type { TiledMapJSON, TiledTileset } from '@pixelmon/shared/data/maps/tiled/types';

/**
 * TiledMapLoader — đọc file .tmj (Tiled Maps Editor) và render bằng Phaser Tilemap.
 *
 * Dữ liệu map: `packages/shared/data/maps/tiled/*.tmj` + `assets/tilesets/Outdoor.png`.
 * Mỗi .tmj có 3 tilelayer: Ground, Decoration, Overhead + 1 objectgroup.
 *
 * Phaser KHÔNG đọc .tmj trực tiếp. Ta cần:
 * 1. Import JSON (bundled bởi Vite — không cần fetch)
 * 2. Load tileset image vào Phaser texture cache
 * 3. Tạo Tilemap thủ công từ layer.data
 * 4. Add TilemapLayer cho mỗi tilelayer
 */

/** Registry các map ID có sẵn trong repo. */
export const TILED_MAPS: Record<string, TiledMapJSON> = {
  'pallet-town': palletTownMap,
  'map-1': map1Map,
  'map-3': map3Map,
  'interior-lab': interiorLabMap,
  'interior-player-house': interiorPlayerHouseMap,
  'interior-rival-house': interiorRivalHouseMap,
} as Record<string, TiledMapJSON>;

/** Danh sách map ID có sẵn (dùng cho WorldScene dropdown + admin). */
export const AVAILABLE_MAP_IDS = Object.keys(TILED_MAPS);

/** Map mặc định load khi vào game. */
export const DEFAULT_MAP_ID = 'pallet-town';

export interface LoadedTiledMap {
  tilemap: Phaser.Tilemaps.Tilemap;
  layers: Phaser.Tilemaps.TilemapLayer[];
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
}

/**
 * Load tileset image vào texture cache (nếu chưa có).
 * Dùng `this.load.image()` để đồng bộ với loader của Phaser.
 */
export async function loadTilesetTexture(scene: Phaser.Scene): Promise<void> {
  const key = 'tileset_outdoor';
  if (scene.textures.exists(key)) return;

  return new Promise<void>((resolve, reject) => {
    const loader = scene.load;
    loader.once('complete', () => resolve());
    loader.once('loaderror', (file: { key: string }) => {
      if (file.key === key) reject(new Error(`Failed to load tileset: ${key}`));
    });
    loader.image(key, outdoorTilesetUrl);
    loader.start();
  });
}

/**
 * Load map từ registry và tạo TilemapLayer cho mỗi tilelayer.
 * Yêu cầu: gọi `loadTilesetTexture()` trước (trong preload hoặc load event).
 */
export async function loadTiledMap(
  scene: Phaser.Scene,
  mapId: string,
  depthBase = 0,
): Promise<LoadedTiledMap> {
  const mapJson = TILED_MAPS[mapId] ?? TILED_MAPS[DEFAULT_MAP_ID];
  if (!mapJson) throw new Error(`Map "${mapId}" not found in registry`);

  // Load tileset nếu chưa có
  await loadTilesetTexture(scene);

  const ts: TiledTileset = mapJson.tilesets[0];
  if (!ts) throw new Error(`Map "${mapId}" has no tilesets`);

  // 1. Tạo Tilemap
  const tilemap = scene.make.tilemap({
    tileWidth: mapJson.tilewidth,
    tileHeight: mapJson.tileheight,
    width: mapJson.width,
    height: mapJson.height,
  });

  // 2. Add tileset image vào Tilemap
  const tileset = tilemap.addTilesetImage(
    ts.name,
    'tileset_outdoor',
    ts.tilewidth,
    ts.tileheight,
    ts.margin ?? 0,
    ts.spacing ?? 0,
  );
  if (!tileset) throw new Error(`Failed to add tileset image for "${mapId}"`);

  // 3. Tạo layer cho mỗi tilelayer (bỏ qua objectgroup)
  const layers: Phaser.Tilemaps.TilemapLayer[] = [];
  let depth = depthBase;

  for (const layer of mapJson.layers) {
    if (layer.type !== 'tilelayer' || !layer.data) continue;

    const tilemapLayer = tilemap.createBlankLayer(layer.name, tileset);
    if (!tilemapLayer) continue;

    // Copy data từ Tiled vào Phaser
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i] ?? 0;
      if (gid === 0) continue; // 0 = empty tile

      const x = i % mapJson.width;
      const y = Math.floor(i / mapJson.width);
      tilemapLayer.putTileAt(gid - 1, x, y, false); // GID → index (off-by-1 vì Phaser index 0-based)
    }

    tilemapLayer.setDepth(depth++);
    layers.push(tilemapLayer);
  }

  const widthPx = mapJson.width * mapJson.tilewidth;
  const heightPx = mapJson.height * mapJson.tileheight;

  return {
    tilemap,
    layers,
    width: widthPx,
    height: heightPx,
    tileWidth: mapJson.tilewidth,
    tileHeight: mapJson.tileheight,
  };
}

/**
 * Load nhiều map cùng lúc (dùng khi cần preload tất cả vào scene).
 * Hiện tại chỉ dùng 1 map/lần nhưng API sẵn sàng cho mở rộng.
 */
export async function loadAllTiledMaps(
  scene: Phaser.Scene,
  depthBase = 0,
): Promise<Record<string, LoadedTiledMap>> {
  const result: Record<string, LoadedTiledMap> = {};
  for (const mapId of AVAILABLE_MAP_IDS) {
    result[mapId] = await loadTiledMap(scene, mapId, depthBase);
  }
  return result;
}
