import Phaser from 'phaser';

const LS_KEY = 'pixelmon.uiZoom';
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1.0;

/**
 * Quản lý **UI zoom** — scale thống nhất cho toàn bộ HUD panels.
 *
 * Tách biệt hoàn toàn với **game zoom** (`cameras.main.zoom`, xử lý bằng scroll
 * wheel trong `main.ts`). UI zoom chỉ tác động tới panel giao diện, không đụng
 * tới camera hay thế giới.
 *
 * Mỗi panel tự đọc `uiZoom` khi `relayout()` — quản lý này chỉ giữ giá trị
 * và phát sự kiện `ui-zoom-change` để các panel biết khi nào cần vẽ lại.
 */
export type UiBreakpoint = 'normal' | 'compact' | 'mini';

export class UiZoomManager {
  private readonly scene: Phaser.Scene;
  private _uiZoom: number;
  private lastEffectiveZoom = 1;
  private lastBreakpoint: UiBreakpoint = 'normal';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._uiZoom = this.load();
    this.lastEffectiveZoom = this.uiZoom;
    this.lastBreakpoint = this.getBreakpoint();
    this.setupKeys();

    scene.scale.on('resize', () => {
      const curZoom = this.uiZoom;
      if (Math.abs(curZoom - this.lastEffectiveZoom) > 0.01) {
        this.lastEffectiveZoom = curZoom;
        this.scene.scale.emit('ui-zoom-change', curZoom);
      }
      const curBp = this.getBreakpoint();
      if (curBp !== this.lastBreakpoint) {
        this.lastBreakpoint = curBp;
        this.scene.scale.emit('breakpoint-change', curBp);
      }
    });
  }

  /** Phân loại breakpoint dựa trên kích thước viewport hiện tại. */
  getBreakpoint(): UiBreakpoint {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    if (w < 560 || h < 480) return 'mini';
    if (w < 768 || h < 600) return 'compact';
    return 'normal';
  }

  /**
   * Giá trị UI zoom thực tế: kết hợp giữa zoom người dùng chọn
   * và hệ số co giãn tự động thích ứng khi viewport nhỏ (< 640px).
   */
  get uiZoom(): number {
    const w = this.scene.scale.width;
    const autoFactor = w < 640 ? Math.max(0.7, Math.min(1.0, w / 640)) : 1.0;
    return Math.round(this._uiZoom * autoFactor * 100) / 100;
  }

  /** Giá trị zoom gốc người dùng đặt (chưa nhân hệ số thích ứng). */
  get userZoom(): number {
    return this._uiZoom;
  }

  zoomIn(): void {
    this.setUiZoom(this._uiZoom + ZOOM_STEP);
  }

  zoomOut(): void {
    this.setUiZoom(this._uiZoom - ZOOM_STEP);
  }

  reset(): void {
    this.setUiZoom(ZOOM_DEFAULT);
  }

  setUiZoom(z: number): void {
    const snapped = Math.round(Phaser.Math.Clamp(z, ZOOM_MIN, ZOOM_MAX) * 10) / 10;
    if (snapped === this._uiZoom) return;
    this._uiZoom = snapped;
    this.persist();
    this.lastEffectiveZoom = this.uiZoom;
    this.scene.scale.emit('ui-zoom-change', this.lastEffectiveZoom);
  }

  /** Đăng ký phím tắt `+` / `-` để chỉnh UI zoom. */
  private setupKeys(): void {
    const kb = this.scene.input.keyboard;
    if (!kb) return;
    kb.on('keydown-PLUS', () => this.zoomIn());
    kb.on('keydown-EQUALS', () => this.zoomIn());
    kb.on('keydown-ADD', () => this.zoomIn());
    kb.on('keydown-MINUS', () => this.zoomOut());
    kb.on('keydown-SUBTRACT', () => this.zoomOut());
  }

  private persist(): void {
    try {
      localStorage.setItem(LS_KEY, String(this._uiZoom));
    } catch {
      // localStorage bị chặn (private mode) — bỏ qua, zoom vẫn hoạt động
    }
  }

  private load(): number {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return ZOOM_DEFAULT;
      const n = parseFloat(raw);
      if (Number.isNaN(n)) return ZOOM_DEFAULT;
      return Math.round(Phaser.Math.Clamp(n, ZOOM_MIN, ZOOM_MAX) * 10) / 10;
    } catch {
      return ZOOM_DEFAULT;
    }
  }
}
