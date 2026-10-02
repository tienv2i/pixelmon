import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, onLangChange} from '../i18n';

const MAX_CONSOLE_LINES = 14;

export interface DebugConsoleOptions {
  onRunCommand?: (cmd: string) => string | void;
  onClose?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

/**
 * **DebugConsole** — Khung nhập lệnh và xem thông tin chi tiết debug
 * - Đặt mặc định ở bên phải màn hình (tương tự như khung Chat ở bên trái).
 * - Nhập các lệnh debug: `/help`, `/map`, `/pos`, `/tp`, `/speed`, `/noclip`, `/overlay`, `/layer`, `/server`, `/clear`...
 * - Lưu lịch sử lệnh, dùng phím Mũi tên Lên/Xuống để duyệt lại các lệnh vừa gõ.
 */
export class DebugConsole extends UiModal {
  private unsubLang?: () => void;
  private logLines: Array<{ text: string; color: string }> = [];
  private textObjects: Phaser.GameObjects.Text[] = [];
  private inputEl: HTMLInputElement | null = null;
  private commandHistory: string[] = [];
  private historyIndex = -1;
  private onRunCommand?: (cmd: string) => string | void;

  constructor(scene: Phaser.Scene, opts: DebugConsoleOptions = {}) {
    super(scene, {
      title: t('DBG_CONSOLE_TITLE'),
      width: 380,
      height: 290,
      headerHeight: 28,
      lockUi: false,
      depth: 120,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'top-right',
      defaultOffsetX: 12,
      defaultOffsetY: 40,
      onClose: () => {
        this.removeInput();
        opts.onClose?.();
      },
      onMinimize: () => {
        this.renderVisibility();
      },
    });

    this.onRunCommand = opts.onRunCommand;

    // Tạo các dòng text hiển thị log
    this.createLogTextObjects();

    // Khởi tạo thông điệp mở đầu
    this.addLog(t('DBG_CONSOLE_WELCOME'), '#00cec9');
    this.addLog(t('DBG_CONSOLE_HELP'), '#b2bec3');
    this.addLog(t('DBG_CONSOLE_HINT'), '#74b9ff');

    // Tạo input HTML gắn ở đáy panel
    this.createDomInput();
  
    // Cập nhật title khi đổi ngôn ngữ (chỉ 1 ngôn ngữ hiển thị)
    this.unsubLang = onLangChange(() => this.setTitle(t('DBG_CONSOLE_TITLE')));
  }

  private createLogTextObjects(): void {
    const lineH = 15;
    for (let i = 0; i < MAX_CONSOLE_LINES; i++) {
      const t = this.scene.add.text(12, 8 + i * lineH, '', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#dfe6e9',
        wordWrap: { width: 356 },
      });
      this.textObjects.push(t);
      this.contentContainer.add(t);
    }
  }

  public addLog(text: string, color = '#dfe6e9'): void {
    const split = text.split('\n');
    split.forEach((line) => {
      this.logLines.push({ text: line, color });
      if (this.logLines.length > 100) {
        this.logLines.shift();
      }
    });
    this.render();
  }

  public clearLog(): void {
    this.logLines = [];
    this.render();
  }

  public clearLogs(): void {
    this.clearLog();
  }

  private render(): void {
    const start = Math.max(0, this.logLines.length - MAX_CONSOLE_LINES);
    const visibleLines = this.logLines.slice(start);

    for (let i = 0; i < MAX_CONSOLE_LINES; i++) {
      const entry = visibleLines[i];
      const textObj = this.textObjects[i];
      if (!textObj) continue;

      if (entry) {
        textObj.setText(entry.text).setColor(entry.color);
      } else {
        textObj.setText('');
      }
    }
  }

  private renderVisibility(): void {
    const show = !this.isMinimized && this.open;
    this.textObjects.forEach((t) => t.setVisible(show));
    if (this.inputEl) {
      this.inputEl.style.display = show ? 'block' : 'none';
    }
  }

  private createDomInput(): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('DBG_CONSOLE_INPUT');
    input.style.cssText = `
      position: absolute;
      padding: 4px 10px;
      font-size: 11px;
      font-family: monospace;
      border: 1px solid #00cec9;
      background: #0f172a;
      color: #81ecec;
      border-radius: 4px;
      outline: none;
      z-index: 1002;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
    `;

    document.body.appendChild(input);
    this.inputEl = input;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = input.value.trim();
        if (cmd) {
          this.commandHistory.push(cmd);
          this.historyIndex = this.commandHistory.length;
          this.addLog(`> ${cmd}`, '#ffeaa7');

          if (cmd.toLowerCase() === '/clear') {
            this.clearLog();
          } else if (this.onRunCommand) {
            const out = this.onRunCommand(cmd);
            if (out) {
              this.addLog(out, '#55efc4');
            }
          }
        }
        input.value = '';
        e.stopPropagation();
      } else if (e.key === 'ArrowUp') {
        if (this.commandHistory.length > 0 && this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.commandHistory[this.historyIndex] ?? '';
        }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (this.historyIndex < this.commandHistory.length - 1) {
          this.historyIndex++;
          input.value = this.commandHistory[this.historyIndex] ?? '';
        } else {
          this.historyIndex = this.commandHistory.length;
          input.value = '';
        }
        e.preventDefault();
      } else if (e.key === 'Escape') {
        input.blur();
        e.stopPropagation();
      }
    });

    this.positionDomInput();
  }

  private positionDomInput(): void {
    if (!this.inputEl) return;
    const { actualW, actualH } = this.getScaleAndBounds();
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;

    const inputH = 24;
    const inputX = this.currentX + 8;
    const inputY = this.currentY + actualH - inputH - 6;

    this.inputEl.style.left = `${rect.left + inputX * scaleX}px`;
    this.inputEl.style.top = `${rect.top + inputY * scaleY}px`;
    this.inputEl.style.width = `${(actualW - 16) * scaleX}px`;
    this.inputEl.style.height = `${inputH * scaleY}px`;
    this.inputEl.style.display = this.open && !this.isMinimized ? 'block' : 'none';
  }

  public relayout(): void {
    super.relayout();
    this.positionDomInput();
  }

  public override show(): void {
    super.show();
    this.renderVisibility();
    this.positionDomInput();
    (this.opts as any).onVisibilityChange?.(true);
  }

  public override close(): void {
    super.close();
    this.renderVisibility();
    this.positionDomInput();
    (this.opts as any).onVisibilityChange?.(false);
  }

  public setVisible(visible: boolean): this {
    if (visible) this.show();
    else this.close();    return this;
  }

  public setStackOffsetY(y: number): void {
    this.setDefaultOffsetY(y);
    this.positionDomInput();
  }

  private removeInput(): void {
    if (this.inputEl) {
      this.inputEl.remove();
      this.inputEl = null;
    }
  }

  public destroy(): void {
    this.unsubLang?.();
    this.removeInput();
    super.destroy();
  }
}
