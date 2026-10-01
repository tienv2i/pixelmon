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

/** Tính xác suất bắt (0.01 - 1). */
export function calculateCatchChance(
  species: { catchRate: number },
  hpCurrent: number,
  hpMax: number,
  statusEffect: string | null,
  ballMultiplier: number,
): number {
  const catchRate = species.catchRate / 255;
  const hpPercent = Math.max(0, 1 - hpCurrent / hpMax);
  const statusBonus = statusMultiplier(statusEffect);
  const raw = catchRate * hpPercent * ballMultiplier * statusBonus;
  return Math.min(1, Math.max(0.01, raw / 4));
}

/** Thực hiện attempt bắt, trả về result với số shake. */
export function attemptCatch(
  species: { catchRate: number },
  hpCurrent: number,
  hpMax: number,
  statusEffect: string | null,
  ballMultiplier: number,
  rng: () => number = Math.random,
): CatchResult {
  const chance = calculateCatchChance(species, hpCurrent, hpMax, statusEffect, ballMultiplier);
  const caught = rng() < chance;
  const shakes = caught ? 3 : Math.min(3, Math.floor((1 - chance) * 3));
  return {
    caught,
    chance,
    shakes,
    critical: caught && chance > 0.9,
    message: buildCatchMessage(caught, shakes),
  };
}

function statusMultiplier(status: string | null): number {
  switch (status) {
    case 'sleep':
    case 'freeze':
      return 2;
    case 'paralysis':
    case 'poison':
    case 'badly_poisoned':
    case 'burn':
      return 1.5;
    default:
      return 1;
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

/** Bóng theo multiplier. */
export function ballMultiplierFor(ballId: string): number {
  switch (ballId) {
    case 'masterball':
      return 255;
    case 'ultraball':
      return 2;
    case 'greatball':
      return 1.5;
    default:
      return 1;
  }
}

export { rollEncounter as rollWildEncounter };
