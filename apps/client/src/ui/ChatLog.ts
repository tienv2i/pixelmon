import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const BASE_MAX_LINES = 6;
const LINE_H = 17;
const CHAT_W = 320;
const CHAT_H = 138;

/**
 * Khung Chat (ChatLog):
 * - Kế thừa từ `UiModal`: đồng bộ phong cách window chuẩn MMORPG.
 * - Draggable: kéo thả di chuyển bằng thanh tiêu đề (Title Bar).
 * - Nút Thu nhỏ / Mở rộng (Minimize/Expand: － / ＋) thu gọn thành thanh tiêu đề khi cần tầm nhìn.
 * - Nút Neo (Dock: ⚓) đưa panel về vị trí neo mặc định ở góc dưới-trái màn hình.
 * - Nút Tắt (✕) ẩn khung chat.
 * - Enter mở input HTML để chat, Escape đóng input.
 */
export class ChatLog extends UiModal {
  private lines: string[] = [];
  private textObjects: Phaser.GameObjects.Text[] = [];
  private inputEl: HTMLInputElement | null = null;
  private onSend?: (msg: string) => void;
  private _hudMode: HudMode = 'normal';

  constructor(scene: Phaser.Scene, onSend?: (msg: string) => void) {
    super(scene, {
      title: '💬 TRÒ CHUYỆN',
      width: CHAT_W,
      height: CHAT_H,
      headerHeight: 28,
      lockUi: false,
      depth: 100,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'bottom-left',
      defaultOffsetX: 10,
      defaultOffsetY: 10,
      onClose: () => {
        this.setVisible(false);
      },
      onMinimize: () => {
        this.renderTextVisibility();
      },
    });

    this.onSend = onSend;

    // Tạo các dòng text ban đầu trong contentContainer
    this.recreateTextObjects();

    this.addLine('--- Chào mừng đến với Pixelmon! ---');

    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown-ENTER', () => this.toggleInput());
    }

    this.show();
  }

  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    this.recreateTextObjects();
    this.relayout();
  }

  private isMiniMode(): boolean {
    return (
      this._hudMode === 'mini' ||
      this.scene.scale.height < 500 ||
      this.scene.scale.width < 640
    );
  }

  private maxLines(): number {
    return this.isMiniMode() ? 3 : BASE_MAX_LINES;
  }

  private recreateTextObjects(): void {
    this.textObjects.forEach((t) => t.destroy());
    this.textObjects = [];
    const max = this.maxLines();
    const wrapW = CHAT_W - 16;

    for (let i = 0; i < max; i++) {
      const t = this.scene.add
        .text(8, 4 + i * LINE_H, '', {
          fontSize: '11px',
          fontFamily: FONT.mono,
          color: C.text,
          wordWrap: { width: wrapW },
        });
      this.textObjects.push(t);
      this.contentContainer.add(t);
    }
    this.render();
  }

  private renderTextVisibility(): void {
    const show = !this.isMinimized && this.open;
    this.textObjects.forEach((t) => t.setVisible(show));
  }

  addLine(text: string): void {
    this.lines.push(text);
    if (this.lines.length > this.maxLines()) this.lines.shift();
    this.render();
  }

  private render(): void {
    const max = this.maxLines();
    for (let i = 0; i < this.textObjects.length; i++) {
      this.textObjects[i]?.setText(this.lines[this.lines.length - max + i] ?? '');
    }
  }

  private toggleInput(): void {
    if (this.inputEl) {
      this.removeInput();
      return;
    }
    if (!this.open) return;

    if (this.isMinimized) {
      this.expand();
    }

    const { actualW, actualH } = this.getScaleAndBounds();
    const X = this.currentX;
    const Y = this.currentY;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nhắn tin... (Enter để gửi, Esc để huỷ)';
    input.style.cssText = `
      position:absolute; padding:4px 8px; font-size:12px; font-family:monospace;
      border:1px solid #00cec9; background:#0f1020; color:#e8eaf6;
      border-radius:4px; outline:none; z-index:1001; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;
    input.style.left = `${rect.left + X * scaleX}px`;
    input.style.top = `${rect.top + (Y + actualH + 4) * scaleY}px`;
    input.style.width = `${actualW * scaleX}px`;
    input.style.height = `${24 * scaleY}px`;

    document.body.appendChild(input);
    input.focus();
    this.inputEl = input;

    const submit = () => {
      const msg = input.value.trim();
      if (msg) {
        this.addLine(`> ${msg}`);
        this.onSend?.(msg);
      }
      this.removeInput();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') this.removeInput();
      e.stopPropagation();
    });
  }

  private removeInput(): void {
    if (this.inputEl) {
      this.inputEl.remove();
      this.inputEl = null;
    }
  }

  setVisible(v: boolean): void {
    if (v) {
      this.show();
    } else {
      this.removeInput();
      this.close();
    }
  }

  /** Kích thước panel hiện tại. */
  getSize(): { w: number; h: number } {
    return this.getActualSize();
  }

  public relayout(): void {
    super.relayout();
    this.renderTextVisibility();
  }

  destroy(): void {
    this.removeInput();
    super.destroy();
  }
}
