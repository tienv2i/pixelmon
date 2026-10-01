import { TILE_SIZE } from './grid.js';

/** Player walk speed in tiles per second */
export const PLAYER_SPEED = 6;

/** Movement step size in px (used by Phaser tweens) */
export const MOVE_STEP = TILE_SIZE;

/** Lerp factor for remote player interpolation */
export const INTERPOLATION_LERP = 0.15;

export const POKEBALL_LIST = [
  { id: 'pokeball', name: 'Poké Ball', mod: 1.0 },
  { id: 'greatball', name: 'Great Ball', mod: 1.5 },
  { id: 'ultraball', name: 'Ultra Ball', mod: 2.0 },
] as const;

export const MAX_PARTY_SIZE = 6;
export const MAX_POKEMON_LEVEL = 100;
export const MAX_TOTAL_EV = 510;
export const MAX_SINGLE_EV = 252;
export const MAX_IV = 31;

/** Battle constants */
export const BATTLE_TIMEOUT_SEC = 60;
export const CRIT_CHANCE_BASE = 1 / 16;
export const CRIT_MULT = 1.5;
export const STAB_MULT = 1.5;
export const TYPE_ADVANTAGE = 2.0;
export const TYPE_DISADVANTAGE = 0.5;
export const TYPE_NO_EFFECT = 0;

export const STAT_STAGE_MULTIPLIER: Record<number, number> = {
  [-6]: 2 / 8,
  [-5]: 2 / 7,
  [-4]: 2 / 6,
  [-3]: 2 / 5,
  [-2]: 2 / 4,
  [-1]: 2 / 3,
  [0]: 1,
  [1]: 3 / 2,
  [2]: 4 / 2,
  [3]: 5 / 2,
  [4]: 6 / 2,
  [5]: 7 / 2,
  [6]: 8 / 2,
};
