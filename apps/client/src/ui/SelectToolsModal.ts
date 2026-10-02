import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { TOP_MENU_ICONS, type MenuIconDef } from './TopMenu';
import { t, mkText, onLangChange, type I18nKey } from '../i18n';

export interface SelectToolsModalOptions {
  onSelectTool: (key: string) => void;
  onClose?: () => void;
}

export interface ToolDef extends MenuIconDef {
  desc?: string;
  color?: string;
}

const TOOL_DETAILS: Record<string, { descKey: I18nKey; color: string }> = {
  bag: { descKey: 'TOOL_BAG', color: '#e67e22' },
  team: { descKey: 'TOOL_TEAM', color: '#e74c3c' },
  pokedex: { descKey: 'TOOL_POKEDEX', color: '#0984e3' },
  pc: { descKey: 'TOOL_PC', color: '#00cec9' },
  map: { descKey: 'TOOL_MAP', color: '#f1c40f' },
  gps: { descKey: 'TOOL_GPS', color: '#2ecc71' },
  settings: { descKey: 'TOOL_SETTINGS', color: '#a29bfe' },
  help: { descKey: 'TOOL_HELP', color: '#fdcb6e' },
  debug: { descKey: 'TOOL_DEBUG', color: '#ff7675' },
  logout: { descKey: 'TOOL_LOGOUT', color: '#d63031' },
};

/**
 * **SelectToolsModal** — Bảng chọn công cụ màn hình lớn tối ưu cho thiết bị di động & cảm ứng:
 * - Kích thước lớn, đặt giữa màn hình (`lockUi: true`).
 * - Title chuẩn: "SELECT TOOLS" với nút tắt ✕ ở góc trên phải.
 * - Các nút bấm kích thước lớn (chiều cao 54-58px), dễ dàng chạm ngón tay.
 * - Icon Pixel Art to rõ kết hợp nhãn tiếng Việt và mô tả ngắn.
 */
export class SelectToolsModal extends UiModal {
  private unsubLang?: () => void;
  private toolOpts: SelectToolsModalOptions;
  private hiddenTools = new Set<string>();

