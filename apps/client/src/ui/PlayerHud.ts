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

/** Kích thước panel chuẩn và mini. */
const PANEL_W = 210;
const PANEL_H = 72;
const MINI_W = 146;
const MINI_H = 36;
const PAD = 6;

/**
 * **PlayerHud** — bảng thông tin người chơi, góc trên-trái.
 *
 * Hỗ trợ 2 chế độ:
 * - **Normal**: Bảng chi tiết gọn gàng (Avatar + Tên + Tiền game + Tiền thật).
 * - **Mini (Profile Mini)**: Dạng viên thuốc tối giản (Avatar 28px + Tên + Tiền game), cao chỉ 36px.
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
    const w = (isMini ? MINI_W : PANEL_W) * z;
    const h = (isMini ? MINI_H : PANEL_H) * z;
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
      .text(0, 0, 'Trainer', { fontSize: '13px', fontFamily: FONT.ui, color: C.text })
      .setOrigin(0, 0)
      .setDepth(101)
      .setScrollFactor(0);
    this.objs.push(this.nameText);

    this.moneyText = scene.add
      .text(0, 0, '$ 0', { fontSize: '12px', fontFamily: FONT.mono, color: '#00cec9' })
      .setOrigin(0, 0)
      .setDepth(101)
      .setScrollFactor(0);
    this.objs.push(this.moneyText);

    this.realMoneyText = scene.add
      .text(0, 0, '₿ 0', { fontSize: '11px', fontFamily: FONT.mono, color: '#fdcb6e' })
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
    const P = (isMini ? 4 : PAD) * z;
    const w = (isMini ? MINI_W : PANEL_W) * z;
    const h = (isMini ? MINI_H : PANEL_H) * z;
    const x = P;
    const y = P;

    // Khung nền panel
    this.graphics.clear();
    this.graphics.fillStyle(0x000000, 0.28);
    this.graphics.fillRoundedRect(x + 2, y + 2, w, h, isMini ? 6 : 4);
    this.graphics.fillStyle(C.panel, 0.94);
    this.graphics.fillRoundedRect(x, y, w, h, isMini ? 6 : 4);
    this.graphics.lineStyle(1, C.border, 0.95);
    this.graphics.strokeRoundedRect(x, y, w, h, isMini ? 6 : 4);

    if (isMini) {
      // Profile Mini (Dạng Pill): Avatar 28px + Tên Trainer + Tiền game
      const avatarSize = h - 6 * z;
      this.avatar
        .setPosition(x + avatarSize / 2 + 4 * z, y + h / 2)
        .setScale(avatarSize / (this._avatarFrameSize || 32));

      const colX = x + avatarSize + 8 * z;
      this.nameText
        .setPosition(colX, y + 4 * z)
        .setFontSize(Math.max(10, Math.round(11 * z)));
      this.moneyText
        .setPosition(colX, y + 18 * z)
        .setFontSize(Math.max(9, Math.round(10 * z)));

      this.realMoneyText.setVisible(false);
    } else {
      // Chế độ Normal gọn gàng
      const avatarSize = h - 10 * z;
      this.avatar
        .setPosition(x + avatarSize / 2 + 6 * z, y + h / 2)
        .setScale(avatarSize / (this._avatarFrameSize || 32));

      const colX = x + avatarSize + 12 * z;
      this.nameText
        .setPosition(colX, y + 8 * z)
        .setFontSize(Math.max(11, Math.round(13 * z)));
      this.moneyText
        .setPosition(colX, y + 28 * z)
        .setFontSize(Math.max(10, Math.round(12 * z)));
      this.realMoneyText
        .setPosition(colX, y + 48 * z)
        .setFontSize(Math.max(10, Math.round(11 * z)))
        .setVisible(true);
    }
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
