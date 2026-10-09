import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange } from '../i18n';
import type { PokemonData } from './PokemonSummaryModal';

const PARTY_COUNT = 6;

// Kích thước chuẩn cân đối:
// Chiều ngang rộng hơn (264px) giúp tên, level, badge trạng thái và HP không bị chật chội
const SLOT_W = 264;
const SLOT_H = 50;
const SLOT_GAP = 7;
const PAD_X = 14;
const PAD_Y = 10;
const HEADER_H = 34;
const HINT_H = 20; // Khoảng đệm cho dòng hint phụ nếu có
const FOOTER_H = 44;

const EMPTY_BG = 0x14172a;
const SLOT_BG = 0x1e233d;
const SLOT_BG_HOVER = 0x272e50;
const SLOT_BORDER = 0x313860;
const SLOT_BORDER_PICKABLE = 0x48538a;
const SLOT_BORDER_HOVER = 0x00cec9;

const STATUS_MAP: Record<string, { label: string; bg: number; text: string }> = {
  paralysis: { label: 'PAR', bg: 0xb7950b, text: '#ffffff' },
  par: { label: 'PAR', bg: 0xb7950b, text: '#ffffff' },
  poison: { label: 'PSN', bg: 0x8e44ad, text: '#ffffff' },
  psn: { label: 'PSN', bg: 0x8e44ad, text: '#ffffff' },
  toxic: { label: 'TOX', bg: 0x6c3483, text: '#ffffff' },
  burn: { label: 'BRN', bg: 0xd35400, text: '#ffffff' },
  brn: { label: 'BRN', bg: 0xd35400, text: '#ffffff' },
  freeze: { label: 'FRZ', bg: 0x2980b9, text: '#ffffff' },
  frz: { label: 'FRZ', bg: 0x2980b9, text: '#ffffff' },
  sleep: { label: 'SLP', bg: 0x7f8c8d, text: '#ffffff' },
  slp: { label: 'SLP', bg: 0x7f8c8d, text: '#ffffff' },
  faint: { label: 'FNT', bg: 0xc0392b, text: '#ffffff' },
  fnt: { label: 'FNT', bg: 0xc0392b, text: '#ffffff' },
};

