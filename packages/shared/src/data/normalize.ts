/**
 * Normalize raw source data (pixmon format) → project's canonical field names.
 *
 * Mapping:
 *   baseStats: special_attack → spAttack, special_defense → spDefense
 *   growthRate: medium → mediumFast, slow → slow, erratic → erratic...
 *   rarity: ensure valid enum value
 *   learnSet / evolutions / abilities: default empty
 */
import type { ElementType, BaseStats, GrowthRate, Rarity } from './contracts.js';
import { EVOLUTION_STONE_IDS } from '../formulas/evolution.js';

const EVOLUTION_STONE_SET = new Set<string>(EVOLUTION_STONE_IDS);

const VALID_GROWTH: GrowthRate[] = [
  'fast',
  'mediumFast',
  'mediumSlow',
  'slow',
  'fluctuating',
  'erratic',
];
const VALID_RARITY: Rarity[] = ['common', 'uncommon', 'rare', 'legendary', 'mythical'];
const VALID_TYPES = new Set<string>([
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
]);

type RawStats = {
  hp?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  special_attack?: number;
  special_defense?: number;
  spAttack?: number;
  spDefense?: number;
};

function normalizeBaseStats(raw: RawStats): BaseStats {
  return {
    hp: Math.max(1, raw.hp ?? 1),
    attack: Math.max(1, raw.attack ?? 1),
    defense: Math.max(1, raw.defense ?? 1),
    spAttack: Math.max(1, raw.spAttack ?? raw.special_attack ?? 1),
    spDefense: Math.max(1, raw.spDefense ?? raw.special_defense ?? 1),
    speed: Math.max(1, raw.speed ?? 1),
  };
}

function normalizeGrowth(raw: unknown): GrowthRate {
  const s = String(raw ?? 'mediumFast');
  if (VALID_GROWTH.includes(s as GrowthRate)) return s as GrowthRate;
  if (s === 'medium') return 'mediumFast';
  if (s === 'slow') return 'slow';
  if (s === 'fast') return 'fast';
  if (s === 'medium_slow') return 'mediumSlow';
  return 'mediumFast';
}

function normalizeRarity(raw: unknown): Rarity {
  const s = String(raw ?? 'common');
  if (VALID_RARITY.includes(s as Rarity)) return s as Rarity;
  // Map common synonyms
  if (s === 'starter' || s === 'uncommon') return 'uncommon';
  if (s === 'ultra_rare') return 'rare';
  if (s === 'uber') return 'legendary';
  return 'common';
}

export function normalizeTypes(raw: unknown): ElementType[] {
  if (!Array.isArray(raw) || raw.length === 0) return ['normal'];
  const valid = raw.filter((t): t is ElementType => typeof t === 'string' && VALID_TYPES.has(t));
  return valid.length > 0 ? valid.slice(0, 2) : ['normal'];
}

export interface NormalizedSpecies {
  id: string;
  name: string;
  category: string;
  types: ElementType[];
  baseStats: BaseStats;
  baseExperience: number;
  rarity: Rarity;
  genderRatio: number;
  catchRate: number;
  growthRate: GrowthRate;
  evolutions: unknown[];
  learnSet: unknown[];
  abilities: string[];
  baseStatTotal?: number;
  iconUrl?: string;
  spriteUrl?: string;
}

export function normalizeSpecies(raw: unknown): NormalizedSpecies {
  const r = raw as Record<string, any>;
  const baseStats = normalizeBaseStats(r.baseStats ?? {});
  return {
    id: String(r.id ?? 'unknown'),
    name: String(r.name ?? r.id ?? 'Unknown'),
    category: String(r.category ?? 'Unknown'),
    types: normalizeTypes(r.types),
    baseStats,
    baseExperience: Math.max(1, Number(r.baseExperience ?? r.base_exp ?? 60)),
    rarity: normalizeRarity(r.rarity),
    genderRatio: Number(r.genderRatio ?? 0.5),
    catchRate: Math.min(255, Math.max(1, Number(r.catchRate ?? 45))),
    growthRate: normalizeGrowth(r.growthRate ?? r.growth_rate),
    evolutions: Array.isArray(r.evolutions) ? r.evolutions : [],
    learnSet: Array.isArray(r.learnSet) ? r.learnSet : [],
    abilities: Array.isArray(r.abilities) ? r.abilities.map(String) : [],
    baseStatTotal: r.baseStatTotal !== undefined ? Number(r.baseStatTotal) : undefined,
    iconUrl: r.iconUrl !== undefined ? String(r.iconUrl) : undefined,
    spriteUrl: r.spriteUrl !== undefined ? String(r.spriteUrl) : undefined,
  };
}

