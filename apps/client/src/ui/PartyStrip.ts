import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import type { HudMode } from './HudManager';

const PARTY_COUNT = 6;
const TOP_DRAG_H = 14;

// Normal Mode (Thẻ ngang chi tiết 72x38, rộng 86px)
const NORMAL_SLOT_W = 72;
const NORMAL_SLOT_H = 38;
const NORMAL_SLOT_GAP = 5;
const NORMAL_PANEL_W = 86;
const NORMAL_CONTENT_H = PARTY_COUNT * NORMAL_SLOT_H + (PARTY_COUNT - 1) * NORMAL_SLOT_GAP + 14;
const NORMAL_PANEL_H = NORMAL_CONTENT_H + TOP_DRAG_H;

// Mini Mode (Thẻ vuông tối giản 38x38, rộng 48px khớp với PlayerHud 48px)
const MINI_SLOT_W = 38;
const MINI_SLOT_H = 38;
const MINI_SLOT_GAP = 4;
const MINI_PANEL_W = 48;
const MINI_CONTENT_H = PARTY_COUNT * MINI_SLOT_H + (PARTY_COUNT - 1) * MINI_SLOT_GAP + 14;
const MINI_PANEL_H = MINI_CONTENT_H + TOP_DRAG_H;

export interface PartyMember {
  name: string;
  hp: number;
  maxHp: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';
  id?: string;
  species_id?: string;
  level?: number;
  shiny?: boolean;
  /** Item đang cầm trên Pokémon (Plan 45) — đánh dấu bằng dấu vát / viền cạnh trái. */
  heldItem?: string | null;
  pokemonData?: any;
}

const RARITY_COLORS: Record<PartyMember['rarity'], number> = {
  common: C.border,
  uncommon: C.ok,
  rare: C.accent,
  legendary: C.warn,
  mythical: C.err,
};

const EMPTY_BG = 0x262a4d;

function loadTextureImage(scene: Phaser.Scene, key: string, url: string): Promise<boolean> {
  if (scene.textures.exists(key)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!scene.textures.exists(key)) {
        scene.textures.addImage(key, img);
      }
      resolve(true);
    };
    img.onerror = () => {
      resolve(false);
    };
    img.src = url;
  });
}

/**
 * **PartyStrip** — Khung danh sách Pokémon trong đội hình (Party):
 * - Kế thừa từ `UiModal`: chuẩn hoá khung giao diện pixel thống nhất.
 * - Hỗ trợ kéo thả linh hoạt với Top Drag Padding (`topDragPadding: 14`) không titlebar.
 * - Thiết kế Thẻ ngang Mini Card rộng rãi (72×38px): Tách biệt hoàn toàn cột Icon Pokémon bên trái
 *   và cột Cấp độ (Level) + Máu (HP) bên phải, thoáng đãng và không bị dính đè.
 * - Click vào từng Pokémon để mở bảng thông tin chi tiết (Summary).
 */
export class PartyStrip extends UiModal {
  private members: Array<PartyMember | null>;
  private slotGraphics: Phaser.GameObjects.Graphics;
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private slotImages: Phaser.GameObjects.Image[] = [];
  private slotZones: Phaser.GameObjects.Zone[] = [];
  private _hudMode: HudMode = 'normal';

  public onSelectMember?: (member: PartyMember, index: number) => void;

  /** Y neo — WorldScene gán bằng cách set trực tiếp. */
  public anchorY = 96;

  constructor(
    scene: Phaser.Scene,
    members: Array<PartyMember | null>,
    onSelectMember?: (member: PartyMember, index: number) => void,
    onClose?: () => void,
    onResetPosition?: () => void,
  ) {
    super(scene, {
      title: '',
      width: NORMAL_PANEL_W,
      height: NORMAL_PANEL_H,
      showTitleBar: false,
      topDragPadding: TOP_DRAG_H,
      showDragGrip: true,
      draggable: true,
      docked: false,
      lockUi: false,
      depth: 100,
      showClose: false,
      showMinimize: false,
      showDock: false,
      defaultAlign: 'top-left',
      defaultOffsetX: 8,
      defaultOffsetY: 96,
      onClose: () => {
        this.setVisible(false);
        onClose?.();
      },
      onResetPosition: () => {
        onResetPosition?.();
      },
    });

    this.members = members;
    this.onSelectMember = onSelectMember;

    // Graphics vẽ nền và viền các slot trong contentContainer
    this.slotGraphics = scene.add.graphics();
    this.contentContainer.add(this.slotGraphics);

    this.renderSlots();
    this.show();
  }

