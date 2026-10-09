import { t } from '../../i18n';
import type { DebugCommandRegistry } from '../registry.js';

/** API mà nhóm lệnh giao diện cần — WorldScene cấp qua adapter (closure). */
export interface UiApi {
  openPokedex(): void;
  clearConsoleAndChat(): void;
  serverInfo(): { origin: string; room: string; session: string; debugAccess: boolean };
}

/** Lệnh giao diện & kết nối: `/pokedex`, `/clear`, `/server`. */
export function registerUiCommands(reg: DebugCommandRegistry, api: UiApi): void {
  reg.register({
    name: 'pokedex',
    aliases: ['dex'],
    summary: () => t('WS_HELP_POKEDEX'),
    run: () => {
      api.openPokedex();
      return '[UI] Đã mở Pokédex.';
    },
  });

  reg.register({
    name: 'clear',
    summary: () => t('WS_HELP_CLEAR'),
    run: () => {
      api.clearConsoleAndChat();
      // Không hiện dòng confirm (đã xoá sạch).
    },
  });

  reg.register({
    name: 'server',
    summary: () => t('WS_HELP_SERVER'),
    run: () => {
      const s = api.serverInfo();
      return [
        `Origin: ${s.origin}`,
        `Room: ${s.room}`,
        `Session ID: ${s.session}`,
        `Debug Access: ${s.debugAccess ? t('WS_DEBUG_ACCESS_YES') : t('WS_DEBUG_ACCESS_NO')}`,
      ].join('\n');
    },
  });
}
