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
  'kurts-house': {
    id: 'kurts-house',
    name: "Kurt's house",
    width: 20,
    height: 15,
    spawn: { x: 6, y: 7 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'cedolan-city': {
    id: 'cedolan-city',
    name: 'Cedolan City',
    width: 60,
    height: 43,
    spawn: { x: 17, y: 40 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'cedolan-poke-center': {
    id: 'cedolan-poke-center',
    name: 'Cedolan Poké Center',
    width: 20,
    height: 15,
    spawn: { x: 7, y: 8 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'cedolan-gym': {
    id: 'cedolan-gym',
    name: 'Cedolan Gym',
    width: 20,
    height: 17,
    spawn: { x: 6, y: 14 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'pokemon-institute': {
    id: 'pokemon-institute',
    name: 'Pokémon Institute',
    width: 20,
    height: 15,
    spawn: { x: 7, y: 9 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'cedolan-condo': {
    id: 'cedolan-condo',
    name: 'Cedolan Condo',
    width: 20,
    height: 15,
    spawn: { x: 6, y: 9 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'game-corner': {
    id: 'game-corner',
    name: 'Game Corner',
    width: 20,
    height: 32,
    spawn: { x: 9, y: 13 },
    pvp: false,
    encounterRate: 0,
    spawnZones: [],
  },
  'cedolan-dept-1f': {
    id: 'cedolan-dept-1f',
    name: 'Cedolan Dept. 1F',
    width: 20,
    height: 17,
    spawn: { x: 2, y: 14 },
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
};

export const DEFAULT_MAP = 'lappet-town' as const;

/**
 * Ánh xạ mapId sang toạ độ lưới (grid tile x, y) trên Town Map vùng Essen.
 * Grid tile 16x16: x trong khoảng 0..29, y trong khoảng 0..19.
 */
export const MAP_TO_TOWN_POINT: Record<string, { x: number; y: number }> = {
  'lappet-town': { x: 13, y: 12 },
  'players-house': { x: 13, y: 12 },
  'pokemon-lab': { x: 13, y: 12 },
  'daisys-house': { x: 13, y: 12 },
  'route-1': { x: 13, y: 11 },
  'kurts-house': { x: 13, y: 11 },
  'cedolan-city': { x: 13, y: 10 },
  'cedolan-poke-center': { x: 14, y: 10 },
  'cedolan-gym': { x: 13, y: 10 },
  'pokemon-institute': { x: 14, y: 10 },
  'cedolan-condo': { x: 14, y: 10 },
  'game-corner': { x: 14, y: 10 },
  'cedolan-dept-1f': { x: 13, y: 10 },
  // Backward-compatibility aliases
  'pallet-town': { x: 13, y: 12 },
  'interior-player-house': { x: 13, y: 12 },
  'interior-lab': { x: 13, y: 12 },
  'interior-rival-house': { x: 13, y: 12 },
  route_1: { x: 13, y: 11 },
  oak_lab: { x: 13, y: 12 },
};

/** Lấy toạ độ Town Map theo mapId (fallback về Lappet Town x:13, y:12 nếu không có) */
export function getTownMapCoords(mapId: string): { x: number; y: number } {
  return MAP_TO_TOWN_POINT[mapId] ?? { x: 13, y: 12 };
}

