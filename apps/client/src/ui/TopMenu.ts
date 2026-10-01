import Phaser from 'phaser';
import { C, FONT } from './theme';

/**
 * Icon nhỏ dùng trong dãy menu top-center.
 * 28×28 px, bo góc 6px, nền tối trong suốt.
 * Hover → viền sáng cyan. Active (đang bật) → nền cyan đậm.
 */
const ICON_SIZE = 28;
const GAP = 6;

export interface MenuIconDef {
  /** Key định danh, ví dụ 'gps' */
  key: string;
  /** Glyph hiển thị */
  glyph: string;
  /** Tooltip khi hover */
  label: string;
}

class IconButton {
  readonly gfx: Phaser.GameObjects.Graphics;
  readonly glyph: Phaser.GameObjects.Text;
  readonly zone: Phaser.GameObjects.Zone;
  private hover = false;
  private active = false;
  private currentSize = ICON_SIZE;

  constructor(
    private scene: Phaser.Scene,
    private def: MenuIconDef,
    private onClick: (key: string) => void,
    private onHover: ((label: string | null) => void) | null,
  ) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(140);
    this.glyph = scene.add
      .text(0, 0, def.glyph, { fontSize: '14px', fontFamily: FONT.ui, color: '#e8eaf6' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(141);

    this.zone = scene.add
      .zone(0, 0, ICON_SIZE, ICON_SIZE)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(142);

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.onClick(this.def.key);
    });
    this.zone.on('pointerover', () => {
      this.hover = true;
      this.onHover?.(this.def.label);
      this.draw();
    });
    this.zone.on('pointerout', () => {
      this.hover = false;
      this.onHover?.(null);
      this.draw();
    });

    this.draw();
  }

  setPosition(x: number, y: number, size = ICON_SIZE): void {
    this.currentSize = size;
    this.gfx.setPosition(x, y);
    this.glyph
      .setPosition(x + size / 2, y + size / 2)
      .setFontSize(Math.max(11, Math.round(size * 0.5)));

    // Touch padding: trên màn hình cảm ứng, mở rộng hit area tối thiểu 36px
    const touchSize = Math.max(36, size + 8);
    this.zone.setSize(touchSize, touchSize);
    this.zone.setPosition(x + size / 2, y + size / 2);

    this.draw();
  }

  setActive(v: boolean): void {
    if (this.active === v) return;
    this.active = v;
    this.draw();
  }

  setVisible(v: boolean): void {
    this.gfx.setVisible(v);
    this.glyph.setVisible(v);
    this.zone.setVisible(v);
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.glyph, this.zone];
  }

  destroy(): void {
    this.gfx.destroy();
    this.glyph.destroy();
    this.zone.destroy();
  }

  private draw(): void {
    const s = this.currentSize;
    this.gfx.clear();
    // nền
    if (this.active) {
      this.gfx.fillStyle(0x00cec9, 0.28);
    } else if (this.hover) {
      this.gfx.fillStyle(C.panel, 0.95);
    } else {
      this.gfx.fillStyle(C.panel, 0.7);
    }
    this.gfx.fillRoundedRect(0, 0, s, s, 6);
    // viền
    if (this.hover || this.active) {
      this.gfx.lineStyle(1, C.accent, 1);
    } else {
      this.gfx.lineStyle(1, C.border, 0.7);
    }
    this.gfx.strokeRoundedRect(0, 0, s, s, 6);
  }
}

const ICONS: MenuIconDef[] = [
  { key: 'pokedex', glyph: '📖', label: 'Pokédex' },
  { key: 'bag', glyph: '🎒', label: 'Túi đồ' },
  { key: 'team', glyph: '👥', label: 'Đội hình' },
  { key: 'map', glyph: '🗺', label: 'Bản đồ' },
  { key: 'gps', glyph: '📍', label: 'GPS / Minimap' },
  { key: 'settings', glyph: '⚙', label: 'Cài đặt' },
  { key: 'help', glyph: '?', label: 'Hướng dẫn' },
  { key: 'logout', glyph: '🚪', label: 'Đăng xuất' },
];

/**
 * **TopMenu** — thanh công cụ menu phía trên.
 *
 * Hỗ trợ 2 chế độ:
 * - **Normal**: Dãy icon dàn ngang tinh gọn.
 * - **Mini (Tối giản)**: Thu gọn thành 1 nút toggle (☰). Khi click sẽ bật mở
 *   một mini toolbar panel dạng popup chứa toàn bộ các icon chức năng.
 */
export class TopMenu {
  private buttons: IconButton[] = [];
  private toggleButton: IconButton;
  private miniPanelGfx: Phaser.GameObjects.Graphics;
  private hint?: Phaser.GameObjects.Text;
  private hoverLabel: string | null = null;
  private leftBoundFn?: () => number;
  private rightBoundFn?: () => number;
  private isMini = false;
  private isPopupOpen = false;

