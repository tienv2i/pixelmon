import Phaser from 'phaser';
import { C, FONT } from './theme';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

interface WeatherDef {
  glyph: string;
  name: string;
  /** Tint nhẹ cho icon */
  tint: number;
}

/** Thời tiết mô phỏng — chọn theo giờ trong ngày + hạt giống để ổn định. */
const WEATHERS: WeatherDef[] = [
  { glyph: '☀', name: 'Nắng', tint: 0xfdcb6e },
  { glyph: '⛅', name: 'Nhiều mây', tint: 0xc9d1e0 },
  { glyph: '☁', name: 'Âm uất', tint: 0x9aa0c3 },
  { glyph: '🌧', name: 'Mưa', tint: 0x6c9fd8 },
];

const PANEL_W = 144;
const PANEL_H = 46;
const MINI_W = 80;
const MINI_H = 32;
const PAD = 6;

/**
 * **InfoPanel** — khối thông tin góc trên phải: giờ + thời tiết.
 *
 * Neo cố định góc trên phải. Minimap sẽ hiển thị ngay bên dưới panel này.
 * Hỗ trợ chế độ mini tự động khi màn hình nhỏ để tránh va chạm với TopMenu.
 */
export class InfoPanel {
  private readonly scene: Phaser.Scene;
  private panel: Phaser.GameObjects.Graphics;
  private clockText: Phaser.GameObjects.Text;
  private dateText: Phaser.GameObjects.Text;
  private weatherGlyph: Phaser.GameObjects.Text;
  private weatherText: Phaser.GameObjects.Text;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private seed: number;
  private baseY = PAD;
  private currentH = PANEL_H;
  private _uiZoomManager?: UiZoomManager;
  private _hudMode: HudMode = 'normal';

  constructor(scene: Phaser.Scene, seed = 0) {
    this.scene = scene;
    this.seed = seed;

    this.panel = scene.add.graphics().setScrollFactor(0).setDepth(100);
    this.objects.push(this.panel);

    this.clockText = scene.add
      .text(0, 0, '00:00', {
        fontSize: '16px',
        fontFamily: FONT.ui,
        color: C.text,
      })
      .setScrollFactor(0)
      .setDepth(101);
    this.objects.push(this.clockText);

    this.dateText = scene.add
      .text(0, 0, '', {
        fontSize: '9px',
        fontFamily: FONT.ui,
        color: C.muted,
      })
      .setScrollFactor(0)
      .setDepth(101);
    this.objects.push(this.dateText);

    this.weatherGlyph = scene.add
      .text(0, 0, '☀', { fontSize: '16px', fontFamily: FONT.ui, color: '#fdcb6e' })
      .setScrollFactor(0)
      .setDepth(101);
    this.objects.push(this.weatherGlyph);

    this.weatherText = scene.add
      .text(0, 0, '', {
        fontSize: '9px',
        fontFamily: FONT.ui,
        color: C.muted,
      })
      .setScrollFactor(0)
      .setDepth(101);
    this.objects.push(this.weatherText);

    this.relayout();
    this.updateClock();

    // Cập nhật đồng hồ mỗi giây
    scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateClock() });
    scene.scale.on('resize', () => this.relayout());
  }

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => this.relayout());
  }

  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    this.relayout();
  }

  /** Kích thước hiện tại của panel. */
  getSize(): { w: number; h: number } {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this.isMiniMode();
    return {
      w: (isMini ? MINI_W : PANEL_W) * z,
      h: (isMini ? MINI_H : PANEL_H) * z,
    };
  }

  private isMiniMode(): boolean {
    return this._hudMode === 'mini' || this.scene.scale.width < 640;
  }

  /**
   * Vị trí đáy của panel — Minimap dùng để neo ngay bên dưới.
   */
  getBottomY(): number {
    return this.baseY + this.currentH;
  }

  private relayout(): void {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    const isMini = this.isMiniMode();
    const w = (isMini ? MINI_W : PANEL_W) * z;
    const h = (isMini ? MINI_H : PANEL_H) * z;
    const pad = (isMini ? 4 : PAD) * z;

    const W = this.scene.scale.width;
    const x = W - w - pad;
    const y = pad;
    this.baseY = y;
    this.currentH = h;

    this.panel.clear();
    this.panel.fillStyle(0x000000, 0.28);
    this.panel.fillRoundedRect(x + 2, y + 2, w, h, 4);
    this.panel.fillStyle(C.panel, 0.94);
    this.panel.fillRoundedRect(x, y, w, h, 4);
    this.panel.lineStyle(1, C.border, 0.95);
    this.panel.strokeRoundedRect(x, y, w, h, 4);

    if (isMini) {
      // Chế độ mini: chỉ hiển thị giờ và glyph thời tiết cạnh nhau
      this.clockText.setPosition(x + 7 * z, y + 8 * z).setFontSize(13 * z);
      this.dateText.setVisible(false);

      this.weatherGlyph.setPosition(x + w - 22 * z, y + 8 * z).setFontSize(13 * z);
      this.weatherText.setVisible(false);
    } else {
      // Chế độ normal: hiển thị đầy đủ
      this.clockText.setPosition(x + 10 * z, y + 6 * z).setFontSize(16 * z);
      this.dateText.setPosition(x + 11 * z, y + 27 * z).setFontSize(9 * z).setVisible(true);

      this.weatherGlyph.setPosition(x + w - 42 * z, y + 8 * z).setFontSize(16 * z);
      this.weatherText.setPosition(x + w - 28 * z, y + 14 * z).setFontSize(9 * z).setVisible(true);
    }
  }

  private updateClock(): void {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    this.clockText.setText(`${hh}:${mm}`);

    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    this.dateText.setText(`${days[now.getDay()]} • ${now.getDate()}/${now.getMonth() + 1}`);

    // Thời tiết mô phỏng: đổi theo khung giờ 3 giờ, xoay qua danh sách
    const slot = Math.floor(now.getHours() / 3 + this.seed) % WEATHERS.length;
    const w = WEATHERS[slot];
    this.weatherGlyph.setText(w.glyph);
    this.weatherGlyph.setColor(`#${w.tint.toString(16).padStart(6, '0')}`);
    this.weatherText.setText(w.name);
  }

  setVisible(v: boolean): void {
    this.panel.setVisible(v);
    this.clockText.setVisible(v);
    this.dateText.setVisible(v);
    this.weatherGlyph.setVisible(v);
    this.weatherText.setVisible(v);
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return this.objects as unknown as Phaser.GameObjects.GameObject[];
  }

  destroy(): void {
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
  }
}
