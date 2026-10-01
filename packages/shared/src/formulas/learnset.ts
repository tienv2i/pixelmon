/**
 * LearnSet + Evolution — helpers chọn move theo level, kiểm tra tiến hóa.
 */
import type { Species, LearnSetEntry, Move } from '../data/contracts.js';

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
export interface EvolutionCheck {
  species: Species;
  targetId?: string;
  canEvolve: boolean;
  method: string;
}

/** Kiểm tra species có thể tiến hóa theo level không. Chỉ check method "level". */
export function checkLevelEvolution(
  species: Species,
  level: number,
): { canEvolve: boolean; targetId?: string } {
  for (const evo of species.evolutions) {
    if (evo.method === 'level' && evo.level !== undefined && level >= evo.level) {
      return { canEvolve: true, targetId: evo.to };
    }
  }
  return { canEvolve: false };
}

/**
 * Tiến hóa pokemon (trả về species mới id + tên).
 * Caller cần update OwnedPokemon (speciesId, types, stats recalc).
 */
export function evolveSpecies(
  species: Species,
  method: 'level' | 'item' | 'trade' | 'friendship' | 'move',
  param?: string | number,
): Species | null {
  for (const evo of species.evolutions) {
    if (evo.method !== method) continue;
    if (
      method === 'level' &&
      evo.level !== undefined &&
      typeof param === 'number' &&
      param >= evo.level
    ) {
      return null; // handled by checkLevelEvolution
    }
    if (method === 'item' && evo.item === param) return null; // caller resolve target species
    if (method === 'trade' || method === 'friendship' || method === 'move') return null;
  }
  return null;
}

/** Species tiến hóa được từ method (trả về targetId). */
export function evolutionTargetId(
  species: Species,
  method: 'level' | 'item' | 'trade' | 'friendship' | 'move',
  param?: string | number,
): string | undefined {
  for (const evo of species.evolutions) {
    if (evo.method !== method) continue;
    if (
      method === 'level' &&
      evo.level !== undefined &&
      typeof param === 'number' &&
      param >= evo.level
    )
      return evo.to;
    if (method === 'item' && evo.item === param) return evo.to;
    if (method === 'trade') return evo.to;
  }
  return undefined;
}
