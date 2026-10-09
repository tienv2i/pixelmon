/**
 * Friendship (happiness) — SSOT hiển thị/panel.
 *
 * Thang 0..255 (chuẩn mainline) chia 5 bậc; `FRIENDSHIP_EVO_THRESHOLD` (160)
 * trong `evolution.ts` là ngưỡng tiến hoá (Espeon/Umbreon). Server
 * (`modules/pokemon/friendship.ts`) và client (`/friendship`, UI) dùng chung
 * để không lệch bậc hiển thị.
 */

/** Ngưỡng của từng bậc hạnh phúc (mainline). */
export const FRIENDSHIP_TIERS = [
  { min: 200, tier: 'devoted' },
  { min: 160, tier: 'loving' },
  { min: 100, tier: 'friendly' },
  { min: 50, tier: 'neutral' },
  { min: 0, tier: 'hated' },
] as const;

export type FriendshipTier = (typeof FRIENDSHIP_TIERS)[number]['tier'];

/** Chuẩn hoá friendship về 0..255. */
export function clampFriendship(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Bậc hạnh phúc từ giá trị 0..255. */
export function friendshipTier(value: number): FriendshipTier {
  const v = clampFriendship(value);
  for (const t of FRIENDSHIP_TIERS) if (v >= t.min) return t.tier;
  return 'hated';
}
