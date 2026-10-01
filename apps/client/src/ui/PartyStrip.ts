import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import type { HudMode } from './HudManager';

const SLOT_W = 72;
const SLOT_H = 38;
const SLOT_GAP = 5;
const PARTY_COUNT = 6;
const PANEL_W = 86;
const CONTENT_H = PARTY_COUNT * SLOT_H + (PARTY_COUNT - 1) * SLOT_GAP + 14;
const PANEL_H = CONTENT_H;

export interface PartyMember {
  name: string;
  hp: number;
  maxHp: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';
  id?: string;
  species_id?: string;
  level?: number;
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
 * - Chế độ neo (`docked: true`) cố định bên dưới PlayerHud.
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
  ) {
    super(scene, {
      title: '',
      width: PANEL_W,
      height: PANEL_H,
      showTitleBar: false,
      docked: true,
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
    });

    this.members = members;
    this.onSelectMember = onSelectMember;

    // Graphics vẽ nền và viền các slot trong contentContainer
    this.slotGraphics = scene.add.graphics();
    this.contentContainer.add(this.slotGraphics);

    this.renderSlots();
    this.show();
  }

  setHudMode(mode: HudMode): void {
    if (this._hudMode === mode) return;
    this._hudMode = mode;
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

    const startX = Math.round((PANEL_W - SLOT_W) / 2);
    const startY = 7;

    for (let i = 0; i < PARTY_COUNT; i++) {
      const sy = startY + i * (SLOT_H + SLOT_GAP);
      const m = this.members[i];

      // Nền ô slot
      this.slotGraphics.fillStyle(m ? 0x242848 : EMPTY_BG, 1);
      this.slotGraphics.fillRoundedRect(startX, sy, SLOT_W, SLOT_H, 5);
      this.slotGraphics.lineStyle(1.5, m ? RARITY_COLORS[m.rarity] : C.border, m ? 1 : 0.4);
      this.slotGraphics.strokeRoundedRect(startX, sy, SLOT_W, SLOT_H, 5);

      if (!m) {
        // Dấu + ô trống
        const txt = this.scene.add
          .text(startX + SLOT_W / 2, sy + SLOT_H / 2, '+', {
            fontSize: '16px',
            fontFamily: FONT.mono,
            color: C.muted,
          })
          .setOrigin(0.5);
        this.slotTexts.push(txt);
        this.contentContainer.add(txt);
      } else {
        // ── Cột trái: Icon Pokémon (tâm tại startX + 18, sy + 19) ──
        const speciesId = m.species_id || m.name.toLowerCase();
        const iconKey = `pkm_icon_${speciesId}`;
        const iconUrl = `/assets/icons/pokemon/${speciesId}.png`;

        if (this.scene.textures.exists(iconKey)) {
          const img = this.scene.add.image(startX + 18, sy + 19, iconKey);
          img.setDisplaySize(28, 28);
          this.slotImages.push(img);
          this.contentContainer.add(img);
        } else {
          // Fallback text icon
          const icon = this.scene.add
            .text(startX + 18, sy + 19, '●', {
              fontSize: '15px',
              fontFamily: FONT.mono,
              color: '#00cec9',
            })
            .setOrigin(0.5);
          this.slotTexts.push(icon);
          this.contentContainer.add(icon);

          // Tải động texture icon an toàn
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

        // ── Cột phải (x: startX + 36): Rộng rãi 32px, tách biệt hoàn toàn ──
        // 1. Text Level (dòng trên)
        if (m.level) {
          const lvTxt = this.scene.add
            .text(startX + 36, sy + 6, `Lv.${m.level}`, {
              fontSize: '10px',
              fontFamily: FONT.mono,
              fontStyle: 'bold',
              color: '#fdcb6e',
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

        // Vùng tương tác nhấp chuột (Click to View Summary)
        const zone = this.scene.add
          .zone(startX + SLOT_W / 2, sy + SLOT_H / 2, SLOT_W, SLOT_H)
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
}
