/**
 * build-server-map.ts — Tạo `packages/shared/data/maps/server/<id>.json` từ `.tmj` (Tiled).
 *
 * Mục tiêu (plan-tiled-first Phase 2): KHÔNG viết tay server JSON — mọi map vẽ trong Tiled
 * đều chạy `pnpm run build:map <id>` để sinh dữ liệu va chạm + object.
 *
 * Cách chạy:
 *   node scripts/build-server-map.ts <mapId...>     # cụ thể
 *   node scripts/build-server-map.ts --all          # mọi map có trong tiled/
 *   node scripts/build-server-map.ts --all --dry-run # chỉ báo cáo, không ghi
 *   node scripts/build-server-map.ts --all --watch   # tự regenerate khi Tiled save
 *
 * Collision derive 3 tầng (plan §3.3 + §3.4):
 *   A. Layer heuristic:  Decoration!=0 → BLOCKED | Ground!=0 → WALKABLE
 *      (Overhead KHÔNG chặn — mặc định walkable, render depth 30 che nhân vật)
 *   B. Tileset tile property (ưu tiên hơn A): `passage` (0x00 walkable / 0x0f blocked),
 *      `terrain_tag` (0x02 grass, 0x06 water, 0x0a tall grass), `ledge_dir`, `water`
 *   C. Object property override: `passage`, `terrain_tag`, `ledge_dir`, `water`
 *   D. Warp post-pass: ô warp → clear BLOCKED, set WALKABLE|WARP
 *   E. Landing post-pass: ô đích warp (cùng map + cross-map) → clear BLOCKED, set WALKABLE
 *
 * Node >= 22 chạy trực tiếp TypeScript (type stripping) — không cần tsx.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, watch as fsWatch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerMap, MapObject, CollisionLayer } from '../packages/shared/src/data/contracts.ts';
import { MAPS } from '../packages/shared/src/constants/maps.ts';

// ── CollisionFlag — khớp `packages/shared/src/data/contracts.ts` ────────────────
const WALKABLE = 0x01;
const WATER = 0x02;
const BLOCKED = 0x04;
const GRASS = 0x08;
const LEDGE = 0x10;
const LEDGE_DIR_MASK = 0x60;
const LEDGE_SOUTH = 0x10;
const LEDGE_NORTH = 0x30;
const LEDGE_WEST = 0x50;
const LEDGE_EAST = 0x70;
const WARP = 0x80;
// ── Bit 8-15: passage theo hướng (RMXP 4-bit) ──
const PASS_DOWN = 0x0100;
const PASS_LEFT = 0x0200;
const PASS_RIGHT = 0x0400;
const PASS_UP = 0x0800;
const PASS_DIR_MASK = 0x0f00;
const PASS_ALL = 0x0f00;

/**
 * `passage` (RMXP bitmask 4 hướng) → bit `PASS_*` trong collision.flags.
 * Chuẩn RMXP: bit = 1 nghĩa là **không cho đi** theo hướng đó.
 * Chỉ mask `0x0f` — bit cao (0x40/0x80) là cờ khác của RMXP, bỏ qua.
 */
const PASSAGE_TO_PASS_FLAG: Record<number, number> = {
  0x01: PASS_DOWN,
  0x02: PASS_LEFT,
  0x04: PASS_RIGHT,
  0x08: PASS_UP,
};

/** `passage & 0x0f` → tổng bit `PASS_*` tương ứng. */
function passageToPassFlags(low: number): number {
  let out = 0;
  for (const [pBit, fBit] of Object.entries(PASSAGE_TO_PASS_FLAG)) {
    if (low & Number(pBit)) out |= fBit;
  }
  return out;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TILED_DIR = path.join(ROOT, 'packages/shared/data/maps/tiled');
const SERVER_DIR = path.join(ROOT, 'packages/shared/data/maps/server');
const ENCOUNTERS_PATH = path.join(ROOT, 'packages/shared/data/encounters.json');

// ── Types ─────────────────────────────────────────────────────────────────────
interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}
interface TiledObject {
  id: number;
  name?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  visible?: boolean;
  properties?: TiledProperty[];
}
interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TiledObject[];
}
interface TiledTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets?: TiledTileset[];
  properties?: TiledProperty[];
}
interface RawSpawn {
  species: string;
  minLevel: number;
  maxLevel: number;
  weight: number;
  rarity: string;
  conditions?: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function propsOf(o: { properties?: TiledProperty[] }): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const p of o.properties ?? []) m.set(p.name, p.value);
  return m;
}
function propNum(o: { properties?: TiledProperty[] }, key: string): number | undefined {
  const v = propsOf(o).get(key);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}
