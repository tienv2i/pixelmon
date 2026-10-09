import type { ServerMap } from '@pixelmon/shared';
import {
  CollisionFlag,
  isWalkable,
  isGrass,
  isWater,
  isLedge,
  getLedgeDirection,
  canJumpLedge,
  getWarpAt,
  getCollisionFlag,
  isDirBlocked,
  canStep,
  type WalkableOptions,
} from '@pixelmon/shared';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059: file nằm ngoài rootDir của client (packages/shared/data)
import lappetTownJson from '@pixelmon/shared/data/maps/server/lappet-town.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import route1Json from '@pixelmon/shared/data/maps/server/route-1.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import playersHouseJson from '@pixelmon/shared/data/maps/server/players-house.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import pokemonLabJson from '@pixelmon/shared/data/maps/server/pokemon-lab.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import daisysHouseJson from '@pixelmon/shared/data/maps/server/daisys-house.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import kurtsHouseJson from '@pixelmon/shared/data/maps/server/kurts-house.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import cedolanCityJson from '@pixelmon/shared/data/maps/server/cedolan-city.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import cedolanPokeCenterJson from '@pixelmon/shared/data/maps/server/cedolan-poke-center.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import cedolanGymJson from '@pixelmon/shared/data/maps/server/cedolan-gym.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import pokemonInstituteJson from '@pixelmon/shared/data/maps/server/pokemon-institute.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import cedolanCondoJson from '@pixelmon/shared/data/maps/server/cedolan-condo.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import gameCornerJson from '@pixelmon/shared/data/maps/server/game-corner.json';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — TS6059
import cedolanDept1fJson from '@pixelmon/shared/data/maps/server/cedolan-dept-1f.json';

/**
 * CollisionGrid — wrapper phía client cho `ServerMap.collision`.
 *
 * Nguồn SSOT: `packages/shared/data/maps/server/*.json` (do converter
 * `scripts/tools/convert_essentials_map.py` sinh ra, đã gồm WATER/GRASS/LEDGE/WARP).
 * Trả về `ServerMap` cho các helper `formulas/mapruntime.ts` để client và server
 * dùng chung **một bộ logic va chạm duy nhất**.
 */
export class CollisionGrid {
  readonly mapId: string;
  readonly width: number;
  readonly height: number;
  /** `null` = map chưa đăng ký → fallback đi được ở mọi nơi (giữ hành vi cũ). */
  private readonly map: ServerMap | null;

  constructor(map: ServerMap | null, mapId = '') {
    this.map = map;
    this.mapId = map?.mapId ?? mapId;
    this.width = map?.width ?? 0;
    this.height = map?.height ?? 0;
  }

  /** Map đã có dữ liệu va chạm thật chưa? */
  get hasData(): boolean {
    return this.map !== null;
  }

  /** Ô có thể đi vào không? (nước cần `opts.canSurf`) */
  isWalkable(x: number, y: number, opts: WalkableOptions = {}): boolean {
    if (!this.map) return true; // fallback: không chặn (giữ hành vi hiện tại)
    return isWalkable(this.map, x, y, opts);
  }

  /** Hướng `dir` bị chặn tại ô này theo `passage` (RMXP)? */
  isDirBlocked(x: number, y: number, dir: 'down' | 'up' | 'left' | 'right'): boolean {
    if (!this.map) return false;
    return isDirBlocked(this.map, x, y, dir);
  }

  /** Đi được hướng `dir` vào ô này không? (walkable + passage theo hướng) */
  canStep(
    x: number,
    y: number,
    dir: 'down' | 'up' | 'left' | 'right',
    opts: WalkableOptions = {},
  ): boolean {
    if (!this.map) return true;
    return canStep(this.map, x, y, dir, opts);
  }

  /** Ô nước (cần Surf)? */
  isWater(x: number, y: number): boolean {
    if (!this.map) return false;
    return isWater(this.map, x, y);
  }

  /** Ô cỏ cao (potential encounter)? */
  isGrass(x: number, y: number): boolean {
    if (!this.map) return false;
    return isGrass(this.map, x, y);
  }

  /** Ô ledge (vách nhảy 1 chiều)? */
  isLedge(x: number, y: number): boolean {
    if (!this.map) return false;
    return isLedge(this.map, x, y);
  }

  /** Hướng rơi của ledge, `null` nếu không phải ledge. */
  getLedgeDirection(x: number, y: number): 'down' | 'up' | 'left' | 'right' | null {
    if (!this.map) return null;
    return getLedgeDirection(this.map, x, y);
  }

  /** Ô ledge có cho phép nhảy theo hướng `dir` không? */
  canJumpLedge(x: number, y: number, dir: 'down' | 'up' | 'left' | 'right'): boolean {
    if (!this.map) return false;
    return canJumpLedge(this.map, x, y, dir);
  }

  /** Warp (cửa nhà / chuyển map) tại ô này? */
  getWarpAt(x: number, y: number) {
    if (!this.map) return undefined;
    return getWarpAt(this.map, x, y);
  }

  /** Danh sách toàn bộ objects trong map (warp, npc_spawn, items...). */
  get objects(): ServerMap['objects'] {
    return this.map?.objects ?? [];
  }

