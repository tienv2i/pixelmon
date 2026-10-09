/**
 * Combat formulas — damage, crit, accuracy, status checks.
 * Pure game logic, no I/O. Randomness qua injected `rng` (deterministic khi seed).
 */
import type { Move } from '../data/contracts.js';
import type { BaseStats } from '../data/contracts.js';
import type { GrowthRate } from '../data/contracts.js';

export type { GrowthRate } from '../data/contracts.js';

export type Rng = () => number;
export const defaultRng: Rng = Math.random;

export type StatType = 'hp' | 'attack' | 'defense' | 'spAttack' | 'spDefense' | 'speed';

// ===== Stage multipliers =====
const STAGE_MULT: Record<number, number> = {
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

export function stageMultiplier(stage: number): number {
  return STAGE_MULT[Math.max(-6, Math.min(6, stage))] ?? 1;
}

// ===== Accuracy / Crit =====
export function accuracyCheck(moveAccuracy: number, rng: Rng = defaultRng): boolean {
  // moveAccuracy là percent 1-100
  return rng() * 100 < moveAccuracy;
}

/** 1/16 base chance crit, boost bằng tốc độ (simplified: +5% mỗi speed tier). */
export function isCriticalHit(rng: Rng = defaultRng, speedTier: number = 0): boolean {
  const chance = 1 / 16 + speedTier * 0.05;
  return rng() < Math.min(0.5, chance);
}

/** Random damage factor ∈ [0.85, 1.0] */
export function randomDamageFactor(rng: Rng = defaultRng): number {
  return 0.85 + rng() * 0.15;
}

// ===== Damage =====
export interface DamageInput {
  level: number;
  power: number;
  attackerStat: number;
  defenderStat: number;
  effectiveness: number;
  stab: boolean;
  isCritical: boolean;
  randomFactor: number;
  attackerStage?: number;
  defenderStage?: number;
}

export interface DamageResult {
  damage: number;
  messages: string[];
}

/**
 * Damage formula (Gen 5+):
 *   floor(((((2*level/5+2)*power*A/D)/50+2) * modifier))
 * modifier = stab × effectiveness × crit × random
 */
export function calcDamage(input: DamageInput): DamageResult {
  const {
    level,
    power,
    attackerStat,
    defenderStat,
    effectiveness,
    stab,
    isCritical,
    randomFactor,
    attackerStage = 0,
    defenderStage = 0,
  } = input;
  const messages: string[] = [];

  if (power <= 0 || effectiveness === 0) {
    return { damage: 0, messages };
  }

  const atk = Math.max(1, Math.floor(attackerStat * stageMultiplier(attackerStage)));
  const def = Math.max(1, Math.floor(defenderStat * stageMultiplier(defenderStage)));

  const base = (((2 * level) / 5 + 2) * power * (atk / def)) / 50 + 2;

  let modifier = 1;
  if (stab) modifier *= 1.5;
  modifier *= effectiveness;
  if (isCritical) {
    modifier *= 1.5;
    messages.push('A critical hit!');
  }
  modifier *= randomFactor;

  const damage = Math.max(1, Math.floor(base * modifier));
  return { damage, messages };
}

/**
 * Chọn A/D theo category move.
 * physical → attack/defense, special → spAttack/spDefense, status → dùng attack/defense mặc định.
 */
export function getEffectiveStatForCategory(
  category: Move['category'],
  attackerStats: BaseStats,
  defenderStats: BaseStats,
): { attackerStat: number; defenderStat: number } {
  if (category === 'special') {
    return { attackerStat: attackerStats.spAttack, defenderStat: defenderStats.spDefense };
  }
  return { attackerStat: attackerStats.attack, defenderStat: defenderStats.defense };
}

// ===== Status checks =====
export function paralyzeCheck(rng: Rng = defaultRng): boolean {
  return rng() < 0.25; // 25% fully paralyzed
}

export function thawCheck(rng: Rng = defaultRng): boolean {
  return rng() < 0.2; // 20% thaw mỗi turn
}

/** Poison damage: 1/8 max HP, badly_poisoned tăng dần. */
export function poisonDamage(maxHp: number, turn: number): number {
  return Math.max(1, Math.floor((maxHp / 8) * turn));
}

/** Burn damage: 1/16 max HP mỗi turn. */
export function burnDamage(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 16));
}

/** Thoát được? (wild battle) */
export function canEscape(
  attackerSpeed: number,
  defenderSpeed: number,
  rng: Rng = defaultRng,
): boolean {
  if (attackerSpeed >= defenderSpeed) return true;
  const chance = attackerSpeed / defenderSpeed;
  return rng() < chance;
}

/** Giảm tốc độ khi bị paralysis (không áp stage). */
export function paralyzedSpeedMultiplier(isParalyzed: boolean): number {
  return isParalyzed ? 0.5 : 1;
}

/** Fallback GrowthRate khi chưa có data (namespace re-export). */
export type FallbackGrowthRate = GrowthRate;

/**
 * Total exp cần để đạt `level` (cumulative).
 * Simplified: các rate khác nhau qua exponent.
 */
export function expForLevel(level: number, growthRate: GrowthRate = 'mediumFast'): number {
  if (level <= 1) return 0;
  switch (growthRate) {
    case 'fast':
      return Math.floor((4 * level ** 3) / 5);
    case 'mediumSlow':
      return Math.floor((6 * level ** 3) / 5 - 15 * level ** 2 + 100 * level - 140);
    case 'slow':
      return Math.floor((5 * level ** 3) / 4);
    case 'fluctuating': {
      // Canonical Gen 3+ curve (3 tier). Bản cũ dùng 1 polynomial duy nhất cho
      // mọi level → giá trị ÂM ở tầm L50 (≈ −50 558) khiến species fluctuating
      // (14 loài) spawn sai / exp âm trong DB.
      if (level < 15) {
        return Math.floor((level ** 3 * (Math.floor((level + 1) / 3) + 24)) / 50);
      }
      if (level < 36) {
        return Math.floor((level ** 3 * (level + 14)) / 50);
      }
      return Math.floor((level ** 3 * (Math.floor(level / 2) + 32)) / 50);
    }
    case 'erratic': {
      // Canonical Gen 3+ curve (4 tier, Bulbapedia). Tier 3 (68–97) là
      // n³·⌊(1911−10n)/3⌋/500 — bản cũ dùng n³·(190−n)/100 (sai) và bản
      // "(191−n)/3" cũng sai → 25 species erratic lên level sai/không đơn điệu.
      if (level < 50) return Math.floor((level ** 3 * (100 - level)) / 50);
      if (level < 68) return Math.floor((level ** 3 * (150 - level)) / 100);
      if (level < 98) return Math.floor((level ** 3 * Math.floor((1911 - 10 * level) / 3)) / 500);
      return Math.floor((level ** 3 * (160 - level)) / 100);
    }
    case 'mediumFast':
    default:
      return level ** 3;
  }
}

/**
 * Tính exp gain từ một trận thắng.
 */
export function calcExpGain(
  defeatedLevel: number,
  baseExperience: number,
  partySize: number = 1,
  isWild: boolean = true,
): number {
  const raw = (defeatedLevel * baseExperience) / 7;
  const multiplier = isWild ? 1 : 1.5;
  return Math.floor((raw * multiplier) / partySize);
}
