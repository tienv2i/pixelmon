import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

interface WeatherDef {
  glyph: string;
  name: string;
  tint: number;
}

const WEATHERS: WeatherDef[] = [
  { glyph: '☀', name: 'Nắng', tint: 0xfdcb6e },
  { glyph: '⛅', name: 'Nhiều mây', tint: 0xc9d1e0 },
  { glyph: '☁', name: 'Âm uất', tint: 0x9aa0c3 },
  { glyph: '🌧', name: 'Mưa', tint: 0x6c9fd8 },
];

const PANEL_W = 180;
const PANEL_H = 48;

/**
 * **InfoPanel** — Bảng thông tin góc trên-phải: Đồng hồ & Thời tiết:
 * - Kế thừa từ `UiModal`: chuẩn hoá khung giao diện pixel thống nhất.
 * - Chế độ neo (`docked: true`) cố định ở góc trên-phải màn hình.
 * - Không có thanh tiêu đề (`showTitleBar: false`), gắn cứng và không thể drag.
 */
export class InfoPanel extends UiModal {
  private clockText: Phaser.GameObjects.Text;
  private dateText: Phaser.GameObjects.Text;
  private weatherGlyph: Phaser.GameObjects.Text;
  private weatherText: Phaser.GameObjects.Text;
  private seed: number;
  private _hudMode: HudMode = 'normal';

  constructor(scene: Phaser.Scene, seed = 0) {
    super(scene, {
      title: '🌤 THỜI TIẾT',
      width: PANEL_W,
      height: PANEL_H,
      showTitleBar: false,
      docked: true,
      lockUi: false,
      depth: 100,
      showClose: false,
      showMinimize: false,
      showDock: false,
      defaultAlign: 'top-right',
      defaultOffsetX: 8,
      defaultOffsetY: 8,
      onClose: () => {
        this.setVisible(false);
      },
    });

    this.seed = seed;

    // 1. Clock Text (Local trong contentContainer)
    this.clockText = scene.add
      .text(12, 6, '00:00', {
        fontSize: '16px',
        fontFamily: FONT.ui,
        color: C.text,
      });
    this.contentContainer.add(this.clockText);

    // 2. Date Text
    this.dateText = scene.add
      .text(12, 27, '', {
        fontSize: '10px',
        fontFamily: FONT.ui,
        color: C.muted,
      });
    this.contentContainer.add(this.dateText);

    // Vạch ngăn cách dọc giữa Giờ và Thời tiết
    const divider = scene.add.graphics();
    divider.lineStyle(1, 0x2e3358, 0.8);
    divider.lineBetween(88, 8, 88, 40);
    this.contentContainer.add(divider);

    // 3. Weather Glyph
    this.weatherGlyph = scene.add
      .text(100, 8, '☀', {
        fontSize: '17px',
        fontFamily: FONT.ui,
        color: '#fdcb6e',
      });
    this.contentContainer.add(this.weatherGlyph);

    // 4. Weather Text (Rộng rãi, không bao giờ bị tràn)
    this.weatherText = scene.add
      .text(124, 15, '', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: C.text,
      });
    this.contentContainer.add(this.weatherText);

    this.updateClock();

    // Cập nhật đồng hồ mỗi giây
    scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateClock() });

    this.show();
  }

  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
  }

  /** Kích thước hiện tại của panel. */
  getSize(): { w: number; h: number } {
    return this.getActualSize();
  }

  /** Vị trí đáy của panel — Minimap dùng để neo ngay bên dưới. */
  getBottomY(): number {
    return this.currentY + this.getActualSize().h + 4;
  }

  private updateClock(): void {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;
    this.clockText.setText(timeStr);

    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    this.dateText.setText(`${days[now.getDay()]} • ${now.getDate()}/${now.getMonth() + 1}`);

    const slot = Math.floor(now.getHours() / 3 + this.seed) % WEATHERS.length;
    const w = WEATHERS[slot];
    this.weatherGlyph.setText(w.glyph);
    this.weatherGlyph.setColor(`#${w.tint.toString(16).padStart(6, '0')}`);
    this.weatherText.setText(w.name);

    // Cập nhật title của Header bar để khi thu nhỏ vẫn thấy giờ và thời tiết!
    this.setTitle(`${w.glyph} ${timeStr}`);
  }

  setVisible(v: boolean): void {
    if (v) this.show();
    else this.close();
  }
}
