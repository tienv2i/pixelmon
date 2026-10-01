/**
 * Map runtime helpers — đọc collision bitmask, kiểm tra walkable, xử lý warps.
 * Dùng cho server (validate di chuyển) và client (render tile passable).
 */
import type { ServerMap, MapObject } from '../data/contracts.js';
import { CollisionFlag } from '../data/contracts.js';

export function getCollisionFlag(map: ServerMap, x: number, y: number): number {
  const { width, height, flags } = map.collision;
  if (x < 0 || y < 0 || x >= width || y >= height) return 0; // out of bounds = blocked
  return flags[y * width + x] ?? 0;
}

/** Tùy chọn cho isWalkable. */
export interface WalkableOptions {
  /** Player có HM Surf → đi vào ô WATER (sóng yên) được. */
  canSurf?: boolean;
}

/** Tile có thể đi vào không? */
export function isWalkable(
  map: ServerMap,
  x: number,
  y: number,
  opts: WalkableOptions = {},
): boolean {
  const flag = getCollisionFlag(map, x, y);
  if (flag & CollisionFlag.BLOCKED) return false;
  // Nước: chỉ qua khi surf. WATER|BLOCKED (nước sâu/thác) đã bị chặn ở trên.
  if (flag & CollisionFlag.WATER) return !!opts.canSurf;
  if (flag & CollisionFlag.WARP) return true; // warp tile walkable (trigger portal)
  return !!(flag & CollisionFlag.WALKABLE);
}

/** Tile cỏ (potential encounter)? */
export function isGrass(map: ServerMap, x: number, y: number): boolean {
  return !!(getCollisionFlag(map, x, y) & CollisionFlag.GRASS);
}

/** Tile nước? */
export function isWater(map: ServerMap, x: number, y: number): boolean {
  return !!(getCollisionFlag(map, x, y) & CollisionFlag.WATER);
}

/** Có phải ledge (leo — chỉ 1 chiều)? */
export function isLedge(map: ServerMap, x: number, y: number): boolean {
  return !!(getCollisionFlag(map, x, y) & CollisionFlag.LEDGE);
}

/** Hướng rơi của ledge: 'down' = +y, 'up' = -y, 'left' = -x, 'right' = +x.
 *  null nếu ô không phải ledge. */
export function getLedgeDirection(
  map: ServerMap,
  x: number,
  y: number,
): 'down' | 'up' | 'left' | 'right' | null {
  const flag = getCollisionFlag(map, x, y);
  if (!(flag & CollisionFlag.LEDGE)) return null;
  const dir = (flag & CollisionFlag.LEDGE_DIR_MASK) >> 5;
  switch (dir) {
    case 0: return 'down';   // LEDGE_SOUTH
    case 1: return 'up';     // LEDGE_NORTH
    case 2: return 'left';   // LEDGE_WEST
    case 3: return 'right';  // LEDGE_EAST
    default: return null;
  }
}

/** Ô ledge có cho phép nhảy theo `dir` không? */
export function canJumpLedge(
  map: ServerMap,
  x: number,
  y: number,
  dir: 'down' | 'up' | 'left' | 'right',
): boolean {
  return getLedgeDirection(map, x, y) === dir;
}

export type MapObjectType = MapObject['type'];

export function getObjectsOfType<T extends MapObjectType>(
  map: ServerMap,
  type: T,
): Extract<MapObject, { type: T }>[] {
  return map.objects.filter((o: MapObject) => o.type === type) as Extract<MapObject, { type: T }>[];
}

export type MapObjectWarp = Extract<MapObject, { type: 'warp' }>;
export type MapObjectNpc = Extract<MapObject, { type: 'npc_spawn' }>;
export type MapObjectGrass = Extract<MapObject, { type: 'grass_zone' }>;
export type MapObjectItemBall = Extract<MapObject, { type: 'item_ball' }>;
export type MapObjectBattle = Extract<MapObject, { type: 'battle_trigger' }>;

export function getWarpAt(map: ServerMap, x: number, y: number): MapObjectWarp | undefined {
  return map.objects.find(
    (o: MapObject): o is MapObjectWarp => o.type === 'warp' && o.x === x && o.y === y,
  );
}

/** Tất cả warp trong map. */
export function getAllWarps(map: ServerMap): MapObjectWarp[] {
  return getObjectsOfType(map, 'warp');
}

/** NPC spawns trong map. */
export function getNpcSpawns(map: ServerMap): MapObjectNpc[] {
  return getObjectsOfType(map, 'npc_spawn');
}

/** Grass zones (potential encounter areas) trong map. */
export function getGrassZones(map: ServerMap): MapObjectGrass[] {
  return getObjectsOfType(map, 'grass_zone');
}

/** Item balls trong map. */
export function getItemBalls(map: ServerMap): MapObjectItemBall[] {
  return getObjectsOfType(map, 'item_ball');
}

/** Trainer battle triggers trong map. */
export function getBattleTriggers(map: ServerMap): MapObjectBattle[] {
  return getObjectsOfType(map, 'battle_trigger');
}

export function isInGrassZone(map: ServerMap, x: number, y: number): boolean {
  const zones = getGrassZones(map);
  return zones.some(
    (z: MapObjectGrass) =>
      x >= z.x && x < z.x + (z.width || 1) && y >= z.y && y < z.y + (z.height || 1),
  );
}

/** Chuyển pixel ↔ tile. */
export function pixelToTile(px: number, tileSize: number): number {
  return Math.floor(px / tileSize);
}
export function tileToPixel(tile: number, tileSize: number): number {
  return tile * tileSize;
}

/** Clamp vị trí vào trong bounds map. */
export function clampToMap(map: ServerMap, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(map.width - 1, x)),
    y: Math.max(0, Math.min(map.height - 1, y)),
  };
}