function loadTextureImage(scene: Phaser.Scene, key: string, url: string): Promise<boolean> {
  if (scene.textures.exists(key)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * **PartySelectModal** — khung chọn Pokémon trong đội (mini party box).
 *
 * Dùng cho các tác vụ cần chọn 1 Pokémon:
 * - Dùng item (heal / cure / evo stone...) trong trận & ngoài trận
 * - Switch Pokémon (đổi thứ tự đội)
 * - Gán item (cầm đồ), Trade...
 *
 * Gọi `onSelect(pokemon, index)` khi bấm vào 1 slot; `onCancel()` khi đóng.
 * `filterAlive = true` → chỉ chọn được Pokémon còn máu (dùng cho switch).
 */
export class PartySelectModal extends UiModal {
  private party: PokemonData[] = [];
  private filterAlive: boolean;
  private gfx!: Phaser.GameObjects.Graphics;
  private icons!: Phaser.GameObjects.Container;
  private customFooterContainer!: Phaser.GameObjects.Container;
  private cancelBtnText?: Phaser.GameObjects.Text;
  private cancelBtnBgGfx?: Phaser.GameObjects.Graphics;
  private hintTextObj?: Phaser.GameObjects.Text;
  private unsubLang?: () => void;
  private rawHint = '';

  public onSelect?: (pokemon: PokemonData, index: number) => void;
  public onCancel?: () => void;

  constructor(
    scene: Phaser.Scene,
    options: {
      title: string;
      party?: PokemonData[];
      filterAlive?: boolean;
      hint?: string;
      depth?: number;
      onSelect?: (pokemon: PokemonData, index: number) => void;
      onCancel?: () => void;
    },
  ) {
    const listH = PARTY_COUNT * SLOT_H + (PARTY_COUNT - 1) * SLOT_GAP;
    const contentH = PAD_Y + (options.hint ? HINT_H : 4) + listH + PAD_Y;
    const w = SLOT_W + PAD_X * 2;
    const h = HEADER_H + contentH + FOOTER_H;

    super(scene, {
      title: options.title,
      width: w,
      height: h,
      headerHeight: HEADER_H,
      showTitleBar: true,
      draggable: true,
      docked: true,
      dockOnOpen: true,
      lockUi: true,
      lockGameOnly: true,
      overlay: true,
      depth: options.depth ?? 250,
      showClose: true,
      showMinimize: false,
      showDock: true,
      defaultAlign: 'center',
      padding: 0, // Padding quản lý nội bộ theo hệ thống toạ độ contentContainer
      onClose: () => {
        options.onCancel?.();
      },
    });

    this.party = options.party ?? [];
    this.filterAlive = options.filterAlive ?? false;
    this.onSelect = options.onSelect;
    this.onCancel = options.onCancel;
    this.rawHint = options.hint || '';

    this.gfx = scene.add.graphics();
    this.icons = scene.add.container(0, 0);
    this.customFooterContainer = scene.add.container(0, 0);
    this.contentContainer.add(this.gfx);
    this.contentContainer.add(this.icons);
    this.contentContainer.add(this.customFooterContainer);

    this.buildFooter(w, contentH);

    this.close();
    this.unsubLang = onLangChange(() => {
      this.setTitle(options.title);
      this.render();
    });
  }

  private buildFooter(w: number, contentH: number): void {
    const btnW = 104;
    const btnH = 28;
    const bx = Math.round((w - btnW) / 2);
    const by = Math.round(contentH + (FOOTER_H - btnH) / 2);

    const btnGfx = this.scene.add.graphics();
    this.cancelBtnBgGfx = btnGfx;
    const drawBtn = (hover = false) => {
      btnGfx.clear();
      btnGfx.fillStyle(hover ? 0x333b66 : 0x222846, 1);
      btnGfx.fillRoundedRect(bx, by, btnW, btnH, 5);
      btnGfx.lineStyle(1.5, hover ? 0x00cec9 : 0x414b78, 1);
      btnGfx.strokeRoundedRect(bx, by, btnW, btnH, 5);
    };
    drawBtn(false);
    this.customFooterContainer.add(btnGfx);

    this.cancelBtnText = mkText(this.scene, 'CONFIRM_CANCEL', {
      fontSize: '12px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#cbd5e1',
    }, bx + btnW / 2, by + btnH / 2).setOrigin(0.5);
    this.customFooterContainer.add(this.cancelBtnText);

    const hitZone = this.scene.add
      .zone(bx + btnW / 2, by + btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    hitZone.on('pointerover', () => {
      drawBtn(true);
      this.cancelBtnText?.setColor('#ffffff');
    });
    hitZone.on('pointerout', () => {
      drawBtn(false);
      this.cancelBtnText?.setColor('#cbd5e1');
    });
    hitZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.close();
    });
    this.customFooterContainer.add(hitZone);
  }

  public override destroy(): void {
    this.unsubLang?.();
    super.destroy();
  }

  public override show(): void {
    super.show();
    this.render();
  }

  setParty(party: PokemonData[]): void {
    this.party = party;
    this.render();
  }

  /** Chỉ chọn được Pokémon còn máu (switch). */
  setFilterAlive(v: boolean): void {
    this.filterAlive = v;
  }

  /** Dòng chữ nhỏ dưới tiêu đề (mô tả tác vụ). */
  setHint(hint: string): void {
    this.rawHint = hint;
    this.render();
  }

  private canPick(p: PokemonData | undefined): boolean {
    if (!p) return false;
    if (!this.filterAlive) return true;
    const hp = p.current_hp ?? p.stats?.hp ?? 0;
    return hp > 0;
  }

  private render(): void {
    this.gfx.clear();
    this.icons.removeAll(true);

    const startX = PAD_X;
    let currentY = PAD_Y;

    // 1. Render Hint text căn giữa nếu có
    if (this.rawHint) {
      const hint = mkText(this.scene, this.rawHint, {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: '#94a3b8',
        align: 'center',
      }, (SLOT_W + PAD_X * 2) / 2, currentY + 1).setOrigin(0.5, 0);
      this.icons.add(hint);
      currentY += HINT_H;
    } else {
      currentY += 4;
    }

    // 2. Render 6 slots
    for (let i = 0; i < PARTY_COUNT; i++) {
      const sy = currentY + i * (SLOT_H + SLOT_GAP);
      const p = this.party[i];
      const pickable = this.canPick(p);

      // Thẻ trống
      if (!p) {
        this.gfx.fillStyle(EMPTY_BG, 0.7);
        this.gfx.fillRoundedRect(startX, sy, SLOT_W, SLOT_H, 6);
        this.gfx.lineStyle(1, 0x222742, 0.8);
        this.gfx.strokeRoundedRect(startX, sy, SLOT_W, SLOT_H, 6);

        const txt = this.scene.add.text(startX + SLOT_W / 2, sy + SLOT_H / 2, '— ' + (i + 1) + ' —', {
          fontSize: '13px',
          fontFamily: FONT.mono,
          color: '#3b4266',
        }).setOrigin(0.5);
        this.icons.add(txt);
        continue;
      }

      // Slot có Pokémon
      const curHp = Math.max(0, p.current_hp ?? 0);
      const maxHp = Math.max(1, p.stats?.hp ?? 10);
      const isFainted = curHp <= 0;
      const slotBgColor = isFainted ? 0x181a28 : SLOT_BG;
      const slotBorderColor = pickable ? SLOT_BORDER_PICKABLE : 0x272c48;

      const slotGfx = this.scene.add.graphics();
      const drawSlotBg = (hover = false) => {
        slotGfx.clear();
        slotGfx.fillStyle(hover ? SLOT_BG_HOVER : slotBgColor, 1);
        slotGfx.fillRoundedRect(startX, sy, SLOT_W, SLOT_H, 6);
        slotGfx.lineStyle(1.5, hover ? SLOT_BORDER_HOVER : slotBorderColor, pickable ? 1 : 0.4);
        slotGfx.strokeRoundedRect(startX, sy, SLOT_W, SLOT_H, 6);
      };
      drawSlotBg(false);
      this.icons.add(slotGfx);

      // Icon Pokémon (căn trái cân đối lùi vào 20px)
      const speciesId = p.species_id;
      const iconKey = `pkm_icon_${speciesId}`;
      const iconUrl = `/assets/icons/pokemon/${speciesId}.png`;
      const iconX = startX + 22;
      const iconY = sy + SLOT_H / 2;

      if (this.scene.textures.exists(iconKey)) {
        const img = this.scene.add.image(iconX, iconY, iconKey);
        img.setDisplaySize(34, 34);
        img.setAlpha(pickable ? 1 : 0.45);
        this.icons.add(img);
      } else {
        const placeholder = this.scene.add.text(iconX, iconY, '●', {
          fontSize: '16px',
          fontFamily: FONT.mono,
          color: '#00cec9',
        }).setOrigin(0.5);
        this.icons.add(placeholder);
        loadTextureImage(this.scene, iconKey, iconUrl).then((ok) => {
          if (ok && placeholder.active) {
            placeholder.destroy();
            const img = this.scene.add.image(iconX, iconY, iconKey);
            img.setDisplaySize(34, 34);
            img.setAlpha(pickable ? 1 : 0.45);
            this.icons.add(img);
          }
        });
      }

      // Giới tính icon
      const genderSymbol = p.gender === 'male' ? ' ♂' : p.gender === 'female' ? ' ♀' : '';
      const genderColor = p.gender === 'male' ? '#60a5fa' : p.gender === 'female' ? '#f472b6' : '';

      // Tên Pokémon (dòng 1 bên trái)
      const isShiny = Boolean(p.shiny);
      const baseName = (p.nickname || speciesId).slice(0, 12);
      const nameTxt = this.scene.add.text(startX + 44, sy + 7, (isShiny ? '★ ' : '') + baseName, {
        fontSize: '12px',
        fontFamily: FONT.ui,
        fontStyle: 'bold',
        color: isFainted ? '#64748b' : isShiny ? '#fcd34d' : pickable ? '#f8fafc' : '#94a3b8',
      });
      this.icons.add(nameTxt);

      if (genderSymbol) {
        const genderTxt = this.scene.add.text(nameTxt.x + nameTxt.width + 1, sy + 7, genderSymbol, {
          fontSize: '11px',
          fontFamily: FONT.ui,
          fontStyle: 'bold',
          color: genderColor,
        });
        this.icons.add(genderTxt);
      }

      // Level (ngay sau tên)
      const lvTxt = this.scene.add.text(startX + 140, sy + 8, `Lv.${p.level ?? 1}`, {
        fontSize: '10.5px',
        fontFamily: FONT.mono,
        color: isFainted ? '#475569' : '#38bdf8',
      });
      this.icons.add(lvTxt);

      // Trạng thái (Status badge / FNT) ở góc phải dòng 1
      const statusKey = isFainted ? 'fnt' : (p.status || '').toLowerCase();
      const statusDef = STATUS_MAP[statusKey];
      if (statusDef) {
        const badgeW = 28;
        const badgeH = 14;
        const badgeX = startX + SLOT_W - badgeW - 8;
        const badgeY = sy + 6;

        this.gfx.fillStyle(statusDef.bg, 0.95);
        this.gfx.fillRoundedRect(badgeX, badgeY, badgeW, badgeH, 3);
        const stTxt = this.scene.add.text(badgeX + badgeW / 2, badgeY + badgeH / 2, statusDef.label, {
          fontSize: '8.5px',
          fontFamily: FONT.mono,
          fontStyle: 'bold',
          color: statusDef.text,
        }).setOrigin(0.5);
        this.icons.add(stTxt);
      }

      // Thanh HP bar (dòng 2)
      const barX = startX + 44;
      const barY = sy + 28;
      const hpNumW = 54;
      const barW = SLOT_W - 44 - hpNumW - 12; // Chiều dài thanh HP
      const barH = 6;

      // Track HP
      this.gfx.fillStyle(0x0f1422, 1);
      this.gfx.fillRoundedRect(barX, barY, barW, barH, 2);
      this.gfx.lineStyle(1, 0x242b45, 0.8);
      this.gfx.strokeRoundedRect(barX, barY, barW, barH, 2);

      // Thanh máu thực tế
      const ratio = Phaser.Math.Clamp(curHp / maxHp, 0, 1);
      const hpColor = ratio > 0.5 ? C.ok : ratio > 0.2 ? C.warn : C.err;
      if (ratio > 0) {
        this.gfx.fillStyle(hpColor, 1);
        this.gfx.fillRoundedRect(barX, barY, Math.max(3, Math.round(barW * ratio)), barH, 2);
      }

      // Số máu HP hiển thị căn phải ngay cạnh thanh máu
      const hpTxt = this.scene.add.text(startX + SLOT_W - 8, barY + barH / 2, `${curHp}/${maxHp}`, {
        fontSize: '10px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: isFainted ? '#ef4444' : ratio > 0.2 ? '#cbd5e1' : '#f87171',
      }).setOrigin(1, 0.5);
      this.icons.add(hpTxt);

      // Biểu tượng Item đang cầm (Held Item) nếu có: đặt tinh tế ở góc phải trên hoặc góc dưới
      const held = (p as PokemonData & { held_item?: string | null }).held_item;
      if (held) {
        const heldTxt = this.scene.add.text(startX + SLOT_W - (statusDef ? 40 : 8), sy + 6, '🎒', {
          fontSize: '9.5px',
          fontFamily: FONT.sans,
        }).setOrigin(1, 0);
        this.icons.add(heldTxt);
      }

      // Vùng tương tác nhấp chọn
      const zone = this.scene.add
        .zone(startX + SLOT_W / 2, sy + SLOT_H / 2, SLOT_W, SLOT_H)
        .setInteractive({ useHandCursor: pickable });

      if (pickable) {
        zone.on('pointerover', () => drawSlotBg(true));
        zone.on('pointerout', () => drawSlotBg(false));
        zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
          ptr.event?.stopPropagation();
          this.onSelect?.(p, i);
          this.close();
        });
      }
      this.icons.add(zone);
    }
  }
}

export const PARTY_SELECT_MODAL_W = SLOT_W + PAD_X * 2;