  constructor(
    private scene: Phaser.Scene,
    private onIcon: (key: string) => void,
  ) {
    // Khung nền cho toolbar panel mini popup
    this.miniPanelGfx = scene.add.graphics().setScrollFactor(0).setDepth(138).setVisible(false);

    // Nút toggle mở toolbar ở giao diện mini
    this.toggleButton = new IconButton(
      scene,
      { key: 'toolbar-toggle', glyph: '☰', label: 'Menu chức năng' },
      () => this.toggleMiniPopup(),
      (lbl) => {
        this.hoverLabel = lbl;
        this.updateHint();
      },
    );

    ICONS.forEach((def) => {
      const b = new IconButton(scene, def, (key) => {
        this.onIcon(key);
        if (this.isMini && this.isPopupOpen) {
          this.toggleMiniPopup(false);
        }
      }, (label) => {
        this.hoverLabel = label;
        this.updateHint();
      });
      this.buttons.push(b);
    });

    // Tooltip hiện dưới icon khi hover
    this.hint = scene.add
      .text(0, 0, '', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: '#e8eaf6',
        backgroundColor: '#0f1020dd',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setDepth(142)
      .setScrollFactor(0)
      .setVisible(false);

    this.relayout();
    this.updateHint();
    scene.scale.on('resize', () => this.relayout());
  }

  setHudMode(mode: 'normal' | 'mini'): void {
    const mini = mode === 'mini';
    if (this.isMini === mini) return;
    this.isMini = mini;
    if (!mini) {
      this.isPopupOpen = false;
    }
    this.relayout();
  }

  toggleMiniPopup(force?: boolean): void {
    this.isPopupOpen = force !== undefined ? force : !this.isPopupOpen;
    this.toggleButton.setActive(this.isPopupOpen);
    this.relayout();
  }

  /**
   * Cung cấp ranh giới trái/phải từ WorldScene để tự động tránh va chạm.
   */
  setBoundsConstraints(leftBound: () => number, rightBound: () => number): void {
    this.leftBoundFn = leftBound;
    this.rightBoundFn = rightBound;
    this.relayout();
  }

  setActive(key: string): void {
    this.buttons.forEach((b, i) => b.setActive(ICONS[i].key === key));
  }

  setVisible(v: boolean): void {
    if (!v) {
      this.toggleButton.setVisible(false);
      this.buttons.forEach((b) => b.setVisible(false));
      this.miniPanelGfx.setVisible(false);
      this.hint?.setVisible(false);
      return;
    }
    this.relayout();
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [this.miniPanelGfx, ...this.toggleButton.getGameObjects()];
    this.buttons.forEach((b) => objs.push(...b.getGameObjects()));
    if (this.hint) objs.push(this.hint);
    return objs;
  }

  destroy(): void {
    this.miniPanelGfx.destroy();
    this.toggleButton.destroy();
    this.buttons.forEach((b) => b.destroy());
    this.hint?.destroy();
  }

  private updateHint(): void {
    if (!this.hint) return;
    if (!this.hoverLabel) {
      this.hint.setVisible(false);
      return;
    }
    this.hint.setText(this.hoverLabel).setVisible(true);
    this.relayout();
  }

  relayout(): void {
    const W = this.scene.scale.width;
    const isSmall = this.isMini || W < 640;

    if (isSmall) {
      // ── CHẾ ĐỘ MINI (TỐI GIẢN): Chỉ hiện 1 nút Toggle ──
      const btnSize = 28;
      const x0 = Math.floor(W / 2 - btnSize / 2);
      const y0 = 6;

      this.toggleButton.setVisible(true);
      this.toggleButton.setPosition(x0, y0, btnSize);

      if (this.isPopupOpen) {
        // Bung ra Toolbar Panel Mini
        const iconSize = 26;
        const gap = 6;
        const pad = 8;
        const totalW = ICONS.length * iconSize + (ICONS.length - 1) * gap;
        const panelW = totalW + pad * 2;
        const panelH = iconSize + pad * 2;
        const px = Math.max(8, Math.min(W - panelW - 8, Math.floor((W - panelW) / 2)));
        const py = y0 + btnSize + 8;

        this.miniPanelGfx.clear();
        this.miniPanelGfx.setVisible(true);
        // Shadow
        this.miniPanelGfx.fillStyle(0x000000, 0.45);
        this.miniPanelGfx.fillRoundedRect(px + 3, py + 3, panelW, panelH, 6);
        // Background
        this.miniPanelGfx.fillStyle(C.panel, 0.98);
        this.miniPanelGfx.fillRoundedRect(px, py, panelW, panelH, 6);
        // Border
        this.miniPanelGfx.lineStyle(1, C.accent, 0.95);
        this.miniPanelGfx.strokeRoundedRect(px, py, panelW, panelH, 6);

        this.buttons.forEach((b, i) => {
          b.setVisible(true);
          b.setPosition(px + pad + i * (iconSize + gap), py + pad, iconSize);
        });

        if (this.hint && this.hint.visible) {
          this.hint.setPosition(px + panelW / 2, py + panelH + 4);
        }
      } else {
        this.miniPanelGfx.setVisible(false);
        this.buttons.forEach((b) => b.setVisible(false));
      }
    } else {
      // ── CHẾ ĐỘ NORMAL: Dàn ngang toàn bộ icon ──
      this.toggleButton.setVisible(false);
      this.miniPanelGfx.setVisible(false);

      const iconSize = ICON_SIZE;
      const gap = GAP;
      const totalW = ICONS.length * iconSize + (ICONS.length - 1) * gap;

      const leftLimit = this.leftBoundFn ? this.leftBoundFn() + 8 : 180;
      const rightLimit = this.rightBoundFn ? this.rightBoundFn() - 8 : W - 90;
      const availW = rightLimit - leftLimit;

      const x0 = availW >= totalW
        ? Math.floor(leftLimit + (availW - totalW) / 2)
        : Math.max(12, Math.floor((W - totalW) / 2));
      const y0 = 6;

      this.buttons.forEach((b, i) => {
        b.setVisible(true);
        b.setPosition(x0 + i * (iconSize + gap), y0, iconSize);
      });

      if (this.hint && this.hint.visible) {
        this.hint.setPosition(x0 + totalW / 2, y0 + iconSize + 4);
      }
    }
  }
}

export { ICONS as TOP_MENU_ICONS };
