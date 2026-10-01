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

export interface UiModalCustomButton {
  id?: string;
  icon: string;
  tooltip?: string;
  color?: string;
  hoverColor?: string;
  onClick: () => void;
}

export interface UiModalPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface UiModalOptions {
  /** Tiêu đề modal */
  title: string;
  /** Chiều rộng chuẩn (local space) */
  width: number;
  /** Chiều cao chuẩn (local space) */
  height: number;
  /** Chiều cao header bar (mặc định: 34) */
  headerHeight?: number;
  /** Ẩn/hiện thanh tiêu đề Title Bar (mặc định: true). Nếu false, không vẽ header bar và không cho drag bằng header. */
  showTitleBar?: boolean;

  /** Chế độ khóa UI: phủ overlay mờ đen khóa toàn bộ gameplay & UI bên dưới (mặc định: false) */
  lockUi?: boolean;
  /** Độ sâu rendering layer / z-index (mặc định: 200 nếu lockUi, 100 nếu không lockUi) */
  depth?: number;
  /** Z-index alias của depth */
  zIndex?: number;

  /** Cho phép kéo thả (mặc định: true nếu showTitleBar = true) */
  draggable?: boolean;
  /** Chế độ neo: nếu true, vị trí bị gắn cứng và KHÔNG thể kéo đi cho đến khi mở neo (mặc định: false) */
  docked?: boolean;

  /** Cấu hình các nút điều khiển mặc định trên thanh Header */
  showClose?: boolean; // Nút ✕ đóng
  showMinimize?: boolean; // Nút － thu nhỏ / mở rộng
  showDock?: boolean; // Nút ⚓ neo / mở khoá vị trí
  showSecondaryClose?: boolean; // Nút tắt thứ 2

  /** Các nút tính năng phụ tuỳ biến trên Header Bar */
  customHeaderButtons?: UiModalCustomButton[];

  /** Vị trí neo mặc định */
  defaultAlign?: UiModalAlign;
  defaultOffsetX?: number;
  defaultOffsetY?: number;

  /** Khoảng đệm nội dung (Padding) */
  padding?: number | UiModalPadding;

  /** Thanh công cụ phía dưới (Footer Bar) */
  showFooter?: boolean;
  footerHeight?: number;

  /** Callbacks sự kiện */
  onClose?: () => void;
  onMinimize?: (minimized: boolean) => void;
  onDock?: (docked: boolean) => void;
  onDragEnd?: (x: number, y: number) => void;
}

/**
 * **UiModal** — Khung cửa sổ / modal popup cao cấp dùng chung cho toàn bộ giao diện game:
 *
 * Tính năng chính:
 * 1. **Thống nhất phong cách UI:** Header bar sắc nét, bo góc, viền neon tinh tế.
 * 2. **Điều khiển linh hoạt:** Hỗ trợ 2 nút tắt (✕ chính + tắt phụ), nút thu nhỏ (－), nút neo (⚓), và mảng nút tính năng phụ tuỳ biến.
 * 3. **Chế độ neo khoá cứng (`docked: true`):** Khi đang neo thì vị trí bị gắn cứng và không thể drag đi; nhấn ⚓ để mở khoá kéo thả hoặc neo lại.
 * 4. **Hỗ trợ ẩn Title Bar (`showTitleBar: false`):** Ẩn hoàn toàn header, nội dung chiếm trọn panel (dành cho HUD UserInfo, Weather...).
 * 5. **Hỗ trợ Footer Bar (`showFooter: true`):** Thanh công cụ gắn các action buttons ở đáy panel.
 * 6. **Tuỳ biến Z-Index / Depth và Padding:** Cấu hình linh hoạt cho từng panel.
 * 7. **Tự động co giãn theo UI Zoom & kẹp an toàn không tràn màn hình.**
 * 8. **Container nội dung (`contentContainer`) & Footer Container (`footerContainer`).**
 */
export class UiModal {
  protected readonly scene: Phaser.Scene;
  protected opts: UiModalOptions;
  protected _uiZoomManager?: UiZoomManager;

  // Trạng thái mở, thu nhỏ & neo
  protected open = true;
  protected isMinimized = false;
  protected isDocked = false;

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
  protected headerBg?: Phaser.GameObjects.Graphics;
  protected titleText?: Phaser.GameObjects.Text;
  protected headerZone?: Phaser.GameObjects.Zone;

  // Footer bar
  protected footerBg?: Phaser.GameObjects.Graphics;
  public readonly footerContainer?: Phaser.GameObjects.Container;

