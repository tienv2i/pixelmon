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
  /** grass tile ranges for encounters */
  encounterZones: { x1: number; y1: number; x2: number; y2: number }[];
}

export const MAPS: Record<string, MapData> = {
  'lappet-town': {
    id: 'lappet-town',
    name: 'Lappet Town',
    width: 32,
    height: 21,
    spawn: { x: 256, y: 256 },
    pvp: false,
    encounterRate: 15,
    encounterZones: [{ x1: 7, y1: 17, x2: 12, y2: 20 }],
  },
  'route-1': {
    id: 'route-1',
    name: 'Route 1',
    width: 36,
    height: 24,
    spawn: { x: 416, y: 704 },
    pvp: true,
    encounterRate: 20,
    encounterZones: [{ x1: 4, y1: 4, x2: 28, y2: 20 }],
  },
  'players-house': {
    id: 'players-house',
    name: "Player's house",
    width: 31,
    height: 15,
    spawn: { x: 96, y: 256 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
  'pokemon-lab': {
    id: 'pokemon-lab',
    name: 'Pokémon Lab',
    width: 20,
    height: 15,
    spawn: { x: 192, y: 384 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
  'daisys-house': {
    id: 'daisys-house',
    name: "Daisy's house",
    width: 20,
    height: 15,
    spawn: { x: 96, y: 256 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
  // Backward-compatibility aliases
  'pallet-town': {
    id: 'lappet-town',
    name: 'Lappet Town',
    width: 32,
    height: 21,
    spawn: { x: 256, y: 256 },
    pvp: false,
    encounterRate: 15,
    encounterZones: [{ x1: 7, y1: 17, x2: 12, y2: 20 }],
  },
  'interior-player-house': {
    id: 'players-house',
    name: "Player's house",
    width: 31,
    height: 15,
    spawn: { x: 96, y: 256 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
  'interior-lab': {
    id: 'pokemon-lab',
    name: 'Pokémon Lab',
    width: 20,
    height: 15,
    spawn: { x: 192, y: 384 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
  'interior-rival-house': {
    id: 'daisys-house',
    name: "Daisy's house",
    width: 20,
    height: 15,
    spawn: { x: 96, y: 256 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
  route_1: {
    id: 'route-1',
    name: 'Route 1',
    width: 36,
    height: 24,
    spawn: { x: 416, y: 704 },
    pvp: true,
    encounterRate: 20,
    encounterZones: [{ x1: 4, y1: 4, x2: 28, y2: 20 }],
  },
  oak_lab: {
    id: 'pokemon-lab',
    name: 'Pokémon Lab',
    width: 20,
    height: 15,
    spawn: { x: 192, y: 384 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
} as const;

export const DEFAULT_MAP = 'lappet-town' as const;
