/**
 * Battle Manager — pending battle (token → battle payload).
 *
 * Flow (Plan 44 Phase 0):
 *  - WorldRoom roll encounter + chuẩn bị team → `createPendingBattle()`.
 *  - Gửi token qua message `battle_init` cho client.
 *  - Client `client.create('battle', { token })` → BattleRoom.onCreate consume.
 *  - Token SINGLE-USE, TTL 30s (chống re-use / token giả).
 *
 * Flow PvP (Plan 47):
 *  - WorldRoom xác nhận 2 người chơi hợp lệ → `createPendingPvpBattle()`.
 *  - Tạo 2 token: `allyToken` (bên thách) & `foeToken` (bên bị thách).
 *  - Client bên thách `client.create('battle', { token: allyToken })` → tạo room.
 *  - BattleRoom publish roomId; WorldRoom gửi `pvp_battle_ready { roomId, token }`
 *    cho bên foe → client foe `client.joinById(roomId, { token: foeToken })`.
 *  - Cả 2 token trỏ về CÙNG battleId nhưng khác `side` — server gán đúng bên.
 *
 * Server là nguồn duy nhất chuẩn bị dữ liệu → client không thể tự chọn
 * species/level foe (chống cheat).
 */

/** Vai của 1 token trong phòng battle. */
export type BattleSideKind = 'ally' | 'foe';

/** Payload server đã chuẩn bị cho 1 trận. */
export interface PendingBattle {
  token: string;
  /** `ally` = người tạo phòng (thách/wild/trainer). `foe` = người chơi thật bên kia. */
  side: BattleSideKind;
  /** userId (DB `players.id`) của người chơi bên này. */
  userId: string;
  /** Session id của player trong WorldRoom (gửi `battle_end` khi xong). */
  worldSessionId: string;
  mapId: string;
  /** Team server đã load từ DB (shape chuẩn bị sẵn cho BattlePokemon). */
  allyTeam: Record<string, unknown>[];
  foeTeam: Record<string, unknown>[];
  isTrainer?: boolean;
  trainerName?: string;
  rewardMoney?: number;
  loseText?: string;
  npcId?: string;
  trainerId?: string;

  // ── PvP (2 người chơi thật) ──────────────────────────────────────────────
  /** `true` khi đây là trận đấu người chơi vs người chơi. */
  isPvp?: boolean;
  /**
   * (Chỉ token `ally`) userId + worldSessionId + tên của BÊN kia.
   * Server populate foeTeam/foe info từ đây khi cả 2 đã join.
   */
  opponentUserId?: string;
  opponentWorldSessionId?: string;
  opponentName?: string;
  /** Tên hiển thị bên ally (khi là token foe thì đây là tên đối thủ của họ). */
  allyName?: string;
  /** Tiền thưởng cho người thắng (PvP). */
  pvpRewardMoney?: number;
  /**
   * (PvP) Token của bên foe — Room giữ lại để validate client thứ 2 join.
   * WorldRoom gửi token này cho client foe; foe join bằng `joinById`.
   */
  foeToken?: string;
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
 * Đăng ký 1 trận wild/trainer sắp diễn ra (1 người chơi).
 * @returns token gửi cho client (dùng 1 lần, TTL 30s).
 */
export function createPendingBattle(
  data: Omit<PendingBattle, 'token' | 'createdAt' | 'side'>,
): { token: string } {
  sweep();
  const token = crypto.randomUUID();
  pending.set(token, { ...data, token, side: 'ally', createdAt: Date.now() });
  return { token };
}

/**
 * Đăng ký 1 trận PvP — tạo 2 token (mỗi token 1 `side`).
 *
 * Cả 2 token chung `worldSessionId` của bên thách + `opponent*` của bên bị thách
 * (token foe thì `userId`/`worldSessionId` của chính nó, còn `opponent*` là bên thách).
 */
export function createPendingPvpBattle(data: {
  mapId: string;
  allyTeam: Record<string, unknown>[];
  foeTeam: Record<string, unknown>[];
  /** Bên thách (tạo phòng). */
  challengerUserId: string;
  challengerWorldSessionId: string;
  challengerName: string;
  /** Bên bị thách. */
  opponentUserId: string;
  opponentWorldSessionId: string;
  opponentName: string;
}): { allyToken: string; foeToken: string } {
  sweep();
  const allyToken = crypto.randomUUID();
  const foeToken = crypto.randomUUID();

  pending.set(allyToken, {
    token: allyToken,
    side: 'ally',
    isPvp: true,
    userId: data.challengerUserId,
    worldSessionId: data.challengerWorldSessionId,
    mapId: data.mapId,
    allyTeam: data.allyTeam,
    foeTeam: data.foeTeam,
    allyName: data.challengerName,
    opponentUserId: data.opponentUserId,
    opponentWorldSessionId: data.opponentWorldSessionId,
    opponentName: data.opponentName,
    pvpRewardMoney: 0,
    foeToken,
    createdAt: Date.now(),
  });

  pending.set(foeToken, {
    token: foeToken,
    side: 'foe',
    isPvp: true,
    userId: data.opponentUserId,
    worldSessionId: data.opponentWorldSessionId,
    mapId: data.mapId,
    // Team của 2 bên vẫn là cùng payload — BattleRoom chỉ dùng `allyTeam`
    // cho side ally & `foeTeam` cho side foe; token foe cũng cần cả 2 để
    // populate đúng khi room đã có state.
    allyTeam: data.allyTeam,
    foeTeam: data.foeTeam,
    allyName: data.opponentName,
    opponentUserId: data.challengerUserId,
    opponentWorldSessionId: data.challengerWorldSessionId,
    opponentName: data.challengerName,
    pvpRewardMoney: 0,
    createdAt: Date.now(),
  });

  return { allyToken, foeToken };
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

/**
 * Đọc token KHÔNG xoá (dùng cho `foeToken` — chỉ consume khi client foe
 * thật sự join, không consume khi client ally tạo phòng).
 */
export function peekBattleToken(token: string): PendingBattle | null {
  if (!token || typeof token !== 'string') return null;
  const entry = pending.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) return null;
  const { createdAt: _createdAt, ...rest } = entry;
  return rest;
}

/** Số token đang chờ (debug). */
export function pendingBattleCount(): number {
  return pending.size;
}