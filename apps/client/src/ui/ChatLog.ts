import Phaser from 'phaser';
import { C, FONT } from './theme';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const BASE_MAX_LINES = 6;
const LINE_H = 18;

/**
 * Khung Chat (ChatLog):
 * - Tỷ lệ hiển thị lớn, sắc nét, dễ đọc.
 * - Draggable: kéo thả di chuyển bằng thanh tiêu đề (Title Bar).
 * - Nút Thu nhỏ / Mở rộng (Minimize/Expand: ▼ / ▲).
 * - Nút Neo (Dock: ⚓) đưa panel về vị trí neo mặc định ở góc màn hình.
 * - Enter mở input HTML để chat, Escape đóng.
 */
export class ChatLog {
  private scene: Phaser.Scene;
  private lines: string[] = [];
  private textObjects: Phaser.GameObjects.Text[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private btnMin: Phaser.GameObjects.Text;
  private btnDock: Phaser.GameObjects.Text;
  private titleBarZone: Phaser.GameObjects.Zone;

  private inputEl: HTMLInputElement | null = null;
  private onSend?: (msg: string) => void;

  private readonly padding = 8;
  private _hudMode: HudMode = 'normal';
  private _uiZoomManager?: UiZoomManager;

  // Trạng thái kéo thả & thu nhỏ
  private customX?: number;
  private customY?: number;
  private currentX = 0;
  private currentY = 0;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private isMinimized = false;
  private isVisible = true;

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => this.relayout());
  }

  setHudMode(mode: HudMode): void {
    this._hudMode = mode;
    this.recreateTextObjects();
    this.relayout();
  }

  private recreateTextObjects(): void {
    this.textObjects.forEach((t) => t.destroy());
    this.textObjects = [];
    const max = this.maxLines();
    const wrapW = Math.max(160, this.getBaseWidth() - 16);
    for (let i = 0; i < max; i++) {
      const t = this.scene.add
        .text(0, 0, '', {
          fontSize: '12px',
          fontFamily: FONT.mono,
          color: C.text,
          wordWrap: { width: wrapW },
        })
        .setDepth(102)
        .setScrollFactor(0);
      this.textObjects.push(t);
    }
    this.render();
  }

  private getBaseWidth(): number {
    const W = this.scene.scale.width;
    if (W < 560) {
      return Math.max(200, Math.min(280, W - 24));
    }
    return Math.min(340, Math.max(280, W * 0.38));
  }

  private isMiniMode(): boolean {
    return (
      this._hudMode === 'mini' ||
      this.scene.scale.height < 500 ||
      this.scene.scale.width < 560
    );
  }

  private maxLines(): number {
    return this.isMiniMode() ? 3 : BASE_MAX_LINES;
  }

  private getHeight(z: number): number {
    if (this.isMinimized) {
      return 26 * z;
    }
    return (this.maxLines() * LINE_H + 28) * z;
  }

  /** Kích thước panel hiện tại. */
  getSize(): { w: number; h: number } {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    return {
      w: this.getBaseWidth() * z,
      h: this.getHeight(z),
    };
  }

  constructor(scene: Phaser.Scene, onSend?: (msg: string) => void) {
    this.scene = scene;
    this.onSend = onSend;

    // Graphics nền & viền
    this.graphics = scene.add.graphics().setDepth(100).setScrollFactor(0);

    // Tiêu đề
    this.title = scene.add
      .text(0, 0, '💬 CHAT', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: '#00cec9',
        fontStyle: 'bold',
      })
      .setDepth(102)
      .setScrollFactor(0);

    // Nút Neo (Dock): quay về vị trí mặc định
    this.btnDock = scene.add
      .text(0, 0, '⚓', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: '#9aa0c3',
      })
      .setOrigin(0.5)
      .setDepth(103)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.btnDock.on('pointerover', () => this.btnDock.setColor('#00cec9'));
    this.btnDock.on('pointerout', () => this.btnDock.setColor('#9aa0c3'));
    this.btnDock.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.customX = undefined;
      this.customY = undefined;
      this.relayout();
    });

    // Nút Thu nhỏ / Mở rộng (Minimize/Expand)
    this.btnMin = scene.add
      .text(0, 0, '▼', {
        fontSize: '10px',
        fontFamily: FONT.ui,
        color: '#9aa0c3',
      })
      .setOrigin(0.5)
      .setDepth(103)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.btnMin.on('pointerover', () => this.btnMin.setColor('#00cec9'));
    this.btnMin.on('pointerout', () => this.btnMin.setColor('#9aa0c3'));
    this.btnMin.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.isMinimized = !this.isMinimized;
      this.btnMin.setText(this.isMinimized ? '▲' : '▼');
      this.relayout();
    });

    // Vùng kéo thả Title Bar
    this.titleBarZone = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0, 0)
      .setDepth(101)
      .setScrollFactor(0)
      .setInteractive({ cursor: 'grab' });

    this.setupDragEvents();
    this.recreateTextObjects();

    this.addLine('--- Welcome to Pixelmon! ---');

    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown-ENTER', () => this.toggleInput());
    }

    this.relayout();
    scene.scale.on('resize', () => this.relayout());
  }

  private setupDragEvents(): void {
    this.titleBarZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      this.isDragging = true;
      this.dragOffset = {
        x: pointer.x - this.currentX,
        y: pointer.y - this.currentY,
      };
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const z = this._uiZoomManager?.uiZoom ?? 1;
      const w = this.getBaseWidth() * z;
      const h = this.getHeight(z);
      const maxX = Math.max(0, this.scene.scale.width - w);
      const maxY = Math.max(0, this.scene.scale.height - h);
      this.customX = Phaser.Math.Clamp(pointer.x - this.dragOffset.x, 0, maxX);
      this.customY = Phaser.Math.Clamp(pointer.y - this.dragOffset.y, 0, maxY);
      this.relayout();
    });

    const endDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
      }
    };
    this.scene.input.on('pointerup', endDrag);
    this.scene.input.on('pointerupoutside', endDrag);
  }

  private relayout(): void {
    if (!this.isVisible) return;
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const maxLines = this.maxLines();
    const w = this.getBaseWidth() * z;
    const h = this.getHeight(z);

    // Tính toạ độ: ưu tiên customX/Y nếu người dùng kéo thả
    let X: number;
    let Y: number;
    if (this.customX !== undefined && this.customY !== undefined) {
      const maxX = Math.max(0, this.scene.scale.width - w);
      const maxY = Math.max(0, this.scene.scale.height - h);
      X = Phaser.Math.Clamp(this.customX, 0, maxX);
      Y = Phaser.Math.Clamp(this.customY, 0, maxY);
    } else {
      X = this.scene.scale.width - w - this.padding * z;
      Y = this.scene.scale.height - h - this.padding * z;
    }
    this.currentX = X;
    this.currentY = Y;

    // Header bar height
    const headerH = 24 * z;

    // Vẽ panel
    this.graphics.clear();
    // Shadow
    this.graphics.fillStyle(0x000000, 0.35);
    this.graphics.fillRoundedRect(X + 2, Y + 2, w, h, 6);
    // Body background
    this.graphics.fillStyle(C.panel, 0.94);
    this.graphics.fillRoundedRect(X, Y, w, h, 6);
    // Header background
    this.graphics.fillStyle(0x13152c, 0.95);
    this.graphics.fillRoundedRect(X, Y, w, headerH, { tl: 6, tr: 6, bl: 0, br: 0 });
    // Border
    this.graphics.lineStyle(1, C.border, 0.95);
    this.graphics.strokeRoundedRect(X, Y, w, h, 6);
    // Header divider line (nếu không minimize)
    if (!this.isMinimized) {
      this.graphics.lineStyle(1, 0x2e3358, 0.6);
      this.graphics.lineBetween(X, Y + headerH, X + w, Y + headerH);
    }

    // Title text
    this.title
      .setPosition(X + 8 * z, Y + 5 * z)
      .setFontSize(Math.max(10, Math.round(11 * z)));

    // Drag zone
    this.titleBarZone.setPosition(X, Y).setSize(w - 48 * z, headerH);

    // Nút Neo (Dock)
    const isDocked = this.customX === undefined;
    this.btnDock
      .setPosition(X + w - 32 * z, Y + headerH / 2)
      .setFontSize(Math.max(9, Math.round(11 * z)))
      .setColor(isDocked ? '#555a80' : '#00cec9');

    // Nút Thu nhỏ / Mở rộng (Minimize)
    this.btnMin
      .setPosition(X + w - 12 * z, Y + headerH / 2)
      .setFontSize(Math.max(9, Math.round(10 * z)));

    // Cập nhật vị trí các dòng tin nhắn
    if (this.isMinimized) {
      this.textObjects.forEach((t) => t.setVisible(false));
    } else {
      const wrapW = Math.max(140, w - 16 * z);
      for (let i = 0; i < maxLines; i++) {
        const txt = this.textObjects[i];
        if (txt) {
          txt
            .setPosition(X + 8 * z, Y + headerH + (4 + i * LINE_H) * z)
            .setFontSize(Math.max(10, Math.round(11 * z)))
            .setWordWrapWidth(wrapW)
            .setVisible(this.isVisible);
        }
      }
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
    if (!this.isVisible) return;

    if (this.isMinimized) {
      this.isMinimized = false;
      this.btnMin.setText('▼');
      this.relayout();
    }

    const z = this._uiZoomManager?.uiZoom ?? 1;
    const w = this.getBaseWidth() * z;
    const h = this.getHeight(z);
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
    input.style.top = `${rect.top + (Y + h + 4) * scaleY}px`;
    input.style.width = `${w * scaleX}px`;
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
    this.isVisible = v;
    this.graphics.setVisible(v);
    this.title.setVisible(v);
    this.btnMin.setVisible(v);
    this.btnDock.setVisible(v);
    this.titleBarZone.setActive(v);
    if (!v) {
      this.textObjects.forEach((t) => t.setVisible(false));
      this.removeInput();
    } else {
      this.relayout();
    }
  }

  /** Danh sách object để WorldScene gán vào camera UI. */
  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return [
      this.graphics,
      this.title,
      this.btnMin,
      this.btnDock,
      this.titleBarZone,
      ...this.textObjects,
    ];
  }

  destroy(): void {
    this.removeInput();
    this.graphics.destroy();
    this.title.destroy();
    this.btnMin.destroy();
    this.btnDock.destroy();
    this.titleBarZone.destroy();
    this.textObjects.forEach((t) => t.destroy());
  }
}
