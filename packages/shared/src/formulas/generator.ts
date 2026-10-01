/**
 * Pokemon generator — tạo pokemon instance mới từ species data.
 * Bao gồm IV roll, nature, gender, shiny, stats, moveset, exp.
 */
import type { Species, BaseStats, StatusEffect } from '../data/contracts.js';
import {
  rollIVs,
  rollNature,
  rollGender,
  rollShiny,
  computeOwnedPokemonStats,
  type NatureMod,
} from './stats.js';
import { expForLevel } from './combat.js';
import type { Move } from '../data/contracts.js';
import type { MoveSlot } from './moveset.js';

export type Gender = 'male' | 'female' | 'genderless';

export interface OwnedPokemon {
  id: string; // instance uuid
  speciesId: string;
  nickname?: string;
  level: number;
  exp: number; // total cumulative exp
  types: string[];
  nature: NatureMod;
  gender: Gender;
  shiny: boolean;
  ivs: BaseStats;
  evs: BaseStats;
  stats: BaseStats;
  maxHp: number;
  currentHp: number;
  moves: MoveSlot[];
  status: StatusEffect;
  caughtAt: number;
  originalTrainer: string;
  partySlot?: number; // 0-5 = party, undefined = box
}

const ZERO_EVS: BaseStats = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

/**
 * Tạo pokemon mới ở level chỉ định.
 * @param species - species data (từ GameData)
 * @param level - level 1-100
 * @param moveSource - cách lấy moveset theo level (thường là GameData.getMovesForLevel)
 */
export function generatePokemon(
  species: Species,
  level: number,
  moveSource?: (speciesId: string, level: number) => Move[],
  rng: () => number = Math.random,
  originalTrainer: string = 'wild',
): OwnedPokemon {
  const clampedLevel = Math.max(1, Math.min(100, Math.floor(level)));
  const ivs = rollIVs(rng);
  const nature = rollNature(rng);
  const gender = rollGender(species.genderRatio, rng);
  const shiny = rollShiny(rng);
  const evs = { ...ZERO_EVS };

  const { maxHp, stats } = computeOwnedPokemonStats(
    species.baseStats,
    ivs,
    evs,
    clampedLevel,
    nature,
  );

  const moves: MoveSlot[] = moveSource ? moveSource(species.id, clampedLevel).map(toMoveSlot) : [];

  const totalExp = expForLevel(clampedLevel, species.growthRate);

  return {
    id: crypto.randomUUID(),
    speciesId: species.id,
    level: clampedLevel,
    exp: totalExp,
    types: [...species.types],
    nature,
    gender,
    shiny,
    ivs,
    evs,
    stats,
    maxHp,
    currentHp: maxHp,
    moves,
    status: 'none',
    caughtAt: Date.now(),
    originalTrainer,
  };
}

function toMoveSlot(move: Move): MoveSlot {
  return {
    id: move.id,
    name: move.name,
    type: move.type,
    category: move.category,
    power: move.power,
    accuracy: move.accuracy,
    maxPp: move.pp,
    currentPp: move.pp,
    priority: move.priority,
  };
}

// ===== EV gain =====
export const MAX_EV_PER_STAT = 252;
export const MAX_EV_TOTAL = 510;

export function gainEv(current: number, amount: number): number {
  return Math.min(MAX_EV_PER_STAT, current + amount);
}

export interface EvYield {
  stat: keyof BaseStats;
  amount: number;
}

export function applyEvYields(pokemon: OwnedPokemon, yields: EvYield[]): void {
  const total = Object.values(pokemon.evs).reduce((a, b) => a + b, 0);
  let remaining = MAX_EV_TOTAL - total;
  for (const y of yields) {
    if (remaining <= 0) break;
    const add = Math.min(y.amount, MAX_EV_PER_STAT - pokemon.evs[y.stat], remaining);
    pokemon.evs[y.stat] += add;
    remaining -= add;
  }
}

// ===== Level up =====
export function levelUp(pokemon: OwnedPokemon, species: Species, newLevel: number): OwnedPokemon {
  const level = Math.max(1, Math.min(100, newLevel));
  const { maxHp, stats } = computeOwnedPokemonStats(
    species.baseStats,
    pokemon.ivs,
    pokemon.evs,
    level,
    pokemon.nature,
  );
  const hpDiff = maxHp - pokemon.maxHp;
  return {
    ...pokemon,
    level,
    stats,
    maxHp,
    currentHp: Math.min(maxHp, pokemon.currentHp + Math.max(0, hpDiff)),
  };
}

/** Trả về true nếu pokemon vừa lên level. */
export function addExp(pokemon: OwnedPokemon, gained: number, species: Species): OwnedPokemon {
  pokemon.exp += gained;
  let next = pokemon;
  const threshold = (lv: number) => expForLevel(lv, species.growthRate);
  while (next.level < 100 && next.exp >= threshold(next.level + 1)) {
    next = levelUp(next, species, next.level + 1);
  }
  return next;
}
