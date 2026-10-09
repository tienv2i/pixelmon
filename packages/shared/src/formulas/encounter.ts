/**
 * Encounter + Catch — weighted spawn roll & catch probability.
 * Port từ core-engine/encounter (rewrite).
 */
import type { SpawnEntry } from '../data/contracts.js';

export interface EncounterContext {
  mapType?: string;
  timeOfDay?: 'day' | 'night' | 'dawn' | 'dusk';
  weather?: string;
  playerLevel?: number;
}

export function randomInt(min: number, max: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Roll encounter từ weighted spawn entries.
 * Returns null nếu không gặp pokemon (do rate thấp hoặc không có entry hợp lệ).
 */
export function rollEncounter(
  entries: SpawnEntry[],
  ctx: EncounterContext,
  encounterRate: number = 0.1,
  rng: () => number = Math.random,
): { species: string; level: number } | null {
  if (rng() > encounterRate) return null;

  const valid = entries.filter((e) => {
    const c = e.conditions;
    if (c.timeOfDay && ctx.timeOfDay && !c.timeOfDay.includes(ctx.timeOfDay)) return false;
    if (c.weather && ctx.weather && !c.weather.includes(ctx.weather)) return false;
    return true;
  });

  if (valid.length === 0) return null;

  const totalWeight = valid.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng() * totalWeight;
  for (const entry of valid) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { species: entry.species, level: randomInt(entry.minLevel, entry.maxLevel, rng) };
    }
  }
  const first = valid[0]!;
  return { species: first.species, level: randomInt(first.minLevel, first.maxLevel, rng) };
}

// ===== Catch =====
export interface CatchResult {
  caught: boolean;
  chance: number;
  shakes: number;
  critical: boolean;
  message: string;
}

export interface CatchContext {
  turn?: number;
  types?: string[];
  baseSpeed?: number;
  allyLevel?: number;
  foeLevel?: number;
  isWater?: boolean;
  isDarkOrCave?: boolean;
  alreadyCaught?: boolean;
}

/** Tính xác suất bắt (0.01 - 1.0) theo chuẩn Gen 3-8 / Essentials. */
export function calculateCatchChance(
  species: { catchRate: number },
  hpCurrent: number,
  hpMax: number,
  statusEffect: string | null,
  ballMultiplier: number,
): number {
  if (ballMultiplier >= 255) return 1.0;

  const catchRate = species.catchRate ?? 45;
  const maxHp = Math.max(1, hpMax);
  const curHp = Math.max(1, Math.min(maxHp, hpCurrent));
  const statusBonus = statusMultiplier(statusEffect);

  // a = ((3 * MaxHP - 2 * CurrentHP) * CatchRate * BallMultiplier) / (3 * MaxHP) * StatusBonus
  const a = (((3 * maxHp - 2 * curHp) * catchRate * ballMultiplier) / (3 * maxHp)) * statusBonus;

  if (a >= 255) return 1.0;
  if (a <= 0) return 0.01;

  const chance = a / 255;
  return Math.min(1.0, Math.max(0.01, chance));
}

