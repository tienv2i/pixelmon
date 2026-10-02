import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange, type I18nKey } from '../i18n';
import type { PokemonData, PokemonSummaryModal } from './PokemonSummaryModal';

export interface StorageBoxState {
  currentBox: number;
  totalBoxes: number;
  party: PokemonData[];
  boxPokemon: PokemonData[];
}

const MODAL_W = 640;
const MODAL_H = 430;
const BOX_COLS = 6;
const BOX_ROWS = 5;
const BOX_SLOT_SIZE = 38;
const BOX_SLOT_GAP = 4;

const SERVER_ORIGIN: string = (() => {
  const url: string = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567';
  return url.replace(/^ws/, 'http');
})();

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
 * **PcBoxModal** — Hệ thống Lưu trữ Pokémon (PC Box):
 * - Quản lý các hộp lưu trữ Pokémon (mỗi hộp 30 ô lưới 6×5).
 * - Hiển thị song song đội hình 6 Pokémon trong Party và kho Box.
 * - Thao tác trực tiếp: Rút về đội (Withdraw), Gửi vào hộp (Deposit), Thả (Release).
 * - Tích hợp xem chi tiết qua `PokemonSummaryModal`.
 */
export class PcBoxModal extends UiModal {
  private currentBoxIndex = 0;
  private totalBoxes = 8;

  private partyPokemon: PokemonData[] = [];
  private allBoxPokemon: PokemonData[] = [];

  private selectedPokemon: PokemonData | null = null;
  private selectedSource: 'box' | 'party' | null = null;

  private summaryModal?: PokemonSummaryModal;
  private onPartyChanged?: (party: PokemonData[]) => void;
  private unsubLang?: () => void;

  // Visual containers & graphics
  private boxGridGraphics!: Phaser.GameObjects.Graphics;
  private partyGraphics!: Phaser.GameObjects.Graphics;
  private previewGraphics!: Phaser.GameObjects.Graphics;

