import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import type { HudMode } from './HudManager';

export interface PlayerHudData {
  name: string;
  /** Tiền trong game */
  money: number;
  /** Tiền thật (premium / vnd) */
  realMoney: number;
}

const NORMAL_W = 168;
const NORMAL_H = 62;
const MINI_W = 115;
const MINI_H = 44;

/**
 * **PlayerHud** — Bảng thông tin người chơi (UserInfo):
 * - Kế thừa từ `UiModal`: chuẩn hoá khung giao diện pixel thống nhất.
 * - Chế độ neo (`docked: true`) cố định ở góc trên-trái màn hình.
 * - Hỗ trợ Responsive: tự động thu gọn sang chế độ Mini trên màn hình hẹp hoặc khi kích hoạt mini mode.
 */
export class PlayerHud extends UiModal {
  private avatar: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private moneyText: Phaser.GameObjects.Text;
  private realMoneyText: Phaser.GameObjects.Text;
  private _avatarFrameSize = 32;
  private _hudMode: HudMode = 'normal';

  constructor(
    scene: Phaser.Scene,
    sheetKey: string,
    frame: string | number = 0,
    frameSize = 32,
    onClose?: () => void,
  ) {
    super(scene, {
      title: '👤 NHÂN VẬT',
      width: NORMAL_W,
      height: NORMAL_H,
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
        onClose?.();
      },
    });

    this._avatarFrameSize = frameSize;

    // 1. Avatar / Sprite Preview
    const hasPreview128 = scene.textures.exists('user_preview_128');
    const avatarTexture = hasPreview128 ? 'user_preview_128' : sheetKey;
    const avatarFrame = hasPreview128 ? undefined : frame;

    this.avatar = scene.add
      .image(30, 31, avatarTexture, avatarFrame)
      .setOrigin(0.5, 0.5);
    this.contentContainer.add(this.avatar);

    // 2. Name Text
    this.nameText = scene.add
      .text(62, 8, 'Trainer', {
        fontSize: '12px',
        fontFamily: FONT.ui,
        fontStyle: 'bold',
        color: C.text,
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.nameText);

    // 3. Money Text (Tiền game)
    this.moneyText = scene.add
      .text(62, 25, '$ 0', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#00cec9',
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.moneyText);

    // 4. Real Money Text (Tiền thật)
    this.realMoneyText = scene.add
      .text(62, 42, '₿ 0', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#fdcb6e',
      })
      .setOrigin(0, 0);
    this.contentContainer.add(this.realMoneyText);

    this.applyInternalLayout();
    this.update({ name: 'Trainer', money: 5000, realMoney: 0 });
    this.show();
  }

  /** Đặt lại chế độ hiển thị (normal/mini/hidden) — gọi từ HudManager. */
  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    const isMini = this.isMiniMode();
    this.setSize(isMini ? MINI_W : NORMAL_W, isMini ? MINI_H : NORMAL_H);
    this.relayout();
  }

  private isMiniMode(): boolean {
    return this._hudMode === 'mini' || this.scene.scale.width < 800 || this.scene.scale.height < 600;
  }

  public override relayout(): void {
    const isMini = this.isMiniMode();
    const targetW = isMini ? MINI_W : NORMAL_W;
    const targetH = isMini ? MINI_H : NORMAL_H;
    this.opts.width = targetW;
    this.opts.height = targetH;

    super.relayout();
    this.applyInternalLayout();
  }

  private applyInternalLayout(): void {
    const isMini = this.isMiniMode();
    const hasPreview128 = this.scene.textures.exists('user_preview_128');

    if (isMini) {
      this.avatar.setPosition(20, 22);
      if (hasPreview128) {
        this.avatar.setScale(34 / 128);
      } else {
        this.avatar.setScale(32 / Math.max(1, this._avatarFrameSize));
      }

      this.nameText.setPosition(40, 6).setFontSize('11px');
      this.moneyText.setPosition(40, 22).setFontSize('10px');
      this.realMoneyText.setVisible(false);
    } else {
      this.avatar.setPosition(30, 31);
      if (hasPreview128) {
        this.avatar.setScale(48 / 128);
      } else {
        this.avatar.setScale(44 / Math.max(1, this._avatarFrameSize));
      }

      this.nameText.setPosition(62, 8).setFontSize('12px');
      this.moneyText.setPosition(62, 25).setFontSize('11px');
      this.realMoneyText.setPosition(62, 42).setFontSize('11px').setVisible(true);
    }
  }

  /** Kích thước hiện tại của panel (đã tính scale). */
  getSize(): { w: number; h: number } {
    return this.getActualSize();
  }

  /** Đổi avatar nhân vật hiển thị trên Player Info. */
  setAvatar(sheetKey: string, frame: string | number = 0, frameSize = 64): void {
    if (this.scene.textures.exists('user_preview_128')) {
      this.avatar.setTexture('user_preview_128');
    } else {
      if (!this.scene.textures.exists(sheetKey)) return;
      this._avatarFrameSize = frameSize;
      this.avatar.setTexture(sheetKey, frame);
    }
    this.applyInternalLayout();
  }

  /** Dùng trực tiếp sprite preview 128px nếu có */
  setPreview128(textureKey = 'user_preview_128'): void {
    if (this.scene.textures.exists(textureKey)) {
      this.avatar.setTexture(textureKey);
      this.applyInternalLayout();
    }
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
