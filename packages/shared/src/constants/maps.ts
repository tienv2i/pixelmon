export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  /** spawn tile {x,y} */
  spawn: { x: number; y: number };
  /** whether PvP is allowed in this map */
  pvp: boolean;
  /** encounter rate 0-100 */
  encounterRate: number;
  /**
   * Mốc kiểm tra vùng spawn (rect) — GIỮ LẠI từ `encounterZones` cũ.
   * KHÔNG còn inject vào collision nữa; vùng spawn thật nay đến từ property
   * `spawn_zone=1` trong tileset (xem `scripts/build-server-map.ts`).
   * Dùng để đối chiếu khi vẽ ô cỏ trong Tiled.
   */
  spawnZones: { x1: number; y1: number; x2: number; y2: number }[];
}

export const MAPS: Record<string, MapData> = {
  'lappet-town': {
    id: 'lappet-town',
    name: 'Lappet Town',
    width: 32,
    height: 21,
    spawn: { x: 8, y: 8 },
    pvp: false,
    encounterRate: 15,
    spawnZones: [{ x1: 7, y1: 17, x2: 12, y2: 20 }],
  },
  'route-1': {
    id: 'route-1',
    name: 'Route 1',
    width: 36,
    height: 24,
    spawn: { x: 13, y: 22 },
    pvp: true,
    encounterRate: 20,
    spawnZones: [{ x1: 4, y1: 4, x2: 28, y2: 20 }],
  },
  'players-house': {
    id: 'players-house',
    name: "Player's house",
    width: 31,
    height: 15,
    spawn: { x: 3, y: 8 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'pokemon-lab': {
    id: 'pokemon-lab',
    name: 'Pokémon Lab',
    width: 20,
    height: 15,
    spawn: { x: 6, y: 12 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'daisys-house': {
    id: 'daisys-house',
    name: "Daisy's house",
    width: 20,
    height: 15,
    spawn: { x: 3, y: 8 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  // Backward-compatibility aliases
  'pallet-town': {
    id: 'lappet-town',
    name: 'Lappet Town',
    width: 32,
    height: 21,
    spawn: { x: 8, y: 8 },
    pvp: false,
    encounterRate: 15,
    spawnZones: [{ x1: 7, y1: 17, x2: 12, y2: 20 }],
  },
  'interior-player-house': {
    id: 'players-house',
    name: "Player's house",
    width: 31,
    height: 15,
    spawn: { x: 3, y: 8 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'interior-lab': {
    id: 'pokemon-lab',
    name: 'Pokémon Lab',
    width: 20,
    height: 15,
    spawn: { x: 6, y: 12 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'interior-rival-house': {
    id: 'daisys-house',
    name: "Daisy's house",
    width: 20,
    height: 15,
    spawn: { x: 3, y: 8 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  route_1: {
    id: 'route-1',
    name: 'Route 1',
    width: 36,
    height: 24,
    spawn: { x: 13, y: 22 },
    pvp: true,
    encounterRate: 20,
    spawnZones: [{ x1: 4, y1: 4, x2: 28, y2: 20 }],
  },
  oak_lab: {
    id: 'pokemon-lab',
    name: 'Pokémon Lab',
    width: 20,
    height: 15,
    spawn: { x: 6, y: 12 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
} as const;

export const DEFAULT_MAP = 'lappet-town' as const;
