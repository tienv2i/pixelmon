import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import type { UiZoomManager } from './UiZoomManager';

export type UiModalAlign =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'right';

export interface UiModalOptions {
  /** Tiêu đề modal (ví dụ: '⚙ CÀI ĐẶT HỆ THỐNG', '💬 TRÒ CHUYỆN', '👤 THÔNG TIN') */
  title: string;
  /** Chiều rộng chuẩn (local space) */
  width: number;
  /** Chiều cao chuẩn (local space) */
  height: number;
  /** Chiều cao header bar (mặc định: 34) */
  headerHeight?: number;

  /** Chế độ khóa UI: phủ overlay mờ đen khóa toàn bộ gameplay & UI bên dưới (mặc định: false) */
  lockUi?: boolean;
  /** Độ sâu rendering layer (mặc định: 200 nếu lockUi, 100 nếu không lockUi) */
  depth?: number;
  /** Cho phép kéo thả bằng header (mặc định: true) */
  draggable?: boolean;

  /** Cấu hình các nút điều khiển trên thanh Header */
  showClose?: boolean; // Nút ✕ đóng (mặc định: true)
  showMinimize?: boolean; // Nút － thu nhỏ / mở rộng (mặc định: true)
  showDock?: boolean; // Nút ⚓ neo về vị trí mặc định (mặc định: true)
  showSecondaryClose?: boolean; // Nút tắt thứ 2 (mặc định: false)

  /** Vị trí neo mặc định */
  defaultAlign?: UiModalAlign;
  defaultOffsetX?: number;
  defaultOffsetY?: number;

  /** Callbacks sự kiện */
  onClose?: () => void;
  onMinimize?: (minimized: boolean) => void;
  onDock?: () => void;
  onDragEnd?: (x: number, y: number) => void;
}

/**
 * **UiModal** — Khung cửa sổ / modal popup dùng chung cho toàn bộ giao diện game:
 *
 * Tính năng chính:
 * 1. **Thống nhất phong cách UI:** Header bar sắc nét, bo góc, viền neon tinh tế.
 * 2. **Điều khiển linh hoạt:** Hỗ trợ 2 nút tắt (nút ✕ chính + nút tắt phụ), nút thu nhỏ (－), nút neo vị trí (⚓).
 * 3. **Chế độ khóa UI (`lockUi`):** Phủ overlay đen nuốt tương tác (cho Settings, Dialog xác nhận), hoặc chế độ nổi tự do cho HUD (Chat, Party, Info, Weather).
 * 4. **Tự động co giãn theo UI Zoom (`UiZoomManager`):** Tự động scale theo `uiZoom` và kẹp an toàn không bao giờ tràn mép màn hình.
 * 5. **Container nội dung (`contentContainer`):** Cung cấp container riêng biệt để component con gắn các phần tử nội dung vào không gian local `(0, 0)`.
 */
export class UiModal {
  protected readonly scene: Phaser.Scene;
  protected opts: UiModalOptions;
  protected _uiZoomManager?: UiZoomManager;

  // Trạng thái mở & thu nhỏ
  protected open = true;
  protected isMinimized = false;

  // Toạ độ & kéo thả
  protected customX?: number;
  protected customY?: number;
  protected currentX = 0;
  protected currentY = 0;
  protected isDragging = false;
  protected dragOffset = { x: 0, y: 0 };

  // Các đối tượng hiển thị chính
  protected overlay?: Phaser.GameObjects.Graphics;
  protected overlayBlocker?: Phaser.GameObjects.Zone;
  protected modalContainer: Phaser.GameObjects.Container;
  protected panelBg: Phaser.GameObjects.Graphics;
  protected headerBg: Phaser.GameObjects.Graphics;
  protected titleText: Phaser.GameObjects.Text;
  protected headerZone: Phaser.GameObjects.Zone;

  // Nút điều khiển header
  protected btnDock?: Phaser.GameObjects.Text;
  protected btnMinimize?: Phaser.GameObjects.Text;
  protected btnClose?: Phaser.GameObjects.Text;
  protected btnSecondaryClose?: Phaser.GameObjects.Text;

  // Container nội dung dành cho các lớp con gắn elements
  public readonly contentContainer: Phaser.GameObjects.Container;