  // Nút điều khiển header mặc định
  protected btnDock?: Phaser.GameObjects.Text;
  protected btnMinimize?: Phaser.GameObjects.Text;
  protected btnClose?: Phaser.GameObjects.Text;
  protected btnSecondaryClose?: Phaser.GameObjects.Text;

  // Nút tuỳ chỉnh trên header
  protected customHeaderBtns: Array<{
    def: UiModalCustomButton;
    txt: Phaser.GameObjects.Text;
  }> = [];

  // Container nội dung dành cho các lớp con gắn elements
  public readonly contentContainer: Phaser.GameObjects.Container;

  // Danh sách toàn bộ GameObject để camera UI quản lý
  protected allObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, opts: UiModalOptions) {
    this.scene = scene;
    this.opts = {
      headerHeight: 34,
      showTitleBar: true,
      lockUi: false,
      draggable: true,
      docked: false,
      showClose: true,
      showMinimize: true,
      showDock: true,
      showSecondaryClose: false,
      defaultAlign: 'center',
      defaultOffsetX: 8,
      defaultOffsetY: 8,
      showFooter: false,
      footerHeight: 32,
      ...opts,
    };

    this.isDocked = this.opts.docked ?? false;
    const depth = this.opts.zIndex ?? this.opts.depth ?? (this.opts.lockUi ? 200 : 100);

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

    // 4. Header Bar (chỉ vẽ nếu showTitleBar = true)
    if (this.opts.showTitleBar) {
      this.headerBg = scene.add.graphics();
      this.modalContainer.add(this.headerBg);

      this.titleText = scene.add
        .text(12, Math.round(this.opts.headerHeight! / 2), this.opts.title, ts(13, '#00cec9', FONT.ui))
        .setOrigin(0, 0.5);
      this.modalContainer.add(this.titleText);

      this.headerZone = scene.add
        .zone(0, 0, this.opts.width, this.opts.headerHeight!)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: !this.isDocked && !!this.opts.draggable });

      if (this.opts.draggable) {
        this.updateHeaderCursor();
        this.setupDragEvents();
      }
      this.modalContainer.add(this.headerZone);

      this.buildHeaderButtons();
    }

    // 5. Container nội dung
    const pad = this.getPadding();
    const contentTop = (this.opts.showTitleBar ? this.opts.headerHeight! : 0) + pad.top;
    this.contentContainer = scene.add.container(pad.left, contentTop);
    this.modalContainer.add(this.contentContainer);

    // 6. Footer Bar (nếu showFooter = true)
    if (this.opts.showFooter) {
      this.footerBg = scene.add.graphics();
      this.modalContainer.add(this.footerBg);

      const footerTop = this.opts.height - (this.opts.footerHeight ?? 32);
      this.footerContainer = scene.add.container(pad.left, footerTop);
      this.modalContainer.add(this.footerContainer);
    }

    // Lắng nghe sự kiện resize của màn hình
    scene.scale.on('resize', () => {
      if (this.open) this.relayout();
    });
  }

  // ── Xây dựng các nút trên Header ───────────────────────────────────────────
  private buildHeaderButtons(): void {
    if (!this.opts.showTitleBar) return;

    let btnRightOffset = 14;
    const headerCenterY = Math.round(this.opts.headerHeight! / 2);

    // 1. Nút ✕ Close (chính)
    if (this.opts.showClose) {
      this.btnClose = this.scene.add
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

    // 2. Nút tắt phụ (Secondary Close)
    if (this.opts.showSecondaryClose) {
      this.btnSecondaryClose = this.scene.add
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

    // 3. Nút － / ＋ Minimize (Thu nhỏ / Mở rộng)
    if (this.opts.showMinimize) {
      this.btnMinimize = this.scene.add
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

    // 4. Nút ⚓ Dock (Neo / Mở khoá vị trí)
    if (this.opts.showDock) {
      this.btnDock = this.scene.add
        .text(this.opts.width - btnRightOffset, headerCenterY, '⚓', ts(13, this.isDocked ? '#00cec9' : C.muted, FONT.ui))
        .setOrigin(0.5)
        .setSize(22, 22)
        .setInteractive({
          hitArea: new Phaser.Geom.Rectangle(-4, -4, 22, 22),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
          useHandCursor: true,
        });

      this.btnDock.on('pointerover', () => this.btnDock?.setColor('#00cec9'));
      this.btnDock.on('pointerout', () => this.btnDock?.setColor(this.isDocked ? '#00cec9' : C.muted));
      this.btnDock.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.toggleDock();
      });
      this.modalContainer.add(this.btnDock);
      btnRightOffset += 22;
    }

    // 5. Các nút tuỳ biến phụ (Custom Header Buttons)
    if (this.opts.customHeaderButtons) {
      for (const btnDef of this.opts.customHeaderButtons) {
        this.createCustomHeaderButton(btnDef, btnRightOffset, headerCenterY);
        btnRightOffset += 22;
      }
    }

    if (this.headerZone) {
      this.headerZone.setSize(Math.max(40, this.opts.width - btnRightOffset), this.opts.headerHeight!);
    }
  }

  private createCustomHeaderButton(btnDef: UiModalCustomButton, offsetRight: number, centerY: number): void {
    const col = btnDef.color ?? C.muted;
    const hCol = btnDef.hoverColor ?? '#00cec9';

    const txt = this.scene.add
      .text(this.opts.width - offsetRight, centerY, btnDef.icon, ts(13, col, FONT.ui))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    txt.on('pointerover', () => txt.setColor(hCol));
    txt.on('pointerout', () => txt.setColor(col));
    txt.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      btnDef.onClick();
    });

    this.customHeaderBtns.push({ def: btnDef, txt });
    this.modalContainer.add(txt);
  }

  /** Thêm nút tuỳ biến lên Header bar. */
  public addHeaderButton(btn: UiModalCustomButton): void {
    if (!this.opts.customHeaderButtons) {
      this.opts.customHeaderButtons = [];
    }
    this.opts.customHeaderButtons.push(btn);
    // Xây lại các nút header
    this.refreshHeaderButtons();
  }

  private refreshHeaderButtons(): void {
    this.btnClose?.destroy();
    this.btnSecondaryClose?.destroy();
    this.btnMinimize?.destroy();
    this.btnDock?.destroy();
    this.customHeaderBtns.forEach((b) => b.txt.destroy());
    this.customHeaderBtns = [];
    this.buildHeaderButtons();
    this.relayout();
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  protected setupDragEvents(): void {
    if (!this.headerZone) return;

    this.headerZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      // Nếu đang ở chế độ neo thì BỊ GẮN CỨNG và KHÔNG THỂ DRAG ĐI
      if (this.isDocked) return;

      pointer.event?.stopPropagation();
      this.isDragging = true;
      this.dragOffset = {
        x: pointer.x - this.modalContainer.x,
        y: pointer.y - this.modalContainer.y,
      };
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || this.isDocked) return;
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

  private updateHeaderCursor(): void {
    if (!this.headerZone) return;
    if (this.isDocked || !this.opts.draggable) {
      this.headerZone.input?.cursor && (this.headerZone.input.cursor = 'default');
    } else {
      this.headerZone.input?.cursor && (this.headerZone.input.cursor = 'grab');
    }
  }

  // ── Padding Helper ─────────────────────────────────────────────────────────
  public getPadding(): { top: number; right: number; bottom: number; left: number } {
    if (typeof this.opts.padding === 'number') {
      const p = this.opts.padding;
      return { top: p, right: p, bottom: p, left: p };
    }
    return {
      top: this.opts.padding?.top ?? 0,
      right: this.opts.padding?.right ?? 0,
      bottom: this.opts.padding?.bottom ?? 0,
      left: this.opts.padding?.left ?? 0,
    };
  }

  public setPadding(padding: number | UiModalPadding): void {
    this.opts.padding = padding;
    const pad = this.getPadding();
    const contentTop = (this.opts.showTitleBar ? this.opts.headerHeight! : 0) + pad.top;
    this.contentContainer.setPosition(pad.left, contentTop);
    this.relayout();
  }

  // ── Z-Index / Depth ────────────────────────────────────────────────────────
  public setDepth(depth: number): this {
    this.opts.depth = depth;
    this.opts.zIndex = depth;
    if (this.overlay) this.overlay.setDepth(depth);
    if (this.overlayBlocker) this.overlayBlocker.setDepth(depth);
    this.modalContainer.setDepth(depth + 1);
    return this;
  }

  public getDepth(): number {
    return this.modalContainer.depth;
  }

  // ── Scale & Bounds ─────────────────────────────────────────────────────────
  public getScaleAndBounds(): { scale: number; actualW: number; actualH: number } {
    const uiZoom = this._uiZoomManager?.uiZoom ?? 1.25;
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;
    const MARGIN = 10;

    const curH = this.isMinimized && this.opts.showTitleBar ? this.opts.headerHeight! : this.opts.height;
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

  // ── Quản lý Trạng thái ─────────────────────────────────────────────────────
  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => {
      if (this.open) this.relayout();
    });
  }

  setTitle(title: string): void {
    this.opts.title = title;
    this.titleText?.setText(title);
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

  isDockedState(): boolean {
    return this.isDocked;
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
    if (this.isMinimized || !this.opts.showTitleBar) return;
    this.isMinimized = true;
    this.contentContainer.setVisible(false);
    if (this.footerContainer) this.footerContainer.setVisible(false);
    if (this.btnMinimize) this.btnMinimize.setText('＋');
    this.opts.onMinimize?.(true);
    this.relayout();
  }

  expand(): void {
    if (!this.isMinimized) return;
    this.isMinimized = false;
    this.contentContainer.setVisible(true);
    if (this.footerContainer) this.footerContainer.setVisible(true);
    if (this.btnMinimize) this.btnMinimize.setText('－');
    this.opts.onMinimize?.(false);
    this.relayout();
  }

  toggleMinimize(): void {
    if (this.isMinimized) this.expand();
    else this.minimize();
  }

  /**
   * Khoá neo vị trí mặc định (gắn cứng, không thể kéo đi).
   */
  dock(): void {
    this.isDocked = true;
    this.customX = undefined;
    this.customY = undefined;
    this.updateHeaderCursor();
    if (this.btnDock) this.btnDock.setColor('#00cec9');
    this.opts.onDock?.(true);
    this.relayout();
  }

  /**
   * Mở khoá vị trí neo (cho phép kéo thả tự do).
   */
  undock(): void {
    this.isDocked = false;
    this.customX = this.modalContainer.x;
    this.customY = this.modalContainer.y;
    this.updateHeaderCursor();
    if (this.btnDock) this.btnDock.setColor(C.muted);
    this.opts.onDock?.(false);
  }

  /**
   * Chuyển đổi trạng thái Docked (khoá vị trí) và Un-docked (kéo thả tự do).
   */
  toggleDock(): void {
    if (this.isDocked) {
      this.undock();
    } else {
      this.dock();
    }
  }

  setPosition(x: number, y: number): void {
    this.customX = x;
    this.customY = y;
    this.isDocked = false;
    this.updateHeaderCursor();
    if (this.btnDock) this.btnDock.setColor(C.muted);
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
    const showHeader = this.opts.showTitleBar ?? true;
    const headerH = showHeader ? this.opts.headerHeight! : 0;
    const curH = this.isMinimized && showHeader ? headerH : this.opts.height;
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

    if (this.customX !== undefined && this.customY !== undefined && !this.isDocked) {
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

    // 4. Vẽ Header bar nếu bật showTitleBar
    if (showHeader && this.headerBg && this.titleText && this.headerZone) {
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
        this.btnDock.setColor(this.isDocked ? '#00cec9' : C.muted);
        btnRightOffset += 22;
      }
      for (const btn of this.customHeaderBtns) {
        btn.txt.setPosition(W - btnRightOffset, headerCenterY);
        btnRightOffset += 22;
      }
      const dragW = Math.max(40, W - btnRightOffset);
      this.headerZone.setSize(dragW, headerH);
      if (this.headerZone.input && this.headerZone.input.hitArea) {
        (this.headerZone.input.hitArea as Phaser.Geom.Rectangle).setSize(dragW, headerH);
      }
      const maxTitleW = Math.max(30, W - btnRightOffset - 16);
      this.titleText.setWordWrapWidth(maxTitleW, false);
    }

    // 5. Vẽ Footer Bar nếu bật showFooter
    if (this.opts.showFooter && this.footerBg && !this.isMinimized) {
      const footH = this.opts.footerHeight ?? 32;
      const footY = curH - footH;

      this.footerBg.clear();
      this.footerBg.fillStyle(0x0f1124, 0.95);
      this.footerBg.fillRoundedRect(0, footY, W, footH, { tl: 0, tr: 0, bl: 6, br: 6 });
      this.footerBg.lineStyle(1, 0x2e3358, 0.7);
      this.footerBg.lineBetween(0, footY, W, footY);

      if (this.footerContainer) {
        const pad = this.getPadding();
        this.footerContainer.setPosition(pad.left, footY);
      }
    }
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
