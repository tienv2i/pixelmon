import Phaser from 'phaser';
import { FONT } from './theme';
import { UiModal } from './UiModal';
import { t, onLangChange} from '../i18n';
import type { HudMode } from './HudManager';

interface WeatherDef {
  glyph: string;
  tint: number;
}

const WEATHERS: WeatherDef[] = [
  { glyph: '☀', tint: 0xfdcb6e },
  { glyph: '⛅', tint: 0xc9d1e0 },
  { glyph: '☁', tint: 0x9aa0c3 },
  { glyph: '🌧', tint: 0x6c9fd8 },
  { glyph: '⛈', tint: 0xa29bfe },
];

const NORMAL_W = 140;
const NORMAL_H = 46;
const MINI_W = 54;
const MINI_H = 50;

/**
 * **InfoPanel** — Bảng thông tin góc trên-phải: Đồng hồ (Poke Time + Real Time) & Thời tiết (Weather):
 * - Kế thừa từ `UiModal`: chuẩn hoá khung giao diện pixel thống nhất.
 * - Chế độ neo (`docked: true`) cố định ở góc trên-phải màn hình.
 * - 2 Dòng thời gian: Poke Time (thời gian thế giới Pokémon) và Real Time (thời gian thực).
 * - Biểu tượng Thời tiết to rõ, không chữ rườm rà, không ngày tháng năm.
 * - Hỗ trợ Responsive linh hoạt co giãn theo kích thước màn hình và UI Zoom.
 */
export class InfoPanel extends UiModal {
  private unsubLang?: () => void;
  private pokeTimeText: Phaser.GameObjects.Text;
  private realTimeText: Phaser.GameObjects.Text;
  private divider: Phaser.GameObjects.Graphics;
  private weatherGlyph: Phaser.GameObjects.Text;
  private seed: number;
  private _hudMode: HudMode = 'normal';

  constructor(scene: Phaser.Scene, seed = 0, onClose?: () => void) {
    super(scene, {
      title: t('INFO_WEATHER'),
      width: NORMAL_W,
      height: NORMAL_H,
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
        onClose?.();
      },
    });

    this.seed = seed;

    // 1. Dòng Poke Time
    this.pokeTimeText = scene.add.text(10, 6, 'Poke: 00:00', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#00cec9',
    });
    this.contentContainer.add(this.pokeTimeText);

    // 2. Dòng Real Time
    this.realTimeText = scene.add.text(10, 23, 'Real: 00:00', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      color: '#cbd5e0',
    });
    this.contentContainer.add(this.realTimeText);

    // 3. Vạch ngăn cách dọc
    this.divider = scene.add.graphics();
    this.contentContainer.add(this.divider);

    // 4. Biểu tượng / Ảnh Weather (to, nổi bật, không chữ)
    this.weatherGlyph = scene.add
      .text(118, 23, '☀', {
        fontSize: '22px',
        fontFamily: FONT.ui,
        color: '#fdcb6e',
      })
      .setOrigin(0.5, 0.5);
    this.contentContainer.add(this.weatherGlyph);

    this.updateClock();
    this.applyInternalLayout();

    // Cập nhật đồng hồ mỗi giây
    scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.updateClock() });

    this.show();
  
    // Cập nhật title khi đổi ngôn ngữ (chỉ 1 ngôn ngữ hiển thị)
    this.unsubLang = onLangChange(() => this.setTitle(t('INFO_WEATHER')));
  }

  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    const isMini = this.isMiniMode();
    this.setSize(isMini ? MINI_W : NORMAL_W, isMini ? MINI_H : NORMAL_H);
    this.relayout();
  }

  private isMiniMode(): boolean {
    return this._hudMode === 'mini' || this.scene.scale.width < 800 || this.scene.scale.height < 600;
  }

  public override relayout(): void {
    const isMini = this.isMiniMode();
    const targetW = isMini ? MINI_W : NORMAL_W;
    const targetH = isMini ? MINI_H : NORMAL_H;
    this.opts.width = targetW;
    this.opts.height = targetH;

    super.relayout();
    this.applyInternalLayout();
  }

  private applyInternalLayout(): void {
    const isMini = this.isMiniMode();

    if (isMini) {
      this.weatherGlyph.setPosition(MINI_W / 2, 17).setFontSize('22px').setOrigin(0.5, 0.5);
      this.divider.clear();
      this.pokeTimeText.setPosition(MINI_W / 2, 38).setFontSize('11px').setOrigin(0.5, 0.5).setVisible(true);
      this.realTimeText.setVisible(false);
    } else {
      this.pokeTimeText.setPosition(10, 6).setFontSize('11px').setOrigin(0, 0).setVisible(true);
      this.realTimeText.setPosition(10, 23).setFontSize('11px').setOrigin(0, 0).setVisible(true);

      this.divider.clear();
      this.divider.lineStyle(1, 0x2e3358, 0.8);
      this.divider.lineBetween(96, 6, 96, 40);

      this.weatherGlyph.setPosition(118, 23).setFontSize('22px').setOrigin(0.5, 0.5);
    }
  }

  /** Kích thước hiện tại của panel (đã tính scale). */
  getSize(): { w: number; h: number } {
    return this.getActualSize();
  }

  /** Vị trí đáy của panel — Minimap dùng để neo ngay bên dưới. */
  getBottomY(): number {
    return this.currentY + this.getActualSize().h + 4;
  }

  private updateClock(): void {
    const now = new Date();
    // 1. Real time
    const realH = String(now.getHours()).padStart(2, '0');
    const realM = String(now.getMinutes()).padStart(2, '0');
    const realTimeStr = `${realH}:${realM}`;

    // 2. Poke time (nhanh gấp 6 lần thời gian thực: 1 ngày thực = 6 chu kỳ ngày đêm Pokémon)
    const totalRealSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const pokeSeconds = (totalRealSeconds * 6) % (24 * 3600);
    const pokeH = String(Math.floor(pokeSeconds / 3600)).padStart(2, '0');
    const pokeM = String(Math.floor((pokeSeconds % 3600) / 60)).padStart(2, '0');
    const pokeTimeStr = `${pokeH}:${pokeM}`;

    const isMini = this.isMiniMode();
    if (isMini) {
      // Chỉ hiển thị thời gian, bỏ đi title poketime, realtime
      this.pokeTimeText.setText(pokeTimeStr);
    } else {
      this.pokeTimeText.setText(`${t('INFO_POKE')}: ${pokeTimeStr}`);
      this.realTimeText.setText(`${t('INFO_REAL')}: ${realTimeStr}`);
    }

    // 3. Thời tiết (dựa trên Poke Time ngày hoặc đêm)
    const pokeHourNum = parseInt(pokeH, 10);
    const isNight = pokeHourNum >= 20 || pokeHourNum < 5;

    if (isNight) {
      this.weatherGlyph.setText('🌙');
      this.weatherGlyph.setColor('#f1c40f');
    } else {
      const slot = Math.floor(pokeHourNum / 4 + this.seed) % WEATHERS.length;
      const w = WEATHERS[slot] || WEATHERS[0];
      this.weatherGlyph.setText(w.glyph);
      this.weatherGlyph.setColor(`#${w.tint.toString(16).padStart(6, '0')}`);
    }

    this.setTitle(`🌤 ${pokeTimeStr}`);
  }

  isVisible(): boolean {
    return this.isOpen();
  }

  setVisible(v: boolean): void {
    if (v) this.show();
    else this.close();  }

  destroy(): void {
    this.unsubLang?.();
    super.destroy?.();
  }
}
