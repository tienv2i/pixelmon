import Phaser from 'phaser';
import { C, FONT } from './theme';
import { drawPanel, panelTitle } from './PanelFrame';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const SLOT = 40;
const SLOT_GAP = 6;
const PARTY_COUNT = 6;
const PANEL_W = 132;
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
 * ```
 * ┌─────────┐
 * │ PARTY   │
 * │ ┌─────┐ │  ← 6 ô xếp chồng dọc
 * │ │  ●  │ │
 * │ ├─────┤ │
 * │ │  ●  │ │
 * │ ├─────┤ │
 * │ │  +  │ │  ← ô trống
 * │ └─────┘ │
 * └─────────┘
 * ```
 *
 * Mỗi ô: icon Pokémon (tròn placeholder) + HP bar. Không có level/EXP.
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

  /** Kích thước panel hiện tại (đã nhân uiZoom, đã xét mini) — dùng để xếp HUD. */
  getSize(): { w: number; h: number } {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const headerH = this._hudMode === 'mini' ? 0 : 24;
    const slot = this._hudMode === 'mini' ? SLOT * 0.7 : SLOT;
    const gap = this._hudMode === 'mini' ? SLOT_GAP * 0.7 : SLOT_GAP;
    return {
      w: PANEL_W * z,
      h: (headerH + PARTY_COUNT * slot + (PARTY_COUNT - 1) * gap + PAD) * z,
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
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const headerH = 24;
    return (headerH + PARTY_COUNT * SLOT + (PARTY_COUNT - 1) * SLOT_GAP + PAD) * z;
  }

  /** Ép vẽ lại với `anchorY` hiện tại. */
  relayoutPublic(): void {
    this.relayout();
  }

  private relayout(): void {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];

    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this._hudMode === 'mini';
    const headerH = isMini ? 0 : 24;
    const slotSize = (isMini ? SLOT * 0.7 : SLOT) * z;
    const gap = (isMini ? SLOT_GAP * 0.7 : SLOT_GAP) * z;
    const { w, h } = this.getSize();
    const x = PAD * z;
    const y = this.anchorY;

    this.track(drawPanel(this.scene, x, y, w, h, 100));
    if (!isMini) this.track(panelTitle(this.scene, x + 8 * z, y + 6 * z, 'PARTY', 101));

    for (let i = 0; i < PARTY_COUNT; i++) {
      const sx = x + 14 * z;
      const sy = y + headerH * z + i * (slotSize + gap);
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

  private drawSlot(
    x: number,
    y: number,
    i: number,
    size: number,
    z: number,
    _gap?: number,
  ): void {
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