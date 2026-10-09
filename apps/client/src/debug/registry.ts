import { t } from '../i18n';

/**
 * Registry lệnh debug — **mọi tính năng game debug bằng dòng lệnh đều qua đây**.
 *
 * Mỗi lệnh là 1 def `{ name, aliases, summary, run }` đăng ký từ các file
 * `commands/*.ts` (chia theo nhóm tính năng). `/help` tự sinh từ registry nên
 * thêm lệnh mới không cần sửa text help tay (trước đây help ghi cứng trong
 * `WorldScene.handleDebugCommand` nên hay lệch với lệnh thật).
 */
export type DebugRun = (args: string[]) => string | void;

export interface DebugCommandDef {
  /** Tên lệnh (không slash): `tp` → dùng `/tp`. */
  name: string;
  /** Bí danh: `dex` → `/dex` chạy cùng handler `pokedex`. */
  aliases?: string[];
  /** 1 dòng mô tả cho `/help` (nên là `() => t(KEY)` để theo ngôn ngữ). */
  summary: () => string;
  /** `args` = phần sau tên lệnh đã split whitespace. */
  run: DebugRun;
}

export class DebugCommandRegistry {
  private ordered: DebugCommandDef[] = [];
  private byName = new Map<string, DebugCommandDef>();

  register(def: DebugCommandDef): void {
    this.ordered.push(def);
    this.byName.set(def.name.toLowerCase(), def);
    for (const a of def.aliases ?? []) {
      this.byName.set(a.toLowerCase(), def);
    }
  }

  /** Chạy 1 dòng lệnh (`/tp 10 20`). Không biết lệnh → chuỗi gợi ý `/help`. */
  execute(line: string): string | void {
    const cmd = line.trim();
    if (!cmd) return;
    const parts = cmd.split(/\s+/);
    const raw = (parts[0] ?? '').toLowerCase();
    const name = raw.startsWith('/') ? raw.slice(1) : raw;
    const def = this.byName.get(name);
    if (!def) return `${t('WS_CMD_INVALID')}${cmd}${t('WS_CMD_HELP')}`;
    return def.run(parts.slice(1));
  }

  /** Text `/help` — header + toàn bộ lệnh đã đăng ký + footer tĩnh. */
  helpText(): string {
    const lines = [t('WS_HELP_HEADER'), t('WS_HELP_HELP')];
    for (const d of this.ordered) lines.push(`• ${d.summary()}`);
    lines.push(
      '• /battle <tên> — Thách đấu PvP người chơi khác (chỉ ở map PvP)',
      '• Phím tắt: [D] Pokédex | [M] Town Map | [B] Túi đồ | [P] Đội hình | [H] Trợ giúp',
    );
    return lines.join('\n');
  }
}
