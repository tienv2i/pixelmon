import Phaser from 'phaser';
// Kiểu `*.png?url` đã khai báo trong `src/vite-env.d.ts` → không cần ts-ignore.
import outdoorTilesetUrl from '@pixelmon/shared/assets/tilesets/Outdoor.png?url';
import interiorTilesetUrl from '@pixelmon/shared/assets/tilesets/Interior general.png?url';
import lappetTownMap from '@pixelmon/shared/data/maps/tiled/lappet-town.tmj';
import route1Map from '@pixelmon/shared/data/maps/tiled/route-1.tmj';
import pokemonLabMap from '@pixelmon/shared/data/maps/tiled/pokemon-lab.tmj';
import playersHouseMap from '@pixelmon/shared/data/maps/tiled/players-house.tmj';
import daisysHouseMap from '@pixelmon/shared/data/maps/tiled/daisys-house.tmj';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059: type nằm ngoài rootDir của client (packages/shared/data)
import type { TiledMapJSON, TiledTileset } from '@pixelmon/shared/data/maps/tiled/types';

/**
 * TiledMapLoader — đọc file .tmj (Tiled Maps Editor) và render bằng Phaser Tilemap.
 *
 * Dữ liệu map: `packages/shared/data/maps/tiled/*.tmj` + `assets/tilesets/Outdoor.png`.
 * Mỗi .tmj có 3 tilelayer: Ground, Decoration, Overhead + 1 objectgroup.
 */

/** Registry các map ID có sẵn trong repo (khớp MapInfos.rxdata). */
export const TILED_MAPS: Record<string, TiledMapJSON> = {
  'lappet-town': lappetTownMap,
  'route-1': route1Map,
  'pokemon-lab': pokemonLabMap,
  'players-house': playersHouseMap,
  'daisys-house': daisysHouseMap,
  // Aliases
  'pallet-town': lappetTownMap,
  'interior-lab': pokemonLabMap,
  'interior-player-house': playersHouseMap,
  'interior-rival-house': daisysHouseMap,
} as Record<string, TiledMapJSON>;

/** Danh sách map ID có sẵn (dùng cho WorldScene dropdown + admin). */
export const AVAILABLE_MAP_IDS = Object.keys(TILED_MAPS);

/** Map mặc định load khi vào game (khớp rxmapdata). */
export const DEFAULT_MAP_ID = 'lappet-town';

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
export async function loadTilesetTexture(
  scene: Phaser.Scene,
  key = 'tileset_outdoor',
  url = outdoorTilesetUrl,
): Promise<void> {
  if (scene.textures.exists(key)) return;

  return new Promise<void>((resolve, reject) => {
    const loader = scene.load;
    loader.once('complete', () => resolve());
    loader.once('loaderror', (file: { key: string }) => {
      if (file.key === key) reject(new Error(`Failed to load tileset: ${key}`));
    });
    loader.image(key, url);
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

  const ts: TiledTileset = mapJson.tilesets[0];
  if (!ts) throw new Error(`Map "${mapId}" has no tilesets`);

  const isInterior = ts.image.includes('Interior') || ts.name.includes('interior');
  const textureKey = isInterior ? 'tileset_interior' : 'tileset_outdoor';
  const textureUrl = isInterior ? interiorTilesetUrl : outdoorTilesetUrl;

  // Load tileset nếu chưa có
  await loadTilesetTexture(scene, textureKey, textureUrl);

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
    textureKey,
    ts.tilewidth,
    ts.tileheight,
    ts.margin ?? 0,
    ts.spacing ?? 0,
  );
  if (!tileset) throw new Error(`Failed to add tileset image for "${mapId}"`);

  // 3. Tạo layer cho mỗi tilelayer (bỏ qua objectgroup)
  const layers: Phaser.Tilemaps.TilemapLayer[] = [];

  for (const layer of mapJson.layers) {
    if (layer.type !== 'tilelayer' || !layer.data) continue;

    const tilemapLayer = tilemap.createBlankLayer(layer.name, tileset);
    if (!tilemapLayer) continue;

    // Copy data từ Tiled vào Phaser
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i] ?? 0;
      if (gid < ts.firstgid) continue; // 0 = empty hoặc autotile không thuộc sheet này

      const x = i % mapJson.width;
      const y = Math.floor(i / mapJson.width);
      // GID sang tile index trong tileset image (0-based)
      tilemapLayer.putTileAt(gid - ts.firstgid, x, y, false);
    }

    // Đặt depth chuẩn hoá:
    // Ground (10) -> Decoration (12) -> Player (20) -> Overhead (30 - trên đầu người chơi)
    const lowerName = layer.name.toLowerCase();
    let layerDepth = depthBase;
    if (lowerName.includes('ground')) {
      layerDepth = 10;
    } else if (lowerName.includes('deco')) {
      layerDepth = 12;
    } else if (lowerName.includes('overhead')) {
      layerDepth = 30;
    } else {
      layerDepth = depthBase + layers.length * 2;
    }

    tilemapLayer.setDepth(layerDepth);
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
