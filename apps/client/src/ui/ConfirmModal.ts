import Phaser from 'phaser';
import { C, FONT, ts } from './theme';

export interface ConfirmModalOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: number;
  onConfirm: () => void;
  onCancel?: () => void;
}

const MODAL_W = 340;
const MODAL_H = 170;

/**
 * ConfirmModal — Hộp thoại popup xác nhận hành động nguy hiểm hoặc đăng xuất:
 * - Khóa hoàn toàn UI và gameplay phía dưới bằng overlay mờ đen (depth 250).
 * - Cung cấp nút Xác nhận và nút Huỷ bỏ trực quan.
 */
export class ConfirmModal {
  private readonly scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Graphics;
  private blockerZone: Phaser.GameObjects.Zone;
  private panel: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private messageText: Phaser.GameObjects.Text;

  private btnConfirmBg: Phaser.GameObjects.Graphics;
  private btnConfirmTxt: Phaser.GameObjects.Text;
  private btnConfirmZone: Phaser.GameObjects.Zone;

  private btnCancelBg: Phaser.GameObjects.Graphics;
  private btnCancelTxt: Phaser.GameObjects.Text;
  private btnCancelZone: Phaser.GameObjects.Zone;

  private objects: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> = [];
  private open = false;
  private currentOpts?: ConfirmModalOptions;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // 1. Overlay tối
    this.overlay = scene.add.graphics().setDepth(250).setScrollFactor(0).setVisible(false);
    this.objects.push(this.overlay);

    this.blockerZone = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0, 0)
      .setDepth(250)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ cursor: 'default' });

    this.blockerZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
    });
    this.objects.push(this.blockerZone);

    // 2. Khung dialog
    this.panel = scene.add.graphics().setDepth(251).setScrollFactor(0).setVisible(false);
    this.objects.push(this.panel);

    // 3. Tiêu đề
    this.titleText = scene.add
      .text(0, 0, '⚠ XÁC NHẬN', ts(14, '#ff7675', FONT.ui))
      .setDepth(252)
      .setScrollFactor(0)
      .setVisible(false);
    this.objects.push(this.titleText);

    // 4. Nội dung
    this.messageText = scene.add
      .text(0, 0, '', {
        fontSize: '12px',
        fontFamily: FONT.ui,
        color: C.text,
        wordWrap: { width: MODAL_W - 40 },
        align: 'center',
      })
      .setDepth(252)
      .setScrollFactor(0)
      .setVisible(false);
    this.objects.push(this.messageText);

    // 5. Nút Xác nhận
    this.btnConfirmBg = scene.add.graphics().setDepth(252).setScrollFactor(0).setVisible(false);
    this.btnConfirmTxt = scene.add
      .text(0, 0, 'Xác nhận', ts(12, '#ffffff', FONT.ui))
      .setOrigin(0.5)
      .setDepth(253)
      .setScrollFactor(0)
      .setVisible(false);
    this.btnConfirmZone = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(254)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.btnConfirmZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      const fn = this.currentOpts?.onConfirm;
      this.close();
      fn?.();
    });
    this.objects.push(this.btnConfirmBg, this.btnConfirmTxt, this.btnConfirmZone);

    // 6. Nút Huỷ bỏ
    this.btnCancelBg = scene.add.graphics().setDepth(252).setScrollFactor(0).setVisible(false);
    this.btnCancelTxt = scene.add
      .text(0, 0, 'Huỷ', ts(12, C.text, FONT.ui))
      .setOrigin(0.5)
      .setDepth(253)
      .setScrollFactor(0)
      .setVisible(false);
    this.btnCancelZone = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(254)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.btnCancelZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      const fn = this.currentOpts?.onCancel;
      this.close();
      fn?.();
    });
    this.objects.push(this.btnCancelBg, this.btnCancelTxt, this.btnCancelZone);

    scene.scale.on('resize', () => {
      if (this.open) this.relayout();
    });
  }

  isOpen(): boolean {
    return this.open;
  }

  show(opts: ConfirmModalOptions): void {
    this.currentOpts = opts;
    this.open = true;

    this.titleText.setText(opts.title ?? '⚠ XÁC NHẬN');
    this.messageText.setText(opts.message ?? 'Bạn có chắc chắn muốn thực hiện hành động này?');
    this.btnConfirmTxt.setText(opts.confirmText ?? 'Xác nhận');
    this.btnCancelTxt.setText(opts.cancelText ?? 'Huỷ');

    this.objects.forEach((o) => o.setVisible(true));
    this.relayout();
  }

  close(): void {
    this.open = false;
    this.objects.forEach((o) => o.setVisible(false));
  }

  private relayout(): void {
    if (!this.open) return;
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;

    // Overlay
    this.overlay.clear();
    this.overlay.fillStyle(0x000000, 0.7);
    this.overlay.fillRect(0, 0, screenW, screenH);
    this.blockerZone.setPosition(0, 0).setSize(screenW, screenH);

    // Dialog position
    const X = Math.round((screenW - MODAL_W) / 2);
    const Y = Math.round((screenH - MODAL_H) / 2);

    // Panel
    this.panel.clear();
    this.panel.fillStyle(0x000000, 0.5);
    this.panel.fillRoundedRect(X + 3, Y + 3, MODAL_W, MODAL_H, 8);
    this.panel.fillStyle(0x13152c, 0.98);
    this.panel.fillRoundedRect(X, Y, MODAL_W, MODAL_H, 8);
    this.panel.lineStyle(2, 0xc0392b, 0.9);
    this.panel.strokeRoundedRect(X, Y, MODAL_W, MODAL_H, 8);

    // Title
    this.titleText.setPosition(X + 20, Y + 16);

    // Message
    this.messageText.setPosition(X + 20, Y + 50);

    // Buttons
    const btnW = 120;
    const btnH = 34;
    const btnY = Y + MODAL_H - 38;

    // Nút Xác nhận
    const confX = X + MODAL_W / 2 - btnW / 2 - 10;
    const confColor = this.currentOpts?.confirmColor ?? 0xc0392b;
    this.btnConfirmBg.clear();
    this.btnConfirmBg.fillStyle(confColor, 1);
    this.btnConfirmBg.fillRoundedRect(confX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    this.btnConfirmBg.lineStyle(1, 0xffffff, 0.3);
    this.btnConfirmBg.strokeRoundedRect(confX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);

    this.btnConfirmTxt.setPosition(confX, btnY);
    this.btnConfirmZone.setPosition(confX, btnY).setSize(btnW, btnH);

    // Nút Huỷ
    const cancelX = X + MODAL_W / 2 + btnW / 2 + 10;
    this.btnCancelBg.clear();
    this.btnCancelBg.fillStyle(0x24284d, 1);
    this.btnCancelBg.fillRoundedRect(cancelX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    this.btnCancelBg.lineStyle(1, 0x2e3358, 1);
    this.btnCancelBg.strokeRoundedRect(cancelX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);

    this.btnCancelTxt.setPosition(cancelX, btnY);
    this.btnCancelZone.setPosition(cancelX, btnY).setSize(btnW, btnH);
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return this.objects;
  }

  destroy(): void {
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
  }
}
