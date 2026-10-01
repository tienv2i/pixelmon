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

const PANEL_W = 154;
const PANEL_H = 68;
const HEADER_H = 26;

/**
 * **InfoPanel** — Bảng thông tin góc trên-phải: Đồng hồ & Thời tiết:
 * - Kế thừa từ `UiModal`: đồng bộ thanh tiêu đề với toàn bộ hệ thống popup.
 * - Draggable: kéo thả di chuyển tự do bằng thanh tiêu đề.
 * - Nút Thu nhỏ (－): thu gọn panel chỉ còn lại giờ trên thanh tiêu đề khi cần thoáng màn hình.
 * - Nút Neo (⚓): đưa panel về vị trí mặc định ở góc trên-phải màn hình.
 * - Nút Tắt (✕): ẩn bảng thời tiết.
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
      headerHeight: HEADER_H,
      lockUi: false,
      depth: 100,
      showClose: true,
      showMinimize: true,
      showDock: true,
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
      .text(10, 4, '00:00', {
        fontSize: '15px',
        fontFamily: FONT.ui,
        color: C.text,
      });
    this.contentContainer.add(this.clockText);

    // 2. Date Text
    this.dateText = scene.add
      .text(10, 22, '', {
        fontSize: '9px',
        fontFamily: FONT.ui,
        color: C.muted,
      });
    this.contentContainer.add(this.dateText);

    // 3. Weather Glyph
    this.weatherGlyph = scene.add
      .text(96, 6, '☀', {
        fontSize: '15px',
        fontFamily: FONT.ui,
        color: '#fdcb6e',
      });
    this.contentContainer.add(this.weatherGlyph);

    // 4. Weather Text
    this.weatherText = scene.add
      .text(114, 10, '', {
        fontSize: '9px',
        fontFamily: FONT.ui,
        color: C.muted,
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
    if (mode === 'mini') {
      this.minimize();
    } else if (mode === 'normal') {
      this.expand();
    }
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
