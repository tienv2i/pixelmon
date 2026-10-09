import { pool } from '../../config/database.js';

/**
 * Friendship (happiness) — **SSOT hạnh phúc Pokémon**.
 *
 * Mainline dùng thang 0..255 chia 5 bậc; `evolution.ts` dùng
 * `FRIENDSHIP_EVO_THRESHOLD` (160) làm ngưỡng cho Espeon/Umbreon.
 *
 * Quy tắc cập nhật trong dự án (đã chốt):
 * - **+1 / ngày game**      → job toàn cục trong `WorldClockService`.
 * - **+1 / trận thắng**    → `battle.grantExp()` cho Pokémon tham gia.
 * - **−2 / ngày game**     → bỏ chạy khỏi trận wild (chạy trốn).
 * - **−1 / thua trận**     → `endBattle()` khi thua.
 *
 * Mọi thay đổi đều clamp về [0, 255] và **không** ghi DB khi không có dòng nào
 * khớp (pokemon không thuộc user → im lặng, tránh lộ thông tin).
 */

/** Ngưỡng + delta cho từng sự kiện (nguồn sự thật duy nhất — không magic number). */
export const FRIENDSHIP_DELTA = {
  /** Thắng trận (wild/trainer) — Pokémon tham gia. */
  battleWin: 1,
  /** Thua trận. */
  battleLoss: -1,
  /** Pokémon bị gục trong trận. */
  faint: -2,
  /** Bỏ chạy khỏi trận wild. */
  fled: -2,
} as const;

export type FriendshipReason = keyof typeof FRIENDSHIP_DELTA;

/** Ngưỡng của từng bậc hạnh phúc (mainline). */
export const FRIENDSHIP_TIERS = [
  { min: 200, tier: 'devoted' },
  { min: 160, tier: 'loving' },
  { min: 100, tier: 'friendly' },
  { min: 50, tier: 'neutral' },
  { min: 0, tier: 'hated' },
] as const;

export type FriendshipTier = (typeof FRIENDSHIP_TIERS)[number]['tier'];

/** Bậc hạnh phúc từ giá trị 0..255. */
export function friendshipTier(value: number): FriendshipTier {
  const v = clampFriendship(value);
  for (const t of FRIENDSHIP_TIERS) if (v >= t.min) return t.tier;
  return 'hated';
}

/** Chuẩn hoá friendship về 0..255. */
export function clampFriendship(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Cộng/trừ friendship cho MỌI Pokémon thuộc user (dùng cho job theo ngày).
 * Trả về số dòng đã cập nhật.
 */
export async function adjustAllForUser(userId: string, delta: number): Promise<number> {
  const d = Math.round(delta);
  if (d === 0) return 0;
  const { rowCount } = await pool.query(
    `UPDATE pokemon
        SET friendship = GREATEST(0, LEAST(255, friendship + $2))
      WHERE owner_id = $1`,
    [userId, d],
  );
  return rowCount ?? 0;
}

/** Cộng/trừ friendship cho 1 Pokémon cụ thể. */
export async function adjustForPokemon(
  userId: string,
  pokemonId: string,
  delta: number,
): Promise<boolean> {
  const d = Math.round(delta);
  if (d === 0) return false;
  const { rowCount } = await pool.query(
    `UPDATE pokemon
        SET friendship = GREATEST(0, LEAST(255, friendship + $3))
      WHERE id = $1 AND owner_id = $2`,
    [pokemonId, userId, d],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Cộng/trừ friendship cho **party Pokémon có tham gia trận** (những cái đã
 * roll EXP). Lý do: chỉ Pokémon đã đánh mới "quen" với người chơi.
 */
export async function adjustForParticipants(
  userId: string,
  pokemonIds: readonly string[],
  delta: number,
): Promise<void> {
  const d = Math.round(delta);
  if (d === 0 || pokemonIds.length === 0) return;
  try {
    await pool.query(
      `UPDATE pokemon
          SET friendship = GREATEST(0, LEAST(255, friendship + $3))
        WHERE owner_id = $1 AND id = ANY($2::uuid[])`,
      [userId, pokemonIds, d],
    );
  } catch (err) {
    // Friendship là hệ phụ — lỗi DB không được làm hỏng kết quả trận.
    console.warn('[friendship] adjustForParticipants failed:', err);
  }
}
