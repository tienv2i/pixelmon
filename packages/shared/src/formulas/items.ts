/**
 * ItemEffect registry — SSOT gameplay cho item (Plan 45 §1.4).
 *
 * `items.json` không có `effect` (data gốc để None) → registry tĩnh theo id
 * là nguồn duy nhất quyết định hiệu quả item. JSON chỉ là metadata (name/price).
 *
 * - Thuần tuý (không I/O) — server & client đều dùng được.
 * - Mapping id → effect theo data Essentials v21.1 (đã verify bằng
 *   `python3 scripts/tools/query_data.py item <id>`).
 */
import { EVOLUTION_STONE_IDS, isEvolutionStone } from './evolution.js';

export type ItemEffect =
  | { kind: 'heal'; hp: number }
  | { kind: 'restore_pp'; pp: number; scope: 'move' | 'all' }
  | { kind: 'cure_status'; status: string[] }
  | { kind: 'revive'; pct: number }
  | { kind: 'revive_all' }
  | { kind: 'buff'; stat: 'atk' | 'def' | 'spa' | 'spd' | 'spe'; stages: number }
  | { kind: 'catch_ball'; rate: number }
  | { kind: 'evo_stone'; stoneId: string }
  | { kind: 'exp_boost'; mult: number }
  | { kind: 'level_up'; levels: number };

// ── Bảng tra tĩnh ──────────────────────────────────────────────────────────

/** Poké Ball — id → catch rate modifier (Essentials). */
const BALL_RATES: Record<string, number> = {
  pokeball: 1,
  greatball: 1.5,
  ultraball: 2,
  masterball: 255,
  safariball: 1.5,
  netball: 3,
  diveball: 3.5,
  nestball: 3,
  repeatball: 3,
  timerball: 3,
  luxuryball: 1.5,
  premierball: 1,
  duskball: 3,
  healball: 1.5,
  quickball: 3.5,
  cherishball: 1,
  fastball: 4,
  levelball: 8,
  lureball: 4,
  heavyball: 8,
  loveball: 4,
  friendball: 4,
  moonball: 4,
  dreamball: 1.5,
  beastball: 5,
};

/** Medicine — hp hồi phục (Potion 20, Super 50, Hyper 120, Max = full). */
const HEALS: Record<string, number> = {
  potion: 20,
  superpotion: 50,
  hyperpotion: 120,
  maxpotion: Infinity,
  // Berry hồi HP (data `berry` category)
  oranberry: 10,
  sitrusberry: 25,
  lycheeberry: 40,
  liechiberry: 40,
  petayaberry: 40,
  apicotberry: 40,
  salacberry: 40,
  ganlonberry: 40,
};

/** Cure status — id → danh sách status chữa được. */
const CURES: Record<string, string[]> = {
  antidote: ['poison', 'badly_poisoned'],
  paralyzeheal: ['paralysis'],
  awakeheal: ['sleep'],
  iceheal: ['freeze'],
  burnheal: ['burn'],
  fullheal: [
    'poison',
    'badly_poisoned',
    'paralysis',
    'sleep',
    'freeze',
    'burn',
  ],
  healpowder: [
    'poison',
    'badly_poisoned',
    'paralysis',
    'sleep',
    'freeze',
    'burn',
  ],
  ragecandybar: [
    'poison',
    'badly_poisoned',
    'paralysis',
    'sleep',
    'freeze',
    'burn',
  ],
  pechaberry: ['poison', 'badly_poisoned'],
  cheriaberry: ['paralysis'],
  chestoberry: ['sleep'],
  aspearberry: ['freeze'],
  rawstberry: ['burn'],
};