function propStr(o: { properties?: TiledProperty[] }, key: string): string | undefined {
  const v = propsOf(o).get(key);
  return typeof v === 'string' ? v : undefined;
}
function propBool(o: { properties?: TiledProperty[] }, key: string): boolean | undefined {
  const v = propsOf(o).get(key);
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return undefined;
}

/** terrain_tag (Essentials) → CollisionFlag. Khớp bảng trong docs/tiled-workflow.md. */
const TERRAIN_TAG_TO_FLAG: Record<number, number> = {
  1: WALKABLE | LEDGE_SOUTH, // Ledge (jump down)
  2: GRASS, // Grass
  3: WALKABLE, // Sand
  4: BLOCKED, // Rock
  5: WATER, // DeepWater
  6: WATER, // StillWater
  7: WATER, // Water
  8: WATER | BLOCKED, // Waterfall
  9: WATER, // WaterfallCrest
  10: GRASS, // TallGrass
  11: WATER, // UnderwaterGrass
  12: WALKABLE, // Ice
  13: WALKABLE, // Neutral
  14: GRASS, // SootGrass
  15: WALKABLE, // Bridge
  16: WALKABLE, // Puddle
};
const LEDGE_DIR_TO_FLAG: Record<string, number> = {
  down: LEDGE_SOUTH,
  south: LEDGE_SOUTH,
  up: LEDGE_NORTH,
  north: LEDGE_NORTH,
  left: LEDGE_WEST,
  west: LEDGE_WEST,
  right: LEDGE_EAST,
  east: LEDGE_EAST,
};

/** Đọc JSON map Tiled. */
async function readTiled(mapId: string): Promise<TiledMap> {
  const p = path.join(TILED_DIR, `${mapId}.tmj`);
  if (!existsSync(p)) throw new Error(`TMJ không tồn tại: ${p}`);
  return JSON.parse(await readFile(p, 'utf-8')) as TiledMap;
}

/** Lấy layer theo tên (không phân biệt hoa/thường). */
function pickLayer(map: TiledMap, ...names: string[]): TiledLayer | undefined {
  return map.layers.find((l) => names.some((n) => l.name.toLowerCase() === n.toLowerCase()));
}

/** Đọc encounters theo mapId (nếu có file). */
async function readEncounters(mapId: string): Promise<RawSpawn[]> {
  if (!existsSync(ENCOUNTERS_PATH)) return [];
  const list = JSON.parse(await readFile(ENCOUNTERS_PATH, 'utf-8')) as {
    mapId: string;
    spawns: RawSpawn[];
  }[];
  return list.find((x) => x.mapId === mapId)?.spawns ?? [];
}

/** Build map tile-property lookup: gid → props. */
function buildTilePropIndex(map: TiledMap): Map<number, Map<string, unknown>> {
  const idx = new Map<number, Map<string, unknown>>();
  for (const ts of map.tilesets ?? []) {
    const firstgid = ts.firstgid ?? 1;
    for (const t of ts.tiles ?? []) {
      const gid = firstgid + t.id;
      idx.set(gid, propsOf(t as unknown as { properties?: TiledProperty[] }));
    }
  }
  return idx;
}

/** Đọc property từ một Map (đã parse) hoặc object Tiled. */
function propNumFromMap(m: Map<string, unknown>, key: string): number | undefined {
  const v = m.get(key);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}
function propStrFromMap(m: Map<string, unknown>, key: string): string | undefined {
  const v = m.get(key);
  return typeof v === 'string' ? v : undefined;
}
function propBoolFromMap(m: Map<string, unknown>, key: string): boolean | undefined {
  const v = m.get(key);
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) return true;
  if (v === 'false' || v === 0) return false;
  return undefined;
}

