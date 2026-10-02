import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange} from '../i18n';
import type { UiZoomManager } from './UiZoomManager';

export interface ConfirmModalOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: number;
  onConfirm: () => void;
  onCancel?: () => void;
}

const MODAL_W = 360;
const MODAL_H = 175;

/**
 * ConfirmModal — Hộp thoại popup xác nhận hành động nguy hiểm hoặc đăng xuất:
 * - Kế thừa từ `UiModal`, đồng bộ phong cách với toàn bộ hệ thống pop-up trong game.
 * - Khóa hoàn toàn UI và gameplay phía dưới bằng overlay mờ đen (`lockUi: true`, depth 250).
 * - Cung cấp nút Xác nhận và nút Huỷ bỏ trực quan.
 */
export class ConfirmModal extends UiModal {
  private unsubLang?: () => void;
  private messageText: Phaser.GameObjects.Text;
  private btnConfirmBg: Phaser.GameObjects.Graphics;
  private btnConfirmTxt: Phaser.GameObjects.Text;
  private btnConfirmZone: Phaser.GameObjects.Zone;

  private btnCancelBg: Phaser.GameObjects.Graphics;
  private btnCancelTxt: Phaser.GameObjects.Text;
  private btnCancelZone: Phaser.GameObjects.Zone;

  private currentOpts?: ConfirmModalOptions;

  constructor(scene: Phaser.Scene) {
    super(scene, {
      title: t('CONFIRM_TITLE'),
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 34,
      lockUi: true,
      depth: 250,
      showClose: true,
      showMinimize: false,
      showDock: true,
      defaultAlign: 'center',
      onClose: () => {
        this.currentOpts?.onCancel?.();
      },
    });

    // Ban đầu ẩn modal
    this.modalContainer.setVisible(false);
    if (this.overlay) this.overlay.setVisible(false);
    if (this.overlayBlocker) this.overlayBlocker.setVisible(false);
    this.open = false;
    // Cập nhật title khi đổi ngôn ngữ
    this.unsubLang = onLangChange(() => this.setTitle(t('CONFIRM_TITLE')));

    // 1. Message Text (Local coordinate trong contentContainer)
    this.messageText = scene.add
      .text(20, 16, '', {
        fontSize: '12px',
        fontFamily: FONT.ui,
        color: C.text,
        wordWrap: { width: MODAL_W - 40 },
        align: 'center',
      });
    this.contentContainer.add(this.messageText);

    // 2. Nút Xác nhận
    this.btnConfirmBg = scene.add.graphics();
    this.btnConfirmTxt =
      mkText(this.scene, 'CONFIRM_OK', ts(12, '#ffffff', FONT.ui))
      .setOrigin(0.5);
    this.btnConfirmZone = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.btnConfirmZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      const fn = this.currentOpts?.onConfirm;
      this.close();
      fn?.();
    });
    this.contentContainer.add([this.btnConfirmBg, this.btnConfirmTxt, this.btnConfirmZone]);

    // 3. Nút Huỷ bỏ
    this.btnCancelBg = scene.add.graphics();
    this.btnCancelTxt =
      mkText(this.scene, 'CONFIRM_CANCEL', ts(12, C.text, FONT.ui))
      .setOrigin(0.5);
    this.btnCancelZone = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.btnCancelZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      const fn = this.currentOpts?.onCancel;
      this.close();
      fn?.();
    });
    this.contentContainer.add([this.btnCancelBg, this.btnCancelTxt, this.btnCancelZone]);

    // Vẽ layout ban đầu cho các nút nội dung
    this.renderButtons();
  }

  private renderButtons(): void {
    const btnW = 120;
    const btnH = 34;
    const btnY = 94; // Khoảng cách từ đỉnh contentContainer

    // Nút Xác nhận
    const confX = MODAL_W / 2 - btnW / 2 - 12;
    const confColor = this.currentOpts?.confirmColor ?? 0xc0392b;
    this.btnConfirmBg.clear();
    this.btnConfirmBg.fillStyle(confColor, 1);
    this.btnConfirmBg.fillRoundedRect(confX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    this.btnConfirmBg.lineStyle(1, 0xffffff, 0.3);
    this.btnConfirmBg.strokeRoundedRect(confX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);

    this.btnConfirmTxt.setPosition(confX, btnY);
    this.btnConfirmZone.setPosition(confX, btnY).setSize(btnW, btnH);

    // Nút Huỷ
    const cancelX = MODAL_W / 2 + btnW / 2 + 12;
    this.btnCancelBg.clear();
    this.btnCancelBg.fillStyle(0x24284d, 1);
    this.btnCancelBg.fillRoundedRect(cancelX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    this.btnCancelBg.lineStyle(1, 0x2e3358, 1);
    this.btnCancelBg.strokeRoundedRect(cancelX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);

    this.btnCancelTxt.setPosition(cancelX, btnY);
    this.btnCancelZone.setPosition(cancelX, btnY).setSize(btnW, btnH);
  }

  show(opts?: ConfirmModalOptions): void {
    if (opts) {
      this.currentOpts = opts;
      this.setTitle(opts.title ?? t('CONFIRM_TITLE'));
      this.messageText.setText(opts.message ?? t('CONFIRM_DEFAULT_MSG'));
      this.btnConfirmTxt.setText(opts.confirmText ?? t('CONFIRM_OK'));
      this.btnCancelTxt.setText(opts.cancelText ?? t('CONFIRM_CANCEL'));
      this.renderButtons();
    }
    super.show();
  }

  destroy(): void {
    this.unsubLang?.();
    super.destroy?.();
  }
}
