import { pool } from '../../config/database.js';
import { gameData } from '@pixelmon/shared/data';
import {
  resolveEvolution,
  type EvolutionContext,
  type EvolutionResolution,
  type BaseStats,
} from '@pixelmon/shared';
import {
  computeOwnedPokemonStats,
  expForLevel,
  getNatureMod,
  learnsetAtLevel,
  type MoveSlot,
} from '@pixelmon/shared';
import { logEvolve, logLevelUp } from '../events/eventLog.js';

/**
 * Evolution service (Plan 45 §3.1 + §5.1).
 *
 * - `tryEvolve` — gọi ở mọi điểm level-up / item / trade / admin.
 * - Server-authoritative: client chỉ gửi lệnh, server resolve + ghi DB.
 * - Recompute stats đúng IV/EV/nature qua `computeOwnedPokemonStats`.
 * - Log `pokemon_evolution_history` + `pokemon_events` (audit).
 */

export interface EvolveResult {
  evolved: boolean;
  from?: string;
  to?: string;
  method?: string;
  /** Lỗi (nếu không evolve được) — dùng để báo client. */
  error?: string;
}

interface OwnedPokemonRow {
  id: string;
  species_id: string;
  nickname: string | null;
  level: number;
  exp: number;
  ivs: Record<string, number>;
  evs: Record<string, number>;
  stats: Record<string, number>;
  current_hp: number;
  moves: unknown;
  status: string | null;
  /** DB lưu object JSONB `{name,...}` — cũng chịu được string cũ. */
  nature: { name?: string } | string | null;
  held_item: string | null;
  friendship: number;
}

async function loadOwned(userId: string, pokemonId: string): Promise<OwnedPokemonRow | null> {
  const { rows } = await pool.query(
    `SELECT id, species_id, nickname, level, exp, ivs, evs, stats, current_hp, moves, status, nature, held_item, friendship
       FROM pokemon
      WHERE id = $1 AND owner_id = $2`,
    [pokemonId, userId],
  );
  return (rows[0] as OwnedPokemonRow | undefined) ?? null;
}

/**
 * Bóc tên nature từ giá trị DB (object JSONB `{name,...}` hoặc string cũ)
 * trước khi truyền cho `getNatureMod` — nếu truyền thẳng object thì
 * `NATURE_MAP.get(object)` luôn miss → stat bị tính theo `hardy` oan.
 */
function natureNameOf(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string') {
    const name = (raw as { name: string }).name.trim();
    if (name) return name;
  }
  return 'hardy';
}

/** Recompute stats + HP delta khi đổi level/species. */
function recompute(
  row: OwnedPokemonRow,
  speciesId: string,
  level: number,
): { stats: Record<string, number>; maxHp: number } {
  const sp = gameData.getSpecies(speciesId);
  if (!sp) return { stats: row.stats, maxHp: row.stats.hp ?? 10 };
  const { maxHp, stats } = computeOwnedPokemonStats(
    sp.baseStats,
    row.ivs as BaseStats,
    row.evs as BaseStats,
    level,
    getNatureMod(natureNameOf(row.nature)),
  );
  return { stats, maxHp };
}

/**
 * Chọn moves mới sau khi evolve: ưu tiên learnset species mới, giữ move cũ nếu còn hợp lệ.
 *
 * PHẢI trả về **object array** (`{id, ...}`) — mọi writer khác đều lưu move dạng
 * object vào cột `pokemon.moves` (battle/index.ts, world/index.ts, battleParty.ts).
 * Nếu lưu `string[]` thì `normalizeMoves` (`battleParty.ts`) bỏ qua vì
 * `typeof m !== 'object'` → Pokémon sau khi tiến hoá **mất sạch moveset**.
 */
function movesAfterEvolve(row: OwnedPokemonRow, speciesId: string, level: number): MoveSlot[] {
  const sp = gameData.getSpecies(speciesId);
  if (!sp) return [];
  const fresh = learnsetAtLevel(sp, level, (id) => gameData.getMove(id)).map((m) => m.id);
  const old = Array.isArray(row.moves)
    ? (row.moves as Array<{ id?: string }>).map((m) => m?.id).filter((id): id is string => Boolean(id))
    : [];

  // Learnset species mới có quyền ưu tiên. Khi learnset rỗng (dữ liệu thiếu) →
  // giữ nguyên move cũ để Pokémon không bị mất sạch moveset sau tiến hoá.
  const source = fresh.length > 0 ? fresh : old;

  const ids: string[] = [];
  for (const id of source) {
    if (ids.length >= 4) break;
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }

  // Chuẩn hoá sang MoveSlot đầy đủ giống `normalizeMoves` phía đọc.
  return ids
    .map((id) => gameData.getMove(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .slice(0, 4)
    .map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      category: m.category,
      power: m.power ?? null,
      accuracy: m.accuracy,
      maxPp: m.pp,
      currentPp: m.pp,
      priority: m.priority ?? 0,
    }));
}

/**
 * Thử tiến hoá 1 Pokémon theo context (level/item/trade/friendship/move).
 * Everstone chặn method `level` + `friendship`.
 */
