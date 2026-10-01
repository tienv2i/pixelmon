import Phaser from 'phaser';
import { C, FONT } from './theme';
import { drawPanel } from './PanelFrame';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const SLOT = 40;
const SLOT_GAP = 6;
const PARTY_COUNT = 6;
const INNER_PAD = 6;
const PANEL_W = SLOT + INNER_PAD * 2; // 52px — ôm sát avatar pokemon, không còn dư padding phải
const PAD = 8;

export interface PartyMember {
  name: string;
  hp: number;
  maxHp: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';
}

const RARITY_COLORS: Record<PartyMember['rarity'], number> = {
  common: C.border,
  uncommon: C.ok,
  rare: C.accent,
  legendary: C.warn,
  mythical: C.err,
};

const EMPTY_BG = 0x262a4d;

/**
 * **PartyStrip** — khung party **dọc bên trái**, đặt ngay **dưới PlayerHud**.
 *
 * Chỉ hiển thị avatar Pokémon xếp dọc (căn giữa vừa vặn, không dư khoảng trống).
 */
export class PartyStrip {
  private readonly scene: Phaser.Scene;
  private members: Array<PartyMember | null>;
  private objs: Array<Phaser.GameObjects.Components.Visible & { destroy(): void }> = [];
  private _uiZoomManager?: UiZoomManager;
  private _hudMode: HudMode = 'normal';

  /** Y neo — WorldScene gán bằng cách set trực tiếp. */
  anchorY = 8;

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => this.relayout());
  }

  private isMiniMode(): boolean {
    return (
      this._hudMode === 'mini' ||
      this.scene.scale.height < 500 ||
      this.scene.scale.width < 560
    );
  }

  /** Kích thước panel hiện tại (đã nhân uiZoom, đã xét mini) — dùng để xếp HUD. */
  getSize(): { w: number; h: number } {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this.isMiniMode();
    const headerH = isMini ? 0 : 20;
    const slot = isMini ? 26 : SLOT;
    const gap = isMini ? 4 : SLOT_GAP;
    const pad = isMini ? 4 : INNER_PAD;
    return {
      w: (slot + pad * 2) * z,
      h: (headerH + pad * 2 + PARTY_COUNT * slot + (PARTY_COUNT - 1) * gap) * z,
    };
  }

  /** Đặt lại chế độ hiển thị (normal/mini/hidden) — gọi từ HudManager. */
  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    this.relayout();
  }

  constructor(scene: Phaser.Scene, members: Array<PartyMember | null>) {
    this.scene = scene;
    this.members = members;
    this.relayout();
    scene.scale.on('resize', () => this.relayout());
  }

  /** Chiều cao khung party theo zoom — WorldScene dùng để tính y. */
  getPanelHeight(): number {
    return this.getSize().h;
  }

  /** Ép vẽ lại với `anchorY` hiện tại. */
  relayoutPublic(): void {
    this.relayout();
  }

  private relayout(): void {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];

    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this.isMiniMode();
    const headerH = isMini ? 0 : 20;
    const slotSize = (isMini ? 26 : SLOT) * z;
    const gap = (isMini ? 4 : SLOT_GAP) * z;
    const pad = (isMini ? 4 : INNER_PAD) * z;
    const { w, h } = this.getSize();
    const x = PAD * z;
    const y = this.anchorY;

    this.track(drawPanel(this.scene, x, y, w, h, 100));
    if (!isMini) {
      this.track(
        this.scene.add
          .text(x + w / 2, y + 4 * z, 'PARTY', {
            fontSize: `${Math.max(9, Math.round(10 * z))}px`,
            fontFamily: FONT.mono,
            color: C.muted,
          })
          .setOrigin(0.5, 0)
          .setDepth(101)
          .setScrollFactor(0),
      );
    }

    const startY = y + (headerH ? (headerH + (isMini ? 4 : INNER_PAD)) * z : pad);
    const sx = x + (w - slotSize) / 2;

    for (let i = 0; i < PARTY_COUNT; i++) {
      const sy = startY + i * (slotSize + gap);
      this.drawSlot(sx, sy, i, slotSize, z, gap);
    }
  }

  private track<T extends Phaser.GameObjects.Components.Visible & { destroy(): void }>(o: T): T {
    this.objs.push(o);
    if (o instanceof Phaser.GameObjects.Graphics || o instanceof Phaser.GameObjects.Text) {
      o.setScrollFactor(0);
    }
    return o;
  }

  private drawSlot(x: number, y: number, i: number, size: number, z: number, _gap?: number): void {
    const m = this.members[i];
    const g = this.scene.add.graphics().setDepth(101).setScrollFactor(0);
    this.track(g);

    // Nền ô
    g.fillStyle(m ? 0x2f3358 : EMPTY_BG, 1);
    g.fillRoundedRect(x, y, size, size, 4);
    g.lineStyle(2, m ? RARITY_COLORS[m.rarity] : C.border, m ? 1 : 0.5);
    g.strokeRoundedRect(x, y, size, size, 4);

    if (!m) {
      // ô trống — dấu +
      this.track(
        this.scene.add
          .text(x + size / 2, y + size / 2, '+', {
            fontSize: `${Math.round(18 * z)}px`,
            fontFamily: FONT.mono,
            color: C.muted,
          })
          .setOrigin(0.5)
          .setDepth(102),
      );
      return;
    }

    // icon tròn placeholder
    this.track(
      this.scene.add
        .text(x + size / 2, y + size / 2 - 3 * z, '●', {
          fontSize: `${Math.round(20 * z)}px`,
          fontFamily: FONT.mono,
          color: '#00cec9',
        })
        .setOrigin(0.5)
        .setDepth(102),
    );

    // HP bar dưới đáy ô
    const barW = size - 8 * z;
    const barH = 3 * z;
    const hb = this.scene.add.graphics().setDepth(102).setScrollFactor(0);
    this.track(hb);
    hb.fillStyle(C.border, 1).fillRoundedRect(x + 4 * z, y + size - 6 * z, barW, barH, barH / 2);
    const ratio = m.maxHp ? Phaser.Math.Clamp(m.hp / m.maxHp, 0, 1) : 0;
    hb.fillStyle(ratio > 0.5 ? C.ok : ratio > 0.2 ? C.warn : C.err, 1);
    hb.fillRoundedRect(x + 4 * z, y + size - 6 * z, barW * ratio, barH, barH / 2);
  }

  setVisible(v: boolean): void {
    this.objs.forEach((o) => o.setVisible(v));
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return this.objs as unknown as Phaser.GameObjects.GameObject[];
  }

  destroy(): void {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
  }
}
