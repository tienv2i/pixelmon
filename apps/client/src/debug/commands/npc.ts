import { t } from '../../i18n';
import type { DebugCommandRegistry } from '../registry.js';

export interface NpcListEntry {
  npcId: string;
  name: string;
  x: number;
  y: number;
  isTrainer: boolean;
  defeated: boolean;
  /** Chuỗi còn lại (`'Sẵn sàng'` hoặc `'12s'`). */
  cdRemain: string;
}

/** API mà nhóm lệnh NPC cần — WorldScene cấp qua adapter (closure). */
export interface NpcApi {
  requestTrainerBattle(trainerId: string): void;
  /** Reset NPC (`'all'` hoặc id) — trả số đã xoá / có xoá được không. */
  resetNpc(target: string): { cleared: number; removed: boolean };
  npcList(): { mapId: string; npcs: NpcListEntry[] };
  cooldownDuration(): number;
  setCooldownDuration(ms: number): void;
}

/** Lệnh NPC/trainer: `/trainer`, `/resetnpc`, `/npclist`, `/cooldown`. */
export function registerNpcCommands(reg: DebugCommandRegistry, api: NpcApi): void {
  reg.register({
    name: 'trainer',
    summary: () => t('WS_HELP_TRAINER'),
    run: (a) => {
      const trainerId = a[0];
      if (!trainerId) return 'Sử dụng: /trainer <id> (kích hoạt trận đấu trainer test)';
      api.requestTrainerBattle(trainerId);
      return `[debug] Đã gửi yêu cầu đấu trainer test: ${trainerId}`;
    },
  });

  reg.register({
    name: 'resetnpc',
    summary: () => t('WS_HELP_RESETNPC'),
    run: (a) => {
      const target = a[0] || 'all';
      if (target === 'all') {
        const { cleared } = api.resetNpc('all');
        return `[debug] Đã reset toàn bộ NPC (${cleared} trainer đã đánh bại, toàn bộ cooldown đã xoá).`;
      }
      const { removed } = api.resetNpc(target);
      return `[debug] Đã reset NPC '${target}' (trạng thái: ${removed ? 'đã xoá khỏi danh sách thắng' : 'chưa từng đánh bại'}, cooldown: đã xoá).`;
    },
  });

  reg.register({
    name: 'npclist',
    summary: () => t('WS_HELP_NPCLIST'),
    run: () => {
      const { mapId, npcs } = api.npcList();
      if (npcs.length === 0) {
        return `[debug] Bản đồ ${mapId} không có NPC nào.`;
      }
      const lines = [`=== DANH SÁCH NPC TRÊN BẢN ĐỒ (${mapId}) ===`];
      for (const npc of npcs) {
        const defeatedStr = npc.isTrainer ? (npc.defeated ? 'Đã đấu' : 'Chưa đấu') : 'NPC thường';
        lines.push(
          `• [${npc.npcId}] ${npc.name} (${npc.x}, ${npc.y}) | Loại: ${npc.isTrainer ? 'Trainer' : 'Dân làng'} | Trạng thái: ${defeatedStr} | Cooldown: ${npc.cdRemain}`,
        );
      }
      return lines.join('\n');
    },
  });

  reg.register({
    name: 'cooldown',
    summary: () => t('WS_HELP_COOLDOWN'),
    run: (a) => {
      const sec = parseFloat(a[0] ?? '');
      if (isNaN(sec) || sec < 0) {
        return `Sử dụng: /cooldown <seconds> (Hiện tại: ${api.cooldownDuration() / 1000}s)`;
      }
      api.setCooldownDuration(Math.round(sec * 1000));
      return `[debug] Đã cập nhật thời gian cooldown tương tác NPC: ${sec}s`;
    },
  });
}