  constructor(scene: Phaser.Scene, opts: SelectToolsModalOptions) {
    const sw = scene.scale.width;
    const modalW = Math.min(500, Math.max(340, sw - 24));
    const modalH = Math.min(460, scene.scale.height - 30);

    super(scene, {
      title: t('TOOLS_TITLE'),
      width: modalW,
      height: modalH,
      headerHeight: 38,
      lockUi: true,
      depth: 210,
      showClose: true,
      showMinimize: false,
      showDock: false,
      defaultAlign: 'center',
      onClose: () => {
        opts.onClose?.();
      },
    });

    this.toolOpts = opts;
    this.renderToolGrid();
    // Cập nhật title + lưới khi đổi ngôn ngữ (chỉ 1 ngôn ngữ hiển thị)
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('TOOLS_TITLE'));
      this.renderToolGrid();
    });
  }

  public override destroy(): void {
    this.unsubLang?.();
    super.destroy();
  }

  public setHiddenTools(hidden: Set<string>): void {
    this.hiddenTools = hidden;
    this.renderToolGrid();
  }

  public override relayout(): void {
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    this.opts.width = Math.min(500, Math.max(340, sw - 24));
    this.opts.height = Math.min(460, sh - 30);
    super.relayout();
    this.renderToolGrid();
  }

  private renderToolGrid(): void {
    this.contentContainer.removeAll(true);

    const padX = 14;
    const padY = 10;
    const contentW = this.opts.width - padX * 2;
    const isSingleCol = contentW < 400;
    const cols = isSingleCol ? 2 : 2;
    const gap = 10;
    const btnW = Math.floor((contentW - (cols - 1) * gap) / cols);
    const btnH = 56;

    const tools = TOP_MENU_ICONS.filter((t) => !this.hiddenTools.has(t.key));

    tools.forEach((t, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = padX + col * (btnW + gap);
      const by = padY + row * (btnH + gap);

      const info = TOOL_DETAILS[t.key];

      // 1. Background Card
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x1a1e38, 0.95);
      bg.fillRoundedRect(bx, by, btnW, btnH, 8);
      bg.lineStyle(1.5, 0x2e355c, 0.9);
      bg.strokeRoundedRect(bx, by, btnW, btnH, 8);

      // 2. Icon Graphic lớn (34px)
      const iconGfx = this.scene.add.graphics();
      const iconCenterX = bx + 26;
      const iconCenterY = by + btnH / 2;
      this.drawToolIcon(iconGfx, t.key, iconCenterX, iconCenterY, 30);

      // 3. Title Text
      const titleTxt = mkText(this.scene, t.i18nKey ?? t.label, {
        fontSize: '13px',
        fontFamily: FONT.ui,
        fontStyle: 'bold',
        color: '#ffffff',
      }, bx + 50, by + 10)
        .setOrigin(0, 0);

      // 4. Subtitle / Desc
      const descTxt = mkText(this.scene, info?.descKey ?? '', {
        fontSize: '10px',
        fontFamily: FONT.ui,
        color: '#8c93b8',
      }, bx + 50, by + 30)
        .setOrigin(0, 0);

      // 5. Zone tương tác kích thước lớn
      const zone = this.scene.add
        .zone(bx + btnW / 2, by + btnH / 2, btnW, btnH)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(0x272c54, 1);
        bg.fillRoundedRect(bx, by, btnW, btnH, 8);
        bg.lineStyle(2, 0x00cec9, 1);
        bg.strokeRoundedRect(bx, by, btnW, btnH, 8);
        titleTxt.setColor('#81ecec');
      });

      zone.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(0x1a1e38, 0.95);
        bg.fillRoundedRect(bx, by, btnW, btnH, 8);
        bg.lineStyle(1.5, 0x2e355c, 0.9);
        bg.strokeRoundedRect(bx, by, btnW, btnH, 8);
        titleTxt.setColor('#ffffff');
      });

      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.close();
        this.toolOpts.onSelectTool(t.key);
      });

      this.contentContainer.add([bg, iconGfx, titleTxt, descTxt, zone]);
    });
  }

  private drawToolIcon(
    gfx: Phaser.GameObjects.Graphics,
    key: string,
    cx: number,
    cy: number,
    size: number,
  ): void {
    const p = Math.max(1.8, Math.floor(size / 13));

    switch (key) {
      case 'pokedex': {
        gfx.fillStyle(0xd63031, 1);
        gfx.fillRect(cx - 6 * p, cy - 7 * p, 12 * p, 14 * p);
        gfx.fillStyle(0x2d3436, 1);
        gfx.fillRect(cx - 7 * p, cy - 7 * p, 2 * p, 14 * p);
        gfx.fillStyle(0x00cec9, 1);
        gfx.fillRect(cx - 4 * p, cy - 5 * p, 4 * p, 4 * p);
        gfx.fillStyle(0xffffff, 0.9);
        gfx.fillRect(cx - 4 * p, cy + 1 * p, 8 * p, 4 * p);
        break;
      }
      case 'bag': {
        gfx.fillStyle(0xe67e22, 1);
        gfx.fillRect(cx - 6 * p, cy - 4 * p, 12 * p, 11 * p);
        gfx.fillStyle(0xf1c40f, 1);
        gfx.fillRect(cx - 6 * p, cy - 7 * p, 12 * p, 4 * p);
        gfx.fillStyle(0xd35400, 1);
        gfx.fillRect(cx - 3 * p, cy - 2 * p, 6 * p, 5 * p);
        gfx.fillStyle(0xecf0f1, 1);
        gfx.fillRect(cx - 2 * p, cy - 5 * p, 4 * p, 2 * p);
        break;
      }
      case 'team': {
        const r = 6 * p;
        gfx.fillStyle(0xe74c3c, 1);
        gfx.fillRect(cx - r, cy - r, r * 2, r);
        gfx.fillStyle(0xf5f6fa, 1);
        gfx.fillRect(cx - r, cy, r * 2, r);
        gfx.fillStyle(0x2f3640, 1);
        gfx.fillRect(cx - r, cy - 1 * p, r * 2, 2 * p);
        gfx.fillStyle(0x2f3640, 1);
        gfx.fillRect(cx - 3 * p, cy - 3 * p, 6 * p, 6 * p);
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(cx - 1 * p, cy - 1 * p, 2 * p, 2 * p);
        break;
      }
      case 'pc': {
        gfx.fillStyle(0xdfe6e9, 1);
        gfx.fillRect(cx - 6 * p, cy - 7 * p, 12 * p, 9 * p);
        gfx.fillStyle(0x00cec9, 1);
        gfx.fillRect(cx - 5 * p, cy - 6 * p, 10 * p, 7 * p);
        gfx.fillStyle(0xffffff, 0.8);
        gfx.fillRect(cx - 4 * p, cy - 5 * p, 3 * p, 2 * p);
        gfx.fillStyle(0xb2bec3, 1);
        gfx.fillRect(cx - 2 * p, cy + 2 * p, 4 * p, 2 * p);
        gfx.fillRect(cx - 5 * p, cy + 4 * p, 10 * p, 2 * p);
        break;
      }
      case 'map': {
        gfx.fillStyle(0xf5f6fa, 1);
        gfx.fillRect(cx - 7 * p, cy - 6 * p, 14 * p, 12 * p);
        gfx.fillStyle(0x7f8c8d, 1);
        gfx.fillRect(cx - 7 * p, cy - 7 * p, 14 * p, 2 * p);
        gfx.fillRect(cx - 7 * p, cy + 5 * p, 14 * p, 2 * p);
        gfx.fillStyle(0x27ae60, 1);
        gfx.fillRect(cx - 4 * p, cy - 4 * p, 4 * p, 4 * p);
        gfx.fillStyle(0x2980b9, 1);
        gfx.fillRect(cx + 1 * p, cy - 2 * p, 4 * p, 5 * p);
        gfx.fillStyle(0xe74c3c, 1);
        gfx.fillRect(cx - 1 * p, cy - 1 * p, 2 * p, 2 * p);
        break;
      }
      case 'gps': {
        gfx.fillStyle(0x27ae60, 1);
        gfx.fillRect(cx - 6 * p, cy - 6 * p, 12 * p, 12 * p);
        gfx.fillStyle(0x2ecc71, 0.85);
        gfx.fillRect(cx - 5 * p, cy - 5 * p, 10 * p, 10 * p);
        gfx.fillStyle(0xffffff, 0.7);
        gfx.fillRect(cx, cy - 5 * p, 1 * p, 10 * p);
        gfx.fillRect(cx - 5 * p, cy, 10 * p, 1 * p);
        gfx.fillStyle(0xe74c3c, 1);
        gfx.fillRect(cx - 2 * p, cy - 4 * p, 4 * p, 4 * p);
        gfx.fillRect(cx - 1 * p, cy - 2 * p, 2 * p, 3 * p);
        break;
      }
      case 'settings': {
        gfx.fillStyle(0x95a5a6, 1);
        gfx.fillRect(cx - 2 * p, cy - 7 * p, 4 * p, 14 * p);
        gfx.fillRect(cx - 7 * p, cy - 2 * p, 14 * p, 4 * p);
        gfx.fillRect(cx - 5 * p, cy - 5 * p, 10 * p, 10 * p);
        gfx.fillStyle(0x2c3e50, 1);
        gfx.fillRect(cx - 2 * p, cy - 2 * p, 4 * p, 4 * p);
        break;
      }
      case 'help': {
        gfx.fillStyle(0xf1c40f, 1);
        gfx.fillRect(cx - 6 * p, cy - 6 * p, 12 * p, 12 * p);
        gfx.fillStyle(0x2d3436, 1);
        gfx.fillRect(cx - 3 * p, cy - 4 * p, 6 * p, 2 * p);
        gfx.fillRect(cx + 1 * p, cy - 2 * p, 2 * p, 3 * p);
        gfx.fillRect(cx - 1 * p, cy, 2 * p, 2 * p);
        gfx.fillRect(cx - 1 * p, cy + 3 * p, 2 * p, 2 * p);
        break;
      }
      case 'debug': {
        gfx.fillStyle(0x2d3436, 1);
        gfx.fillRect(cx - 4 * p, cy - 4 * p, 8 * p, 9 * p);
        gfx.fillStyle(0x00cec9, 1);
        gfx.fillRect(cx - 3 * p, cy - 3 * p, 6 * p, 7 * p);
        gfx.fillStyle(0xff7675, 1);
        gfx.fillRect(cx - 3 * p, cy - 7 * p, 2 * p, 3 * p);
        gfx.fillRect(cx + 1 * p, cy - 7 * p, 2 * p, 3 * p);
        gfx.fillStyle(0x00cec9, 1);
        gfx.fillRect(cx - 6 * p, cy - 2 * p, 2 * p, 2 * p);
        gfx.fillRect(cx + 4 * p, cy - 2 * p, 2 * p, 2 * p);
        gfx.fillRect(cx - 6 * p, cy + 2 * p, 2 * p, 2 * p);
        gfx.fillRect(cx + 4 * p, cy + 2 * p, 2 * p, 2 * p);
        break;
      }
      case 'logout': {
        gfx.fillStyle(0x6c5ce7, 1);
        gfx.fillRect(cx - 6 * p, cy - 6 * p, 7 * p, 12 * p);
        gfx.fillStyle(0x00cec9, 1);
        gfx.fillRect(cx - 4 * p, cy - 1 * p, 2 * p, 2 * p);
        gfx.fillStyle(0xff7675, 1);
        gfx.fillRect(cx + 1 * p, cy - 2 * p, 5 * p, 4 * p);
        gfx.fillRect(cx + 3 * p, cy - 4 * p, 3 * p, 2 * p);
        gfx.fillRect(cx + 3 * p, cy + 2 * p, 3 * p, 2 * p);
        break;
      }
      default: {
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(cx - 4 * p, cy - 4 * p, 8 * p, 8 * p);
        break;
      }
    }
  }
}