/** Thực hiện attempt bắt, tính chính xác số lần lắc bóng (0-3) và critical capture. */
export function attemptCatch(
  species: { catchRate: number },
  hpCurrent: number,
  hpMax: number,
  statusEffect: string | null,
  ballMultiplier: number,
  rng: () => number = Math.random,
): CatchResult {
  if (ballMultiplier >= 255) {
    return {
      caught: true,
      chance: 1.0,
      shakes: 3,
      critical: false,
      message: 'Gotcha! The Pokémon was caught!',
    };
  }

  const catchRate = species.catchRate ?? 45;
  const maxHp = Math.max(1, hpMax);
  const curHp = Math.max(1, Math.min(maxHp, hpCurrent));
  const statusBonus = statusMultiplier(statusEffect);

  const a = (((3 * maxHp - 2 * curHp) * catchRate * ballMultiplier) / (3 * maxHp)) * statusBonus;

  if (a >= 255) {
    return {
      caught: true,
      chance: 1.0,
      shakes: 3,
      critical: false,
      message: 'Gotcha! The Pokémon was caught!',
    };
  }

  // Xác suất mỗi lần lắc: b = (a / 255)^0.25
  const shakeProb = Math.min(1, Math.max(0.05, Math.pow(Math.max(0.001, a / 255), 0.25)));

  // Bắt chí mạng (Critical Capture)
  const criticalRoll = rng();
  const critical = (a > 120 && criticalRoll < 0.1) || criticalRoll < 0.01;

  if (critical) {
    const passed = rng() < shakeProb;
    return {
      caught: passed,
      chance: Math.min(1, a / 255),
      shakes: passed ? 1 : 0,
      critical: true,
      message: passed ? 'Gotcha! Critical capture!' : 'Oh no! The Pokémon broke free!',
    };
  }

  let shakes = 0;
  for (let i = 0; i < 3; i++) {
    if (rng() < shakeProb) {
      shakes++;
    } else {
      break;
    }
  }

  const caught = shakes === 3;
  return {
    caught,
    chance: Math.min(1, Math.max(0.01, a / 255)),
    shakes,
    critical: false,
    message: buildCatchMessage(caught, shakes),
  };
}

function statusMultiplier(status: string | null): number {
  switch (status) {
    case 'sleep':
    case 'freeze':
      return 2.5;
    case 'paralysis':
    case 'poison':
    case 'badly_poisoned':
    case 'burn':
      return 1.5;
    default:
      return 1.0;
  }
}

function buildCatchMessage(caught: boolean, shakes: number): string {
  if (caught) return 'Gotcha! The Pokémon was caught!';
  const messages = [
    'Oh no! The Pokémon broke free!',
    'Aww! It appeared to be caught!',
    'Shoot! It was so close!',
  ];
  return messages[shakes] ?? messages[0]!;
}

/** Tỷ lệ bóng (Ball multiplier) theo loại bóng và ngữ cảnh trận đấu. */
export function ballMultiplierFor(ballId: string, ctx?: CatchContext): number {
  const id = ballId.toLowerCase().replace(/[^a-z0-9]/g, '');
  switch (id) {
    case 'masterball':
    case 'parkball':
      return 255;
    case 'ultraball':
      return 2.0;
    case 'greatball':
    case 'safariball':
      return 1.5;
    case 'netball':
      if (ctx?.types?.some((t) => t.toLowerCase() === 'water' || t.toLowerCase() === 'bug')) return 3.5;
      return 1.0;
    case 'diveball':
      if (ctx?.isWater) return 3.5;
      return 1.0;
    case 'nestball':
      if (ctx?.foeLevel) return Math.min(3.0, Math.max(1.0, (41 - ctx.foeLevel) / 10));
      return 1.0;
    case 'repeatball':
      if (ctx?.alreadyCaught) return 3.5;
      return 1.0;
    case 'timerball':
      if (ctx?.turn) return Math.min(4.0, 1.0 + (ctx.turn - 1) * 0.3);
      return 1.0;
    case 'quickball':
      if (ctx?.turn === 1) return 5.0;
      return 1.0;
    case 'duskball':
      if (ctx?.isDarkOrCave) return 3.0;
      return 1.0;
    case 'fastball':
      if (ctx?.baseSpeed && ctx.baseSpeed >= 100) return 4.0;
      return 1.0;
    case 'levelball':
      if (ctx?.allyLevel && ctx?.foeLevel) {
        if (ctx.allyLevel >= ctx.foeLevel * 4) return 8.0;
        if (ctx.allyLevel >= ctx.foeLevel * 2) return 4.0;
        if (ctx.allyLevel > ctx.foeLevel) return 2.0;
      }
      return 1.0;
    default:
      return 1.0;
  }
}

export { rollEncounter as rollWildEncounter };
