import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange, type I18nKey } from '../i18n';
import { ColyseusManager } from '../network/ColyseusManager';

export interface PokemonData {
  id: string;
  species_id: string;
  nickname?: string;
  level: number;
  exp: number;
  ivs?: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  evs?: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  stats?: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  current_hp: number;
  moves?: Array<{
    id: string;
    name: string;
    pp?: number;
    currentPp?: number;
    maxPp?: number;
    type?: string;
    category?: string;
    power?: number;
    accuracy?: number;
  }>;
  status?: string | null;
  shiny?: boolean;
  caught_at?: string;
  party_slot?: number | null;
  gender?: 'male' | 'female' | 'genderless';
  nature?: { name: string; increases: string; decreases: string };
  types?: string[];
  /** Item đang cầm (Plan 45) — id, ví dụ `everstone`. */
  held_item?: string | null;
  /** Điểm happiness 0..255 (server đã trả trong `/api/pokemon` — dùng cho `/friendship` + evolve). */
  friendship?: number;
}

const MODAL_W = 500;
const MODAL_H = 370;

const TYPE_COLORS: Record<string, number> = {
  normal: 0xa8a878,
  fire: 0xf08030,
  water: 0x6890f0,
  electric: 0xf8d030,
  grass: 0x78c850,
  ice: 0x98d8d8,
  fighting: 0xc03028,
  poison: 0xa040a0,
  ground: 0xe0c068,
  flying: 0xa890f0,
  psychic: 0xf85888,
  bug: 0xa8b820,
  rock: 0xb8a038,
  ghost: 0x705898,
  dragon: 0x7038f8,
  steel: 0xb8b8d0,
  dark: 0x705848,
  fairy: 0xee99ac,
  shadow: 0x604e82,
};

type SummaryTab = 'info' | 'stats' | 'moves' | 'item';

/** Chiều rộng 1 tab (4 tab cân đối trong modal 500px, lề trái-phải 18px). */
const TAB_W = 110;
const TAB_GAP = 8;
const TAB_START_X = 8;

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
 * **PokemonSummaryModal** — Bảng hiển thị thông tin chi tiết từng Pokémon:
 * - Kế thừa từ `UiModal`: hỗ trợ kéo thả, thu nhỏ, neo, tương thích UI zoom.
 * - 3 Tab điều hướng mượt mà: Tổng quan (Info) | Chỉ số (Stats) | Chiêu thức (Moves).
 * - Nút nghe tiếng kêu `🔊 Cry` chân thực.
 */
export class PokemonSummaryModal extends UiModal {
  private pokemon: PokemonData | null = null;
  private currentTab: SummaryTab = 'info';

  private tabButtons: Phaser.GameObjects.Text[] = [];
  private tabGraphics!: Phaser.GameObjects.Graphics;
  private tabContentContainer!: Phaser.GameObjects.Container;
  private unsubLang?: () => void;

  /** Mở BagModal để đổi item (inject từ WorldScene — tab Vật phẩm). */
  public onOpenBag?: (pkm: PokemonData) => void;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    super(scene, {
      title: t('SUMMARY_TITLE'),
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
      depth: 250,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      padding: { top: 6, right: 10, bottom: 10, left: 10 },
      onClose: () => {
        onClose?.();
      },
    });

    this.tabGraphics = scene.add.graphics();
    this.contentContainer.add(this.tabGraphics);

    this.tabContentContainer = scene.add.container(0, 36);
    this.contentContainer.add(this.tabContentContainer);

    this.createTabsHeader();
    this.close(); // Mặc định ẩn, mở khi gọi showPokemon