/** Derive `collision.flags` (mảng phẳng length = w*h, index = y*width+x). */
function deriveCollision(map: TiledMap, mapId: string): CollisionLayer {
  const ground = pickLayer(map, 'Ground', 'ground');
  const deco = pickLayer(map, 'Decoration', 'decoration', 'deco');
  const overhead = pickLayer(map, 'Overhead', 'overhead');
  const size = map.width * map.height;
  const g = ground?.data ?? new Array<number>(size).fill(0);
  const d = deco?.data ?? new Array<number>(size).fill(0);
  const h = overhead?.data ?? new Array<number>(size).fill(0);
  const tileProps = buildTilePropIndex(map);

  const flags = new Array<number>(size);
  for (let i = 0; i < size; i++) {
    // B. Tileset tile property (ƯU TIÊN hơn heuristic — nguồn chân lý từ RMXP)
    //    Semantics khớp `convert_essentials_map.py`:
    //      - BLOCKED nếu BẤT KỲ layer nào (Ground/Decoration/Overhead) có passage 0x0f
    //      - terrain_tag (chỉ đọc ở Ground) quyết định bit còn lại
    //      - nếu blocked & terrain có WATER → giữ WATER (surf được), không thêm BLOCKED
    //      - nếu không blocked → terrain | WALKABLE
    const gProps = tileProps.get(g[i] ?? 0);
    const dProps = tileProps.get(d[i] ?? 0);
    const hProps = tileProps.get(h[i] ?? 0);
    const anyProps = gProps || dProps || hProps;

    let flag: number;
    if (anyProps) {
      // `passage` — ưu tiên Ground → Decoration → Overhead (layer đầu tiên CÓ).
      // Không layer nào có → `passLow = 0` (đi được cả 4 hướng, hành vi cũ).
      const gPass = gProps ? propNumFromMap(gProps, 'passage') : undefined;
      const dPass = dProps ? propNumFromMap(dProps, 'passage') : undefined;
      const hPass = hProps ? propNumFromMap(hProps, 'passage') : undefined;
      const passSrc = [gPass, dPass, hPass].find((p) => p !== undefined) ?? 0;
      const passLow = passSrc & 0x0f;
      // passage 0x0f → BLOCKED toàn phần (giữ hành vi cũ, không dùng bit PASS_*).
      const passAll = [gPass, dPass, hPass].some((p) => p !== undefined && (p & 0x0f) === 0x0f);

      const terrainTag = gProps ? propNumFromMap(gProps, 'terrain_tag') : undefined;
      const terrainFlag = terrainTag !== undefined ? (TERRAIN_TAG_TO_FLAG[terrainTag] ?? 0) : 0;

      // `spawn_zone=1` — CHỈ đọc từ Ground (không quét Decoration/Overhead để
      // ô trang trí không bị vô tình thành vùng spawn). Thay cho `grass_zone` cũ.
      const spawnZone =
        gProps && propNumFromMap(gProps, 'spawn_zone') === 1 ? GRASS : 0;
      const grassFlag = terrainFlag | spawnZone;

      // Cỏ luôn đi được (tall grass / grass chỉ gây encounter, không chặn di chuyển).
      // BUG cũ: `isBlocked` khiến tag 2/10/14 thành GRASS|BLOCKED (0x0C) → ô cỏ bị coi
      // là không đi được. Ưu tiên GRASS giữ WALKABLE, chỉ clear BLOCKED.
      if (grassFlag & GRASS) {
        flag = (flag & ~BLOCKED) | WALKABLE | grassFlag;
      } else if (passAll) {
        // passage 0x0f → BLOCKED toàn phần.
        flag = terrainFlag & WATER ? terrainFlag : (terrainFlag & ~WALKABLE) | BLOCKED;
      } else {
        // Ô đi được — gắn bit PASS_* cho các hướng bị chặn (nếu có).
        flag = terrainFlag | WALKABLE | passageToPassFlags(passLow);
      }

      // Ledge: `ledge_dir` có thể nằm ở BẤT KỲ layer nào (Ground/Decoration/Overhead).
      // BUG cũ: `gProps || dProps || hProps` dừng ngay khi Ground có props → ô ledge
      // vẽ ở Decoration (vd route-1 gid 829) không bao giờ được đọc → mất bit LEDGE,
      // người chơi đi thẳng xuyên qua. Quét cả 3 lớp thay vì dừng ở Ground.
      const ledSrc = [gProps, dProps, hProps].find(
        (p): p is Map<string, unknown> =>
          p !== undefined && propStrFromMap(p, 'ledge_dir') !== undefined,
      );
      const led = ledSrc ? propStrFromMap(ledSrc, 'ledge_dir') : undefined;
      if (led && LEDGE_DIR_TO_FLAG[led.toLowerCase()] !== undefined) {
        flag = (flag & ~LEDGE_DIR_MASK) | LEDGE_DIR_TO_FLAG[led.toLowerCase()]!;
      }

      // `water` — quét độc lập với ledge (trước đây dùng chung ledSrc, nên ô có
      // `water` mà không có `ledge_dir` sẽ bị bỏ sót).
      const waterSrc = [gProps, dProps, hProps].find(
        (p): p is Map<string, unknown> =>
          p !== undefined && propBoolFromMap(p, 'water') !== undefined,
      );
      if (waterSrc && propBoolFromMap(waterSrc, 'water') === true) flag |= WATER;
    } else {
      // A. Layer heuristic (chỉ khi không có tile property nào — map vẽ tay trong Tiled)
      //    Overhead KHÔNG chặn: đây là lớp tile vẽ ĐÈ LÊN nhân vật (tán cây, mái nhà,
      //    rào trên cao...) — người chơi đi được bên dưới. Muốn chặn ô có Overhead
      //    thì gán `passage=0x0f` cho tile đó trong Tiled (đi qua nhánh B ở trên).
      if (d[i] !== 0) flag = BLOCKED;
      else if (g[i] !== 0) flag = WALKABLE;
      else if (h[i] !== 0) flag = WALKABLE;
      else flag = BLOCKED;
    }

    flags[i] = flag;
  }

  // C. Object property override
  const objects = pickLayer(map, 'Objects', 'objects', 'objectgroup');
  if (objects?.objects) {
    for (const o of objects.objects) {
      const tx = Math.floor(o.x / map.tilewidth);
      const ty = Math.floor(o.y / map.tileheight);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      const i = ty * map.width + tx;

      const passage = propNum(o, 'passage');
      if (passage !== undefined) {
        const low = passage & 0x0f;
        if (low === 0x0f) flags[i] = (flags[i] & ~WALKABLE) | BLOCKED;
        else flags[i] = (flags[i] & ~BLOCKED) | WALKABLE | passageToPassFlags(low);
      }
      const terrainTag = propNum(o, 'terrain_tag');
      if (terrainTag !== undefined && TERRAIN_TAG_TO_FLAG[terrainTag] !== undefined) {
        flags[i] = TERRAIN_TAG_TO_FLAG[terrainTag]!;
      }
      const led = propStr(o, 'ledge_dir');
      if (led && LEDGE_DIR_TO_FLAG[led.toLowerCase()] !== undefined) {
        flags[i] = (flags[i] & ~LEDGE_DIR_MASK) | LEDGE_DIR_TO_FLAG[led.toLowerCase()]!;
      }
      if (propBool(o, 'water') === true) flags[i] |= WATER;
    }
  }

  // D. Warp post-pass: ô warp → clear BLOCKED, set WALKABLE|WARP
  if (objects?.objects) {
    for (const o of objects.objects) {
      if ((o.type ?? '').toLowerCase() !== 'warp') continue;
      const tx = Math.floor(o.x / map.tilewidth);
      const ty = Math.floor(o.y / map.tileheight);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      const i = ty * map.width + tx;
      if (flags[i] & WATER) continue; // nước — bỏ qua
      flags[i] = (flags[i] & ~BLOCKED) | WALKABLE | WARP;
    }
  }

  // D2. ĐÃ BỎ `grass_zone` post-pass.
  //     Trước đây object `grass_zone` trong Tiled set GRASS|WALKABLE cho mọi ô
  //     trong rect, gây lệch pha với `terrain_tag` (Pokémon spawn ở ô không phải
  //     cỏ). Nay GRASS chỉ đến từ property `spawn_zone=1` trong tileset (xem B)
  //     và `terrain_tag` — nguồn duy nhất, tuỳ biến được trong Tiled.

  // E. Landing post-pass: ô đích warp (cùng map) → clear BLOCKED, set WALKABLE
  if (objects?.objects) {
    for (const o of objects.objects) {
      if ((o.type ?? '').toLowerCase() !== 'warp') continue;
      const toX = propNum(o, 'toX');
      const toY = propNum(o, 'toY');
      const toMap = propStr(o, 'toMap');
      if (toX === undefined || toY === undefined || toMap !== mapId) continue;
      if (toX < 0 || toY < 0 || toX >= map.width || toY >= map.height) continue;
      const i = toY * map.width + toX;
      if (flags[i] & WATER) continue;
      flags[i] = (flags[i] & ~BLOCKED) | WALKABLE;
    }
  }

  return { name: 'collision', width: map.width, height: map.height, flags };
}

