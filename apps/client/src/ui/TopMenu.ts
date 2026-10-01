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
      .setOrigin(0, 0)
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

  setPosition(x: number, y: number): void {
    this.gfx.setPosition(x, y);
    this.glyph.setPosition(x + ICON_SIZE / 2, y + ICON_SIZE / 2);
    this.zone.setPosition(x, y);
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
    const s = ICON_SIZE;
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
 * Icon nhỏ 28×28, bo góc, hover đổi viền, active đổi nền.
 * Icon `gps` toggle minimap; các icon khác hiện là nút bấm (chưa cần popup).
 */
export class TopMenu {
  private buttons: IconButton[] = [];
  private hint?: Phaser.GameObjects.Text;
  private hoverLabel: string | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onIcon: (key: string) => void,
  ) {
    // Khối dải icon, neo giữa trên cạnh trên
    const totalW = ICONS.length * ICON_SIZE + (ICONS.length - 1) * GAP;
    const x0 = Math.floor((scene.scale.width - totalW) / 2);
    const y0 = 8;

    ICONS.forEach((def, i) => {
      const b = new IconButton(scene, def, onIcon, (label) => {
        this.hoverLabel = label;
        this.updateHint();
      });
      b.setPosition(x0 + i * (ICON_SIZE + GAP), y0);
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

    this.updateHint();
    scene.scale.on('resize', () => this.relayout());
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

  private relayout(): void {
    const totalW = ICONS.length * ICON_SIZE + (ICONS.length - 1) * GAP;
    const x0 = Math.floor((this.scene.scale.width - totalW) / 2);
    const y0 = 8;

    this.buttons.forEach((b, i) => {
      b.setPosition(x0 + i * (ICON_SIZE + GAP), y0);
    });

    if (this.hint && this.hint.visible) {
      this.hint.setPosition(this.scene.scale.width / 2, y0 + ICON_SIZE + 4);
    }
  }
}

export { ICONS as TOP_MENU_ICONS };
