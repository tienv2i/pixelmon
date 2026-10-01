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
  route_1: {
    id: 'route_1',
    name: 'Route 1',
    width: 60,
    height: 60,
    spawn: { x: 30, y: 30 },
    pvp: true,
    encounterRate: 20,
    encounterZones: [{ x1: 10, y1: 10, x2: 50, y2: 50 }],
  },
  oak_lab: {
    id: 'oak_lab',
    name: "Oak's Laboratory",
    width: 10,
    height: 10,
    spawn: { x: 5, y: 9 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
  pewter_city: {
    id: 'pewter_city',
    name: 'Pewter City',
    width: 40,
    height: 40,
    spawn: { x: 20, y: 20 },
    pvp: false,
    encounterRate: 0,
    encounterZones: [],
  },
} as const;

export const DEFAULT_MAP = 'route_1' as const;
