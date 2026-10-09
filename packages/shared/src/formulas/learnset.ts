/**
 * LearnSet + Evolution — helpers chọn move theo level, kiểm tra tiến hóa.
 */
import type { Species, LearnSetEntry, Move } from '../data/contracts.js';
import { resolveEvolution, type EvolutionContext } from './evolution.js';

/**
 * Lấy 4 move cuối mà species biết ở level hiện tại (mainline: move mới thay cũ).
 * @param resolveMove - hàm lấy Move data từ id (thường là GameData.getMove)
 */
export function learnsetAtLevel(
  species: Species,
  level: number,
  resolveMove: (id: string) => Move | undefined,
): Move[] {
  const known: Move[] = [];
  for (const entry of [...species.learnSet].sort((a, b) => a.level - b.level)) {
    if (entry.level > level) break;
    const move = resolveMove(entry.move);
    if (!move) continue;
    if (known.length >= 4) known.shift(); // replace oldest
    // Replace nếu đã có same id
    const existing = known.findIndex((m) => m.id === move.id);
    if (existing >= 0) known.splice(existing, 1);
    known.push(move);
  }
  return known;
}

/** Các move mới learn ở level cụ thể (thường để server push notification). */
export function movesLearnedAt(species: Species, level: number): LearnSetEntry[] {
  return species.learnSet.filter((e) => e.level === level);
}

// ===== Evolution =====
// ⚠ Toàn bộ logic tiến hoá nằm ở `./evolution.ts` (SSOT, gộp mọi method).
// Dưới đây chỉ giữ 2 wrapper tương thích cho code cũ.

export interface EvolutionCheck {
  species: Species;
  targetId?: string;
  canEvolve: boolean;
  method: string;
}

/**
 * Kiểm tra species có thể tiến hóa theo level không. Chỉ check method "level".
 * @deprecated Dùng `resolveEvolution()` (formulas/evolution.ts) — hỗ trợ mọi method.
 */
export function checkLevelEvolution(
  species: Species,
  level: number,
): { canEvolve: boolean; targetId?: string } {
  const r = resolveEvolution(species, { level, skipMethod: 'none' });
  if (r?.method === 'level') return { canEvolve: true, targetId: r.targetId };
  return { canEvolve: false };
}

/**
 * Tiến hóa pokemon — trả về targetId + method nếu thoả điều kiện.
 * Caller cần update OwnedPokemon (speciesId, types, stats recalc).
 *
 * ⚠ Bản cũ của hàm này luôn `return null` (landmine) — đã thay bằng wrapper
 * quanh `resolveEvolution()`.
 *
 * @param method - chỉ cho phép cân nhắc 1 method này (null = mọi method).
 * @param param - ngữ cảnh tuỳ method: number (level) | string (item id).
 */
export function evolveSpecies(
  species: Species,
  method: 'level' | 'item' | 'trade' | 'friendship' | 'move',
  param?: string | number,
): { targetId: string; method: string } | null {
  const ctx: EvolutionContext = { level: typeof param === 'number' ? param : 0 };
  if (method === 'level' && typeof param === 'number') ctx.level = param;
  if (method === 'item' && typeof param === 'string') ctx.usedItemId = param;
  if (method === 'trade') ctx.tradeWithNpc = true;

  const r = resolveEvolution(species, { ...ctx, skipMethod: 'none' });
  return r && r.method === method ? { targetId: r.targetId, method: r.method } : null;
}

/** Species tiến hóa được từ method (trả về targetId).
 * @deprecated Dùng `resolveEvolution()` / `evolutionTargetForMethod()` (formulas/evolution.ts).
 */
export function evolutionTargetId(
  species: Species,
  method: 'level' | 'item' | 'trade' | 'friendship' | 'move',
  param?: string | number,
): string | undefined {
  const r = evolveSpecies(species, method, param);
  return r?.targetId;
}