export interface NormalizedMove {
  id: string;
  name: string;
  type: ElementType;
  category: 'physical' | 'special' | 'status';
  power: number | null;
  accuracy: number;
  pp: number;
  priority: number;
  target: string;
  description?: string;
  effects: unknown[];
  selfEffects: unknown[];
  isContact: boolean;
  soundBased: boolean;
}

export function normalizeMove(raw: unknown): NormalizedMove {
  const r = raw as Record<string, any>;
  const category = ['physical', 'special', 'status'].includes(r.category)
    ? r.category
    : r.power === 0 || r.power === null
      ? 'status'
      : 'physical';
  const typeList = normalizeTypes([r.type]);
  return {
    id: String(r.id ?? 'unknown'),
    name: String(r.name ?? r.id ?? 'Unknown'),
    type: typeList[0]!,
    category,
    power: r.power === null || r.power === undefined ? null : Math.max(0, Number(r.power)),
    accuracy: Math.min(100, Math.max(1, Number(r.accuracy ?? 100))),
    pp: Math.min(64, Math.max(1, Number(r.pp ?? 20))),
    priority: Math.min(8, Math.max(-8, Number(r.priority ?? 0))),
    target: String(r.target ?? 'one_opponent'),
    description: r.description !== undefined ? String(r.description) : undefined,
    effects: Array.isArray(r.effects) ? r.effects : [],
    selfEffects: Array.isArray(r.selfEffects) ? r.selfEffects : [],
    isContact: Boolean(r.isContact),
    soundBased: Boolean(r.soundBased),
  };
}

export interface NormalizedItem {
  id: string;
  name: string;
  category: 'pokeball' | 'medicine' | 'berry' | 'evolution' | 'key' | 'misc';
  description?: string;
  stackable: boolean;
  maxStack: number;
  sellPrice: number;
  buyPrice: number;
  /** Pocket 1..8 (fallback 6 = misc) — nhóm trong Bag. */
  pocket: number;
  effect?: { stat?: string; amount?: number; effect?: string };
  iconUrl?: string;
}

export function normalizeItem(raw: unknown): NormalizedItem {
  const r = raw as Record<string, any>;
  const VALID_CATEGORIES = ['pokeball', 'medicine', 'berry', 'evolution', 'key', 'misc'];
  const id = String(r.id ?? 'unknown');
  let category = VALID_CATEGORIES.includes(r.category) ? r.category : 'misc';
  // Infer pokeball from id
  if (id.endsWith('ball') && category === 'misc')
    category = 'pokeball';
  // Data gốc để đá tiến hoá là `misc` → infer lại theo registry (Plan 45 §0.1)
  if (EVOLUTION_STONE_SET.has(id)) category = 'evolution';
  // Pocket 1..8, fallback 6 (misc)
  const pocketNum = Number(r.pocket);
  const pocket =
    Number.isInteger(pocketNum) && pocketNum >= 1 && pocketNum <= 8 ? pocketNum : 6;
  return {
    id,
    name: String(r.name ?? r.id ?? 'Unknown'),
    category,
    description: r.description !== undefined ? String(r.description) : undefined,
    stackable: r.stackable !== false,
    maxStack: Math.max(1, Number(r.maxStack ?? 99)),
    sellPrice: Math.max(0, Number(r.sellPrice ?? 0)),
    buyPrice: Math.max(0, Number(r.buyPrice ?? 0)),
    pocket,
    effect: r.effect !== undefined ? r.effect : undefined,
    iconUrl: r.iconUrl !== undefined ? String(r.iconUrl) : undefined,
  };
}
