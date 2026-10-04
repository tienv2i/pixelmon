import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';
import { t, onLangChange } from '../i18n';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const LINE_H = 17;
/** Số dòng tối đa khi tạm mở rộng để hiển thị output lệnh dài (VD `/help`). */
const EXPANDED_MAX_LINES = 14;
/** Thời gian giữ độ mở rộng trước khi tự co lại (ms). */
const EXPAND_MS = 30_000;
/** Kích thước khi chưa resize lần đầu. */
const DEFAULT_W = 320;
const DEFAULT_H = 166;
const INPUT_H = 26;
/** Kích thước tối thiểu / tối đa (đơn vị logic). */
const MIN_W = 220;
const MIN_H = 80;
const MAX_W = 900;
const MAX_H = 640;
/** Kích thước vùng resize ở góc dưới-phải (logic px — trước khi apply scale). */
const RESIZE_ZONE = 20;

/**
 * Khung Chat (ChatLog):
 * - Kế thừa `UiModal`: window style chuẩn MMORPG, drag bằng title bar.
 * - Nút － thu gọn / ＋ mở, nút ⚓ neo, nút ✕ đóng (trên title bar).
 * - **Resize**: kéo nút ⤢ ở góc trên-trái, kéo mép phải/dưới, hoặc vùng chéo góc dưới-phải.
   *   Nút luôn sẵn sàng kéo — không cần bật/tắt. Thả chuột sau khi resize để bố cục
   *   (input, wrap, số dòng) tự theo.
 * - **Scroll**: wheel trên khung chat lướt lịch sử cũ/mới; thanh cuộn nhỏ ở mép phải.
 * - Ô nhập chữ dính đáy khung, tự giãn theo chiều rộng.
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
  private visibleLines = 6;
  /** Timer tự co lại sau khi mở rộng. */
  private collapseTimer?: Phaser.Time.TimerEvent;

  /** Chiều rộng / chiều cao hiện tại (logic px, chưa nhân UI zoom). */
  private chatW = DEFAULT_W;
  private chatH = DEFAULT_H;
  /** Đã resize bằng tay (chặn relayout tự chỉnh về mặc định). */
  private userSized = false;

  // ── Scroll state (logic px) ──────────────────────────────────────────────
  /** Offset cuộn (0 = dưới cùng / mới nhất; tăng dần khi cuộn lên). */
  private scrollY = 0;
  /** Tổng số dòng lịch sử giữ (không phụ thuộc số dòng visible). */
  private readonly MAX_HISTORY = 40;
  /** Thanh cuộn. */
  private scrollGfx?: Phaser.GameObjects.Graphics;
  /** Zone bám chuột wheel. */
  private scrollZone?: Phaser.GameObjects.Zone;
  /** Zone bắt kéo resize (góc dưới-phải). */
  private resizeZone?: Phaser.GameObjects.Zone;
  /** Graphics vẽ gợi ý grip ở góc dưới-phải. */
  private gripGfx?: Phaser.GameObjects.Graphics;
  /** Nút bật/tắt chế độ resize ở góc trên-trái. */
  private resizeToggle?: Phaser.GameObjects.Text;
  private resizingW = false;
  private resizingH = false;
  private resizeAnchor = { x: 0, y: 0, w: 0, h: 0 };
  /** Reference các handler do ChatLog đăng ký trên `scene.input` — cần off đúng. */
  private wheelHandler?: (p: Phaser.Input.Pointer) => void;
  private resizeMoveHandler?: (p: Phaser.Input.Pointer) => void;
  private resizeUpHandler?: () => void;
  private toggleMoveHandler?: (p: Phaser.Input.Pointer) => void;
  private toggleUpHandler?: () => void;
  /** Handler blur ô chat khi bấm chuột vào bất kỳ đâu trong game. */
  private canvasPointerDownHandler?: () => void;
  /** Đang kéo nút resize góc trên-trái. */
  private toggleDragging = false;

  constructor(scene: Phaser.Scene, onSend?: (msg: string) => void, onClose?: () => void) {
    super(scene, {
      title: t('CHAT_TITLE'),
      width: DEFAULT_W,
      height: DEFAULT_H,
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

    this.createLeftHeaderButton();

    this.recreateTextObjects();
    this.addLine(t('CHAT_WELCOME'));

    this.show();

    this.createInput();
    this.createResizeGrip();
    this.createScrollControls();
    this.setupCanvasBlur();

    // Cập nhật title + placeholder khi đổi ngôn ngữ (chỉ 1 ngôn ngữ hiển thị).
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('CHAT_TITLE'));
      this.updatePlaceholder();
      this.relayout();
    });
  }

  /** Bật chế độ moderator → placeholder gợi ý lệnh debug `/help`. */
  setDebugMode(on: boolean): void {
    this.debugMode = on;
    this.updatePlaceholder();
  }

  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    this.userSized = false; // mini/normal mode đổi layout → bỏ custom size.
    this.chatW = DEFAULT_W;
    this.chatH = DEFAULT_H;
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

  /** Số dòng tối đa trước khi phải cuộn. Tính trực tiếp từ chatH. */
  private maxVisibleLines(): number {
    if (this.isMinimized) return 0;
    const topPad = 6; // padding phía trên text
    const space = this.chatH - INPUT_H - 6 - topPad; // 6 = padding dưới input
    return Math.max(3, Math.floor(space / LINE_H));
  }

  /** Số dòng text đang hiển thị (capped theo EXPANDED_MAX_LINES). */
  private effectiveLines(): number {
    return Math.min(Math.max(this.visibleLines, 3), EXPANDED_MAX_LINES);
  }

  private recreateTextObjects(): void {
    this.textObjects.forEach((t) => t.destroy());
    this.textObjects = [];
    const max = Math.max(3, EXPANDED_MAX_LINES);
    const wrapW = this.chatW - 16;

    for (let i = 0; i < max; i++) {
      const t = this.scene.add
        .text(8, 6 + i * LINE_H, '', {
          fontSize: '11px',
          fontFamily: FONT.mono,
          color: C.text,
          wordWrap: { width: wrapW },
          lineSpacing: 0,
        });
      // Viền mỏng giúp chữ dễ đọc trên nền tối (dùng API sau, không set trong style).
      t.setStroke('#000000', 2);
      this.textObjects.push(t);
      this.contentContainer.add(t);
    }
    this.render();
  }

  private renderTextVisibility(): void {
    const show = !this.isMinimized && this.open;
    this.textObjects.forEach((t) => t.setVisible(show));
    if (this.inputEl) this.inputEl.style.display = show ? '' : 'none';
    if (this.scrollZone) this.scrollZone.setVisible(show);
    this.updateScrollBar();
  }

  addLine(text: string): void {
    this.lines.push(sanitizeUnicode(text));
    if (this.lines.length > this.MAX_HISTORY) this.lines.shift();
    // Giữ scroll ở đáy nếu đang ở cuối; nếu đang đọc lịch sử thì giữ nguyên offset.
    if (this.scrollY === 0) this.scrollY = 0;
    else this.scrollY = Math.min(this.scrollY + 1, this.MAX_HISTORY);
    this.render();
  }

  private render(): void {
    const max = this.maxVisibleLines();
    this.visibleLines = max;
    const total = this.lines.length;
    // Tính start: hiển thị từ cuối trừ scrollY.
    const end = total - this.scrollY;
    const start = Math.max(0, end - max);
    const slice = this.lines.slice(start, end);
    for (let i = 0; i < this.textObjects.length; i++) {
      this.textObjects[i]?.setText(slice[i] ?? '');
      this.textObjects[i]?.setVisible(!this.isMinimized && this.open && i < max);
    }
    this.updateScrollBar();
  }

  // ── Scroll ──────────────────────────────────────────────────────────────
  private createScrollControls(): void {
    if (this.scrollZone) return;
    // Zone phủ vùng nội dung (trên text, dưới header, trên input).
    const z = this.scene.add
      .zone(0, 0, this.chatW, this.chatH)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: false });
    // Không chặn pointerdown body (vẫn cho phép click map xuyên qua vùng trống).
    z.disableInteractive();
    this.scrollZone = z;
    this.contentContainer.add(z);

    this.scrollGfx = this.scene.add.graphics();
    this.contentContainer.add(this.scrollGfx);

    // Wheel → cuộn. Giữ reference để `destroy()` off đúng listener của mình.
    this.wheelHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.open || this.isMinimized) return;
      // Chỉ cuộn khi chuột nằm trong khung chat.
      const rect = this.scene.scale.canvas.getBoundingClientRect();
      const rectX = rect.left + this.currentX * (rect.width / this.scene.scale.width);
      const rectY = rect.top + this.currentY * (rect.height / this.scene.scale.height);
      const { actualW, actualH } = this.getScaleAndBounds();
      const rectW = actualW * (rect.width / this.scene.scale.width);
      const rectH = actualH * (rect.height / this.scene.scale.height);
      if (
        pointer.x < rectX ||
        pointer.x > rectX + rectW ||
        pointer.y < rectY ||
        pointer.y > rectY + rectH
      ) {
        return;
      }
      const delta = Math.sign(pointer.deltaY);
      if (delta > 0) this.scrollBy(1);
      else if (delta < 0) this.scrollBy(-1);
    };
    this.scene.input.on('wheel', this.wheelHandler);
  }

  private scrollBy(dir: 1 | -1): void {
    const total = this.lines.length;
    const max = this.maxVisibleLines();
    const maxScroll = Math.max(0, total - max);
    const next = Phaser.Math.Clamp(this.scrollY + dir, 0, maxScroll);
    if (next === this.scrollY) return;
    this.scrollY = next;
    this.render();
  }

  /** Vẽ thanh cuộn nhỏ ở mép phải nếu lịch sử tràn. */
  private updateScrollBar(): void {
    const g = this.scrollGfx;
    if (!g) return;
    g.clear();
    if (!this.open || this.isMinimized) return;
    const total = this.lines.length;
    const max = this.maxVisibleLines();
    if (total <= max) return;

    const railX = this.chatW - 10;
    const railY = 6;
    const railH = this.chatH - INPUT_H - 16;
    const railW = 4;
    g.fillStyle(0x2e3358, 0.7);
    g.fillRect(railX, railY, railW, railH);

    const maxScroll = Math.max(1, total - max);
    const thumbH = Math.max(20, (max / total) * railH);
    const thumbY = railY + (this.scrollY / maxScroll) * (railH - thumbH);
    g.fillStyle(0x00cec9, 0.9);
    g.fillRect(railX, thumbY, railW, thumbH);
  }

  // ── Resize ──────────────────────────────────────────────────────────────
  private createResizeGrip(): void {
    if (this.resizeZone) return;
    // Zone hình chữ nhật ở góc dưới-phải — kéo để resize cả width + height.
    // QUAN TRỌNG: ô input HTML phủ dải dưới cùng của panel → phải để trống
    // góc dưới-phải `RESIZE_ZONE` px để canvas nhận được pointer event.
    const z = this.scene.add
      .zone(0, 0, RESIZE_ZONE, RESIZE_ZONE)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.resizeZone = z;
    this.modalContainer.add(z);

    z.on('pointerover', () => {
      if (z.input) z.input.cursor = 'nwse-resize';
    });

    z.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.userSized = true;
      // Grip chỉ nằm ở góc dưới-phải → kéo đổi cả chiều rộng lẫn chiều cao.
      this.resizingW = true;
      this.resizingH = true;
      this.resizeAnchor = { x: p.x, y: p.y, w: this.chatW, h: this.chatH };
    });

    const onMove = (p: Phaser.Input.Pointer) => {
      if (!this.resizingW && !this.resizingH) return;
      const { scale } = this.getScaleAndBounds();
      const dx = (p.x - this.resizeAnchor.x) / scale;
      const dy = (p.y - this.resizeAnchor.y) / scale;
      if (this.resizingW) {
        this.chatW = Phaser.Math.Clamp(this.resizeAnchor.w + dx, MIN_W, MAX_W);
      }
      if (this.resizingH) {
        this.chatH = Phaser.Math.Clamp(this.resizeAnchor.h + dy, MIN_H, MAX_H);
      }
      this.applySize();
    };
    this.resizeMoveHandler = onMove;
    this.scene.input.on('pointermove', onMove);

    const onUp = () => {
      if (!this.resizingW && !this.resizingH) return;
      this.resizingW = false;
      this.resizingH = false;
      this.scrollY = 0;
      this.relayout();
    };
    this.resizeUpHandler = onUp;
    this.scene.input.on('pointerup', onUp);
    this.scene.input.on('pointerupoutside', onUp);
  }

  /** Áp dụng chatW/chatH vào opts + relayout. */
  private applySize(): void {
    this.opts.width = this.chatW;
    this.opts.height = this.chatH;
    this.relayout();
  }

  /** Vẽ 3 đường chéo nhỏ ở góc dưới-phải làm gợi ý "kéo để resize". */
  private drawResizeGrip(): void {
    if (!this.gripGfx) {
      this.gripGfx = this.scene.add.graphics();
      this.modalContainer.add(this.gripGfx);
    }
    const g = this.gripGfx;
    g.clear();
    // Luôn vẽ khi panel đang mở + không minimize (nút resize luôn sẵn sàng kéo).
    if (this.isMinimized || !this.open) return;
    const W = this.opts.width;
    const H = this.opts.height;
    const pad = 4;
    g.lineStyle(1.5, 0x5a63a0, 0.95);
    for (let i = 0; i < 3; i++) {
      const off = pad + i * 4;
      g.lineBetween(W - off, H - pad, W - pad, H - off);
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────
  /**
   * Tạo ô nhập chữ cố định ở đáy modal — luôn hiện, tự nắn lại vị trí theo `relayout()`.
   */
  private createInput(): void {
    if (this.inputEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    this.updatePlaceholder(input);
    input.style.cssText = `
      position:absolute; padding:3px 8px; font-size:12px; font-family:${FONT.mono};
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
      } else if (e.key === 'PageUp') {
        this.scrollBy(1);
        e.preventDefault();
      } else if (e.key === 'PageDown') {
        this.scrollBy(-1);
        e.preventDefault();
      }
      e.stopPropagation();
    });
  }

  private submitInput(input: HTMLInputElement): void {
    const msg = input.value.trim();
    if (!msg) return;
    if (msg.startsWith('/') || this.cmdHistory[this.cmdHistory.length - 1] !== msg) {
      this.cmdHistory.push(msg);
      if (this.cmdHistory.length > 50) this.cmdHistory.shift();
    }
    this.cmdHistoryIdx = this.cmdHistory.length;
    input.value = '';
    this.onSend?.(msg);
    // Gửi xong → trả focus về game để phím W/A/S/D hoạt động lại.
    // (Nếu không blur, mọi phím gõ sau đó đều rơi vào ô chat.)
    input.blur();
  }

  private browseHistory(input: HTMLInputElement, dir: 1 | -1): void {
    if (this.cmdHistory.length === 0) return;
    this.cmdHistoryIdx = Math.max(0, Math.min(this.cmdHistory.length, this.cmdHistoryIdx + dir));
    input.value = this.cmdHistory[this.cmdHistoryIdx] ?? '';
    setTimeout(() => {
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }

  private updatePlaceholder(input?: HTMLInputElement): void {
    const el = input ?? this.inputEl;
    if (!el) return;
    el.placeholder = this.debugMode ? t('CHAT_PLACEHOLDER_DEBUG') : t('CHAT_PLACEHOLDER');
  }

  /**
   * Cập nhật vị trí ô input theo modal hiện tại (gọi sau relayout/show).
   * Ô input bám đáy panel: `left = currentX + 8`, `top = currentY + chatH - INPUT_H - 6`.
   */
  private positionInput(): void {
    const input = this.inputEl;
    if (!input || !this.open || this.isMinimized) {
      if (input) input.style.display = 'none';
      return;
    }
    input.style.display = '';

    const { scale, actualW } = this.getScaleAndBounds();
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;

    // Toạ độ local trong logical space → screen px.
    // Phải trừ RESIZE_ZONE để nhường góc dưới-phải cho grip resize
    // (ô input HTML phủ dải dưới cùng → không được che mất grip).
    const localX = 8;
    const localY = this.chatH - INPUT_H - 6;
    const localW = this.chatW - 16 - RESIZE_ZONE;

    input.style.left = `${rect.left + (this.currentX + localX * scale) * scaleX}px`;
    input.style.top = `${rect.top + (this.currentY + localY * scale) * scaleY}px`;
    input.style.width = `${localW * scale * scaleX}px`;
    input.style.height = `${INPUT_H * scale * scaleY}px`;
    input.style.fontSize = `${Math.max(10, Math.round(12 * scale))}px`;
    input.style.display = '';
  }

  /**
   * Bấm chuột vào bất kỳ đâu trong game (canvas) → mất focus ô chat.
   * Nếu không, ô chat giữ focus vĩnh viễn và nuốt mọi phím điều khiển (W/A/S/D...).
   */
  private setupCanvasBlur(): void {
    this.canvasPointerDownHandler = () => {
      if (this.inputEl && document.activeElement === this.inputEl) {
        this.inputEl.blur();
      }
    };
    this.scene.input.on('pointerdown', this.canvasPointerDownHandler);
  }

  private removeInput(): void {
    if (this.inputEl) {
      this.inputEl.remove();
      this.inputEl = null;
    }
  }

  /**
   * Nút góc trên-trái — cánh tay kéo resize.
   *
   * - **Kéo** (di chuyển > 3px): đổi kích thước khung chat theo hướng kéo
   *   (kéo phải = rộng hơn, kéo xuống = cao hơn). Tự động bật `userSized`.
   * - **Bấm** (không kéo): không làm gì — nút luôn sẵn sàng kéo, không cần bật/tắt.
   */
  private createLeftHeaderButton(): void {
    const headerH = this.opts.headerHeight ?? 28;
    const cy = Math.round(headerH / 2);

    this.resizeToggle = this.scene.add
      .text(14, cy, '⤢', ts(13, C.muted, FONT.ui))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.resizeToggle.on('pointerover', () => {
      if (!this.toggleDragging) this.resizeToggle?.setColor('#00cec9');
    });
    this.resizeToggle.on('pointerout', () => this.updateResizeToggle());

    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;
    let moved = false;

    this.resizeToggle.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.userSized = true;
      this.toggleDragging = true;
      moved = false;
      startX = p.x;
      startY = p.y;
      startW = this.chatW;
      startH = this.chatH;
      // Bật grip ngay khi bắt đầu kéo → người dùng thấy phản hồi tức thì.
      if (this.resizeZone) this.resizeZone.setInteractive({ useHandCursor: true });
    });

    const onMove = (p: Phaser.Input.Pointer) => {
      if (!this.toggleDragging) return;
      const { scale } = this.getScaleAndBounds();
      const dx = (p.x - startX) / scale;
      const dy = (p.y - startY) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      this.chatW = Phaser.Math.Clamp(startW + dx, MIN_W, MAX_W);
      this.chatH = Phaser.Math.Clamp(startH + dy, MIN_H, MAX_H);
      this.applySize();
    };
    this.toggleMoveHandler = onMove;
    this.scene.input.on('pointermove', onMove);

    const onUp = () => {
      if (!this.toggleDragging) return;
      this.toggleDragging = false;
      if (moved) {
        // Kéo xong → chốt kích thước, reset cuộn về đáy.
        this.scrollY = 0;
        this.relayout();
      }
      this.updateResizeToggle();
    };
    this.toggleUpHandler = onUp;
    this.scene.input.on('pointerup', onUp);
    this.scene.input.on('pointerupoutside', onUp);

    this.modalContainer.add(this.resizeToggle);
    this.updateResizeToggle();
  }

  private updateResizeToggle(): void {
    if (!this.resizeToggle) return;
    this.resizeToggle.setColor(C.muted);
  }

  /** Bám ô input HTML theo modal mỗi frame khi kéo thả. */
  protected override onDragMove(): void {
    this.positionInput();
  }

  /** Kết thúc kéo thả → chốt vị trí input. */
  protected override onDragEnd(): void {
    this.positionInput();
  }

  setVisible(v: boolean): void {
    if (v) {
      this.show();
      this.createInput();
      this.positionInput();
    } else {
      this.close();
    }
  }

  /** Xoá toàn bộ nội dung khung chat (giữ nguyên trạng thái mở/đóng). */
  clear(): void {
    this.lines = [];
    this.scrollY = 0;
    this.visibleLines = 6;
    this.collapseTimer?.remove();
    this.collapseTimer = undefined;
    this.recreateTextObjects();
    this.render();
  }

  /** Focus vào ô input (mở modal nếu đang đóng). */
  focusInput(): void {
    if (!this.open) this.show();
    if (this.isMinimized) this.expand();
    this.positionInput();
    this.inputEl?.focus();
  }

  // ── Ghi log ─────────────────────────────────────────────────────────────
  addSystemLine(text: string, color: string = C.text): void {
    this.pushLines([text], color);
  }

  addSystemBlock(text: string, color: string = C.text): void {
    this.pushLines(text.split('\n'), color);
  }

  private pushLines(texts: string[], color: string): void {
    const target = Math.min(
      this.lines.length + texts.length,
      Math.max(this.maxVisibleLines(), EXPANDED_MAX_LINES),
    );
    if (this.visibleLines < target) {
      this.visibleLines = target;
      this.recreateTextObjects();
    }
    for (const line of texts) {
      this.lines.push(sanitizeUnicode(line));
    }
    while (this.lines.length > this.MAX_HISTORY) this.lines.shift();
    this.render();

    const startIdx = Math.max(0, this.textObjects.length - texts.length);
    for (let i = startIdx; i < this.textObjects.length; i++) {
      this.textObjects[i]?.setColor(color);
    }

    if (target > this.maxVisibleLines()) {
      this.collapseTimer?.remove();
      this.collapseTimer = this.scene.time.delayedCall(EXPAND_MS, () => {
        this.collapseTimer = undefined;
        this.visibleLines = this.maxVisibleLines();
        this.lines = this.lines.slice(-this.MAX_HISTORY);
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

    // Sau khi UiModal relayout (set opts.width/height), đồng bộ chatW/chatH
    // về opts — tránh lệch khi resize dính lại sau khi layout bị thay đổi.
    if (!this.userSized) {
      this.chatW = this.opts.width;
      this.chatH = this.opts.height;
    }

    // Kéo zone resize về góc dưới-phải của panel (luôn bật sẵn để kéo tự do).
    if (this.resizeZone) {
      const W = this.opts.width;
      const H = this.opts.height;
      this.resizeZone.setPosition(W - RESIZE_ZONE, H - RESIZE_ZONE);
      this.resizeZone.setActive(true);
      this.resizeZone.setInteractive({ useHandCursor: true });
    }

    // Nút resize ở góc trên-trái: dịch title sang phải để nhường chỗ.
    const headerH = this.opts.headerHeight ?? 28;
    if (this.resizeToggle) {
      this.resizeToggle.setPosition(14, Math.round(headerH / 2));
    }
    const title = this.titleText;
    if (title) {
      title.setPosition(34, Math.round(headerH / 2));
      title.setWordWrapWidth(Math.max(30, this.opts.width - 40 - 80), false);
    }
    this.updateResizeToggle();

    // Vẽ gợi ý grip (3 đường chéo) ở góc dưới-phải — chỉ khi đang bật resize.
    this.drawResizeGrip();

    // Đồng bộ kích thước vùng cuộn theo panel.
    if (this.scrollZone) {
      this.scrollZone.setSize(this.chatW, this.chatH);
    }

    // Đặt lại wrap width cho text theo chatW mới.
    const wrapW = this.chatW - 16;
    for (const t of this.textObjects) {
      t.setWordWrapWidth(wrapW, false);
    }

    // Input bám đáy panel.
    this.positionInput();
    this.renderTextVisibility();
    this.render();
  }

  destroy(): void {
    this.unsubLang?.();
    this.collapseTimer?.remove();
    this.collapseTimer = undefined;
    this.removeInput();
    // Chỉ off listener của ChatLog — KHÔNG removeAllListeners vì các modal khác
    // (SettingsPanel, BattleModal...) cũng đăng ký trên cùng `scene.input`.
    if (this.wheelHandler) this.scene.input.off('wheel', this.wheelHandler);
    if (this.resizeMoveHandler) this.scene.input.off('pointermove', this.resizeMoveHandler);
    if (this.resizeUpHandler) {
      this.scene.input.off('pointerup', this.resizeUpHandler);
      this.scene.input.off('pointerupoutside', this.resizeUpHandler);
    }
    if (this.toggleMoveHandler) this.scene.input.off('pointermove', this.toggleMoveHandler);
    if (this.toggleUpHandler) {
      this.scene.input.off('pointerup', this.toggleUpHandler);
      this.scene.input.off('pointerupoutside', this.toggleUpHandler);
    }
    if (this.canvasPointerDownHandler) {
      this.scene.input.off('pointerdown', this.canvasPointerDownHandler);
    }
    super.destroy();
  }
}

/**
 * Sửa lỗi Unicode của text before pushing.
 * - Bỏ surrogate pairs không hợp lệ (emoji không render được trên canvas → tofu).
 * - Chuẩn hoá NFC để tiếng Việt hiển thị đúng (precomposed vs decomposed).
 */
function sanitizeUnicode(s: string): string {
  if (!s) return s;
  // Chuẩn hoá NFC — tiếng Việt dùng precomposed.
  let out: string;
  try {
    out = s.normalize('NFC');
  } catch {
    out = s;
  }
  // Bỏ lone surrogates (không có cặp) → tránh crash/render tofu.
  out = out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  return out;
}