export async function tryEvolve(
  userId: string,
  pokemonId: string,
  ctx: EvolutionContext,
): Promise<EvolveResult> {
  const row = await loadOwned(userId, pokemonId);
  if (!row) return { evolved: false, error: 'not_found' };

  const sp = gameData.getSpecies(row.species_id);
  if (!sp) return { evolved: false, error: 'unknown_species' };

  // Everstone: chặn method `level` + `friendship` + `time` (resolve bình thường
  // rồi loại sau — `skipMethod` chỉ nhận 1 giá trị).
  const resolution = resolveEvolution(sp, ctx);
  if (!resolution) return { evolved: false };
  if (
    row.held_item === 'everstone' &&
    (resolution.method === 'level' || resolution.method === 'friendship' || resolution.method === 'time')
  ) {
    return { evolved: false, error: 'everstone' };
  }

  return applyEvolution(userId, row, resolution, 'natural');
}

/** Dùng đá tiến hoá (precheck: species phải có entry method `item` khớp stone). */
export async function useStone(
  userId: string,
  pokemonId: string,
  stoneId: string,
): Promise<EvolveResult> {
  const row = await loadOwned(userId, pokemonId);
  if (!row) return { evolved: false, error: 'not_found' };
  const sp = gameData.getSpecies(row.species_id);
  if (!sp) return { evolved: false, error: 'unknown_species' };
  const ok = sp.evolutions.some((e) => e.method === 'item' && e.item === stoneId);
  if (!ok) return { evolved: false, error: 'stone_not_applicable' };
  return tryEvolve(userId, pokemonId, { level: row.level, usedItemId: stoneId });
}