/**
 * Tầng F — Cross-map landing post-pass.
 *
 * Ô ĐÍCH của một warp nằm ở map KHÁC thì không thể xử lý trong `deriveCollision()`
 * (vì hàm chỉ nhìn thấy 1 map). Ví dụ `lappet-town (8,7) → players-house (3,8)`:
 * ô (3,8) của players-house bị converter gốc ép `WALKABLE` dù tile data chặn.
 *
 * Hàm này đọc TẤT CẢ map trong `tiled/` để tìm warp trỏ tới `mapId`, rồi ép
 * ô đích thành `WALKABLE` — khớp hành vi `_patch_cross_map_landings()` của converter.
 *
 * @param flags Collision của `mapId` (sẽ bị mutate tại chỗ).
 * @param map   TMJ của `mapId` (cần width/height/tilewidth).
 * @param allMaps Danh sách TMJ của mọi map (dùng để quét warp nguồn).
 */
function applyCrossMapLandings(
  flags: number[],
  map: TiledMap,
  mapId: string,
  allMaps: TiledMap[],
): void {
  for (const src of allMaps) {
    const srcObjects = pickLayer(src, 'Objects', 'objects', 'objectgroup')?.objects ?? [];
    for (const o of srcObjects) {
      if ((o.type ?? '').toLowerCase() !== 'warp') continue;
      if (propStr(o, 'toMap') !== mapId) continue;
      const toX = propNum(o, 'toX');
      const toY = propNum(o, 'toY');
      if (toX === undefined || toY === undefined) continue;
      if (toX < 0 || toY < 0 || toX >= map.width || toY >= map.height) continue;
      const i = toY * map.width + toX;
      if (flags[i] & WATER) continue; // nước — bỏ qua
      flags[i] = (flags[i] & ~BLOCKED) | WALKABLE;
    }
  }
}

