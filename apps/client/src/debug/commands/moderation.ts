import { ColyseusManager } from '../../network/ColyseusManager';
import type { PokemonData } from '../../ui/PokemonSummaryModal';
import { t } from '../../i18n';
import type { DebugCommandRegistry } from '../registry.js';

export interface PartySelectRequest {
  title: string;
  hint: string;
  onSelect: (target: PokemonData) => void | Promise<void>;
}

/** API mà nhóm lệnh moderator cần — WorldScene cấp qua adapter (closure). */
export interface ModerationApi {
  partySlot(i: number): PokemonData | undefined;
  openPartySelect(opts: PartySelectRequest): void;
  reloadParty(): void;
  systemLine(msg: string, color: string): void;
}

function slotArg(a: string[]): number | null {
  const slot = parseInt(a[0] ?? '', 10);
  return Number.isInteger(slot) && slot >= 0 && slot <= 5 ? slot : null;
}

/**
 * Lệnh moderator (gửi `mod_action` lên server — server vẫn là nơi validate
 * quyền + thực thi): `/forceevolve`, `/reverseevolve`, `/levelup`,
 * `/leveldown`, `/forcefriend`, `/trade`, `/switch`, `/spawn`.
 */
export function registerModerationCommands(reg: DebugCommandRegistry, api: ModerationApi): void {
  const mod = ColyseusManager.getInstance();

  reg.register({
    name: 'forceevolve',
    summary: () => t('WS_HELP_FORCEEVOLVE'),
    run: (a) => {
      const slot = slotArg(a);
      if (slot === null) return t('WS_HELP_FORCEEVOLVE');
      mod.sendModAction('forceevolve', [String(slot), a[1] ?? '']);
      return `[debug] /forceevolve ${slot} ${a[1] ?? ''}`;
    },
  });

  reg.register({
    name: 'reverseevolve',
    summary: () => t('WS_HELP_REVERSEEVOLVE'),
    run: (a) => {
      const slot = slotArg(a);
      if (slot === null) return t('WS_HELP_REVERSEEVOLVE');
      mod.sendModAction('reverseevolve', [String(slot), a[1] ?? '1', a[2] ?? '']);
      return `[debug] /reverseevolve ${slot}`;
    },
  });

  reg.register({
    name: 'leveldown',
    summary: () => t('WS_HELP_LEVELDOWN'),
    run: (a) => {
      const slot = slotArg(a);
      const delta = parseInt(a[1] ?? '1', 10);
      if (slot === null || !Number.isInteger(delta)) return t('WS_HELP_LEVELDOWN');
      mod.sendModAction('leveldown', [String(slot), String(delta)]);
      return `[debug] /leveldown ${slot} ${delta}`;
    },
  });

  reg.register({
    name: 'levelup',
    summary: () => t('WS_HELP_LEVELUP'),
    run: (a) => {
      const slot = slotArg(a);
      const delta = parseInt(a[1] ?? '1', 10);
      if (slot === null || !Number.isInteger(delta)) return t('WS_HELP_LEVELUP');
      mod.sendModAction('levelup', [String(slot), String(delta)]);
      return `[debug] /levelup ${slot} ${delta}`;
    },
  });

  reg.register({
    name: 'forcefriend',
    summary: () => t('WS_HELP_FORCEFRIEND'),
    run: (a) => {
      const slot = slotArg(a);
      const value = parseInt(a[1] ?? '160', 10);
      if (slot === null || !Number.isInteger(value)) return t('WS_HELP_FORCEFRIEND');
      mod.sendModAction('forcefriend', [String(slot), String(value)]);
      return `[debug] /forcefriend ${slot} ${value}`;
    },
  });

  reg.register({
    name: 'trade',
    summary: () => t('WS_HELP_TRADE'),
    run: (a) => {
      const slot = slotArg(a);
      if (slot === null) return t('WS_HELP_TRADE');
      const pkm = api.partySlot(slot);
      if (!pkm) return `[debug] /trade — slot ${slot} trống.`;
      mod.sendTrade(pkm.id);
      return `[debug] /trade ${pkm.nickname || pkm.species_id}`;
    },
  });

  reg.register({
    name: 'switch',
    summary: () => t('WS_HELP_SWITCH'),
    run: (a) => {
      const slot = slotArg(a);
      if (slot === null) return t('WS_HELP_SWITCH');
      const src = api.partySlot(slot);
      if (!src) return `[debug] /switch — slot ${slot} trống.`;
      api.openPartySelect({
        title: t('PARTY_SELECT_SWITCH'),
        hint: t('PARTY_SELECT_HINT'),
        onSelect: async (target) => {
          if (target.id === src.id) return;
          const ok = await mod.swapPartySlots(src.id, target.id);
          api.systemLine(ok ? t('WS_SWITCH_DONE') : t('WS_SWITCH_FAIL'), ok ? '#7bed9f' : '#ff7675');
          if (ok) api.reloadParty();
        },
      });
      return `[debug] /switch ${src.nickname || src.species_id} ↔ ?`;
    },
  });

  reg.register({
    name: 'spawn',
    summary: () => t('WS_HELP_SPAWN'),
    run: (a) => {
      const args = a.join(' ').trim();
      const lower = args.toLowerCase();
      if (lower === 'help' || lower === '?' || lower === '-h' || lower === '--help') {
        return [
          '=== LỆNH /SPAWN (TRIỆU HỒI POKÉMON HOANG) ===',
          '• Ngắn gọn: /spawn <tên|dex> [level] [shiny]',
          '  VD: /spawn pikachu | /spawn 25 50 | /spawn mew 100 s',
          '• Chi tiết (Key=Value):',
          '  level=<1-100> | lv=<n>   (Cấp độ)',
          '  shiny=<true|false> | s   (Sắc khác / Shiny)',
          '  nature=<tên>             (adamant, timid, modest, jolly...)',
          '  gender=<m|f|none>        (Giới tính)',
          '  held=<item_id>           (Vật phẩm mang theo: light-ball, leftovers...)',
          '  iv=<0-31|max|min>        (Chỉ số IVs)',
          '  moves=<m1,m2...>         (Chiêu thức: vd moves=psychic,surf)',
          '  hp=<1..max>              (Máu ban đầu: vd hp=1 test bắt)',
          '• Ví dụ mẫu:',
          '  /spawn pikachu 50 shiny nature=timid held=light-ball',
          '  /spawn 150 lv=70 iv=31 moves=psychic,aurasphere hp=1',
        ].join('\n');
      }
      mod.sendDebugSpawn(args || undefined);
      return args
        ? `[debug] Đang triệu hồi: /spawn ${args}...`
        : `[debug] Đang triệu hồi Pokémon ngẫu nhiên theo bản đồ...`;
    },
  });
}
