/**
 * MoveSlot — simplified representation of a move known by an owned Pokémon.
 * Stored in the owned pokemon data; resolved from species learnSet + GameData.
 */
import type { MoveCategory } from '../data/contracts.js';

export interface MoveSlot {
  id: string;
  name: string;
  type: string;
  category: MoveCategory;
  power: number | null;
  accuracy: number;
  maxPp: number;
  currentPp: number;
  priority?: number;
}

/** Kiểm tra pokemon còn PP cho move đó không. */
export function hasPp(move: MoveSlot): boolean {
  return move.currentPp > 0;
}

/** Tiêu 1 PP, trả về false nếu hết. */
export function consumePp(move: MoveSlot): boolean {
  if (move.currentPp <= 0) return false;
  move.currentPp -= 1;
  return true;
}

/** Hồi PP full. */
export function restorePp(move: MoveSlot): void {
  move.currentPp = move.maxPp;
}
