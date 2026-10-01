import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';

const SLOT = 36;
const SLOT_GAP = 5;
const PARTY_COUNT = 6;
const PANEL_W = 76;
const PANEL_H = PARTY_COUNT * SLOT + (PARTY_COUNT - 1) * SLOT_GAP + 14;
const HEADER_H = 26;

export interface PartyMember {
  name: string;
  hp: number;
  maxHp: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';
}

const RARITY_COLORS: Record<PartyMember['rarity'], number> = {
  common: C.border,
  uncommon: C.ok,
  rare: C.accent,
  legendary: C.warn,
  mythical: C.err,
};

const EMPTY_BG = 0x262a4d;

/**
 * **PartyStrip** — Khung danh sách Pokémon trong đội hình (Party):
 * - Kế thừa từ `UiModal`: thanh tiêu đề chuẩn mực, có nút thu nhỏ (－), nút neo (⚓), nút tắt (✕).
 * - Draggable: có thể kéo thả di chuyển tự do trên màn hình.
 * - Nút Thu nhỏ: gập lại chỉ còn thanh tiêu đề giúp không chiếm tầm nhìn thế giới game.
 * - Nút Neo: khôi phục vị trí mặc định ở góc trái bên dưới PlayerHud.
 */
export class PartyStrip extends UiModal {
  private members: Array<PartyMember | null>;
  private slotGraphics: Phaser.GameObjects.Graphics;
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private _hudMode: HudMode = 'normal';

  /** Y neo — WorldScene gán bằng cách set trực tiếp. */
  public anchorY = 96;

  constructor(scene: Phaser.Scene, members: Array<PartyMember | null>) {
    super(scene, {
      title: '🐾 PARTY',
      width: PANEL_W,
      height: PANEL_H,
      headerHeight: HEADER_H,
      lockUi: false,
      depth: 100,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'top-left',
      defaultOffsetX: 8,
      defaultOffsetY: 96,
      onClose: () => {
        this.setVisible(false);
      },
    });

    this.members = members;

    // Graphics vẽ nền và viền các slot trong contentContainer
    this.slotGraphics = scene.add.graphics();
    this.contentContainer.add(this.slotGraphics);

    this.renderSlots();
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
    this.slotGraphics.clear();

    const startX = Math.round((PANEL_W - SLOT) / 2);
    const startY = 6;

    let activeCount = 0;

    for (let i = 0; i < PARTY_COUNT; i++) {
      const sy = startY + i * (SLOT + SLOT_GAP);
      const m = this.members[i];
      if (m) activeCount++;

      // Nền ô slot
      this.slotGraphics.fillStyle(m ? 0x2f3358 : EMPTY_BG, 1);
      this.slotGraphics.fillRoundedRect(startX, sy, SLOT, SLOT, 4);
      this.slotGraphics.lineStyle(1.5, m ? RARITY_COLORS[m.rarity] : C.border, m ? 1 : 0.4);
      this.slotGraphics.strokeRoundedRect(startX, sy, SLOT, SLOT, 4);

      if (!m) {
        // Dấu + ô trống
        const txt = this.scene.add
          .text(startX + SLOT / 2, sy + SLOT / 2, '+', {
            fontSize: '15px',
            fontFamily: FONT.mono,
            color: C.muted,
          })
          .setOrigin(0.5);
        this.slotTexts.push(txt);
        this.contentContainer.add(txt);
      } else {
        // Biểu tượng Pokémon
        const icon = this.scene.add
          .text(startX + SLOT / 2, sy + SLOT / 2 - 3, '●', {
            fontSize: '16px',
            fontFamily: FONT.mono,
            color: '#00cec9',
          })
          .setOrigin(0.5);
        this.slotTexts.push(icon);
        this.contentContainer.add(icon);

        // Thanh HP mini dưới đáy ô
        const barW = SLOT - 6;
        const barH = 3;
        this.slotGraphics.fillStyle(C.border, 1);
        this.slotGraphics.fillRoundedRect(startX + 3, sy + SLOT - 5, barW, barH, 1);

        const ratio = m.maxHp ? Phaser.Math.Clamp(m.hp / m.maxHp, 0, 1) : 0;
        this.slotGraphics.fillStyle(ratio > 0.5 ? C.ok : ratio > 0.2 ? C.warn : C.err, 1);
        this.slotGraphics.fillRoundedRect(startX + 3, sy + SLOT - 5, barW * ratio, barH, 1);
      }
    }

    // Cập nhật tiêu đề hiển thị số lượng Pokémon
    this.setTitle(`🐾 PARTY (${activeCount}/${PARTY_COUNT})`);
  }

  setVisible(v: boolean): void {
    if (v) this.show();
    else this.close();
  }
}