    // Cập nhật lại tiêu đề modal + nội dung tab khi đổi ngôn ngữ
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('SUMMARY_TITLE'));
      this.renderCurrentTab();
    });
  }

  public override destroy(): void {
    this.unsubLang?.();
    super.destroy();
  }

  /** Mở modal và hiển thị dữ liệu Pokémon */
  public showPokemon(pkm: PokemonData): void {
    this.pokemon = pkm;
    const name = pkm.nickname || pkm.species_id;
    this.setTitle(t('SUMMARY_TITLE_NAMED').replace('{name}', name.toUpperCase()).replace('{level}', String(pkm.level)));
    this.currentTab = 'info';
    this.renderCurrentTab();
    this.show();
  }

  private createTabsHeader(): void {
    const tabs: Array<{ id: SummaryTab; label: I18nKey }> = [
      { id: 'info', label: 'SUMMARY_TAB_INFO' },
      { id: 'stats', label: 'SUMMARY_TAB_STATS' },
      { id: 'moves', label: 'SUMMARY_TAB_MOVES' },
      { id: 'item', label: 'SUMMARY_TAB_ITEM' },
    ];

    tabs.forEach((t, i) => {
      const tx = TAB_START_X + i * (TAB_W + TAB_GAP);
      const btn = mkText(this.scene, t.label, {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: t.id === this.currentTab ? '#00cec9' : '#8c94b8',
      }, tx + TAB_W / 2, 16)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        if (this.currentTab === t.id) return;
        this.currentTab = t.id;
        this.renderCurrentTab();
      });

      this.tabButtons.push(btn);
      this.contentContainer.add(btn);
    });
  }

  private renderCurrentTab(): void {
    // Xoá nội dung tab cũ
    this.tabContentContainer.removeAll(true);
    this.tabGraphics.clear();

    const tabs: SummaryTab[] = ['info', 'stats', 'moves', 'item'];

    // Vẽ thanh tab header
    tabs.forEach((t, i) => {
      const tx = TAB_START_X + i * (TAB_W + TAB_GAP);
      const isActive = t === this.currentTab;

      this.tabGraphics.fillStyle(isActive ? 0x2e355b : 0x1d213a, 1);
      this.tabGraphics.fillRoundedRect(tx, 4, TAB_W, 24, 4);
      this.tabGraphics.lineStyle(1.5, isActive ? 0x00cec9 : 0x2e355b, 1);
      this.tabGraphics.strokeRoundedRect(tx, 4, TAB_W, 24, 4);

      if (this.tabButtons[i]) {
        this.tabButtons[i].setColor(isActive ? '#00cec9' : '#8c94b8');
      }
    });

    if (!this.pokemon) return;

    if (this.currentTab === 'info') {
      this.renderInfoTab();
    } else if (this.currentTab === 'stats') {
      this.renderStatsTab();
    } else if (this.currentTab === 'moves') {
      this.renderMovesTab();
    } else {
      this.renderItemTab();
    }
  }

  /** TAB 1: TỔNG QUAN (INFO) */
  private renderInfoTab(): void {
    const pkm = this.pokemon!;
    const g = this.scene.add.graphics();
    this.tabContentContainer.add(g);

    // ── Khung trái: Avatar / Battler & Tiếng kêu ──
    const lx = 8;
    const ly = 10;
    const lw = 142;
    const lh = 264;

    g.fillStyle(0x191c33, 1);
    g.fillRoundedRect(lx, ly, lw, lh, 6);
    g.lineStyle(1.5, 0x2e355b, 1);
    g.strokeRoundedRect(lx, ly, lw, lh, 6);

    // Tải động ảnh Battler (hỗ trợ female và shiny)
    const folder = pkm.shiny ? 'front_shiny' : 'front';
    const isFemale = pkm.gender === 'female';
    const femaleKey = `pkm_front_${pkm.species_id}_female${pkm.shiny ? '_shiny' : ''}`;
    const femaleUrl = `${SERVER_ORIGIN}/assets/battlers/${folder}/${pkm.species_id}_female.png`;
    const defaultKey = `pkm_front_${pkm.species_id}${pkm.shiny ? '_shiny' : ''}`;
    const defaultUrl = `${SERVER_ORIGIN}/assets/battlers/${folder}/${pkm.species_id}.png`;
    const iconUrl = `${SERVER_ORIGIN}/assets/icons/pokemon/${pkm.species_id}.png`;
    const iconKey = `pkm_icon_${pkm.species_id}`;

    const centerX = lx + lw / 2;
    const initialKey = isFemale && this.scene.textures.exists(femaleKey)
      ? femaleKey
      : this.scene.textures.exists(defaultKey)
      ? defaultKey
      : this.scene.textures.exists(iconKey)
      ? iconKey
      : defaultKey;

    const spriteImg = this.scene.add.image(centerX, ly + 65, initialKey);
    spriteImg.setDisplaySize(96, 96);
    this.tabContentContainer.add(spriteImg);

    // Tiến trình nạp ảnh linh hoạt:
    // Nếu là female -> thử nạp femaleUrl trước -> nếu không có -> nạp defaultUrl -> nếu không có -> nạp iconUrl
    if (isFemale && !this.scene.textures.exists(femaleKey)) {
      loadTextureImage(this.scene, femaleKey, femaleUrl).then((ok) => {
        if (ok && spriteImg.active) {
          spriteImg.setTexture(femaleKey);
          spriteImg.setDisplaySize(96, 96);
        } else {
          loadTextureImage(this.scene, defaultKey, defaultUrl).then((defOk) => {
            if (defOk && spriteImg.active) {
              spriteImg.setTexture(defaultKey);
              spriteImg.setDisplaySize(96, 96);
            } else {
              loadTextureImage(this.scene, iconKey, iconUrl).then((iconOk) => {
                if (iconOk && spriteImg.active) {
                  spriteImg.setTexture(iconKey);
                  spriteImg.setDisplaySize(64, 64);
                }
              });
            }
          });
        }
      });
    } else if (!this.scene.textures.exists(defaultKey)) {
      loadTextureImage(this.scene, defaultKey, defaultUrl).then((ok) => {
        if (ok && spriteImg.active) {
          spriteImg.setTexture(defaultKey);
          spriteImg.setDisplaySize(96, 96);
        } else {
          loadTextureImage(this.scene, iconKey, iconUrl).then((iconOk) => {
            if (iconOk && spriteImg.active) {
              spriteImg.setTexture(iconKey);
              spriteImg.setDisplaySize(64, 64);
            }
          });
        }
      });
    }

    // Biểu tượng Giới tính & Shiny
    let tagStr = '';
    if (pkm.gender === 'female') tagStr += ' ♀';
    else if (pkm.gender === 'male') tagStr += ' ♂';
    if (pkm.shiny) tagStr += ' ⭐';

    const genderTxt = this.scene.add
      .text(centerX, ly + 130, tagStr, {
        fontSize: '13px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: pkm.gender === 'female' ? '#ff7675' : '#74b9ff',
      })
      .setOrigin(0.5);
    this.tabContentContainer.add(genderTxt);

    // Nút nghe tiếng kêu Cry
    const cryBtnBg = this.scene.add.graphics();
    cryBtnBg.fillStyle(0x272b49, 1);
    cryBtnBg.fillRoundedRect(centerX - 55, ly + 160, 110, 28, 4);
    cryBtnBg.lineStyle(1, 0x00cec9, 0.8);
    cryBtnBg.strokeRoundedRect(centerX - 55, ly + 160, 110, 28, 4);
    this.tabContentContainer.add(cryBtnBg);

    const cryTxt = mkText(this.scene, 'SUMMARY_CRY', {
      fontSize: '11px',
      fontFamily: FONT.sans,
      color: '#00cec9',
      fontStyle: 'bold',
    }, centerX, ly + 174)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    cryTxt.on('pointerdown', () => {
      const audioUrl = `${SERVER_ORIGIN}/assets/audio/cries/${encodeURIComponent(pkm.species_id)}.ogg`;
      new Audio(audioUrl).play().catch(() => {});
    });
    this.tabContentContainer.add(cryTxt);

    // ── Khung phải: Chi tiết thông số ──
    const rx = 162;
    const ry = 10;
    const rw = 310;
    const rh = 264;

    g.fillStyle(0x191c33, 1);
    g.fillRoundedRect(rx, ry, rw, rh, 6);
    g.lineStyle(1.5, 0x2e355b, 1);
    g.strokeRoundedRect(rx, ry, rw, rh, 6);

    const isShiny = Boolean(pkm.shiny);
    const baseName = (pkm.nickname || pkm.species_id).toUpperCase();
    const titleTxt = this.scene.add.text(rx + 16, ry + 14, (isShiny ? 'S. ' : '') + baseName, {
      fontSize: '15px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: isShiny ? '#f1c40f' : '#ffffff',
    });
    this.tabContentContainer.add(titleTxt);

    const lvTxt = this.scene.add.text(rx + rw - 16, ry + 16, `Lv. ${pkm.level}`, {
      fontSize: '13px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#fdcb6e',
    }).setOrigin(1, 0);
    this.tabContentContainer.add(lvTxt);

    // Badges hệ
    const types = pkm.types || ['normal'];
    types.forEach((tp, idx) => {
      const bgCol = TYPE_COLORS[tp.toLowerCase()] || 0x718096;
      const bx = rx + 16 + idx * 64;
      const by = ry + 42;
      g.fillStyle(bgCol, 1);
      g.fillRoundedRect(bx, by, 58, 20, 3);

      const typeLabel = this.scene.add
        .text(bx + 29, by + 10, tp.toUpperCase(), {
          fontSize: '10px',
          fontFamily: FONT.mono,
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      this.tabContentContainer.add(typeLabel);
    });

    // Thanh Máu (HP)
    const maxHp = pkm.stats?.hp || 100;
    const curHp = pkm.current_hp ?? maxHp;
    const hpRatio = Phaser.Math.Clamp(curHp / maxHp, 0, 1);

    const hpLabel = mkText(this.scene, 'SUMMARY_HP', {
      fontSize: '12px',
      fontFamily: FONT.mono,
      color: '#a0aec0',
    }, rx + 16, ry + 76);
    hpLabel.setText(t('SUMMARY_HP').replace('{cur}', String(curHp)).replace('{max}', String(maxHp)));
    this.tabContentContainer.add(hpLabel);

    g.fillStyle(0x2d3748, 1);
    g.fillRoundedRect(rx + 16, ry + 96, rw - 32, 8, 4);
    g.fillStyle(hpRatio > 0.5 ? 0x2ecc71 : hpRatio > 0.2 ? 0xf1c40f : 0xe74c3c, 1);
    g.fillRoundedRect(rx + 16, ry + 96, (rw - 32) * hpRatio, 8, 4);

    // Thanh Kinh nghiệm (EXP)
    const curExp = pkm.exp || 0;
    const nextExp = Math.pow(pkm.level + 1, 3);
    const prevExp = Math.pow(pkm.level, 3);
    const expRatio = Phaser.Math.Clamp((curExp - prevExp) / Math.max(1, nextExp - prevExp), 0, 1);

    const expLabel = mkText(this.scene, 'SUMMARY_EXP', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      color: '#a0aec0',
    }, rx + 16, ry + 116);
    expLabel.setText(t('SUMMARY_EXP').replace('{cur}', String(curExp)).replace('{next}', String(nextExp)));
    this.tabContentContainer.add(expLabel);

    g.fillStyle(0x2d3748, 1);
    g.fillRoundedRect(rx + 16, ry + 134, rw - 32, 6, 3);
    g.fillStyle(0x0984e3, 1);
    g.fillRoundedRect(rx + 16, ry + 134, (rw - 32) * expRatio, 6, 3);

    // Thông tin cơ bản
    const heldName = pkm.held_item
      ? pkm.held_item.toUpperCase().replace(/_/g, ' ')
      : t('SUMMARY_HOLD_EMPTY');
    const infoDetails = [
      t('SUMMARY_SPECIES').replace('{id}', pkm.species_id.toUpperCase()),
      pkm.party_slot !== null && pkm.party_slot !== undefined
        ? t('SUMMARY_LOCATION_PARTY').replace('{n}', String(pkm.party_slot + 1))
        : t('SUMMARY_LOCATION_BOX'),
      pkm.status
        ? t('SUMMARY_STATUS_VALUE').replace('{status}', pkm.status.toUpperCase())
        : t('SUMMARY_STATUS_NORMAL'),
      `${t('SUMMARY_TAB_HOLD')}: ${heldName}`,
    ];

    infoDetails.forEach((line, i) => {
      const lineTxt = this.scene.add.text(rx + 16, ry + 154 + i * 22, line, {
        fontSize: '12px',
        fontFamily: FONT.sans,
        color: i === 3 && pkm.held_item ? '#00cec9' : '#cbd5e0',
      });
      this.tabContentContainer.add(lineTxt);
    });
  }

  /** TAB 2: CHỈ SỐ CHIẾN ĐẤU (STATS) */
  private renderStatsTab(): void {
    const pkm = this.pokemon!;
    const g = this.scene.add.graphics();
    this.tabContentContainer.add(g);

    const bx = 8;
    const by = 10;
    const bw = 464;
    const bh = 264;

    g.fillStyle(0x191c33, 1);
    g.fillRoundedRect(bx, by, bw, bh, 6);
    g.lineStyle(1.5, 0x2e355b, 1);
    g.strokeRoundedRect(bx, by, bw, bh, 6);

    // Bản tính (Nature)
    const natureName = (pkm.nature?.name || 'hardy').toUpperCase();
    const incStat = pkm.nature?.increases;
    const decStat = pkm.nature?.decreases;
    const hasMod = Boolean(incStat && decStat && incStat !== decStat);
    const natureStr = hasMod
      ? t('SUMMARY_NATURE_MOD').replace('{name}', natureName).replace('{inc}', String(incStat)).replace('{dec}', String(decStat))
      : t('SUMMARY_NATURE_NEUTRAL').replace('{name}', natureName);

    const natureTxt = this.scene.add.text(bx + 16, by + 12, natureStr, {
      fontSize: '12px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#fdcb6e',
    });
    this.tabContentContainer.add(natureTxt);

    // Bảng 6 chỉ số
    const statsDef: Array<{ key: keyof NonNullable<PokemonData['stats']>; label: string; color: number }> = [
      { key: 'hp', label: 'HP', color: 0x2ecc71 },
      { key: 'attack', label: 'Attack', color: 0xe67e22 },
      { key: 'defense', label: 'Defense', color: 0xf1c40f },
      { key: 'spAttack', label: 'Sp. Atk', color: 0x3498db },
      { key: 'spDefense', label: 'Sp. Def', color: 0x9b59b6 },
      { key: 'speed', label: 'Speed', color: 0xe91e63 },
    ];

    const startY = by + 42;
    const barMaxW = 140;

    statsDef.forEach((st, idx) => {
      const sy = startY + idx * 34;
      const val = pkm.stats?.[st.key] || 50;
      const iv = pkm.ivs?.[st.key] ?? 15;
      const ev = pkm.evs?.[st.key] ?? 0;
      const ratio = Phaser.Math.Clamp(val / 200, 0.05, 1);

      // Nature modifier
      const isUp = Boolean(hasMod && incStat && (incStat === st.key || incStat.toLowerCase() === st.key.toLowerCase()));
      const isDown = Boolean(hasMod && decStat && (decStat === st.key || decStat.toLowerCase() === st.key.toLowerCase()));

      let prefix = '';
      let statColor = '#cbd5e0';
      if (isUp) {
        prefix = '+ ';
        statColor = '#2ecc71';
      } else if (isDown) {
        prefix = '- ';
        statColor = '#ff7675';
      }

      // Label chỉ số
      const lbl = this.scene.add.text(bx + 16, sy, `${prefix}${st.label}`, {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: isUp || isDown ? 'bold' : 'normal',
        color: statColor,
      });
      this.tabContentContainer.add(lbl);

      // Thanh bar tiến trình
      g.fillStyle(0x272b49, 1);
      g.fillRoundedRect(bx + 96, sy + 3, barMaxW, 10, 3);
      g.fillStyle(st.color, 1);
      g.fillRoundedRect(bx + 96, sy + 3, barMaxW * ratio, 10, 3);

      // Giá trị Stat
      const valTxt = this.scene.add.text(bx + 248, sy - 1, `${val}`, {
        fontSize: '12px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: isUp ? '#2ecc71' : isDown ? '#ff7675' : '#ffffff',
      });
      this.tabContentContainer.add(valTxt);

      // Cột IVs
      const ivTxt = this.scene.add.text(bx + 295, sy, `IV: ${iv}`, {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#a0aec0',
      });
      this.tabContentContainer.add(ivTxt);

      // Cột EVs
      const evTxt = this.scene.add.text(bx + 365, sy, `EV: ${ev}`, {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#a0aec0',
      });
      this.tabContentContainer.add(evTxt);
    });
  }

  /** TAB 3: BỘ CHIÊU THỨC (MOVES) */
  private renderMovesTab(): void {
    const pkm = this.pokemon!;
    const moves = pkm.moves || [];
    const g = this.scene.add.graphics();
    this.tabContentContainer.add(g);

    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const mx = 8 + col * 236;
      const my = 10 + row * 132;
      const mw = 228;
      const mh = 120;

      const mv = moves[i];

      g.fillStyle(mv ? 0x191c33 : 0x141629, 1);
      g.fillRoundedRect(mx, my, mw, mh, 6);
      g.lineStyle(1.5, mv ? 0x2e355b : 0x232742, 1);
      g.strokeRoundedRect(mx, my, mw, mh, 6);

      if (!mv) {
        const emptyTxt = mkText(this.scene, 'SUMMARY_EMPTY_SLOT', {
          fontSize: '12px',
          fontFamily: FONT.sans,
          color: '#4a5568',
        }, mx + mw / 2, my + mh / 2)
          .setOrigin(0.5);
        this.tabContentContainer.add(emptyTxt);
        continue;
      }

      // Tên chiêu
      const mName = this.scene.add.text(mx + 12, my + 12, mv.name.toUpperCase(), {
        fontSize: '13px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#ffffff',
      });
      this.tabContentContainer.add(mName);

      // Badge Hệ
      const tp = (mv.type || 'normal').toLowerCase();
      const colBg = TYPE_COLORS[tp] || 0x718096;
      g.fillStyle(colBg, 1);
      g.fillRoundedRect(mx + 12, my + 38, 54, 18, 3);

      const tLbl = this.scene.add
        .text(mx + 39, my + 47, tp.toUpperCase(), {
          fontSize: '10px',
          fontFamily: FONT.mono,
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      this.tabContentContainer.add(tLbl);

      // Phân loại chiêu
      const cat = mv.category || 'physical';
      const catTxt = mkText(
        this.scene,
        cat === 'physical' ? 'SUMMARY_CAT_PHYSICAL' : cat === 'special' ? 'SUMMARY_CAT_SPECIAL' : 'SUMMARY_CAT_STATUS',
        {
          fontSize: '11px',
          fontFamily: FONT.sans,
          color: '#fdcb6e',
        },
        mx + 74,
        my + 39,
      );
      this.tabContentContainer.add(catTxt);

      // Uy lực & Độ chính xác
      const pwrStr = mv.power
        ? t('SUMMARY_POWER').replace('{v}', String(mv.power))
        : t('SUMMARY_POWER_NONE');
      const accStr = mv.accuracy
        ? t('SUMMARY_ACCURACY').replace('{v}', String(mv.accuracy))
        : t('SUMMARY_ACCURACY_NONE');
      const statsDetail = mkText(this.scene, `${pwrStr}  |  ${accStr}`, {
        fontSize: '11px',
        fontFamily: FONT.sans,
        color: '#a0aec0',
      }, mx + 12, my + 66);
      this.tabContentContainer.add(statsDetail);

      // PP (xử lý không bao giờ undefined)
      const curPp = mv.currentPp ?? mv.pp ?? mv.maxPp ?? 0;
      const maxPp = mv.maxPp ?? mv.pp ?? mv.currentPp ?? 0;
      const ppTxt = mkText(this.scene, 'SUMMARY_PP', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: '#00cec9',
      }, mx + 12, my + 90);
      ppTxt.setText(t('SUMMARY_PP').replace('{cur}', String(curPp)).replace('{max}', String(maxPp)));
      this.tabContentContainer.add(ppTxt);
    }
  }

  /** TAB 4: VẬT PHẨM ĐANG CẦM (Plan 45 §6.2) — đeo/tháo item. */
  private renderItemTab(): void {
    const pkm = this.pokemon!;
    const g = this.scene.add.graphics();
    this.tabContentContainer.add(g);

    const bx = 8;
    const by = 10;
    const bw = 464;
    const bh = 264;

    g.fillStyle(0x191c33, 1);
    g.fillRoundedRect(bx, by, bw, bh, 6);
    g.lineStyle(1.5, 0x2e355b, 1);
    g.strokeRoundedRect(bx, by, bw, bh, 6);

    const held = pkm.held_item ?? null;
    const cardX = bx + 16;
    const cardW = bw - 32;

    if (!held) {
      // Card thông báo chưa có item
      const cardY = by + 24;
      const cardH = 110;

      g.fillStyle(0x14172a, 0.95);
      g.fillRoundedRect(cardX, cardY, cardW, cardH, 6);
      g.lineStyle(1, 0x2e355b, 0.9);
      g.strokeRoundedRect(cardX, cardY, cardW, cardH, 6);

      const emptyIcon = this.scene.add.text(cardX + cardW / 2, cardY + 34, '🎒', {
        fontSize: '26px',
      }).setOrigin(0.5);
      this.tabContentContainer.add(emptyIcon);

      const txt = mkText(this.scene, 'SUMMARY_HELD_NONE', {
        fontSize: '12px',
        fontFamily: FONT.sans,
        color: '#8c94b8',
        align: 'center',
        lineSpacing: 4,
      }, cardX + cardW / 2, cardY + 74).setOrigin(0.5);
      this.tabContentContainer.add(txt);

      // Nút mở túi đồ (toàn chiều rộng card)
      const btnY = cardY + cardH + 20;
      const btnH = 34;

      const openBagBg = this.scene.add.graphics();
      openBagBg.fillStyle(0x272b49, 1);
      openBagBg.fillRoundedRect(cardX, btnY, cardW, btnH, 4);
      openBagBg.lineStyle(1.5, 0x00cec9, 0.9);
      openBagBg.strokeRoundedRect(cardX, btnY, cardW, btnH, 4);
      this.tabContentContainer.add(openBagBg);

      const openBagTxt = mkText(this.scene, 'SUMMARY_OPEN_BAG', {
        fontSize: '12px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#00cec9',
      }, cardX + cardW / 2, btnY + btnH / 2).setOrigin(0.5);
      openBagTxt.setInteractive({ useHandCursor: true });
      openBagTxt.on('pointerdown', () => this.onOpenBag?.(pkm));
      this.tabContentContainer.add(openBagTxt);
    } else {
      // Khung thẻ item đang cầm
      const cardY = by + 18;
      const cardH = 114;

      g.fillStyle(0x14172a, 0.95);
      g.fillRoundedRect(cardX, cardY, cardW, cardH, 6);
      g.lineStyle(1.5, 0x00cec9, 0.7);
      g.strokeRoundedRect(cardX, cardY, cardW, cardH, 6);

      // Icon item box
      const iconBoxX = cardX + 16;
      const iconBoxY = cardY + 18;
      const iconBoxSize = 78;

      g.fillStyle(0x272b49, 1);
      g.fillRoundedRect(iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 4);
      g.lineStyle(1, 0x3d446b, 1);
      g.strokeRoundedRect(iconBoxX, iconBoxY, iconBoxSize, iconBoxSize, 4);

      const iconKey = `item_icon_${held}`;
      const iconUrl = `${SERVER_ORIGIN}/assets/icons/items/${held}.png`;
      const iconImg = this.scene.add.image(iconBoxX + iconBoxSize / 2, iconBoxY + iconBoxSize / 2, `__MISSING:${held}`);
      iconImg.setDisplaySize(48, 48);
      this.tabContentContainer.add(iconImg);

      if (this.scene.textures.exists(iconKey)) {
        iconImg.setTexture(iconKey);
        iconImg.setDisplaySize(48, 48);
      } else {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => {
          if (!this.scene.textures.exists(iconKey)) this.scene.textures.addImage(iconKey, el);
          if (iconImg.active) {
            iconImg.setTexture(iconKey);
            iconImg.setDisplaySize(48, 48);
          }
        };
        el.src = iconUrl;
      }

      // Thông tin chi tiết item
      const textX = cardX + 108;
      const nameTxt = this.scene.add.text(textX, cardY + 24, held.toUpperCase().replace(/_/g, ' '), {
        fontSize: '14px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#fdcb6e',
      });
      this.tabContentContainer.add(nameTxt);

      const hintTxt = mkText(this.scene, 'SUMMARY_HELD_HINT', {
        fontSize: '11px',
        fontFamily: FONT.sans,
        color: '#a0aec0',
      }, textX, cardY + 50);
      this.tabContentContainer.add(hintTxt);

      const tagTxt = this.scene.add.text(textX, cardY + 74, `ID: ${held}`, {
        fontSize: '10px',
        fontFamily: FONT.mono,
        color: '#718096',
      });
      this.tabContentContainer.add(tagTxt);

      // 2 Nút hành động: THÁO ITEM & MỞ TÚI ĐỒ (chia đôi hàng ngang cân xứng)
      const btnY = cardY + cardH + 18;
      const btnH = 34;
      const gap = 12;
      const btnW = (cardW - gap) / 2;

      // Nút 1: THÁO ITEM
      const unholdX = cardX;
      const unholdBtnBg = this.scene.add.graphics();
      unholdBtnBg.fillStyle(0x272b49, 1);
      unholdBtnBg.fillRoundedRect(unholdX, btnY, btnW, btnH, 4);
      unholdBtnBg.lineStyle(1.5, 0xff7675, 0.9);
      unholdBtnBg.strokeRoundedRect(unholdX, btnY, btnW, btnH, 4);
      this.tabContentContainer.add(unholdBtnBg);

      const unholdTxt = mkText(this.scene, 'SUMMARY_UNHOLD', {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#ff7675',
      }, unholdX + btnW / 2, btnY + btnH / 2)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      unholdTxt.on('pointerdown', () => {
        ColyseusManager.getInstance().sendHoldItem(pkm.id, null);
        this.close();
      });
      this.tabContentContainer.add(unholdTxt);

      // Nút 2: MỞ TÚI ĐỒ ĐỔI ITEM
      const openBagX = cardX + btnW + gap;
      const openBagBg = this.scene.add.graphics();
      openBagBg.fillStyle(0x272b49, 1);
      openBagBg.fillRoundedRect(openBagX, btnY, btnW, btnH, 4);
      openBagBg.lineStyle(1.5, 0x00cec9, 0.9);
      openBagBg.strokeRoundedRect(openBagX, btnY, btnW, btnH, 4);
      this.tabContentContainer.add(openBagBg);

      const openBagTxt = mkText(this.scene, 'SUMMARY_OPEN_BAG', {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#00cec9',
      }, openBagX + btnW / 2, btnY + btnH / 2).setOrigin(0.5);
      openBagTxt.setInteractive({ useHandCursor: true });
      openBagTxt.on('pointerdown', () => this.onOpenBag?.(pkm));
      this.tabContentContainer.add(openBagTxt);
    }
  }
}