  private boxTitleText!: Phaser.GameObjects.Text;
  private gridIconsContainer!: Phaser.GameObjects.Container;
  private partyIconsContainer!: Phaser.GameObjects.Container;
  private previewContainer!: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    summaryModal?: PokemonSummaryModal,
    onPartyChanged?: (party: PokemonData[]) => void,
    onClose?: () => void,
  ) {
    super(scene, {
      title: t('PC_TITLE'),
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 34,
      showTitleBar: true,
      draggable: true,
      docked: false,
      lockUi: false,
      depth: 220,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      padding: { top: 6, right: 10, bottom: 10, left: 10 },
      onClose: () => {
        onClose?.();
      },
    });

    this.summaryModal = summaryModal;
    this.onPartyChanged = onPartyChanged;

    this.boxGridGraphics = scene.add.graphics();
    this.partyGraphics = scene.add.graphics();
    this.previewGraphics = scene.add.graphics();

    this.contentContainer.add(this.boxGridGraphics);
    this.contentContainer.add(this.partyGraphics);
    this.contentContainer.add(this.previewGraphics);

    this.gridIconsContainer = scene.add.container(0, 0);
    this.partyIconsContainer = scene.add.container(0, 0);
    this.previewContainer = scene.add.container(0, 0);

    this.contentContainer.add(this.gridIconsContainer);
    this.contentContainer.add(this.partyIconsContainer);
    this.contentContainer.add(this.previewContainer);

    this.createBoxHeader();
    this.renderAll();
    this.close();

    // Cập nhật lại tiêu đề modal + các nhãn động khi đổi ngôn ngữ
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('PC_TITLE'));
      this.renderAll();
    });
  }

  public override destroy(): void {
    this.unsubLang?.();
    super.destroy();
  }

  public override show(): void {
    super.show();
    this.renderAll();
  }

  /** Cập nhật toàn bộ dữ liệu từ server */
  public setStorageData(party: PokemonData[], box: PokemonData[]): void {
    this.partyPokemon = [...party];
    this.allBoxPokemon = [...box];

    if (!this.selectedPokemon && this.partyPokemon.length > 0) {
      this.selectedPokemon = this.partyPokemon[0];
      this.selectedSource = 'party';
    }

    this.renderAll();
  }

  private createBoxHeader(): void {
    const barX = 14;
    const barY = 6;
    const barW = 256;

    // Nút Box trước ◀
    const prevBtn = this.scene.add
      .text(barX + 16, barY + 14, '◀', {
        fontSize: '14px',
        fontFamily: FONT.sans,
        color: '#00cec9',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    prevBtn.on('pointerdown', () => {
      this.currentBoxIndex = (this.currentBoxIndex - 1 + this.totalBoxes) % this.totalBoxes;
      this.renderBoxGrid();
    });
    this.contentContainer.add(prevBtn);

    // Tiêu đề Box
    this.boxTitleText = mkText(this.scene, this.boxTitle(), {
      fontSize: '13px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#ffffff',
    }, barX + barW / 2, barY + 14).setOrigin(0.5);
    this.contentContainer.add(this.boxTitleText);

    // Nút Box sau ▶
    const nextBtn = this.scene.add
      .text(barX + barW - 16, barY + 14, '▶', {
        fontSize: '14px',
        fontFamily: FONT.sans,
        color: '#00cec9',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    nextBtn.on('pointerdown', () => {
      this.currentBoxIndex = (this.currentBoxIndex + 1) % this.totalBoxes;
      this.renderBoxGrid();
    });
    this.contentContainer.add(nextBtn);
  }

  private renderAll(): void {
    this.renderBoxGrid();
    this.renderPartyList();
    this.renderPreviewPanel();
  }

  /** Nhãn tiêu đề Box hiện tại (VD: "HỘP 1 / 8") */
  private boxTitle(): string {
    return `${t('PC_BOX_LABEL')}${this.currentBoxIndex + 1} / ${this.totalBoxes}`;
  }

  /** Lấy danh sách Pokémon trong Box hiện tại (tối đa 30 con) */
  private getCurrentBoxPokemon(): PokemonData[] {
    const start = this.currentBoxIndex * 30;
    return this.allBoxPokemon.slice(start, start + 30);
  }

  /** Vẽ lưới 30 ô của Box hiện tại */
  private renderBoxGrid(): void {
    this.boxGridGraphics.clear();
    this.gridIconsContainer.removeAll(true);

    this.boxTitleText.setText(this.boxTitle());

    const startX = 14;
    const startY = 38;
    const boxPokemon = this.getCurrentBoxPokemon();

    // Khung nền Box
    this.boxGridGraphics.fillStyle(0x181a2e, 1);
    this.boxGridGraphics.fillRoundedRect(startX - 4, startY - 4, 260, 226, 6);
    this.boxGridGraphics.lineStyle(1.5, 0x2e355b, 1);
    this.boxGridGraphics.strokeRoundedRect(startX - 4, startY - 4, 260, 226, 6);

    for (let r = 0; r < BOX_ROWS; r++) {
      for (let c = 0; c < BOX_COLS; c++) {
        const idx = r * BOX_COLS + c;
        const x = startX + c * (BOX_SLOT_SIZE + BOX_SLOT_GAP);
        const y = startY + r * (BOX_SLOT_SIZE + BOX_SLOT_GAP);

        const pkm = boxPokemon[idx];
        const isSelected = this.selectedSource === 'box' && this.selectedPokemon?.id === pkm?.id;

        // Nền ô
        this.boxGridGraphics.fillStyle(isSelected ? 0x2d3766 : pkm ? 0x222646 : 0x1b1e36, 1);
        this.boxGridGraphics.fillRoundedRect(x, y, BOX_SLOT_SIZE, BOX_SLOT_SIZE, 4);

        this.boxGridGraphics.lineStyle(
          1.5,
          isSelected ? 0x00cec9 : pkm ? 0x3d4475 : 0x262a4a,
          1,
        );
        this.boxGridGraphics.strokeRoundedRect(x, y, BOX_SLOT_SIZE, BOX_SLOT_SIZE, 4);

        if (pkm) {
          // Icon Pokémon
          const iconKey = `pkm_icon_${pkm.species_id}`;
          const iconUrl = `/assets/icons/pokemon/${pkm.species_id}.png`;

          const img = this.scene.add.image(x + BOX_SLOT_SIZE / 2, y + BOX_SLOT_SIZE / 2, iconKey);
          img.setDisplaySize(28, 28);
          this.gridIconsContainer.add(img);

          if (!this.scene.textures.exists(iconKey)) {
            loadTextureImage(this.scene, iconKey, iconUrl).then((loaded) => {
              if (loaded && img.active) {
                img.setTexture(iconKey);
                img.setDisplaySize(28, 28);
              }
            });
          }

          // Cấp độ nhỏ góc dưới
          const lvTxt = this.scene.add
            .text(x + BOX_SLOT_SIZE - 2, y + BOX_SLOT_SIZE - 2, `${pkm.level}`, {
              fontSize: '9px',
              fontFamily: FONT.mono,
              color: '#fdcb6e',
            })
            .setOrigin(1, 1);
          this.gridIconsContainer.add(lvTxt);

          // Vùng bấm chọn
          const zone = this.scene.add
            .zone(x + BOX_SLOT_SIZE / 2, y + BOX_SLOT_SIZE / 2, BOX_SLOT_SIZE, BOX_SLOT_SIZE)
            .setInteractive({ useHandCursor: true });
          zone.on('pointerdown', () => {
            this.selectedPokemon = pkm;
            this.selectedSource = 'box';
            this.renderAll();
          });
          this.gridIconsContainer.add(zone);
        }
      }
    }
  }

  /** Vẽ danh sách Đội hình (Party 6 con) */
  private renderPartyList(): void {
    this.partyGraphics.clear();
    this.partyIconsContainer.removeAll(true);

    const px = 286;
    const py = 10;
    const pw = 150;
    const ph = 254;

    this.partyGraphics.fillStyle(0x181a2e, 1);
    this.partyGraphics.fillRoundedRect(px, py, pw, ph, 6);
    this.partyGraphics.lineStyle(1.5, 0x2e355b, 1);
    this.partyGraphics.strokeRoundedRect(px, py, pw, ph, 6);

    const title = mkText(this.scene, this.partyTitle(), {
      fontSize: '11px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#00cec9',
    }, px + pw / 2, py + 14).setOrigin(0.5);
    this.partyIconsContainer.add(title);

    const slotH = 34;
    const startSlotY = py + 28;

    for (let i = 0; i < 6; i++) {
      const sy = startSlotY + i * (slotH + 3);
      const pkm = this.partyPokemon[i];
      const isSelected = this.selectedSource === 'party' && this.selectedPokemon?.id === pkm?.id;

      this.partyGraphics.fillStyle(isSelected ? 0x2d3766 : pkm ? 0x222646 : 0x1b1e36, 1);
      this.partyGraphics.fillRoundedRect(px + 6, sy, pw - 12, slotH, 4);
      this.partyGraphics.lineStyle(1.5, isSelected ? 0x00cec9 : pkm ? 0x3d4475 : 0x262a4a, 1);
      this.partyGraphics.strokeRoundedRect(px + 6, sy, pw - 12, slotH, 4);

      if (!pkm) {
        const emptyTxt = mkText(this.scene, 'PC_SLOT_EMPTY', {
          fontSize: '11px',
          fontFamily: FONT.sans,
          color: '#4a5568',
        }, px + pw / 2, sy + slotH / 2).setOrigin(0.5);
        this.partyIconsContainer.add(emptyTxt);
      } else {
        // Icon
        const iconKey = `pkm_icon_${pkm.species_id}`;
        const iconUrl = `/assets/icons/pokemon/${pkm.species_id}.png`;

        const img = this.scene.add.image(px + 22, sy + slotH / 2, iconKey);
        img.setDisplaySize(24, 24);
        this.partyIconsContainer.add(img);

        if (!this.scene.textures.exists(iconKey)) {
          loadTextureImage(this.scene, iconKey, iconUrl).then((loaded) => {
            if (loaded && img.active) {
              img.setTexture(iconKey);
              img.setDisplaySize(24, 24);
            }
          });
        }

        // Tên & Cấp
        const nameTxt = this.scene.add.text(px + 38, sy + 6, (pkm.nickname || pkm.species_id).substring(0, 9), {
          fontSize: '11px',
          fontFamily: FONT.sans,
          fontStyle: 'bold',
          color: '#ffffff',
        });
        this.partyIconsContainer.add(nameTxt);

        const lvTxt = this.scene.add.text(px + pw - 12, sy + 6, `Lv.${pkm.level}`, {
          fontSize: '10px',
          fontFamily: FONT.mono,
          color: '#fdcb6e',
        }).setOrigin(1, 0);
        this.partyIconsContainer.add(lvTxt);

        // Thanh HP mini
        const maxHp = pkm.stats?.hp || 100;
        const curHp = pkm.current_hp ?? maxHp;
        const ratio = Phaser.Math.Clamp(curHp / maxHp, 0, 1);

        this.partyGraphics.fillStyle(0x2d3748, 1);
        this.partyGraphics.fillRoundedRect(px + 38, sy + 20, 96, 4, 1);
        this.partyGraphics.fillStyle(ratio > 0.5 ? 0x2ecc71 : ratio > 0.2 ? 0xf1c40f : 0xe74c3c, 1);
        this.partyGraphics.fillRoundedRect(px + 38, sy + 20, 96 * ratio, 4, 1);

        // Zone click
        const zone = this.scene.add
          .zone(px + pw / 2, sy + slotH / 2, pw - 12, slotH)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          this.selectedPokemon = pkm;
          this.selectedSource = 'party';
          this.renderAll();
        });
        this.partyIconsContainer.add(zone);
      }
    }
  }

  /** Nhãn tiêu đề danh sách đội hình (VD: "ĐỘI HÌNH (3/6)") */
  private partyTitle(): string {
    return `${t('PC_PARTY_TITLE')} (${this.partyPokemon.length}/6)`;
  }

  /** Vẽ Panel Xem trước & Nút thao tác (Cột phải) */
  private renderPreviewPanel(): void {
    this.previewGraphics.clear();
    this.previewContainer.removeAll(true);

    const rx = 448;
    const ry = 10;
    const rw = 176;
    const rh = 254;

    this.previewGraphics.fillStyle(0x181a2e, 1);
    this.previewGraphics.fillRoundedRect(rx, ry, rw, rh, 6);
    this.previewGraphics.lineStyle(1.5, 0x2e355b, 1);
    this.previewGraphics.strokeRoundedRect(rx, ry, rw, rh, 6);

    const pkm = this.selectedPokemon;
    if (!pkm) {
      const noneTxt = mkText(this.scene, 'PC_PREVIEW_NONE', {
        fontSize: '12px',
        fontFamily: FONT.sans,
        color: '#718096',
        align: 'center',
      }, rx + rw / 2, ry + rh / 2).setOrigin(0.5);
      this.previewContainer.add(noneTxt);
      return;
    }

    // Avatar preview
    const battlerKey = `pkm_front_${pkm.species_id}`;
    const battlerUrl = `/assets/battlers/front/${pkm.species_id}.png`;

    const img = this.scene.add.image(rx + rw / 2, ry + 42, battlerKey);
    img.setDisplaySize(56, 56);
    this.previewContainer.add(img);

    if (!this.scene.textures.exists(battlerKey)) {
      loadTextureImage(this.scene, battlerKey, battlerUrl).then((loaded) => {
        if (loaded && img.active) {
          img.setTexture(battlerKey);
          img.setDisplaySize(56, 56);
        }
      });
    }

    // Tên & Level
    const nameTxt = this.scene.add.text(rx + rw / 2, ry + 76, (pkm.nickname || pkm.species_id).toUpperCase(), {
      fontSize: '12px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.previewContainer.add(nameTxt);

    const lvTxt = this.scene.add.text(
      rx + rw / 2,
      ry + 92,
      `${t('PC_LEVEL_LABEL')}${pkm.level}  •  ${this.selectedSource === 'party' ? t('PC_SRC_PARTY') : t('PC_SRC_BOX')}`,
      {
        fontSize: '10px',
        fontFamily: FONT.sans,
        color: '#00cec9',
      },
    ).setOrigin(0.5);
    this.previewContainer.add(lvTxt);

    // ── Nút Thao tác ──
    const btnW = 150;
    const btnH = 26;
    const btnX = rx + 13;
    let btnY = ry + 114;

    const createActionBtn = (label: I18nKey | string, col: number, onClick: () => void) => {
      const g = this.scene.add.graphics();
      g.fillStyle(0x272b49, 1);
      g.fillRoundedRect(btnX, btnY, btnW, btnH, 4);
      g.lineStyle(1, col, 0.8);
      g.strokeRoundedRect(btnX, btnY, btnW, btnH, 4);
      this.previewContainer.add(g);

      const txt = mkText(this.scene, label, {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: `#${col.toString(16).padStart(6, '0')}`,
      }, btnX + btnW / 2, btnY + btnH / 2)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      txt.on('pointerdown', onClick);
      this.previewContainer.add(txt);
      btnY += btnH + 6;
    };

    // 1. Rút / Gửi
    if (this.selectedSource === 'box') {
      const canWithdraw = this.partyPokemon.length < 6;
      createActionBtn(
        canWithdraw ? 'PC_BTN_WITHDRAW' : 'PC_BTN_PARTY_FULL',
        canWithdraw ? 0x00cec9 : 0x718096,
        () => {
          if (canWithdraw) this.handleWithdraw(pkm);
        },
      );
    } else {
      const canDeposit = this.partyPokemon.length > 1;
      createActionBtn(
        canDeposit ? 'PC_BTN_DEPOSIT' : 'PC_BTN_KEEP_ONE',
        canDeposit ? 0xfdcb6e : 0x718096,
        () => {
          if (canDeposit) this.handleDeposit(pkm);
        },
      );
    }

    // 2. Xem chi tiết
    createActionBtn('PC_BTN_DETAIL', 0x74b9ff, () => {
      this.summaryModal?.showPokemon(pkm);
    });

    // 3. Thả
    createActionBtn('PC_BTN_RELEASE', 0xff7675, () => {
      this.handleRelease(pkm);
    });
  }

  /** Gọi API Rút Pokémon vào Party */
  private async handleWithdraw(pkm: PokemonData): Promise<void> {
    try {
      const token = localStorage.getItem('pixelmon.token');
      const res = await fetch(`${SERVER_ORIGIN}/api/pokemon/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pokemonId: pkm.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || t('PC_ERR_WITHDRAW'));
        return;
      }

      // Cập nhật state nội bộ
      this.allBoxPokemon = this.allBoxPokemon.filter((p) => p.id !== pkm.id);
      pkm.party_slot = data.partySlot ?? this.partyPokemon.length;
      this.partyPokemon.push(pkm);
      this.selectedSource = 'party';

      this.onPartyChanged?.(this.partyPokemon);
      this.renderAll();
    } catch (e) {
      console.error(e);
    }
  }

  /** Gọi API Gửi Pokémon vào PC Box */
  private async handleDeposit(pkm: PokemonData): Promise<void> {
    try {
      const token = localStorage.getItem('pixelmon.token');
      const res = await fetch(`${SERVER_ORIGIN}/api/pokemon/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pokemonId: pkm.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || t('PC_ERR_DEPOSIT'));
        return;
      }

      this.partyPokemon = this.partyPokemon.filter((p) => p.id !== pkm.id);
      pkm.party_slot = null;
      this.allBoxPokemon.push(pkm);
      this.selectedSource = 'box';

      this.onPartyChanged?.(this.partyPokemon);
      this.renderAll();
    } catch (e) {
      console.error(e);
    }
  }

  /** Gọi API Thả Pokémon */
  private async handleRelease(pkm: PokemonData): Promise<void> {
    const confirmRelease = window.confirm(
      t('PC_CONFIRM_RELEASE').replace('{name}', pkm.nickname || pkm.species_id),
    );
    if (!confirmRelease) return;

    try {
      const token = localStorage.getItem('pixelmon.token');
      const res = await fetch(`${SERVER_ORIGIN}/api/pokemon/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pokemonId: pkm.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.message || t('PC_ERR_RELEASE'));
        return;
      }

      if (this.selectedSource === 'party') {
        this.partyPokemon = this.partyPokemon.filter((p) => p.id !== pkm.id);
        this.onPartyChanged?.(this.partyPokemon);
      } else {
        this.allBoxPokemon = this.allBoxPokemon.filter((p) => p.id !== pkm.id);
      }

      this.selectedPokemon = this.partyPokemon[0] || this.allBoxPokemon[0] || null;
      this.selectedSource = this.selectedPokemon ? (this.partyPokemon.includes(this.selectedPokemon) ? 'party' : 'box') : null;
      this.renderAll();
    } catch (e) {
      console.error(e);
    }
  }
}