/**
 * ĐÃ BỎ `injectGrassZonesFromEncounterZones`.
 *
 * Trước đây hàm này inject object `grass_zone` từ `MAPS[mapId].encounterZones`
 * khi TMJ chưa vẽ zone nào → set GRASS cho mọi ô trong rect. Gây lệch pha với
 * `terrain_tag` (Pokémon spawn ở ô không phải cỏ). Nay GRASS chỉ đến từ property
 * `spawn_zone=1` trong tileset (xem bước B) và `terrain_tag` — nguồn duy nhất,
 * tuỳ biến được trong Tiled.
 *
 * `MAPS[mapId].spawnZones` (đổi tên từ `encounterZones`) được GIỮ LẠI làm mốc
 * kiểm tra — không còn inject vào collision nữa.
 */

/** Derive `objects[]` — warp + các object khác. */function deriveObjects(map: TiledMap): MapObject[] {
  const layer = pickLayer(map, 'Objects', 'objects', 'objectgroup');
  if (!layer?.objects) return [];

  const out: MapObject[] = [];
  for (const o of layer.objects) {
    const tx = Math.floor(o.x / map.tilewidth);
    const ty = Math.floor(o.y / map.tileheight);
    const base = {
      id: o.id,
      name: o.name ?? '',
      x: tx,
      y: ty,
      width: o.width ?? 0,
      height: o.height ?? 0,
      visible: o.visible ?? true,
    };
    const type = (o.type ?? 'event').toLowerCase();

    if (type === 'warp') {
      const toMap = propStr(o, 'toMap');
      const toX = propNum(o, 'toX');
      const toY = propNum(o, 'toY');
      if (!toMap || toX === undefined || toY === undefined) {
        console.warn(`  ⚠️  warp ${o.id} "${o.name}" thiếu toMap/toX/toY — bỏ qua`);
        continue;
      }
      const direction = propStr(o, 'direction') as
        | 'up'
        | 'down'
        | 'left'
        | 'right'
        | undefined;
      out.push({
        ...base,
        type: 'warp',
        toMap,
        toX,
        toY,
        direction,
        visible: o.visible ?? true,
      } as MapObject);
      continue;
    }

    if (type === 'npc_spawn') {
      const npcId = propStr(o, 'npcId') ?? o.name ?? '';
      out.push({
        ...base,
        type: 'npc_spawn',
        npcId,
        sprite: propStr(o, 'sprite'),
        dialog: [],
        team: [],
        trainer: false,
        visible: o.visible ?? true,
      } as MapObject);
      continue;
    }

    if (type === 'grass_zone') {
      out.push({
        ...base,
        type: 'grass_zone',
        encounterTableId: propStr(o, 'encounterTableId') ?? '',
        visible: o.visible ?? true,
      } as MapObject);
      continue;
    }

    out.push({
      ...base,
      type: 'event',
      properties: [],
      visible: o.visible ?? true,
    } as MapObject);
  }
  return out;
}

