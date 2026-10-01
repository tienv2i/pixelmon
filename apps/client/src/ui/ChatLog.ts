import Phaser from 'phaser';
import { C, FONT } from './theme';
import { drawPanel, panelTitle } from './PanelFrame';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const BASE_MAX_LINES = 5;
const LINE_H = 16;

/** Bottom-right chat log. Enter mở input → gửi tin nhắn. */
export class ChatLog {
  private scene: Phaser.Scene;
  private lines: string[] = [];
  private textObjects: Phaser.GameObjects.Text[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private inputEl: HTMLInputElement | null = null;
  private onSend?: (msg: string) => void;

  private readonly baseW: number;
  private readonly baseH: number;
  private readonly padding = 8;

  private _hudMode: HudMode = 'normal';
  private _uiZoomManager?: UiZoomManager;

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => this.relayout());
  }

  setHudMode(mode: HudMode): void {
    this._hudMode = mode;
    // Tạo lại text objects vì số dòng thay đổi
    this.textObjects.forEach((t) => t.destroy());
    this.textObjects = [];
    const max = this.maxLines();
    for (let i = 0; i < max; i++) {
      const t = this.scene.add
        .text(0, 0, '', {
          fontSize: '11px',
          fontFamily: FONT.mono,
          color: C.text,
          wordWrap: { width: this.baseW - 16 },
        })
        .setDepth(102)
        .setScrollFactor(0);
      this.textObjects.push(t);
    }
    this.relayout();
  }

  private maxLines(): number {
    return this._hudMode === 'mini' ? 2 : BASE_MAX_LINES;
  }

  /**
   * Kích thước panel hiện tại (đã nhân uiZoom) — HudManager dùng để xếp chồng
   * các thanh công cụ cùng góc neo.
   */
  getSize(): { w: number; h: number } {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    return {
      w: this.baseW * z,
      h: (this.maxLines() * LINE_H + 24) * z,
    };
  }

  constructor(scene: Phaser.Scene, onSend?: (msg: string) => void) {
    this.scene = scene;
    this.onSend = onSend;
    this.baseW = Math.max(200, Math.min(320, scene.scale.width - 16));
    this.baseH = BASE_MAX_LINES * LINE_H + 24;

    this.graphics = drawPanel(scene, 0, 0, 0, 0, 100);
    this.title = panelTitle(scene, 0, 0, 'CHAT', 101);

    for (let i = 0; i < BASE_MAX_LINES; i++) {
      const t = scene.add
        .text(0, 0, '', {
          fontSize: '11px',
          fontFamily: FONT.mono,
          color: C.text,
          wordWrap: { width: this.baseW - 16 },
        })
        .setDepth(102)
        .setScrollFactor(0);
      this.textObjects.push(t);
    }

    this.addLine('--- Welcome to Pixelmon! ---');

    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown-ENTER', () => this.toggleInput());
    }

    this.relayout();
    scene.scale.on('resize', () => this.relayout());
  }

  private relayout(): void {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const maxLines = this.maxLines();
    const w = this.baseW * z;
    const h = (maxLines * LINE_H + 24) * z;
    const X = this.scene.scale.width - w - this.padding * z;
    const Y = this.scene.scale.height - h - this.padding * z;

    this.graphics.clear();
    this.graphics.fillStyle(0x000000, 0.25);
    this.graphics.fillRoundedRect(X + 3, Y + 3, w, h, 4);
    this.graphics.fillStyle(C.panel, 0.94);
    this.graphics.fillRoundedRect(X, Y, w, h, 4);
    this.graphics.lineStyle(1, C.border, 0.95);
    this.graphics.strokeRoundedRect(X, Y, w, h, 4);

    this.title?.setPosition(X + 8 * z, Y + 5 * z).setFontSize(12 * z);

    for (let i = 0; i < maxLines; i++) {
      this.textObjects[i]?.setPosition(X + 8 * z, Y + (20 + i * LINE_H) * z);
      this.textObjects[i]?.setVisible(true);
    }
    // ẩn các text thừa (nếu trước đó ở mini rồi chuyển về normal)
    for (let i = maxLines; i < this.textObjects.length; i++) {
      this.textObjects[i]?.setVisible(false);
    }
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

    const z = this._uiZoomManager?.uiZoom ?? 1;
    const w = this.baseW * z;
    const h = (this.maxLines() * LINE_H + 24) * z;
    const X = this.scene.scale.width - w - this.padding * z;
    const Y = this.scene.scale.height - h - this.padding * z;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Nhắn tin...';
    input.style.cssText = `
      position:absolute; padding:4px 6px; font-size:11px; font-family:monospace;
      border:1px solid #2e3358; background:#0f1020; color:#e8eaf6;
      border-radius:3px; outline:none; z-index:1001;
    `;
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;
    input.style.left = `${rect.left + X * scaleX + 8 * scaleX}px`;
    input.style.top = `${rect.top + (Y + h + 4) * scaleY}px`;
    input.style.width = `${(w - 16) * scaleX}px`;
    input.style.height = `${22 * scaleY}px`;

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
    this.graphics.setVisible(v);
    this.title?.setVisible(v);
    this.textObjects.forEach((t) => t.setVisible(v));
    if (!v) this.removeInput();
  }

  /** Danh sách object để WorldScene gán vào camera UI. */
  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return [this.graphics, this.title, ...this.textObjects];
  }

  destroy(): void {
    this.removeInput();
    this.graphics.destroy();
    this.title?.destroy();
    this.textObjects.forEach((t) => t.destroy());
  }
}