/** Áp dụng tiến hoá: update DB 1 transaction + log. */
async function applyEvolution(
  userId: string,
  row: OwnedPokemonRow,
  resolution: EvolutionResolution,
  /** Ghi vào history: `level`/`item`/`trade`... (từ resolve) hoặc `force`/`reverse`. */
  method: string,
  moderatorId?: string,
): Promise<EvolveResult> {
  const target = gameData.getSpecies(resolution.targetId);
  if (!target) return { evolved: false, error: 'target_not_found' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { stats, maxHp } = recompute(row, target.id, row.level);
    const hpRatio = row.stats.hp ? row.current_hp / row.stats.hp : 1;
    const newHp = Math.max(1, Math.min(maxHp, Math.round(maxHp * hpRatio)));
    const moves = movesAfterEvolve(row, target.id, row.level);

    await client.query(
      `UPDATE pokemon
          SET species_id = $3, stats = $4, current_hp = $5, moves = $6
        WHERE id = $1 AND owner_id = $2`,
      [row.id, userId, target.id, JSON.stringify(stats), newHp, JSON.stringify(moves)],
    );

    await client.query(
      `INSERT INTO pokemon_evolution_history
         (pokemon_id, user_id, from_species_id, to_species_id, method, moderator_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.id, userId, row.species_id, target.id, method, moderatorId ?? null],
    );

    await client.query('COMMIT');

    void logEvolve(userId, row.id, row.species_id, target.id, method, {
      forced: method !== 'natural',
    });

    return { evolved: true, from: row.species_id, to: target.id, method };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[evolution] applyEvolution failed:', err);
    return { evolved: false, error: 'db_error' };
  } finally {
    client.release();
  }
}

/** Force evolve (moderator+) — bỏ qua mọi điều kiện. */
export async function forceEvolve(
  userId: string,
  pokemonId: string,
  toSpeciesId?: string,
  moderatorId?: string,
): Promise<EvolveResult> {
  const row = await loadOwned(userId, pokemonId);
  if (!row) return { evolved: false, error: 'not_found' };
  const sp = gameData.getSpecies(row.species_id);
  if (!sp) return { evolved: false, error: 'unknown_species' };

  let targetId = toSpeciesId;
  if (!targetId) {
    const r = resolveEvolution(sp, { level: row.level });
    if (!r) return { evolved: false, error: 'no_evolution' };
    targetId = r.targetId;
  }
  if (!gameData.getSpecies(targetId)) return { evolved: false, error: 'target_not_found' };
  return applyEvolution(userId, row, { targetId, method: 'level' }, 'force', moderatorId);
}

/** Đảo ngược N bước theo chain ngược (moderator+). */
export async function reverseEvolve(
  userId: string,
  pokemonId: string,
  steps = 1,
  toSpeciesId?: string,
  moderatorId?: string,
): Promise<EvolveResult> {
  const row = await loadOwned(userId, pokemonId);
  if (!row) return { evolved: false, error: 'not_found' };

  // Dùng helper sẵn có: getPreEvolutionOf(target) → [sources].
  let current = row.species_id;
  for (let i = 0; i < steps; i++) {
    const sources = gameData.getPreEvolutionOf(current).map((s) => s.id);
    if (sources.length === 0) break;
    // Nhiều source → ưu tiên toSpeciesId nếu khớp, không thì source đầu.
    const next = toSpeciesId && sources.includes(toSpeciesId) ? toSpeciesId : sources[0]!;
    current = next;
  }
  if (current === row.species_id) return { evolved: false, error: 'no_reverse' };

  const target = gameData.getSpecies(current);
  if (!target) return { evolved: false, error: 'target_not_found' };

  return applyEvolution(
    userId,
    row,
    { targetId: current, method: 'level' },
    'reverse',
    moderatorId,
  );
}

/** Level up/down (moderator+) — recompute stats, giữ HP ratio. */
export async function changeLevel(
  userId: string,
  pokemonId: string,
  delta: number,
  moderatorId?: string,
): Promise<EvolveResult> {
  const row = await loadOwned(userId, pokemonId);
  if (!row) return { evolved: false, error: 'not_found' };
  const newLevel = Math.max(1, Math.min(100, row.level + delta));
  if (newLevel === row.level) return { evolved: false, error: 'level_clamped' };

  const { stats, maxHp } = recompute(row, row.species_id, newLevel);
  const hpRatio = row.stats.hp ? row.current_hp / row.stats.hp : 1;
  const newHp = Math.max(1, Math.min(maxHp, Math.round(maxHp * hpRatio)));

  try {
    await pool.query(
      `UPDATE pokemon SET level = $3, stats = $4, current_hp = $5 WHERE id = $1 AND owner_id = $2`,
      [row.id, userId, newLevel, JSON.stringify(stats), newHp],
    );
    void logLevelUp(userId, row.id, row.level, newLevel, delta > 0 ? 'up' : 'down');
    return { evolved: true, method: delta > 0 ? 'level_up' : 'level_down' };
  } catch (err) {
    console.error('[evolution] changeLevel failed:', err);
    return { evolved: false, error: 'db_error' };
  }
}

/** Set friendship (moderator+ — để test friendship evolution). */
export async function setFriendship(
  userId: string,
  pokemonId: string,
  value: number,
): Promise<boolean> {
  const v = Math.max(0, Math.min(255, Math.round(value)));
  const { rowCount } = await pool.query(
    `UPDATE pokemon SET friendship = $3 WHERE id = $1 AND owner_id = $2`,
    [pokemonId, userId, v],
  );
  return (rowCount ?? 0) > 0;
}

/** Đeo / tháo item cầm (Plan 45 §1.3): hoán đổi item vào/ra túi đồ trong cùng 1 transaction. */
export async function holdItem(
  userId: string,
  pokemonId: string,
  newItemId: string | null,
): Promise<{ ok: boolean; oldItemId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Kiểm tra sở hữu Pokémon và lấy item đang cầm hiện tại
    const { rows } = await client.query(
      `SELECT held_item FROM pokemon WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [pokemonId, userId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, oldItemId: null };
    }
    const oldItemId = (rows[0].held_item as string | null) ?? null;

    // Không có gì thay đổi
    if (oldItemId === newItemId) {
      await client.query('COMMIT');
      return { ok: true, oldItemId };
    }

    // 2. Nếu đeo item mới, trừ 1 item từ túi đồ
    if (newItemId) {
      const invCheck = await client.query(
        `SELECT quantity FROM inventory WHERE owner_id = $1 AND item_id = $2 FOR UPDATE`,
        [userId, newItemId],
      );
      const curQty = invCheck.rows.length > 0 ? Number(invCheck.rows[0].quantity) : 0;
      if (curQty < 1) {
        await client.query('ROLLBACK');
        return { ok: false, oldItemId };
      }
      if (curQty === 1) {
        await client.query(`DELETE FROM inventory WHERE owner_id = $1 AND item_id = $2`, [userId, newItemId]);
      } else {
        await client.query(`UPDATE inventory SET quantity = quantity - 1 WHERE owner_id = $1 AND item_id = $2`, [userId, newItemId]);
      }
    }

    // 3. Nếu Pokémon trước đó đang cầm item cũ, trả lại 1 item cũ vào túi đồ
    if (oldItemId) {
      await client.query(
        `INSERT INTO inventory (owner_id, item_id, quantity)
         VALUES ($1, $2, 1)
         ON CONFLICT (owner_id, item_id)
         DO UPDATE SET quantity = inventory.quantity + 1`,
        [userId, oldItemId],
      );
    }

    // 4. Cập nhật held_item mới cho Pokémon
    await client.query(
      `UPDATE pokemon SET held_item = $3 WHERE id = $1 AND owner_id = $2`,
      [pokemonId, userId, newItemId],
    );

    await client.query('COMMIT');
    return { ok: true, oldItemId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Lấy held item của Pokémon (null = chưa cầm). */
export async function getHeldItem(
  userId: string,
  pokemonId: string,
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT held_item FROM pokemon WHERE id = $1 AND owner_id = $2`,
    [pokemonId, userId],
  );
  return rows.length > 0 ? (rows[0].held_item as string | null) : null;
}

/** EXP cần để lên level tiếp theo (0 nếu max). */
export function expToNextFor(speciesId: string, level: number): number {
  if (level >= 100) return 0;
  const growth = gameData.getSpecies(speciesId)?.growthRate ?? 'mediumFast';
  return Math.max(1, expForLevel(level + 1, growth) - expForLevel(level, growth));
}
