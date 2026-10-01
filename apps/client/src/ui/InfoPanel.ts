import Phaser from 'phaser';
import { C, FONT } from './theme';

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

const PANEL_W = 168;
const PANEL_H = 54;
const PAD = 8;

/**
 * **InfoPanel** — khối thông tin góc trên phải: giờ + thời tiết.
 *
 * Neo cố định góc trên phải. Minimap sẽ hiển thị ngay bên dưới panel này.
 * Thời tiết mô phỏng (chưa có hệ thời tiết server) — đổi theo giờ trong ngày.
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

  constructor(scene: Phaser.Scene, seed = 0) {
    this.scene = scene;
    this.seed = seed;

    this.panel = scene.add.graphics().setScrollFactor(0).setDepth(100);
    this.objects.push(this.panel);

    this.clockText = scene.add
      .text(0, 0, '00:00', {
        fontSize: '18px',
        fontFamily: FONT.ui,
        color: C.text,
      })
      .setScrollFactor(0)
      .setDepth(101);
    this.objects.push(this.clockText);

    this.dateText = scene.add
      .text(0, 0, '', {
        fontSize: '10px',
        fontFamily: FONT.ui,
        color: C.muted,
      })
      .setScrollFactor(0)
      .setDepth(101);
    this.objects.push(this.dateText);

    this.weatherGlyph = scene.add
      .text(0, 0, '☀', { fontSize: '18px', fontFamily: FONT.ui, color: '#fdcb6e' })
      .setScrollFactor(0)
      .setDepth(101);
    this.objects.push(this.weatherGlyph);

    this.weatherText = scene.add
      .text(0, 0, '', {
        fontSize: '10px',
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

  /**
   * Vị trí thanh trên của panel — Minimap dùng để neo ngay bên dưới.
   * `extraTop` = khoảng cách thêm phía trên (không dùng hiện tại).
   */
  getBottomY(): number {
    this.relayout();
    return this.baseY + PANEL_H;
  }

  private relayout(): void {
    const W = this.scene.scale.width;
    const x = W - PANEL_W - PAD;
    const y = PAD;
    this.baseY = y;

    this.panel.clear();
    this.panel.fillStyle(0x000000, 0.25);
    this.panel.fillRoundedRect(x + 3, y + 3, PANEL_W, PANEL_H, 4);
    this.panel.fillStyle(C.panel, 0.94);
    this.panel.fillRoundedRect(x, y, PANEL_W, PANEL_H, 4);
    this.panel.lineStyle(1, C.border, 0.95);
    this.panel.strokeRoundedRect(x, y, PANEL_W, PANEL_H, 4);

    // Cột trái: giờ + ngày
    this.clockText.setPosition(x + 12, y + 8).setFontSize(18);
    this.dateText.setPosition(x + 13, y + 32).setFontSize(10);

    // Cột phải: icon + tên thời tiết
    this.weatherGlyph.setPosition(x + PANEL_W - 48, y + 10).setFontSize(18);
    this.weatherText.setPosition(x + PANEL_W - 34, y + 16).setFontSize(10);
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
