export const GRID_SIZE = 32;
export const TILE_SIZE = 32;
export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 40;

export const MOVE_SPEED: Record<string, number> = {
  walking: 150,
  running: 250,
  surfing: 180,
  cycling: 300,
  riding: 350,
};

export const MAP_IDS = {
  pallet_town: 'map_pallet_town',
  route_1: 'map_route_1',
  viridian_city: 'map_viridian_city',
  pewter_city: 'map_pewter_city',
};

export const INITIAL_MAP = 'map_pallet_town';