/** Derive metadata map (tên, type, music, weather, desc). */
function deriveMeta(map: TiledMap, mapId: string) {
  const mp = new Map<string, unknown>();
  for (const p of map.properties ?? []) mp.set(p.name, p.value);

  const name = (mp.get('name') as string) ?? mapId;
  const mapType = (mp.get('mapType') as string) ?? 'town';
  const music = (mp.get('music') as string) ?? mapId;
  const weather = (mp.get('weather') as string) ?? 'sunny';
  const description =
    (mp.get('description') as string) ?? `${name} (auto-generated from Tiled).`;
  return { name, mapType, music, weather, description };
}

/** Build 1 map. */
async function buildOne(
  mapId: string,
  opts: { dryRun?: boolean; allMaps?: TiledMap[] } = {},
): Promise<{ ok: boolean; warps: number }> {
  try {
    const map = await readTiled(mapId);
    const meta = deriveMeta(map, mapId);
    const collision = deriveCollision(map, mapId);

    // Tầng F: ép ô đích warp từ map KHÁC thành WALKABLE.
    //   `opts.allMaps` được truyền vào từ `main()` — đọc tất cả `.tmj` một lần.
    const allMaps = opts.allMaps ?? [map];
    applyCrossMapLandings(collision.flags, map, mapId, allMaps);

    const objects = deriveObjects(map);
    // (đã bỏ inject grass_zone — GRASS nay chỉ từ spawn_zone/terrain_tag trong Tiled)
    const encounters = await readEncounters(mapId);

    const out: ServerMap = {
      mapId,
      name: meta.name,
      description: meta.description,
      mapType: (meta.mapType as 'town' | 'route' | 'dungeon' | 'gym' | 'interior' | 'battle') ?? 'town',
      music: meta.music,
      weather: meta.weather,
      width: map.width,
      height: map.height,
      tileWidth: map.tilewidth,
      tileHeight: map.tileheight,
      collision,
      objects,
      encounters: encounters as unknown as ServerMap['encounters'],
      requiredBadges: [],
    };

    const warps = objects.filter((o) => o.type === 'warp').length;
    if (opts.dryRun) {
      console.log(
        `  [dry-run] ${mapId}: ${map.width}×${map.height}, ${warps} warp, ${objects.length} obj, ${encounters.length} spawn`,
      );
      return { ok: true, warps };
    }

    await mkdir(SERVER_DIR, { recursive: true });
    const outPath = path.join(SERVER_DIR, `${mapId}.json`);
    await writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
    console.log(
      `  ✅ ${mapId}: ${map.width}×${map.height}, ${warps} warp, ${objects.length} obj, ${encounters.length} spawn`,
    );
    return { ok: true, warps };
  } catch (e) {
    console.error(`  ❌ ${mapId}:`, (e as Error).message);
    return { ok: false, warps: 0 };
  }
}

