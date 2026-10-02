/**
 * Battle Manager — pending wild encounter (token → battle payload).
 *
 * Flow (Plan 44 Phase 0):
 *  - WorldRoom roll encounter + chuẩn bị team → `createPendingBattle()`.
 *  - Gửi token qua message `battle_init` cho client.
 *  - Client `client.create('battle', { token })` → BattleRoom.onCreate consume.
 *  - Token SINGLE-USE, TTL 30s (chống re-use / token giả).
 *
 * Server là nguồn duy nhất chuẩn bị dữ liệu → client không thể tự chọn
 * species/level foe (chống cheat).
 */

/** Payload server đã chuẩn bị cho 1 trận wild. */
export interface PendingBattle {
  token: string;
  /** userId (DB `players.id`) của người chơi bắt đầu trận. */
  userId: string;
  /** Session id của player trong WorldRoom (gửi `battle_end` khi xong). */
  worldSessionId: string;
  mapId: string;
  /** Team server đã load từ DB (shape chuẩn bị sẵn cho BattlePokemon). */
  allyTeam: Record<string, unknown>[];
  foeTeam: Record<string, unknown>[];
}

/** TTL token (ms). Quá hạn → không còn dùng được. */
const TOKEN_TTL_MS = 30_000;

/**
 * Token úndo (crypto.randomUUID) — server chỉ tung token hợp lệ.
 * Client sửa token → không tra được → BattleRoom từ chối.
 */
const pending = new Map<string, PendingBattle & { createdAt: number }>();

/** Dọn token hết hạn (gọi định kỳ hoặc khi create mới). */
function sweep(): void {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (now - v.createdAt > TOKEN_TTL_MS) pending.delete(k);
  }
}

/**
 * Đăng ký 1 trận wild sắp diễn ra.
 * @returns token gửi cho client (dùng 1 lần, TTL 30s).
 */
export function createPendingBattle(
  data: Omit<PendingBattle, 'token' | 'createdAt'>,
): { token: string } {
  sweep();
  const token = crypto.randomUUID();
  pending.set(token, { ...data, token, createdAt: Date.now() });
  return { token };
}

/**
 * Đổi token lấy payload (single-use: xoá sau khi đọc).
 * Trả về `null` nếu token không tồn tại / hết hạn / đã dùng.
 */
export function consumeBattleToken(token: string): PendingBattle | null {
  if (!token || typeof token !== 'string') return null;
  const entry = pending.get(token);
  if (!entry) return null;
  pending.delete(token);
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) return null;
  const { createdAt: _createdAt, ...rest } = entry;
  return rest;
}

/** Số token đang chờ (debug). */
export function pendingBattleCount(): number {
  return pending.size;
}
