/**
 * PvP rules — SSOT luật đấu người chơi (đọc chung cho server & client).
 *
 * Mục tiêu: giữ trận PvP công bằng và không phá vỡ tiến trình nấp thang:
 *  - Chỉ diễn ra trên map có `pvp: true`.
 *  - Cả 2 bên phải trong cùng map và cùng room thế giới.
 *  - Không Poké Ball, không bỏ chạy, không nhận EXP từ đối thủ.
 *  - Người thắng nhận tiền nhỏ (không farm được).
 *  - Giới hạn level để người chơi mới không bị "cày" bởi account lv cao.
 *
 * Thuần tuý (không I/O) — server validate, client dùng để hiển thị/khoá UI.
 */

/** Cấp tối đa được phép tham gia PvP. */
export const PVP_MAX_LEVEL = 30;

/** Chênh lệch level tối đa giữa 2 bên (tránh cày lv cao đánh lv thấp). */
export const PVP_LEVEL_DIFF = 10;

/** Số tiền người thắng nhận mỗi trận PvP (đủ cảm giác, không farm được). */
export const PVP_WIN_MONEY = 200;

/** Số tiền người thua bị trừ (0 = không trừ — không phạt người mới). */
export const PVP_LOSE_MONEY = 0;

/** Thời gian chờ đối thủ đồng ý thách đấu (ms) — hết hạn thì huỷ. */
export const PVP_CHALLENGE_TTL_MS = 30_000;

/** Cooldown sau khi thách đấu (ms) — chống spam challenge. */
export const PVP_CHALLENGE_COOLDOWN_MS = 10_000;

/**
 * Thời gian chờ client thách đấu tạo xong phòng BattleRoom (ms).
 *
 * Nếu trôi qua mà `pvp_room_ready` chưa fire (client crash / join fail), server
 * gỡ `inBattleSessions` cho cả 2 để không khoá vĩnh viễn khỏi trận đấu.
 */
export const PVP_ROOM_CREATE_TIMEOUT_MS = 15_000;

/** Khối lượng lớn nhất được tham gia PvP (không tính bench). */
export const PVP_TEAM_SIZE = 3;

/** Lý do thất bại khi gửi challenge — client dùng để hiện message. */
export type PvpRejectReason =
  | 'pvp_disabled'
  | 'self'
  | 'not_found'
  | 'in_battle'
  | 'no_team'
  | 'level_too_high'
  | 'level_diff'
  | 'cooldown'
  | 'already_pending';

export interface PvpEligibility {
  ok: boolean;
  reason?: PvpRejectReason;
}

/**
 * Kiểm tra 2 người chơi có hợp lệ để đấu nhau không.
 *
 * @param mapPvpEnabled - map hiện tại có bật PvP không.
 * @param a - người thách đấu.
 * @param b - người bị thách.
 * @param now - timestamp hiện tại (ms) để kiểm tra cooldown.
 */
export function canChallengePvp(
  mapPvpEnabled: boolean,
  a: { userId: string; level: number; inBattle: boolean; aliveCount: number; lastChallengeAt: number },
  b: { userId: string; level: number; inBattle: boolean; aliveCount: number },
  now = Date.now(),
): PvpEligibility {
  if (!mapPvpEnabled) return { ok: false, reason: 'pvp_disabled' };
  if (!a.userId || !b.userId) return { ok: false, reason: 'not_found' };
  if (a.userId === b.userId) return { ok: false, reason: 'self' };
  if (a.inBattle || b.inBattle) return { ok: false, reason: 'in_battle' };
  if (a.aliveCount <= 0 || b.aliveCount <= 0) return { ok: false, reason: 'no_team' };

  // Giới hạn level: cả 2 bên phải ≤ PVP_MAX_LEVEL.
  if (a.level > PVP_MAX_LEVEL || b.level > PVP_MAX_LEVEL) {
    return { ok: false, reason: 'level_too_high' };
  }
  // Không cho lệch level quá xa.
  if (Math.abs(a.level - b.level) > PVP_LEVEL_DIFF) {
    return { ok: false, reason: 'level_diff' };
  }
  // Cooldown chống spam challenge.
  if (now - a.lastChallengeAt < PVP_CHALLENGE_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' };
  }
  return { ok: true };
}

/** Chuỗi giải thích cho `PvpRejectReason` (song ngữ). */
export function pvpRejectMessage(reason: PvpRejectReason, isVi = true): string {
  const msg: Record<PvpRejectReason, [string, string]> = {
    pvp_disabled: ['Khu vực này không cho phép PvP.', 'PvP is not allowed in this area.'],
    self: ['Bạn không thể tự thách đấu mình.', 'You cannot challenge yourself.'],
    not_found: ['Không tìm thấy người chơi.', 'Player not found.'],
    in_battle: ['Một trong hai đang trong trận đấu.', 'One of you is already in battle.'],
    no_team: ['Cần ít nhất 1 Pokémon còn sống để thách đấu.', 'You need at least one Pokémon that can battle.'],
    level_too_high: [`Cấp độ phải ≤ ${PVP_MAX_LEVEL} để tham gia PvP.`, `Level must be ≤ ${PVP_MAX_LEVEL} for PvP.`],
    level_diff: [`Chênh lệch cấp tối đa ${PVP_LEVEL_DIFF}.`, `Level difference must be within ${PVP_LEVEL_DIFF}.`],
    cooldown: ['Bạn vừa thách đấu, chờ một chút.', 'You just challenged someone, please wait.'],
    already_pending: ['Đã có một lời thách đấu đang chờ.', 'A challenge is already pending.'],
  };
  return msg[reason][isVi ? 0 : 1];
}

/**
 * Trận PvP: chọn tối đa `PVP_TEAM_SIZE` Pokémon còn sống, GIỮ NGUYÊN thứ tự party
 * (để Pokémon đứng đầu party vẫn là lead, đúng ý người chơi).
 *
 * @param members - party đầy đủ (BattleTeamMember[]).
 */
export function selectPvpTeam<T extends { currentHp: number }>(members: T[]): T[] {
  return members.filter((m) => m.currentHp > 0).slice(0, PVP_TEAM_SIZE);
}