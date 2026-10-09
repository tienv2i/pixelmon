import { FRIENDSHIP_EVO_THRESHOLD, friendshipTier, msUntilNextPhase, weatherBlock, worldClockAt } from '@pixelmon/shared';
import type { PokemonData } from '../../ui/PokemonSummaryModal';
import { t } from '../../i18n';
import type { DebugCommandRegistry } from '../registry.js';

/** API mà nhóm lệnh hệ thống thế giới cần — WorldScene cấp qua adapter. */
export interface SystemsApi {
  /** Snapshot clock mới nhất server broadcast (qua `WorldState`). */
  clock(): { phase: string; weather: string; gameMinutes: number; mapId: string };
  partySlot(i: number): PokemonData | undefined;
}

/**
 * Lệnh introspection hệ thống ngày/đêm + thời tiết (MỚI — đọc số liệu
 * server-authoritative, không bịa): `/time`, `/weather`.
 */
export function registerSystemsCommands(reg: DebugCommandRegistry, api: SystemsApi): void {
  reg.register({
    name: 'time',
    summary: () => t('WS_HELP_TIME'),
    run: () => {
      const c = api.clock();
      const mins = ((c.gameMinutes % 1440) + 1440) % 1440;
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      const untilNext = Math.round(msUntilNextPhase(worldClockAt(Date.now())) / 60000);
      return [
        `Giờ game: ${hh}:${mm} (${c.phase}) — ngày #${Math.floor(c.gameMinutes / 1440)}`,
        `Đổi phase sau ~${untilNext} phút thực (x6).`,
      ].join('\n');
    },
  });

  reg.register({
    name: 'weather',
    summary: () => t('WS_HELP_WEATHER'),
    run: () => {
      const c = api.clock();
      const now = worldClockAt(Date.now());
      return [
        `Thời tiết ${c.mapId}: ${c.weather} (block ${weatherBlock(now) + 1}/8)`,
        `Phase: ${c.phase} — deterministic theo (map, ngày, block).`,
      ].join('\n');
    },
  });

  reg.register({
    name: 'friendship',
    aliases: ['happy'],
    summary: () => t('WS_HELP_FRIENDSHIP'),
    run: (a) => {
      const fmt = (slot: number, pkm: PokemonData): string => {
        const v = pkm.friendship ?? 0;
        const ready =
          v >= FRIENDSHIP_EVO_THRESHOLD
            ? `✓ đủ ngưỡng evolve (${FRIENDSHIP_EVO_THRESHOLD})`
            : `còn thiếu ${FRIENDSHIP_EVO_THRESHOLD - v} để evolve`;
        return `${pkm.nickname || pkm.species_id} Lv.${pkm.level}: ${v}/255 (${friendshipTier(v)}) — ${ready}`;
      };
      if (a.length >= 1) {
        const slot = parseInt(a[0] ?? '', 10);
        if (!Number.isInteger(slot) || slot < 0 || slot > 5) return t('WS_HELP_FRIENDSHIP');
        const pkm = api.partySlot(slot);
        if (!pkm) return `[debug] /friendship — slot ${slot} trống.`;
        return fmt(slot, pkm);
      }
      const lines = [`=== FRIENDSHIP PARTY (ngưỡng evolve ${FRIENDSHIP_EVO_THRESHOLD}) ===`];
      for (let i = 0; i < 6; i++) {
        const pkm = api.partySlot(i);
        lines.push(pkm ? `• [${i}] ${fmt(i, pkm)}` : `• [${i}] (trống)`);
      }
      return lines.join('\n');
    },
  });
}