  private isMiniMode(): boolean {
    return this._hudMode === 'mini' || this.scene.scale.width < 800 || this.scene.scale.height < 600;
  }

  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
    this.relayout();
  }

  public override relayout(): void {
    const isMini = this.isMiniMode();
    this.opts.width = isMini ? MINI_PANEL_W : NORMAL_PANEL_W;
    this.opts.height = isMini ? MINI_PANEL_H : NORMAL_PANEL_H;
    super.relayout();
    this.renderSlots();
  }

  /** Chiều cao khung party theo zoom — WorldScene dùng để tính vị trí. */
  getPanelHeight(): number {
    return this.getActualSize().h;
  }

  /** Kích thước panel hiện tại. */
  getSize(): { w: number; h: number } {
    return this.getActualSize();
  }

  /** Ép vẽ lại với `anchorY` hiện tại. */
  relayoutPublic(): void {
    this.opts.defaultOffsetY = this.anchorY;
    this.relayout();
  }

  public setMembers(members: Array<PartyMember | null>): void {
    this.members = members;
    this.renderSlots();
  }

  private renderSlots(): void {
    this.slotTexts.forEach((t) => t.destroy());
    this.slotTexts = [];
    this.slotImages.forEach((img) => img.destroy());
    this.slotImages = [];
    this.slotZones.forEach((z) => z.destroy());
    this.slotZones = [];
    this.slotGraphics.clear();

    const isMini = this.isMiniMode();
    const curSlotW = isMini ? MINI_SLOT_W : NORMAL_SLOT_W;
    const curSlotH = isMini ? MINI_SLOT_H : NORMAL_SLOT_H;
    const curSlotGap = isMini ? MINI_SLOT_GAP : NORMAL_SLOT_GAP;
    const curPanelW = isMini ? MINI_PANEL_W : NORMAL_PANEL_W;

    const startX = Math.round((curPanelW - curSlotW) / 2);
    const startY = 7;

    for (let i = 0; i < PARTY_COUNT; i++) {
      const sy = startY + i * (curSlotH + curSlotGap);
      const m = this.members[i];

      // Nền ô slot
      this.slotGraphics.fillStyle(m ? 0x242848 : EMPTY_BG, 1);
      this.slotGraphics.fillRoundedRect(startX, sy, curSlotW, curSlotH, 5);
      this.slotGraphics.lineStyle(1.5, m ? RARITY_COLORS[m.rarity] : C.border, m ? 1 : 0.4);
      this.slotGraphics.strokeRoundedRect(startX, sy, curSlotW, curSlotH, 5);

      if (m && m.heldItem) {
        // Đánh dấu có held item bằng dấu vát góc trên trái & viền cạnh trái (không che text)
        this.slotGraphics.fillStyle(0xfdcb6e, 1);
        this.slotGraphics.beginPath();
        this.slotGraphics.moveTo(startX + 1, sy + 7);
        this.slotGraphics.lineTo(startX + 7, sy + 1);
        this.slotGraphics.lineTo(startX + 1, sy + 1);
        this.slotGraphics.closePath();
        this.slotGraphics.fillPath();

        this.slotGraphics.fillRoundedRect(startX + 1, sy + 2, 3, curSlotH - 4, 1.5);
      }

      if (!m) {
        // Dấu + ô trống
        const txt = this.scene.add
          .text(startX + curSlotW / 2, sy + curSlotH / 2, '+', {
            fontSize: isMini ? '14px' : '16px',
            fontFamily: FONT.mono,
            color: C.muted,
          })
          .setOrigin(0.5);
        this.slotTexts.push(txt);
        this.contentContainer.add(txt);
      } else {
        const speciesId = m.species_id || m.name.toLowerCase();
        const iconKey = `pkm_icon_${speciesId}`;
        const iconUrl = `/assets/icons/pokemon/${speciesId}.png`;

        if (isMini) {
          // ── CHẾ ĐỘ MINI: Chỉ hiển thị Pokémon và thanh EXP dưới chân (không level/tên) ──
          const iconCenterX = startX + curSlotW / 2;
          const iconCenterY = sy + 16;
          const iconSize = 25;

          if (this.scene.textures.exists(iconKey)) {
            const img = this.scene.add.image(iconCenterX, iconCenterY, iconKey);
            img.setDisplaySize(iconSize, iconSize);
            this.slotImages.push(img);
            this.contentContainer.add(img);
          } else {
            const icon = this.scene.add
              .text(iconCenterX, iconCenterY, '●', {
                fontSize: '13px',
                fontFamily: FONT.mono,
                color: '#00cec9',
              })
              .setOrigin(0.5);
            this.slotTexts.push(icon);
            this.contentContainer.add(icon);

            loadTextureImage(this.scene, iconKey, iconUrl).then((loaded) => {
              if (loaded && icon.active) {
                icon.destroy();
                const newImg = this.scene.add.image(iconCenterX, iconCenterY, iconKey);
                newImg.setDisplaySize(iconSize, iconSize);
                this.slotImages.push(newImg);
                this.contentContainer.add(newImg);
              }
            });
          }

          // Thanh EXP dưới chân Pokémon
          const barW = curSlotW - 8; // 30px
          const barH = 3;
          const barX = startX + 4;
          const barY = sy + 31;

          this.slotGraphics.fillStyle(0x191c33, 1);
          this.slotGraphics.fillRoundedRect(barX, barY, barW, barH, 1);

          let expRatio = 0.5;
          if (m.pokemonData?.exp !== undefined) {
            expRatio = Phaser.Math.Clamp((m.pokemonData.exp % 100) / 100, 0.05, 1);
          } else if (m.level !== undefined) {
            expRatio = Phaser.Math.Clamp(((m.level * 19) % 100) / 100, 0.1, 1);
          } else if (m.maxHp) {
            expRatio = Phaser.Math.Clamp(m.hp / m.maxHp, 0, 1);
          }

          this.slotGraphics.fillStyle(0x00cec9, 1);
          this.slotGraphics.fillRoundedRect(barX, barY, Math.max(2, barW * expRatio), barH, 1);

          // Tiền tố S. cho Pokémon Shiny (mini mode)
          const isShiny = Boolean(m.shiny || m.pokemonData?.shiny);
          if (isShiny) {
            const sBadge = this.scene.add
              .text(startX + curSlotW - 4, sy + 3, 'S.', {
                fontSize: '9px',
                fontFamily: FONT.mono,
                fontStyle: 'bold',
                color: '#f1c40f',
              })
              .setOrigin(1, 0);
            this.slotTexts.push(sBadge);
            this.contentContainer.add(sBadge);
          }
        } else {
          // ── CHẾ ĐỘ NORMAL: Cột trái Icon Pokémon, Cột phải Level + Máu HP ──
          if (this.scene.textures.exists(iconKey)) {
            const img = this.scene.add.image(startX + 18, sy + 19, iconKey);
            img.setDisplaySize(28, 28);
            this.slotImages.push(img);
            this.contentContainer.add(img);
          } else {
            const icon = this.scene.add
              .text(startX + 18, sy + 19, '●', {
                fontSize: '15px',
                fontFamily: FONT.mono,
                color: '#00cec9',
              })
              .setOrigin(0.5);
            this.slotTexts.push(icon);
            this.contentContainer.add(icon);

            loadTextureImage(this.scene, iconKey, iconUrl).then((loaded) => {
              if (loaded && icon.active) {
                icon.destroy();
                const newImg = this.scene.add.image(startX + 18, sy + 19, iconKey);
                newImg.setDisplaySize(28, 28);
                this.slotImages.push(newImg);
                this.contentContainer.add(newImg);
              }
            });
          }

          // 1. Text Level (dòng trên) — Thêm tiền tố S. cho Pokémon Shiny
          if (m.level !== undefined) {
            const isShiny = Boolean(m.shiny || m.pokemonData?.shiny);
            const lvStr = isShiny ? `S. Lv.${m.level}` : `Lv.${m.level}`;
            const lvColor = isShiny ? '#f1c40f' : '#fdcb6e';
            const lvTxt = this.scene.add
              .text(startX + 36, sy + 6, lvStr, {
                fontSize: isShiny ? '9.5px' : '10px',
                fontFamily: FONT.mono,
                fontStyle: 'bold',
                color: lvColor,
              })
              .setOrigin(0, 0);
            this.slotTexts.push(lvTxt);
            this.contentContainer.add(lvTxt);
          }

          // 2. Thanh máu HP mini (dòng dưới)
          const barW = 30;
          const barH = 4;
          this.slotGraphics.fillStyle(0x191c33, 1);
          this.slotGraphics.fillRoundedRect(startX + 36, sy + 22, barW, barH, 1.5);

          const ratio = m.maxHp ? Phaser.Math.Clamp(m.hp / m.maxHp, 0, 1) : 0;
          this.slotGraphics.fillStyle(ratio > 0.5 ? C.ok : ratio > 0.2 ? C.warn : C.err, 1);
          this.slotGraphics.fillRoundedRect(startX + 36, sy + 22, barW * ratio, barH, 1.5);
        }

        // Vùng tương tác nhấp chuột (Click to View Summary)
        const zone = this.scene.add
          .zone(startX + curSlotW / 2, sy + curSlotH / 2, curSlotW, curSlotH)
          .setInteractive({ useHandCursor: true });

        zone.on('pointerdown', () => {
          this.onSelectMember?.(m, i);
        });

        this.slotZones.push(zone);
        this.contentContainer.add(zone);
      }
    }
  }

  setVisible(v: boolean): void {
    if (v) this.show();
    else this.close();
  }

  isVisible(): boolean {
    return this.isOpen();
  }
}
