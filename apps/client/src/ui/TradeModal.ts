import Phaser from 'phaser';
import { FONT } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange } from '../i18n';
import { ColyseusManager } from '../network/ColyseusManager';
import type { PokemonData } from './PokemonSummaryModal';

const MODAL_W = 420;
const MODAL_H = 320;

/**
 * **TradeModal** — Giao dịch giả lập với NPC (Plan 45 §4.1).
 * - Chọn Pokémon trong đội → server "nhận lại" cùng con với `tradeWithNpc: true`.
 * - Nếu Pokémon có evolution method `trade` → `EvolveModal` hiện.
 */
export class TradeModal extends UiModal {
  private party: PokemonData[] = [];
  private selected: PokemonData | null = null;

  private gfx!: Phaser.GameObjects.Graphics;
  private icons!: Phaser.GameObjects.Container;
  private unsubLang?: () => void;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    super(scene, {
      title: t('TRADE_TITLE'),
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 34,
      showTitleBar: true,
      draggable: true,
      docked: true,
      dockOnOpen: true,
      lockUi: true,
      lockGameOnly: true,
      overlay: true,
      depth: 240,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      padding: { top: 6, right: 10, bottom: 10, left: 10 },
      onClose: () => onClose?.(),
    });

    this.gfx = scene.add.graphics();
    this.icons = scene.add.container(0, 0);
    this.contentContainer.add(this.gfx);
    this.contentContainer.add(this.icons);

    this.close();
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('TRADE_TITLE'));
      this.render();
    });
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
    if (this.selected && !party.some((p) => p.id === this.selected?.id)) {
      this.selected = null;
    }
    // Không render ở đây — chỉ cập nhật data; render xảy ra ở show().
  }

  private render(): void {
    this.gfx.clear();
    this.icons.removeAll(true);

    const lbl = mkText(this.scene, 'TRADE_SELECT', {
      fontSize: '11px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#00cec9',
    }, 14, 44);
    this.icons.add(lbl);

    // Danh sách party (6 slot)
    const slotW = 120;
    const slotH = 34;
    this.party.forEach((p, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 14 + col * (slotW + 6);
      const y = 64 + row * (slotH + 6);
      const isSel = this.selected?.id === p.id;

      this.gfx.fillStyle(isSel ? 0x2d3766 : 0x222646, 1);
      this.gfx.fillRoundedRect(x, y, slotW, slotH, 4);
      this.gfx.lineStyle(1.5, isSel ? 0x00cec9 : 0x3d4475, 1);
      this.gfx.strokeRoundedRect(x, y, slotW, slotH, 4);

      const name = this.scene.add.text(x + 8, y + 6, (p.nickname || p.species_id).slice(0, 10), {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#ffffff',
      });
      this.icons.add(name);

      const lv = this.scene.add.text(x + slotW - 8, y + 6, `Lv.${p.level}`, {
        fontSize: '10px',
        fontFamily: FONT.mono,
        color: '#fdcb6e',
      }).setOrigin(1, 0);
      this.icons.add(lv);

      const zone = this.scene.add.zone(x + slotW / 2, y + slotH / 2, slotW, slotH).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        this.selected = p;
        this.render();
      });
      this.icons.add(zone);
    });

    // Nút xác nhận
    const btnY = 64 + 2 * (slotH + 6) + 10;
    const canTrade = Boolean(this.selected);
    const g = this.scene.add.graphics();
    g.fillStyle(0x272b49, 1);
    g.fillRoundedRect(14, btnY, MODAL_W - 28, 30, 4);
    g.lineStyle(1, canTrade ? 0x00cec9 : 0x4a5568, 0.9);
    g.strokeRoundedRect(14, btnY, MODAL_W - 28, 30, 4);
    this.icons.add(g);

    const btnTxt = this.scene.add
      .text(MODAL_W / 2, btnY + 15, t('TRADE_CONFIRM'), {
        fontSize: '12px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: canTrade ? '#00cec9' : '#4a5568',
      })
      .setOrigin(0.5);
    if (canTrade) {
      btnTxt.setInteractive({ useHandCursor: true });
      btnTxt.on('pointerdown', () => {
        if (this.selected) {
          ColyseusManager.getInstance().sendTrade(this.selected.id);
          this.close();
        }
      });
    }
    this.icons.add(btnTxt);
  }
}