/** X Atk/Def/… — battle buff (stages theo version number phía sau). */
const BUFFS: Record<string, { stat: 'atk' | 'def' | 'spa' | 'spd' | 'spe'; stages: number }> = {
  xattack: { stat: 'atk', stages: 1 },
  xdefend: { stat: 'def', stages: 1 },
  xspattack: { stat: 'spa', stages: 1 },
  xspdefense: { stat: 'spd', stages: 1 },
  xspeed: { stat: 'spe', stages: 1 },
  xattack2: { stat: 'atk', stages: 2 },
  xdefend2: { stat: 'def', stages: 2 },
  xspattack2: { stat: 'spa', stages: 2 },
  xspdefense2: { stat: 'spd', stages: 2 },
  xspeed2: { stat: 'spe', stages: 2 },
  xattack6: { stat: 'atk', stages: 3 },
  xdefend6: { stat: 'def', stages: 3 },
  xspattack6: { stat: 'spa', stages: 3 },
  xspdefense6: { stat: 'spd', stages: 3 },
  xspeed6: { stat: 'spe', stages: 3 },
};

/** Revive — pct max HP hồi lại. */
const REVIVES: Record<string, number> = {
  revive: 0.5,
  maxrevive: 1,
  // Item hồi sinh khác cùng nhóm (verify qua `query_data.py item <id>`):
  // Revival Herb → hồi đầy HP cho 1 Pokémon.
  revivalherb: 1,
  // Max Honey → "same effect as a Max Revive" (theo description trong items.json).
  maxhoney: 1,
};

/** PP restore (ether/elixir). */
const PP_RESTORE: Record<string, { pp: number; scope: 'move' | 'all' }> = {
  ether: { pp: 10, scope: 'move' },
  maxether: { pp: Infinity, scope: 'move' },
  elixir: { pp: 10, scope: 'all' },
  maxelixir: { pp: Infinity, scope: 'all' },
};

/** EXP boost. */
const EXP_BOOSTS: Record<string, number> = {
  luckyegg: 1.5,
};

/** Rare candy / exp candy → level up (số level). */
const LEVEL_UPS: Record<string, number> = {
  rarecandy: 1,
  expcandyxs: 1,
  expcandys: 2,
  expcandym: 3,
  expcandyl: 5,
  expcandyxl: 10,
};

// ── Resolver ───────────────────────────────────────────────────────────────

/**
 * Trả về hiệu quả gameplay của item (null = không có hiệu quả dùng được).
 *
 * @param itemId - id item (vd `potion`, `firestone`, `ultraball`).
 */
export function resolveItemEffect(itemId: string): ItemEffect | null {
  const id = String(itemId ?? '').toLowerCase();
  if (!id) return null;

  if (isEvolutionStone(id)) return { kind: 'evo_stone', stoneId: id };

  const ballRate = BALL_RATES[id];
  if (ballRate !== undefined) return { kind: 'catch_ball', rate: ballRate };

  const heal = HEALS[id];
  if (heal !== undefined) return { kind: 'heal', hp: heal };

  const cure = CURES[id];
  if (cure !== undefined) return { kind: 'cure_status', status: cure };

  const revive = REVIVES[id];
  if (revive !== undefined) return { kind: 'revive', pct: revive };

  // Sacred Ash → hồi sinh toàn bộ Pokémon ngất trong đội (theo description).
  if (id === 'sacredash') return { kind: 'revive_all' };

  const buff = BUFFS[id];
  if (buff !== undefined) return { kind: 'buff', ...buff };

  const pp = PP_RESTORE[id];
  if (pp !== undefined) return { kind: 'restore_pp', ...pp };

  const expMult = EXP_BOOSTS[id];
  if (expMult !== undefined) return { kind: 'exp_boost', mult: expMult };

  const levels = LEVEL_UPS[id];
  if (levels !== undefined) return { kind: 'level_up', levels };

  return null;
}

/** Item có effect dùng được (heal/cure/revive/ball/evo...) — dùng cho UI filter. */
export function isUsableItem(itemId: string): boolean {
  const e = resolveItemEffect(itemId);
  if (!e) return false;
  // Cấm dùng ngoài battle: ball (chỉ trong battle), buff (chỉ battle).
  return e.kind !== 'catch_ball' && e.kind !== 'buff';
}

/** Item đá tiến hoá mà species này có thể dùng (method `item`). */
export function speciesAcceptsStone(
  evolutions: ReadonlyArray<{ method: string; item?: string }>,
  stoneId: string,
): boolean {
  return evolutions.some((e) => e.method === 'item' && e.item === stoneId);
}

export { EVOLUTION_STONE_IDS };
