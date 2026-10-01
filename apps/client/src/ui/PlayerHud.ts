import Phaser from 'phaser';
import { C, FONT } from './theme';
import { drawPanel } from './PanelFrame';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

export interface PlayerHudData {
  name: string;
  /** Tiền trong game */
  money: number;
  /** Tiền thật (premium / vnd) */
  realMoney: number;
}

/** Kích thước panel. */
const PANEL_W = 260;
const PANEL_H = 92;
const PAD = 8;

/**
 * **PlayerHud** — bảng thông tin người chơi, góc trên-trái.
 *
 * Layout dạng bảng:
 * ```
 * ┌────┬──────────────────┐
 * │    │  Tên nhân vật     │  ← avatar chiếm cột trái
 * │ A  │  💰 Tiền game     │  ← cột phải, từ trên xuống
 * │ v  │  💎 Tiền thật     │
 * │ a  │                  │
 * └────┴──────────────────┘
 * ```
 *
 * - Avatar chiếm toàn bộ chiều cao bên trái.
 * - Bên phải theo hàng từ trên xuống: **tên nhân vật**, **tiền game**, **tiền thật**.
 * - Không có level / EXP — Pokémon không dùng EXP cho trainer (EXP thuộc về Pokémon).
 */
export class PlayerHud {
  private readonly scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private avatar: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private moneyText: Phaser.GameObjects.Text;
  private realMoneyText: Phaser.GameObjects.Text;
  private objs: Array<Phaser.GameObjects.Components.Visible & { destroy(): void }> = [];
  private _uiZoomManager?: UiZoomManager;
  private _hudMode: HudMode = 'normal';

  /** Kích thước panel hiện tại (đã nhân uiZoom, đã xét mini) — dùng để xếp HUD. */
  getSize(): { w: number; h: number } {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this._hudMode === 'mini';
    const w = (isMini ? 172 : PANEL_W) * z;
    const h = (isMini ? 54 : PANEL_H) * z;
    return { w, h };
  }

  /** Đặt lại chế độ hiển thị (normal/mini/hidden) — gọi từ HudManager. */
  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    this.relayout();
  }

  private _avatarFrameSize = 32;

  constructor(scene: Phaser.Scene, sheetKey: string, frame: string | number = 0, frameSize = 32) {
    this.scene = scene;
    this._avatarFrameSize = frameSize;

    this.graphics = drawPanel(scene, 0, 0, 0, 0, 100);
    this.objs.push(this.graphics);

    this.avatar = scene.add
      .image(0, 0, sheetKey, frame)
      .setOrigin(0.5, 0.5)
      .setDepth(101)
      .setScrollFactor(0);
    this.objs.push(this.avatar);

    this.nameText = scene.add
      .text(0, 0, 'Trainer', { fontSize: '14px', fontFamily: FONT.ui, color: C.text })
      .setOrigin(0, 0)
      .setDepth(101)
      .setScrollFactor(0);
    this.objs.push(this.nameText);

    this.moneyText = scene.add
      .text(0, 0, '$ 0', { fontSize: '13px', fontFamily: FONT.mono, color: '#00cec9' })
      .setOrigin(0, 0)
      .setDepth(101)
      .setScrollFactor(0);
    this.objs.push(this.moneyText);

    this.realMoneyText = scene.add
      .text(0, 0, '₿ 0', { fontSize: '13px', fontFamily: FONT.mono, color: '#fdcb6e' })
      .setOrigin(0, 0)
      .setDepth(101)
      .setScrollFactor(0);
    this.objs.push(this.realMoneyText);

    this.update({ name: 'Trainer', money: 5000, realMoney: 0 });
    this.relayout();
    scene.scale.on('resize', () => this.relayout());
  }

  /** Đổi avatar nhân vật hiển thị trên Player Info. */
  setAvatar(sheetKey: string, frame: string | number = 0, frameSize = 64): void {
    if (!this.scene.textures.exists(sheetKey)) return;
    this._avatarFrameSize = frameSize;
    this.avatar.setTexture(sheetKey, frame);
    this.relayout();
  }

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => this.relayout());
  }

  private relayout(): void {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this._hudMode === 'mini';
    const P = (isMini ? 6 : PAD) * z;
    const w = (isMini ? 172 : PANEL_W) * z;
    const h = (isMini ? 54 : PANEL_H) * z;
    const x = P;
    const y = P;

    // Khung nền
    this.graphics.clear();
    this.graphics.fillStyle(0x000000, 0.25);
    this.graphics.fillRoundedRect(x + 3, y + 3, w, h, 4);
    this.graphics.fillStyle(C.panel, 0.94);
    this.graphics.fillRoundedRect(x, y, w, h, 4);
    this.graphics.lineStyle(1, C.border, 0.95);
    this.graphics.strokeRoundedRect(x, y, w, h, 4);

    // Avatar: chiếm trọng cột trái
    const avatarSize = h - (isMini ? 8 : 12) * z;
    this.avatar
      .setPosition(x + avatarSize / 2 + (isMini ? 4 : 6) * z, y + h / 2)
      .setScale(avatarSize / (this._avatarFrameSize || 32));

    // Cột phải: tên → tiền game → tiền thật (từ trên xuống)
    const colX = x + avatarSize + (isMini ? 10 : 16) * z;
    if (isMini) {
      this.nameText.setPosition(colX, y + 9 * z).setFontSize(12 * z);
      this.moneyText.setPosition(colX, y + 28 * z).setFontSize(11 * z);
    } else {
      this.nameText.setPosition(colX, y + 14 * z).setFontSize(14 * z);
      this.moneyText.setPosition(colX, y + 40 * z).setFontSize(13 * z);
    }
    this.realMoneyText.setPosition(colX, y + 64 * z).setFontSize(13 * z);
    // Mini: ẩn tiền thật để panel gọn hơn.
    this.realMoneyText.setVisible(!isMini);
  }

  update(d: Partial<PlayerHudData>): void {
    if (d.name !== undefined) this.nameText.setText(d.name);
    if (d.money !== undefined) this.moneyText.setText(`$ ${d.money.toLocaleString()}`);
    if (d.realMoney !== undefined) this.realMoneyText.setText(`₿ ${d.realMoney.toLocaleString()}`);
  }

  setVisible(v: boolean): void {
    this.objs.forEach((o) => o.setVisible(v));
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return this.objs as unknown as Phaser.GameObjects.GameObject[];
  }

  destroy(): void {
    this.objs.forEach((o) => (o as unknown as { destroy(): void }).destroy());
    this.objs = [];
  }
}
