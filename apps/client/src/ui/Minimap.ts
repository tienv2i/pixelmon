import Phaser from 'phaser';
import { C } from './theme';
import { drawPanel, panelTitle } from './PanelFrame';
import { MAP_W, MAP_H } from '../world/PlaceholderMap';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const BASE_MM_W = 140;
const BASE_MM_H = 106;
const PAD = 8;
const TITLE_H = 18;

/**
 * **Minimap** — popup nhỏ góc trên phải, neo ngay **dưới InfoPanel** (giờ + thời tiết).
 *
 * Mặc định **ẩn**. Bật/tắt bằng icon **GPS** trong `TopMenu`, hoặc phím `M`.
 * Không kéo thả — cố định theo khung màn hình.
 */
export class Minimap {
  private readonly scene: Phaser.Scene;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly content: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private visible = false;
  private _hudMode: HudMode = 'normal';
  private _uiZoomManager?: UiZoomManager;
  private lastPlayer = { x: 0, y: 0 };
  private viewport = { w: 0, h: 0, cx: 0, cy: 0 };

  /** Y neo = đáy InfoPanel. WorldScene gán qua `setAnchorYSource`. */
  private anchorY = PAD;

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => this.relayout());
  }

  setHudMode(mode: HudMode): void {
    this._hudMode = mode;
    this.relayout();
  }

  /** Gán nguồn tính Y neo — WorldScene dùng `InfoPanel.getBottomY()`. */
  setAnchorYSource(fn: () => number): void {
    this.anchorProvider = fn;
    this.relayout();
  }

  private anchorProvider?: () => number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.panel = drawPanel(scene, 0, 0, 0, 0, 100);
    this.title = panelTitle(scene, 0, 0, 'MAP', 101);
    this.content = scene.add.graphics().setDepth(101).setScrollFactor(0);
    this.overlay = scene.add.graphics().setDepth(102).setScrollFactor(0);

    this.relayout();
    // Mặc định ẩn — chỉ hiện khi bấm icon GPS.
    this.setVisible(false);

    scene.scale.on('resize', () => this.relayout());
  }

  /** Layout hiện tại (dùng cho cả draw lẫn input). */
  private getLayout() {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this._hudMode === 'mini';
    const w = (isMini ? BASE_MM_W * 0.6 : BASE_MM_W) * z;
    const h = (isMini ? BASE_MM_H * 0.6 : BASE_MM_H) * z;
    const x = this.scene.scale.width - w - PAD;
    const y = this.anchorY + PAD; // ngay dưới InfoPanel
    const titleH = isMini ? 0 : TITLE_H;
    const contentTop = y + titleH;
    const contentH = y + h - contentTop;
    return { w, h, x, y, titleH, contentTop, contentH, isMini, z };
  }

  private relayout(): void {
    if (this.anchorProvider) this.anchorY = this.anchorProvider();

    const { w, h, x, y, contentTop, contentH, isMini } = this.getLayout();

    this.panel.clear();
    this.panel.fillStyle(0x000000, 0.25);
    this.panel.fillRoundedRect(x + 3, y + 3, w, h, 4);
    this.panel.fillStyle(C.panel, 0.94);
    this.panel.fillRoundedRect(x, y, w, h, 4);
    this.panel.lineStyle(1, C.border, 0.95);
    this.panel.strokeRoundedRect(x, y, w, h, 4);

    this.title.setPosition(x + 8, y + 6).setVisible(!isMini);

    const iw = w - PAD * 2;
    const ih = contentH - PAD;

    this.content.clear();
    this.content.fillStyle(0x1f2447, 1);
    this.content.fillRect(x + PAD, contentTop, iw, ih);

    // Vùng mẫu đồng bộ PlaceholderMap: path ngang/dọc + hồ
    const ox = x + PAD;
    const oy = contentTop;
    this.content.fillStyle(C.path, 0.9);
    this.content.fillRect(ox, oy + (20 / 45) * ih, iw, (2 / 45) * ih);
    this.content.fillRect(ox + (28 / 60) * iw, oy, (2 / 60) * iw, ih);
    this.content.fillStyle(C.water, 0.9);
    this.content.fillRect(ox + (4 / 60) * iw, oy + (34 / 45) * ih, (12 / 60) * iw, (8 / 45) * ih);

    this.drawOverlay();
  }

  /** Vẽ chấm player + khung viewport camera. */
  private drawOverlay(): void {
    const { x, w, contentTop, contentH, z } = this.getLayout();
    const iw = w - PAD * 2;
    const ih = contentH - PAD;
    if (iw <= 0 || ih <= 0) return;

    this.overlay.clear();

    // Khung vùng camera đang thấy
    if (this.viewport.w > 0) {
      this.overlay.lineStyle(1, C.warn, 0.9);
      this.overlay.strokeRect(
        x + PAD + this.viewport.cx * (iw / MAP_W),
        contentTop + this.viewport.cy * (ih / MAP_H),
        this.viewport.w * (iw / MAP_W),
        this.viewport.h * (ih / MAP_H),
      );
    }

    // Chấm player
    const mx = x + PAD + (this.lastPlayer.x / MAP_W) * iw;
    const my = contentTop + (this.lastPlayer.y / MAP_H) * ih;
    this.overlay.fillStyle(C.accent, 1);
    this.overlay.fillCircle(mx, my, 3 * z);
    this.overlay.lineStyle(1, C.white, 0.9);
    this.overlay.strokeCircle(mx, my, 4 * z);
  }

  /** Cập nhật chấm player + vùng camera. */
  update(playerX: number, playerY: number, cam?: Phaser.Cameras.Scene2D.Camera): void {
    this.lastPlayer = { x: playerX, y: playerY };
    if (cam) {
      this.viewport = {
        w: cam.width / cam.zoom,
        h: cam.height / cam.zoom,
        cx: cam.scrollX,
        cy: cam.scrollY,
      };
    }
    if (this.visible) this.drawOverlay();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Kích thước panel hiện tại (đã nhân uiZoom) — HudManager dùng để xếp chồng
   * các thanh công cụ cùng góc neo mà không chồng lên nhau.
   */
  getSize(): { w: number; h: number } {
    const { w, h } = this.getLayout();
    return { w, h };
  }

  /** false khi đang ẩn — HudManager sẽ không tính chỗ cho panel này. */
  isActive(): boolean {
    return this.visible;
  }

  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    [this.panel, this.content, this.overlay, this.title].forEach((o) => o.setVisible(v));
    if (v) this.drawOverlay();
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return [this.panel, this.content, this.overlay, this.title];
  }

  destroy(): void {
    [this.panel, this.content, this.overlay, this.title].forEach((o) => o.destroy());
  }
}
