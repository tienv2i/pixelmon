import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, onLangChange} from '../i18n';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const BASE_MAX_LINES = 6;
const LINE_H = 17;
const CHAT_W = 320;
const CHAT_H = 166;
const INPUT_H = 26;
/** Số dòng tối đa khi tạm mở rộng để hiển thị output lệnh dài (VD `/help`). */
const EXPANDED_MAX_LINES = 14;
/** Thời gian giữ độ mở rộng trước khi tự co lại (ms). */
const EXPAND_MS = 30_000;

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
  private unsubLang?: () => void;
  private lines: string[] = [];
  private textObjects: Phaser.GameObjects.Text[] = [];
  private inputEl: HTMLInputElement | null = null;
  private onSend?: (msg: string) => void;
  private _hudMode: HudMode = 'normal';

  /** Lịch sử lệnh đã gõ (ArrowUp/ArrowDown để duyệt lại). */
  private cmdHistory: string[] = [];
  private cmdHistoryIdx = -1;
  /** Ô input có hỗ trợ lệnh debug (moderator+). */
  private debugMode = false;
  /** Số dòng text đang hiển thị (có thể tạm > `maxLines()` khi output lệnh dài). */
  private visibleLines = BASE_MAX_LINES;
  /** Timer tự co lại sau khi mở rộng. */
  private collapseTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, onSend?: (msg: string) => void, onClose?: () => void) {
    super(scene, {
      title: t('CHAT_TITLE'),
      width: CHAT_W,
      height: CHAT_H,
      headerHeight: 28,
      lockUi: false,
      depth: 100,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'bottom-right',
      defaultOffsetX: 10,
      defaultOffsetY: 10,
      onClose: () => {
        this.setVisible(false);
        onClose?.();
      },
      onMinimize: () => {
        this.renderTextVisibility();
      },
    });

    this.onSend = onSend;

    // Tạo các dòng text ban đầu trong contentContainer
    this.recreateTextObjects();

    this.addLine(t('CHAT_WELCOME'));

    this.show();

    // Tạo ô nhập chữ cố định ở đáy panel (luôn hiện, không cần bấm Enter).
    this.createInput();

    // Cập nhật title + placeholder khi đổi ngôn ngữ (chỉ 1 ngôn ngữ hiển thị)
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('CHAT_TITLE'));
      this.updatePlaceholder();
    });
  }

  /**
   * Bật chế độ moderator → placeholder gợi ý lệnh debug `/help`.
   * Chỉ ảnh hưởng UI; quyền thật vẫn validate ở client + server.
   */
  setDebugMode(on: boolean): void {
    this.debugMode = on;
    this.updatePlaceholder();
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

  /**
   * Số dòng cần vẽ: dùng `visibleLines` (có thể tạm mở rộng khi hiển thị output
   * lệnh dài) nhưng không vượt quá `EXPANDED_MAX_LINES`.
   */
  private effectiveLines(): number {
    return Math.min(this.visibleLines, EXPANDED_MAX_LINES);
  }

  private recreateTextObjects(): void {
    this.textObjects.forEach((t) => t.destroy());
    this.textObjects = [];
    const max = this.effectiveLines();
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
    if (this.inputEl) this.inputEl.style.display = show ? '' : 'none';
  }

  addLine(text: string): void {
    this.lines.push(text);
    // Giữ giới hạn = số dòng hiện đang hiển thị (không vượt EXPANDED_MAX_LINES).
    const cap = Math.min(this.effectiveLines(), EXPANDED_MAX_LINES);
    if (this.lines.length > cap) this.lines.shift();
    this.render();
  }

  private render(): void {
    const max = this.effectiveLines();
    for (let i = 0; i < this.textObjects.length; i++) {
      this.textObjects[i]?.setText(this.lines[this.lines.length - max + i] ?? '');
    }
  }

  /**
   * Tạo ô nhập chữ cố định ở đáy modal — luôn hiện, tự nắn lại vị trí theo `relayout()`.
   * - Enter → gửi (qua `onSend` — WorldScene sẽ phân biệt chat thường vs lệnh `/`).
   * - ArrowUp/ArrowDown → duyệt lịch sử lệnh.
   */
  private createInput(): void {
    if (this.inputEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    this.updatePlaceholder(input);
    input.style.cssText = `
      position:absolute; padding:3px 8px; font-size:12px; font-family:monospace;
      border:1px solid #2e3358; background:#0f1020; color:#e8eaf6;
      border-radius:4px; outline:none; box-sizing:border-box;
      transition:border-color .15s ease;
    `;
    input.addEventListener('focus', () => (input.style.borderColor = '#00cec9'));
    input.addEventListener('blur', () => (input.style.borderColor = '#2e3358'));

    document.body.appendChild(input);
    this.inputEl = input;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.submitInput(input);
      } else if (e.key === 'ArrowUp') {
        this.browseHistory(input, -1);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        this.browseHistory(input, 1);
        e.preventDefault();
      }
      e.stopPropagation();
    });
  }

  /** Gửi nội dung trong ô input (cả chat thường lẫn lệnh `/`). */
  private submitInput(input: HTMLInputElement): void {
    const msg = input.value.trim();
    if (!msg) return;

    // Lưu lịch sử (không lưu lệnh lặp lại liên tiếp ở đầu).
    if (msg.startsWith('/') || this.cmdHistory[this.cmdHistory.length - 1] !== msg) {
      this.cmdHistory.push(msg);
      if (this.cmdHistory.length > 50) this.cmdHistory.shift();
    }
    this.cmdHistoryIdx = this.cmdHistory.length;

    input.value = '';
    this.onSend?.(msg);
  }

  /** Duyệt lịch sử lệnh bằng ArrowUp/ArrowDown. */
  private browseHistory(input: HTMLInputElement, dir: 1 | -1): void {
    if (this.cmdHistory.length === 0) return;
    this.cmdHistoryIdx = Math.max(0, Math.min(this.cmdHistory.length, this.cmdHistoryIdx + dir));
    input.value = this.cmdHistory[this.cmdHistoryIdx] ?? '';
    // Đặt caret về cuối.
    setTimeout(() => {
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }

  private updatePlaceholder(input?: HTMLInputElement): void {
    const el = input ?? this.inputEl;
    if (!el) return;
    el.placeholder = this.debugMode ? t('CHAT_PLACEHOLDER_DEBUG') : t('CHAT_PLACEHOLDER');
  }

  /** Cập nhật vị trí ô input theo modal hiện tại (gọi sau relayout/show). */
  private positionInput(): void {
    const input = this.inputEl;
    if (!input || !this.open || this.isMinimized) {
      if (input) input.style.display = 'none';
      return;
    }
    input.style.display = '';

    const { actualW } = this.getScaleAndBounds();
    const scale = this._uiZoomManager?.uiZoom ?? 1;
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;

    // Ô input nằm cách đáy modal `INPUT_H + 4` px (tính cả border & padding).
    const screenH = INPUT_H * scale + 6;
    const localY = this.opts.height - INPUT_H * scale - 8;
    const screenX = this.currentX + 8 * scale;
    const screenY = this.currentY + localY;

    input.style.left = `${rect.left + screenX * scaleX}px`;
    input.style.top = `${rect.top + screenY * scaleY}px`;
    input.style.width = `${(actualW - 16 * scale) * scaleX}px`;
    input.style.height = `${screenH * scaleY}px`;
    input.style.fontSize = `${12 * scale * scaleX}px`;
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
      // Input đã bị xoá ở lần đóng trước → tạo lại.
      this.createInput();
      this.positionInput();
    } else {
      this.close();
    }
  }

  /** Focus vào ô input (mở modal nếu đang đóng) — dùng khi bấm Enter/click chat. */
  focusInput(): void {
    if (!this.open) this.show();
    if (this.isMinimized) this.expand();
    this.positionInput();
    this.inputEl?.focus();
  }

  /** Ghi 1 dòng hệ thống vào khung chat (dùng cho kết quả lệnh debug). */
  addSystemLine(text: string, color: string = C.text): void {
    this.pushLines([text], color);
  }

  /**
   * Ghi nhiều dòng hệ thống (kết quả lệnh debug dài).
   *
   * Chat chỉ hiện `maxLines()` dòng → với output dài (VD `/help` 13 dòng) sẽ bị cắt.
   * `pushLines` cho phép tạm tăng số dòng hiển thị (tới `EXPANDED_MAX_LINES`) rồi tự
   * co lại sau `EXPAND_MS` để trở về layout gốc.
   */
  addSystemBlock(text: string, color: string = C.text): void {
    this.pushLines(text.split('\n'), color);
  }

  private pushLines(texts: string[], color: string): void {
    const need = this.lines.length + texts.length;
    const target = Math.min(need, Math.max(this.maxLines(), EXPANDED_MAX_LINES));

    // Tăng số dòng hiển thị nếu output dài hơn sức chứa hiện tại.
    if (this.visibleLines < target) {
      this.visibleLines = target;
      this.recreateTextObjects();
    }

    for (const line of texts) {
      this.lines.push(line);
    }
    while (this.lines.length > EXPANDED_MAX_LINES) this.lines.shift();
    this.render();

    // Tô màu các dòng vừa thêm (đã render → index = length - texts.length).
    const startIdx = Math.max(0, this.textObjects.length - texts.length);
    for (let i = startIdx; i < this.textObjects.length; i++) {
      this.textObjects[i]?.setColor(color);
    }

    // Lên lịch co lại nếu đang mở rộng.
    if (target > this.maxLines()) {
      this.collapseTimer?.remove();
      this.collapseTimer = this.scene.time.delayedCall(EXPAND_MS, () => {
        this.collapseTimer = undefined;
        if (this.visibleLines <= this.maxLines()) return;
        this.visibleLines = this.maxLines();
        this.lines = this.lines.slice(-this.visibleLines);
        this.recreateTextObjects();
      });
    }
  }

  /** Kích thước panel hiện tại. */
  getSize(): { w: number; h: number } {
    return this.getActualSize();
  }

  public relayout(): void {
    super.relayout();
    this.renderTextVisibility();
    this.positionInput();
  }

  destroy(): void {
    this.unsubLang?.();
    this.collapseTimer?.remove();
    this.collapseTimer = undefined;
    this.removeInput();
    super.destroy();
  }
}