/** Cập nhật index.json — sinh từ tất cả file `*.json` trong server/ (trừ index.json). */
async function rebuildIndex(): Promise<void> {
  const entries = [];
  const files = await readdir(SERVER_DIR);
  for (const f of files) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    // Bỏ file map legacy đặt tên theo số RMXP (2.json, 8.json...) — không
    // có `.tmj` tương ứng, chỉ là bản dự phòng cũ.
    if (/^\d+$/.test(f.replace(/\.json$/, ''))) continue;
    const p = path.join(SERVER_DIR, f);
    const s = JSON.parse(await readFile(p, 'utf-8')) as ServerMap;
    entries.push({ mapId: s.mapId, file: `${s.mapId}.json`, width: s.width, height: s.height });
  }
  entries.sort((a, b) => a.mapId.localeCompare(b.mapId));
  await writeFile(
    path.join(SERVER_DIR, 'index.json'),
    JSON.stringify(entries, null, 2) + '\n',
    'utf-8',
  );
  console.log(`  📇 index.json cập nhật (${entries.length} map)`);
}

/** Liệt kê mọi mapId có `.tmj` (bỏ file tên thuần số). */
async function allMapIds(): Promise<string[]> {
  const files = await readdir(TILED_DIR);
  return files
    .filter((f) => f.endsWith('.tmj'))
    .map((f) => f.replace(/\.tmj$/, ''))
    .filter((id) => !/^\d+$/.test(id))
    .sort();
}

/** Main. */
async function main() {
  const args = process.argv.slice(2);
  const watch = args.includes('--watch');
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all') || args.length === 0;
  const ids = all ? await allMapIds() : args.filter((a) => !a.startsWith('--'));

  if (ids.length === 0) {
    console.error('❌ Không tìm thấy map. Cách dùng: build:map <id...> | --all [--dry-run] [--watch]');
    process.exit(1);
  }

  const run = async () => {
    console.log(`\n🔨 Build server map${dryRun ? ' (dry-run)' : ''}: ${ids.join(', ')}`);
    // Nạp TẤT CẢ map trong tiled/ một lần — cần cho tầng F (cross-map landing).
    // Warp có thể trỏ sang map KHÔNG nằm trong `ids` (ví dụ build 1 map lẻ).
    let allMaps: TiledMap[] = [];
    try {
      allMaps = await Promise.all((await allMapIds()).map((id) => readTiled(id)));
    } catch (e) {
      console.warn(`⚠️  Không nạp được toàn bộ map (cross-map landing có thể thiếu): ${(e as Error).message}`);
    }

    const results: { id: string; ok: boolean }[] = [];
    for (const id of ids) {
      const r = await buildOne(id, { dryRun, allMaps });
      results.push({ id, ok: r.ok });
    }
    if (!dryRun) {
      await rebuildIndex();
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.error(`\n❌ ${failed.length} map lỗi: ${failed.map((f) => f.id).join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log('\n🎉 Hoàn tất!');
    }
  };

  await run();

  if (watch) {
    console.log(`👀 Watching ${TILED_DIR} ... (Ctrl+C để thoát)`);
    fsWatch(TILED_DIR, async (_e, filename) => {
      if (filename && filename.endsWith('.tmj')) {
        const id = filename.replace(/\.tmj$/, '');
        if (ids.includes(id) || all) await run();
      }
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
