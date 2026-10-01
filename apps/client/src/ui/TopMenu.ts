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
  { key: 'map', glyph: '🗺', label: 'Bản đồ' },
  { key: 'gps', glyph: '📍', label: 'GPS / Minimap' },
  { key: 'team', glyph: '👥', label: 'Đội Pokémon' },
  { key: 'settings', glyph: '⚙', label: 'Cài đặt' },
  { key: 'help', glyph: '?', label: 'Hướng dẫn' },
  { key: 'menu', glyph: '☰', label: 'Menu' },
];

/**
 * **TopMenu** — dãy icon nhỏ neo giữa cạnh trên màn hình.
 *
 * Tự động chuyển xuống hàng thứ 2 khi chiều rộng hẹp để tránh
 * đè lên PlayerHud và InfoPanel.
 */
export class TopMenu {
  private buttons: IconButton[] = [];
  private hint?: Phaser.GameObjects.Text;
  private hoverLabel: string | null = null;
  private leftBoundFn?: () => number;
  private rightBoundFn?: () => number;

  constructor(
    private scene: Phaser.Scene,
    private onIcon: (key: string) => void,
  ) {
    ICONS.forEach((def) => {
      const b = new IconButton(scene, def, onIcon, (label) => {
        this.hoverLabel = label;
        this.updateHint();
      });
      this.buttons.push(b);
    });

    // Tooltip hiện dưới dãy icon khi hover
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
    this.buttons.forEach((b) => b.setVisible(v));
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [];
    this.buttons.forEach((b) => objs.push(...b.getGameObjects()));
    if (this.hint) objs.push(this.hint);
    return objs;
  }

  destroy(): void {
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
    const isSmall = W < 640;
    const iconSize = isSmall ? 24 : ICON_SIZE;
    const gap = isSmall ? 4 : GAP;

    const totalW = ICONS.length * iconSize + (ICONS.length - 1) * gap;

    // Ranh giới an toàn của hàng trên
    const leftLimit = this.leftBoundFn ? this.leftBoundFn() + 8 : 180;
    const rightLimit = this.rightBoundFn ? this.rightBoundFn() - 8 : W - 90;
    const availW = rightLimit - leftLimit;

    let x0: number;
    let y0: number;

    if (availW >= totalW) {
      // Đủ chỗ ở hàng 1: căn giữa khoảng trống giữa PlayerHud và InfoPanel
      x0 = Math.floor(leftLimit + (availW - totalW) / 2);
      y0 = isSmall ? 6 : 8;
    } else {
      // Không đủ chỗ ở hàng 1: chuyển xuống hàng 2 (dưới PlayerHud/InfoPanel)
      // Căn dạt sang phải của PartyStrip hoặc căn giữa
      const leftPad = this.leftBoundFn ? 62 : 12;
      x0 = Math.max(leftPad, Math.floor((W - totalW) / 2));
      y0 = isSmall ? 64 : 100;
    }

    this.buttons.forEach((b, i) => {
      b.setPosition(x0 + i * (iconSize + gap), y0, iconSize);
    });

    if (this.hint && this.hint.visible) {
      this.hint.setPosition(x0 + totalW / 2, y0 + iconSize + 4);
    }
  }
}

export { ICONS as TOP_MENU_ICONS };
