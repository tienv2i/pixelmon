/**
 * Stat calculation — compute max HP + battle stats from species base, IVs, EVs, level, nature.
 * Field names: spAttack/spDefense (project standard).
 */
import type { BaseStats, GrowthRate } from '../data/contracts.js';
import { expForLevel } from './combat.js';

// ===== Nature =====
export interface NatureMod {
  name: string;
  increases: keyof BaseStats; // except "hp"
  decreases: keyof BaseStats; // except "hp"
}

const NATURES: { name: string; increases: keyof BaseStats; decreases: keyof BaseStats }[] = [
  { name: 'hardy', increases: 'attack', decreases: 'defense' },
  { name: 'lonely', increases: 'attack', decreases: 'defense' },
  { name: 'brave', increases: 'attack', decreases: 'speed' },
  { name: 'adamant', increases: 'attack', decreases: 'spAttack' },
  { name: 'naughty', increases: 'attack', decreases: 'spDefense' },
  { name: 'bold', increases: 'defense', decreases: 'attack' },
  { name: 'docile', increases: 'defense', decreases: 'attack' },
  { name: 'relaxed', increases: 'defense', decreases: 'speed' },
  { name: 'impish', increases: 'defense', decreases: 'spAttack' },
  { name: 'lax', increases: 'defense', decreases: 'spDefense' },
  { name: 'timid', increases: 'speed', decreases: 'attack' },
  { name: 'hasty', increases: 'speed', decreases: 'defense' },
  { name: 'serious', increases: 'speed', decreases: 'speed' },
  { name: 'jolly', increases: 'speed', decreases: 'spAttack' },
  { name: 'naive', increases: 'speed', decreases: 'spDefense' },
  { name: 'modest', increases: 'spAttack', decreases: 'attack' },
  { name: 'mild', increases: 'spAttack', decreases: 'defense' },
  { name: 'quiet', increases: 'spAttack', decreases: 'speed' },
  { name: 'bashful', increases: 'spAttack', decreases: 'spAttack' },
  { name: 'rash', increases: 'spAttack', decreases: 'spDefense' },
  { name: 'calm', increases: 'spDefense', decreases: 'attack' },
  { name: 'gentle', increases: 'spDefense', decreases: 'defense' },
  { name: 'sassy', increases: 'spDefense', decreases: 'speed' },
  { name: 'careful', increases: 'spDefense', decreases: 'spAttack' },
  { name: 'quirky', increases: 'spDefense', decreases: 'spDefense' },
];

const NATURE_MAP = new Map(NATURES.map((n) => [n.name, n]));

export function getNatureMod(name: string): NatureMod {
  return NATURE_MAP.get(name) ?? { name: 'hardy', increases: 'attack', decreases: 'defense' };
}

export function rollNature(rng: () => number = Math.random): NatureMod {
  return NATURES[Math.floor(rng() * NATURES.length)]!;
}

// ===== IV / Gender / Shiny =====
export function rollIVs(rng: () => number = Math.random): BaseStats {
  const iv = () => Math.floor(rng() * 32);
  return { hp: iv(), attack: iv(), defense: iv(), spAttack: iv(), spDefense: iv(), speed: iv() };
}

export function rollGender(
  genderRatio: number,
  rng: () => number = Math.random,
): 'male' | 'female' | 'genderless' {
  if (!Number.isFinite(genderRatio) || genderRatio < 0 || genderRatio > 1) return 'genderless';
  return rng() < genderRatio ? 'female' : 'male';
}

export function rollShiny(rng: () => number = Math.random): boolean {
  return rng() < 1 / 4096;
}

// ===== Stat computation =====

/**
 * Tính stat cơ bản (chưa apply nature).
 */
function calcStat(base: number, iv: number, ev: number, level: number, isHp: boolean): number {
  if (isHp) {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100 + level + 10);
  }
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100 + 5);
}

export function calcAllStats(
  base: BaseStats,
  ivs: BaseStats,
  evs: BaseStats,
  level: number,
): BaseStats {
  return {
    hp: calcStat(base.hp, ivs.hp, evs.hp, level, true),
    attack: calcStat(base.attack, ivs.attack, evs.attack, level, false),
    defense: calcStat(base.defense, ivs.defense, evs.defense, level, false),
    spAttack: calcStat(base.spAttack, ivs.spAttack, evs.spAttack, level, false),
    spDefense: calcStat(base.spDefense, ivs.spDefense, evs.spDefense, level, false),
    speed: calcStat(base.speed, ivs.speed, evs.speed, level, false),
  };
}

/**
 * Tính stats cho owned pokemon (có nature ±10%).
 * HP không bị ảnh hưởng nature.
 */
export function computeOwnedPokemonStats(
  speciesBase: BaseStats,
  ivs: BaseStats,
  evs: BaseStats,
  level: number,
  nature: NatureMod | null = null,
): { maxHp: number; stats: BaseStats } {
  const base = calcAllStats(speciesBase, ivs, evs, level);
  const stats: BaseStats = { ...base };

  if (nature) {
    const inc = nature.increases;
    const dec = nature.decreases;
    if (inc !== 'hp') stats[inc] = Math.floor(stats[inc] * 1.1);
    if (dec !== 'hp') stats[dec] = Math.floor(stats[dec] * 0.9);
  }

  return { maxHp: base.hp, stats };
}

/**
 * Resolve level + exp-into-level từ cumulative exp.
 */
export function expToLevel(
  totalExp: number,
  growthRate: GrowthRate = 'mediumFast',
): { level: number; exp: number } {
  let level = 1;
  for (let candidate = 100; candidate >= 1; candidate--) {
    if (totalExp >= expForLevel(candidate, growthRate)) {
      level = candidate;
      break;
    }
  }
  const expNeeded = expForLevel(level, growthRate);
  return { level, exp: totalExp - expNeeded };
}
