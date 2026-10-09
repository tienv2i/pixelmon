import { pool } from '../../config/database.js';

/**
 * Event log — ghi `pokemon_events` (Plan 45 §5.3).
 *
 * - Event feed cho Admin Dashboard (Phase 7) + Summary tab (Phase 6).
 * - Audit trail: xp_gain / level_up / evolve / item_used / trade / catch / money.
 * - Mọi hàm best-effort: lỗi DB không được làm hỏng gameplay flow.
 */

export type EventKind =
  | 'xp_gain'
  | 'level_up'
  | 'evolve'
  | 'item_used'
  | 'trade'
  | 'catch'
  | 'money';

export interface EventPayload {
  [key: string]: unknown;
}

async function insert(
  userId: string,
  kind: EventKind,
  payload: EventPayload = {},
  pokemonId?: string,
): Promise<void> {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO pokemon_events (user_id, pokemon_id, kind, payload)
       VALUES ($1, $2, $3, $4)`,
      [userId, pokemonId ?? null, kind, JSON.stringify(payload)],
    );
  } catch (err) {
    console.warn('[events] insert failed:', err);
  }
}

/** Log EXP nhận được (battle win, rare-candy, gift...). */
export function logXp(
  userId: string,
  pokemonId: string,
  amount: number,
  source: string,
  extra: EventPayload = {},
): Promise<void> {
  return insert(userId, 'xp_gain', { amount, source, ...extra }, pokemonId);
}

/** Log level-up (direction: 'up' | 'down'). */
export function logLevelUp(
  userId: string,
  pokemonId: string,
  from: number,
  to: number,
  direction: 'up' | 'down' = 'up',
): Promise<void> {
  return insert(userId, 'level_up', { from, to, direction }, pokemonId);
}

/** Log tiến hoá (method: level | item | trade | force | reverse). */
export function logEvolve(
  userId: string,
  pokemonId: string,
  fromSpecies: string,
  toSpecies: string,
  method: string,
  extra: EventPayload = {},
): Promise<void> {
  return insert(userId, 'evolve', { fromSpecies, toSpecies, method, ...extra }, pokemonId);
}

/** Log dùng item. */
export function logItemUsed(
  userId: string,
  pokemonId: string | null,
  itemId: string,
  extra: EventPayload = {},
): Promise<void> {
  return insert(userId, 'item_used', { itemId, ...extra }, pokemonId ?? undefined);
}

/** Log giao dịch. */
export function logTrade(
  userId: string,
  pokemonId: string,
  extra: EventPayload = {},
): Promise<void> {
  return insert(userId, 'trade', { ...extra }, pokemonId);
}

/** Log bắt Pokémon. */
export function logCatch(
  userId: string,
  pokemonId: string,
  speciesId: string,
  level: number,
): Promise<void> {
  return insert(userId, 'catch', { speciesId, level }, pokemonId);
}

/** Log thay đổi tiền tệ (buy/sell/gift). */
export function logMoney(
  userId: string,
  delta: number,
  reason: string,
  extra: EventPayload = {},
): Promise<void> {
  return insert(userId, 'money', { delta, reason, ...extra });
}

/** Lấy N event gần nhất của user (dùng cho Summary tab / Admin). */
export async function recentEvents(
  userId: string,
  limit = 10,
): Promise<Array<{ id: string; kind: string; payload: EventPayload; created_at: string }>> {
  try {
    const { rows } = await pool.query(
      `SELECT id, kind, payload, created_at
         FROM pokemon_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows as Array<{ id: string; kind: string; payload: EventPayload; created_at: string }>;
  } catch (err) {
    console.warn('[events] recentEvents failed:', err);
    return [];
  }
}