  // Danh sách toàn bộ GameObject để camera UI quản lý
  protected allObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, opts: UiModalOptions) {
    this.scene = scene;
    this.opts = {
      headerHeight: 34,
      lockUi: false,
      draggable: true,
      showClose: true,
      showMinimize: true,
      showDock: true,
      showSecondaryClose: false,
      defaultAlign: 'center',
      defaultOffsetX: 8,
      defaultOffsetY: 8,
      ...opts,
    };

    const depth = this.opts.depth ?? (this.opts.lockUi ? 200 : 100);

    // 1. Overlay khóa UI (nếu lockUi = true)
    if (this.opts.lockUi) {
      this.overlay = scene.add
        .graphics()
        .setDepth(depth)
        .setScrollFactor(0)
        .setVisible(false);
      this.allObjects.push(this.overlay);

      this.overlayBlocker = scene.add
        .zone(0, 0, 10, 10)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setScrollFactor(0)
        .setVisible(false)
        .setInteractive({ cursor: 'default' });

      this.overlayBlocker.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
      });
      this.allObjects.push(this.overlayBlocker);
    }

    // 2. Container chính của Modal
    this.modalContainer = scene.add
      .container(0, 0)
      .setDepth(depth + 1)
      .setScrollFactor(0)
      .setVisible(false);
    this.allObjects.push(this.modalContainer);

    // 3. Khung nền panel
    this.panelBg = scene.add.graphics();
    this.modalContainer.add(this.panelBg);

    // 4. Header background
    this.headerBg = scene.add.graphics();
    this.modalContainer.add(this.headerBg);

    // 5. Title Text
    this.titleText = scene.add.text(
      12,
      Math.round(this.opts.headerHeight! / 2),
      this.opts.title,
      ts(13, '#00cec9', FONT.ui),
    ).setOrigin(0, 0.5);
    this.modalContainer.add(this.titleText);

    // 6. Header Draggable Zone
    this.headerZone = scene.add
      .zone(0, 0, this.opts.width, this.opts.headerHeight!)
      .setOrigin(0, 0);

    if (this.opts.draggable) {
      this.headerZone.setInteractive({ cursor: 'grab' });
      this.setupDragEvents();
    }
    this.modalContainer.add(this.headerZone);

    // 7. Xây dựng các nút điều khiển Header (tính từ mép phải sang trái)
    let btnRightOffset = 14;
    const headerCenterY = Math.round(this.opts.headerHeight! / 2);

    // 7a. Nút ✕ Close (chính)
    if (this.opts.showClose) {
      this.btnClose = scene.add
        .text(this.opts.width - btnRightOffset, headerCenterY, '✕', ts(14, C.muted, FONT.ui))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.btnClose.on('pointerover', () => this.btnClose?.setColor('#ff7675'));
      this.btnClose.on('pointerout', () => this.btnClose?.setColor(C.muted));
      this.btnClose.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.close();
      });
      this.modalContainer.add(this.btnClose);
      btnRightOffset += 22;
    }

    // 7b. Nút tắt phụ (Secondary Close - ví dụ nút tắt nhanh cạnh nút chính)
    if (this.opts.showSecondaryClose) {
      this.btnSecondaryClose = scene.add
        .text(this.opts.width - btnRightOffset, headerCenterY, '⮌', ts(13, C.muted, FONT.ui))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.btnSecondaryClose.on('pointerover', () => this.btnSecondaryClose?.setColor('#fab1a0'));
      this.btnSecondaryClose.on('pointerout', () => this.btnSecondaryClose?.setColor(C.muted));
      this.btnSecondaryClose.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.close();
      });
      this.modalContainer.add(this.btnSecondaryClose);
      btnRightOffset += 22;
    }

    // 7c. Nút － / ＋ Minimize (Thu nhỏ / Mở rộng)
    if (this.opts.showMinimize) {
      this.btnMinimize = scene.add
        .text(this.opts.width - btnRightOffset, headerCenterY, '－', ts(14, C.muted, FONT.ui))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.btnMinimize.on('pointerover', () => this.btnMinimize?.setColor('#ffeaa7'));
      this.btnMinimize.on('pointerout', () => this.btnMinimize?.setColor(C.muted));
      this.btnMinimize.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.toggleMinimize();
      });
      this.modalContainer.add(this.btnMinimize);
      btnRightOffset += 22;
    }

    // 7d. Nút ⚓ Dock (Neo vị trí mặc định)
    if (this.opts.showDock) {
      this.btnDock = scene.add
        .text(this.opts.width - btnRightOffset, headerCenterY, '⚓', ts(13, C.muted, FONT.ui))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.btnDock.on('pointerover', () => this.btnDock?.setColor('#00cec9'));
      this.btnDock.on('pointerout', () => this.btnDock?.setColor(C.muted));
      this.btnDock.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.dock();
      });
      this.modalContainer.add(this.btnDock);
      btnRightOffset += 22;
    }

    // Thu hẹp vùng drag của header để không bấm nhầm vào các nút bên phải
    this.headerZone.setSize(Math.max(40, this.opts.width - btnRightOffset), this.opts.headerHeight!);

    // 8. Container chứa nội dung (nằm ngay dưới header bar)
    this.contentContainer = scene.add.container(0, this.opts.headerHeight!);
    this.modalContainer.add(this.contentContainer);

    // Lắng nghe sự kiện resize của màn hình
    scene.scale.on('resize', () => {
      if (this.open) this.relayout();
    });
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  protected setupDragEvents(): void {
    this.headerZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      pointer.event?.stopPropagation();
      this.isDragging = true;
      this.dragOffset = {
        x: pointer.x - this.modalContainer.x,
        y: pointer.y - this.modalContainer.y,
      };
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const { actualW, actualH } = this.getScaleAndBounds();
      const maxX = Math.max(0, this.scene.scale.width - actualW);
      const maxY = Math.max(0, this.scene.scale.height - actualH);
      this.customX = Phaser.Math.Clamp(pointer.x - this.dragOffset.x, 0, maxX);
      this.customY = Phaser.Math.Clamp(pointer.y - this.dragOffset.y, 0, maxY);
      this.currentX = this.customX;
      this.currentY = this.customY;
      this.modalContainer.setPosition(this.customX, this.customY);
    });

    const endDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.opts.onDragEnd?.(this.currentX, this.currentY);
      }
    };
    this.scene.input.on('pointerup', endDrag);
    this.scene.input.on('pointerupoutside', endDrag);
  }

  // ── Scale & Bounds ─────────────────────────────────────────────────────────
  /**
   * Tính toán tỷ lệ scale an toàn:
   * - Hưởng theo UI Zoom của hệ thống.
   * - Tự động giới hạn (kẹp) để không bao giờ tràn ra ngoài màn hình.
   */
  public getScaleAndBounds(): { scale: number; actualW: number; actualH: number } {
    const uiZoom = this._uiZoomManager?.uiZoom ?? 1.25;
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const MARGIN = 10;

    const curH = this.isMinimized ? this.opts.headerHeight! : this.opts.height;
    const maxScaleW = Math.max(0.2, (screenW - MARGIN * 2) / this.opts.width);
    const maxScaleH = Math.max(0.2, (screenH - MARGIN * 2) / curH);
    const maxScale = Math.min(maxScaleW, maxScaleH);

    const effectiveScale = Math.max(0.35, Math.min(uiZoom, maxScale));
    const actualW = Math.round(this.opts.width * effectiveScale);
    const actualH = Math.round(curH * effectiveScale);

    return { scale: effectiveScale, actualW, actualH };
  }

  // ── Toạ độ mặc định (Dock Alignment) ───────────────────────────────────────
  protected getDefaultPosition(actualW: number, actualH: number): { x: number; y: number } {
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const offX = this.opts.defaultOffsetX ?? 8;
    const offY = this.opts.defaultOffsetY ?? 8;

    switch (this.opts.defaultAlign) {
      case 'top-left':
        return { x: offX, y: offY };
      case 'top-right':
        return { x: screenW - actualW - offX, y: offY };
      case 'bottom-left':
        return { x: offX, y: screenH - actualH - offY };
      case 'bottom-right':
        return { x: screenW - actualW - offX, y: screenH - actualH - offY };
      case 'left':
        return { x: offX, y: offY };
      case 'right':
        return { x: screenW - actualW - offX, y: offY };
      case 'center':
      default:
        return {
          x: Math.round((screenW - actualW) / 2),
          y: Math.round((screenH - actualH) / 2),
        };
    }
  }

  // ── Quản lý Trạng thái (Open, Close, Minimize, Dock) ────────────────────────
  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => {
      if (this.open) this.relayout();
    });
  }

  setTitle(title: string): void {
    this.opts.title = title;
    this.titleText.setText(title);
  }

  setSize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    if (this.open) this.relayout();
  }

  isOpen(): boolean {
    return this.open;
  }

  isMinimizedState(): boolean {
    return this.isMinimized;
  }

  show(): void {
    this.open = true;
    if (this.overlay) this.overlay.setVisible(true);
    if (this.overlayBlocker) this.overlayBlocker.setVisible(true);
    this.modalContainer.setVisible(true);
    this.relayout();
  }

  close(): void {
    this.open = false;
    this.isDragging = false;
    if (this.overlay) this.overlay.setVisible(false);
    if (this.overlayBlocker) this.overlayBlocker.setVisible(false);
    this.modalContainer.setVisible(false);
    this.opts.onClose?.();
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  minimize(): void {
    if (this.isMinimized) return;
    this.isMinimized = true;
    this.contentContainer.setVisible(false);
    if (this.btnMinimize) this.btnMinimize.setText('＋');
    this.opts.onMinimize?.(true);
    this.relayout();
  }

  expand(): void {
    if (!this.isMinimized) return;
    this.isMinimized = false;
    this.contentContainer.setVisible(true);
    if (this.btnMinimize) this.btnMinimize.setText('－');
    this.opts.onMinimize?.(false);
    this.relayout();
  }

  toggleMinimize(): void {
    if (this.isMinimized) this.expand();
    else this.minimize();
  }

  dock(): void {
    this.customX = undefined;
    this.customY = undefined;
    this.opts.onDock?.();
    this.relayout();
  }

  setPosition(x: number, y: number): void {
    this.customX = x;
    this.customY = y;
    this.relayout();
  }

  getPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  getActualSize(): { w: number; h: number } {
    const { actualW, actualH } = this.getScaleAndBounds();
    return { w: actualW, h: actualH };
  }

  // ── Layout & Render ────────────────────────────────────────────────────────
  public relayout(): void {
    if (!this.open) return;

    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const headerH = this.opts.headerHeight!;
    const curH = this.isMinimized ? headerH : this.opts.height;
    const W = this.opts.width;

    // 1. Render Overlay nếu có lockUi
    if (this.opts.lockUi && this.overlay && this.overlayBlocker) {
      this.overlay.clear();
      this.overlay.fillStyle(0x000000, 0.65);
      this.overlay.fillRect(0, 0, screenW, screenH);
      this.overlayBlocker.setPosition(0, 0).setSize(screenW, screenH);
    }

    // 2. Tính scale và toạ độ kẹp an toàn
    const { scale, actualW, actualH } = this.getScaleAndBounds();

    let targetX: number;
    let targetY: number;

    if (this.customX !== undefined && this.customY !== undefined) {
      const maxX = Math.max(0, screenW - actualW);
      const maxY = Math.max(0, screenH - actualH);
      targetX = Phaser.Math.Clamp(this.customX, 0, maxX);
      targetY = Phaser.Math.Clamp(this.customY, 0, maxY);
    } else {
      const def = this.getDefaultPosition(actualW, actualH);
      targetX = def.x;
      targetY = def.y;
    }

    this.currentX = targetX;
    this.currentY = targetY;

    this.modalContainer.setScale(scale);
    this.modalContainer.setPosition(targetX, targetY);

    // 3. Vẽ khung nền Modal (toạ độ local: 0, 0)
    this.panelBg.clear();
    // Shadow đổ bóng
    this.panelBg.fillStyle(0x000000, 0.4);
    this.panelBg.fillRoundedRect(3, 3, W, curH, 6);
    // Nền tối
    this.panelBg.fillStyle(0x151833, 0.96);
    this.panelBg.fillRoundedRect(0, 0, W, curH, 6);
    // Viền chính
    this.panelBg.lineStyle(1.5, 0x2e3358, 1);
    this.panelBg.strokeRoundedRect(0, 0, W, curH, 6);

    // 4. Vẽ Header bar
    this.headerBg.clear();
    this.headerBg.fillStyle(0x0f1124, 0.98);
    this.headerBg.fillRoundedRect(0, 0, W, headerH, {
      tl: 6,
      tr: 6,
      bl: this.isMinimized ? 6 : 0,
      br: this.isMinimized ? 6 : 0,
    });
    if (!this.isMinimized) {
      this.headerBg.lineStyle(1, 0x2e3358, 0.7);
      this.headerBg.lineBetween(0, headerH, W, headerH);
    }

    // Căn lại vị trí các thành phần trên header
    this.titleText.setPosition(12, Math.round(headerH / 2));
    this.headerZone.setPosition(0, 0);

    let btnRightOffset = 14;
    const headerCenterY = Math.round(headerH / 2);

    if (this.btnClose) {
      this.btnClose.setPosition(W - btnRightOffset, headerCenterY);
      btnRightOffset += 22;
    }
    if (this.btnSecondaryClose) {
      this.btnSecondaryClose.setPosition(W - btnRightOffset, headerCenterY);
      btnRightOffset += 22;
    }
    if (this.btnMinimize) {
      this.btnMinimize.setPosition(W - btnRightOffset, headerCenterY);
      btnRightOffset += 22;
    }
    if (this.btnDock) {
      this.btnDock.setPosition(W - btnRightOffset, headerCenterY);
      btnRightOffset += 22;
    }
    this.headerZone.setSize(Math.max(40, W - btnRightOffset), headerH);
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return this.allObjects;
  }

  destroy(): void {
    if (this.overlay) this.overlay.destroy();
    if (this.overlayBlocker) this.overlayBlocker.destroy();
    this.modalContainer.destroy(true);
    this.allObjects = [];
  }
}