  /** Lấy danh sách NPC spawn trong map. */
  getNpcSpawns() {
    if (!this.map) return [];
    return this.map.objects.filter((o): o is import('@pixelmon/shared').MapObjectNpc => o.type === 'npc_spawn');
  }

  /** Bitmask thô tại ô này (0 = ngoài bản đồ / không có dữ liệu). */
  getFlag(x: number, y: number): number {
    if (!this.map) return CollisionFlag.WALKABLE;
    return getCollisionFlag(this.map, x, y);
  }

  /**
   * Tìm ô walkable gần nhất quanh `(x, y)` theo vòng xoáy (bán kính `maxRadius`).
   * Trả về chính ô đó nếu đã walkable. `null` nếu không tìm thấy.
   * Dùng khi spawn/warp rơi vào ô blocked (tường, cây, nước...).
   *
   * - Nếu ô đích walkable → **luôn trả về ô đó** (warp dest là chính xác, kể cả
   *   cửa kín 3 hướng; chấm điểm độ thoáng chỉ áp dụng khi ô đích KHÔNG walkable).
   * - Nếu ô đích blocked → ưu tiên ô thoáng nhất trong bán kính, tránh kẹt góc/tường.
   */
  nearestWalkable(
    x: number,
    y: number,
    opts: WalkableOptions = {},
    maxRadius = 8,
  ): { x: number; y: number } | null {
    if (this.isWalkable(x, y, opts)) return { x, y };
    let best: { x: number; y: number; score: number } | null = null;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          // Chỉ xét vành ngoài của bán kính r (tránh lặp lại ô đã duyệt).
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!this.isWalkable(nx, ny, opts)) continue;
          const score = this.openNeighborCount(nx, ny, opts);
          if (!best || score > best.score) {
            best = { x: nx, y: ny, score };
          }
          if (score >= 4) return { x: nx, y: ny };
        }
      }
    }
    if (best) return { x: best.x, y: best.y };
    return null;
  }

  /** Đếm số ô walkable 4 hướng xung quanh — proxy cho "độ thoáng" của ô. */
  private openNeighborCount(x: number, y: number, opts: WalkableOptions): number {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let n = 0;
    for (const [dx, dy] of dirs) {
      if (this.isWalkable(x + dx, y + dy, opts)) n++;
    }
    return n;
  }
}

/**
 * Registry mapId → CollisionGrid.
 *
 * - 5 map Essentials được **import tĩnh** (Vite bundle JSON) → không cần async load.
 * - `get(mapId)` với map chưa đăng ký trả về grid fallback `hasData=false`
 *   (mọi ô walkable) để không phá vỡ hành vi client đang chạy.
 */
export class MapCollisionRegistry {
  private readonly grids = new Map<string, CollisionGrid>();
  private readonly fallback = new CollisionGrid(null);

  constructor(maps: Record<string, ServerMap> = {}) {
    for (const [mapId, map] of Object.entries(maps)) this.register(mapId, map);
  }

  /** Đăng ký (hoặc ghi đè) một map. */
  register(mapId: string, map: ServerMap): CollisionGrid {
    const grid = new CollisionGrid(map, mapId);
    this.grids.set(mapId, grid);
    return grid;
  }

  /** Có map này trong registry không? */
  has(mapId: string): boolean {
    return this.grids.has(mapId);
  }

  /** Lấy grid theo mapId — chưa đăng ký → grid fallback (đi được ở mọi nơi). */
  get(mapId: string): CollisionGrid {
    return this.grids.get(mapId) ?? this.fallback;
  }

  /** Danh sách mapId đã đăng ký. */
  get ids(): string[] {
    return [...this.grids.keys()];
  }
}

/** Cast JSON → ServerMap (typecheck nhờ schema ở phía server; client tin dữ liệu bundle). */
const asServerMap = (raw: unknown): ServerMap => raw as ServerMap;

/**
 * Registry mặc định của client — khớp danh sách `TILED_MAPS` trong `TiledMapLoader`.
 * Alias dùng chung cùng một grid với map gốc.
 */
export const collisionRegistry = new MapCollisionRegistry({
  'lappet-town': asServerMap(lappetTownJson),
  'route-1': asServerMap(route1Json),
  'players-house': asServerMap(playersHouseJson),
  'pokemon-lab': asServerMap(pokemonLabJson),
  'daisys-house': asServerMap(daisysHouseJson),
  'kurts-house': asServerMap(kurtsHouseJson),
  'cedolan-city': asServerMap(cedolanCityJson),
  'cedolan-poke-center': asServerMap(cedolanPokeCenterJson),
  'cedolan-gym': asServerMap(cedolanGymJson),
  'pokemon-institute': asServerMap(pokemonInstituteJson),
  'cedolan-condo': asServerMap(cedolanCondoJson),
  'game-corner': asServerMap(gameCornerJson),
  'cedolan-dept-1f': asServerMap(cedolanDept1fJson),
  // Aliases (khớp TILED_MAPS)
  'pallet-town': asServerMap(lappetTownJson),
  'interior-lab': asServerMap(pokemonLabJson),
  'interior-player-house': asServerMap(playersHouseJson),
  'interior-rival-house': asServerMap(daisysHouseJson),
});

/** Tiện gọi nhanh: collision grid của map hiện tại. */
export function getCollisionGrid(mapId: string): CollisionGrid {
  return collisionRegistry.get(mapId);
}
