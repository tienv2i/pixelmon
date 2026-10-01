import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

export interface PlayerHudData {
  name: string;
  /** Tiền trong game */
  money: number;
  /** Tiền thật (premium / vnd) */
  realMoney: number;
}

const PANEL_W = 168;
const PANEL_H = 56;

/**
 * **PlayerHud** — Bảng thông tin người chơi (UserInfo):
 * - Kế thừa từ `UiModal`: chuẩn hoá khung giao diện pixel thống nhất.
 * - Chế độ neo (`docked: true`) cố định ở góc trên-trái màn hình.
 * - Không có thanh tiêu đề (`showTitleBar: false`), gắn cứng và không thể drag.
 */
export class PlayerHud extends UiModal {
  private avatar: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private moneyText: Phaser.GameObjects.Text;
  private realMoneyText: Phaser.GameObjects.Text;
  private _avatarFrameSize = 32;
  private _hudMode: HudMode = 'normal';

  constructor(scene: Phaser.Scene, sheetKey: string, frame: string | number = 0, frameSize = 32) {
    super(scene, {
      title: '👤 NHÂN VẬT',
      width: PANEL_W,
      height: PANEL_H,
      showTitleBar: false,
      docked: true,
      lockUi: false,
      depth: 100,
      showClose: false,
      showMinimize: false,
      showDock: false,
      defaultAlign: 'top-left',
      defaultOffsetX: 8,
      defaultOffsetY: 8,
      onClose: () => {
        this.setVisible(false);
      },
    });

    this._avatarFrameSize = frameSize;

    // 1. Avatar (local space trong contentContainer)
    this.avatar = scene.add
      .image(22, 28, sheetKey, frame)
      .setOrigin(0.5, 0.5);
    this.contentContainer.add(this.avatar);

    // 2. Name Text
    this.nameText = scene.add
      .text(48, 6, 'Trainer', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: C.text,
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.nameText);

    // 3. Money Text
    this.moneyText = scene.add
      .text(48, 22, '$ 0', {
        fontSize: '10px',
        fontFamily: FONT.mono,
        color: '#00cec9',
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.moneyText);

    // 4. Real Money Text
    this.realMoneyText = scene.add
      .text(48, 38, '₿ 0', {
        fontSize: '10px',
        fontFamily: FONT.mono,
        color: '#fdcb6e',
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.realMoneyText);

    this.update({ name: 'Trainer', money: 5000, realMoney: 0 });
    this.show();
  }

  /** Kích thước panel hiện tại (đã tính scale). */
  getSize(): { w: number; h: number } {
    return this.getActualSize();
  }

  /** Đặt lại chế độ hiển thị (normal/mini/hidden) — gọi từ HudManager. */
  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    if (mode === 'mini') {
      this.minimize();
    } else if (mode === 'normal') {
      this.expand();
    }
  }

  /** Đổi avatar nhân vật hiển thị trên Player Info. */
  setAvatar(sheetKey: string, frame: string | number = 0, frameSize = 64): void {
    if (!this.scene.textures.exists(sheetKey)) return;
    this._avatarFrameSize = frameSize;
    this.avatar.setTexture(sheetKey, frame);
  }

  update(d: Partial<PlayerHudData>): void {
    if (d.name !== undefined) {
      this.nameText.setText(d.name);
      this.setTitle(`👤 ${d.name}`);
    }
    if (d.money !== undefined) this.moneyText.setText(`$ ${d.money.toLocaleString()}`);
    if (d.realMoney !== undefined) this.realMoneyText.setText(`₿ ${d.realMoney.toLocaleString()}`);
  }

  setVisible(v: boolean): void {
    if (v) this.show();
    else this.close();
  }
}
