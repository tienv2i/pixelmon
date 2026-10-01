import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';

const MODAL_W = 440;
const MODAL_H = 360;
const HEADER_H = 32;

interface ShortcutItem {
  key: string;
  desc: string;
}

/**
 * **HelpModal** — Modal Bảng Hướng dẫn điều khiển và Phím tắt:
 * - Kế thừa từ `UiModal`, đồng bộ thanh tiêu đề và phong cách pixel với toàn bộ hệ thống popup.
 * - Draggable: có thể kéo thả di chuyển tự do bằng thanh tiêu đề.
 * - Nút Thu nhỏ (－): thu gọn bảng chỉ còn thanh tiêu đề giúp không chiếm tầm nhìn.
 * - Nút Neo (⚓): đưa bảng về vị trí mặc định ở giữa màn hình.
 * - Nút Tắt (✕): đóng bảng hướng dẫn.
 */
export class HelpModal extends UiModal {
  constructor(scene: Phaser.Scene, onClose?: () => void) {
    super(scene, {
      title: '❓ HƯỚNG DẪN ĐIỀU KHIỂN',
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: HEADER_H,
      lockUi: false,
      depth: 170,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      onClose: () => {
        onClose?.();
      },
    });

    this.buildContent();
    this.close();
  }

  private buildContent(): void {
    const padX = 16;
    let curY = 12;

    // Nhóm 1: Bàn phím
    const lblKb = this.scene.add
      .text(padX, curY, '⌨ PHÍM TẮT BÀN PHÍM (KEYBOARD):', ts(11, '#6c5ce7', FONT.ui))
      .setOrigin(0, 0);
    this.contentContainer.add(lblKb);
    curY += 20;

    const kbShortcuts: ShortcutItem[] = [
      { key: 'W, A, S, D / Arrows', desc: 'Di chuyển nhân vật trong thế giới' },
      { key: 'Enter', desc: 'Mở / Gửi tin nhắn vào khung chat' },
      { key: 'P', desc: 'Ẩn / hiện Đội hình Pokémon (Party)' },
      { key: 'B', desc: 'Mở / đóng Hộp lưu trữ Pokémon (PC Box)' },
      { key: 'M', desc: 'Bật / tắt bản đồ thu nhỏ (Minimap)' },
      { key: 'F3  hoặc  F2', desc: 'Mở / đóng Panel Debug & Thông số Map, Toạ độ' },
      { key: 'H  hoặc nút  ?', desc: 'Bật / tắt bảng hướng dẫn này' },
      { key: 'Esc  hoặc nút  ⚙', desc: 'Mở bảng Cài đặt hệ thống' },
    ];

    for (const item of kbShortcuts) {
      this.createShortcutRow(padX, curY, item.key, item.desc);
      curY += 22;
    }

    curY += 8;

    // Nhóm 2: Chuột & Cảm ứng
    const lblMouse = this.scene.add
      .text(padX, curY, '🖱 THAO TÁC CHUỘT & CẢM ỨNG (MOUSE & TOUCH):', ts(11, '#6c5ce7', FONT.ui))
      .setOrigin(0, 0);
    this.contentContainer.add(lblMouse);
    curY += 20;

    const mouseShortcuts: ShortcutItem[] = [
      { key: 'Chuột trái / Touch (LMB)', desc: 'Đi tới vị trí ô được chỉ định (Click-to-move)' },
      { key: 'Chuột giữa / Shift + Kéo', desc: 'Kéo di chuyển góc nhìn camera tự do' },
      { key: 'Con lăn chuột (Wheel)', desc: 'Thu phóng thế giới (khi bật trong Cài đặt)' },
    ];

    for (const item of mouseShortcuts) {
      this.createShortcutRow(padX, curY, item.key, item.desc);
      curY += 22;
    }

    curY += 12;

    // Nút đóng "ĐÃ HIỂU (H)" ở đáy
    const btnW = 160;
    const btnH = 28;
    const btnX = Math.round((MODAL_W - btnW) / 2);

    const btnBg = this.scene.add.graphics();
    btnBg.fillStyle(0x24284d, 0.95);
    btnBg.fillRoundedRect(btnX, curY, btnW, btnH, 4);
    btnBg.lineStyle(1, 0x00cec9, 0.8);
    btnBg.strokeRoundedRect(btnX, curY, btnW, btnH, 4);
    this.contentContainer.add(btnBg);

    const btnText = this.scene.add
      .text(btnX + btnW / 2, curY + btnH / 2, '✔ ĐÃ HIỂU [H]', ts(11, '#00cec9', FONT.ui))
      .setOrigin(0.5);
    this.contentContainer.add(btnText);

    const btnZone = this.scene.add
      .zone(btnX, curY, btnW, btnH)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    btnZone.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(0x00cec9, 1);
      btnBg.fillRoundedRect(btnX, curY, btnW, btnH, 4);
      btnText.setColor('#0f1124');
    });

    btnZone.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(0x24284d, 0.95);
      btnBg.fillRoundedRect(btnX, curY, btnW, btnH, 4);
      btnBg.lineStyle(1, 0x00cec9, 0.8);
      btnBg.strokeRoundedRect(btnX, curY, btnW, btnH, 4);
      btnText.setColor('#00cec9');
    });

    btnZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.close();
    });

    this.contentContainer.add(btnZone);
  }

  private createShortcutRow(x: number, y: number, keyText: string, descText: string): void {
    const keyBoxW = 150;
    const keyBoxH = 18;

    // Badge phím
    const keyBg = this.scene.add.graphics();
    keyBg.fillStyle(0x0f1124, 0.9);
    keyBg.fillRoundedRect(x, y, keyBoxW, keyBoxH, 3);
    keyBg.lineStyle(1, 0x2e3358, 0.9);
    keyBg.strokeRoundedRect(x, y, keyBoxW, keyBoxH, 3);
    this.contentContainer.add(keyBg);

    const keyLabel = this.scene.add
      .text(x + keyBoxW / 2, y + keyBoxH / 2, keyText, ts(10, '#00cec9', FONT.mono))
      .setOrigin(0.5);
    this.contentContainer.add(keyLabel);

    // Mô tả hành động
    const descLabel = this.scene.add
      .text(x + keyBoxW + 12, y + keyBoxH / 2, descText, ts(11, C.text, FONT.ui))
      .setOrigin(0, 0.5);
    this.contentContainer.add(descLabel);
  }
}
