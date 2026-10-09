import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, onLangChange } from '../i18n';
import { ColyseusManager } from '../network/ColyseusManager';
import { SoundManager } from '../audio/SoundManager';
import rawSpeciesData from '@pixelmon/shared/data/species.json';

export interface PokedexSpecies {
  id: string;
  dexNum: number;
  name: string;
  category: string;
  types: string[];
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
  baseStatTotal?: number;
  height?: number;
  weight?: number;
  description?: string;
  evolutions?: Array<{
    to: string;
    method: string;
    level?: number;
    item?: string;
  }>;
  abilities?: string[];
  habitat?: string;
  color?: string;
  iconUrl?: string;
  spriteUrl?: string;
}

const MODAL_W = 720;
const MODAL_H = 520;

export const TYPE_COLORS: Record<string, number> = {
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

const ALL_TYPES = [
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'steel',
  'dark',
  'fairy',
] as const;

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
 * **PokedexModal** — Bách khoa toàn thư Pokédex toàn diện (720x520 px):
 * - Kế thừa từ `UiModal`: hỗ trợ kéo thả, thu nhỏ, neo, đồng bộ giao diện retro-modern.
 * - Header với đèn sensor cyan phát sáng, thống kê Đã gặp / Đã bắt / Tổng số loài (898).
 * - Bộ lọc 3 Tab (Tất cả / Đã gặp / Đã bắt), tìm kiếm theo tên hoặc #Dex, lọc theo 18 Hệ.
 * - Cột trái (~280px) cuộn danh sách loài kèm icon trạng thái và badges hệ.
 * - Cột phải (~418px) hiển thị chi tiết: Sprite to nét, tên, danh hiệu, thông số thể chất, mô tả,
 *   thanh Base Stats đầy màu sắc, Cây tiến hoá tương tác, nút nghe Cry qua SoundManager.
 */
export class PokedexModal extends UiModal {
  private allSpecies: PokedexSpecies[] = [];
  private seenSet: Set<string> = new Set();
  private caughtSet: Set<string> = new Set();
  private totalSpeciesCount = 898;

  // Evolution lookup maps
  private evoMap: Map<string, Array<{ to: string; method: string; level?: number; item?: string }>> = new Map();
  private parentMap: Map<string, { from: string; method: string; level?: number; item?: string }> = new Map();

  // State
  private tabFilter: 'all' | 'seen' | 'caught' = 'all';
  private typeFilter: string = 'all';
  private searchQuery: string = '';
  private selectedSpecies: PokedexSpecies | null = null;
  private scrollIndex: number = 0;
  private readonly visibleItemCount = 10;
  private readonly itemHeight = 39;

  // Search input & Dropdown
  private searchInputEl: HTMLInputElement | null = null;
  private searchFocused = false;
  private searchBoxBounds = { x: 12, y: 38, w: 154, h: 26 };
  private searchBoxGfx?: Phaser.GameObjects.Graphics;
  private typeDropdownOpen = false;
  private dropdownContainer?: Phaser.GameObjects.Container;

  // Container layers
  private mainGfx!: Phaser.GameObjects.Graphics;
  private headerContainer!: Phaser.GameObjects.Container;
  private listContainer!: Phaser.GameObjects.Container;
  private detailContainer!: Phaser.GameObjects.Container;
  private overlayContainer!: Phaser.GameObjects.Container;

  private unsubLang?: () => void;
  private wheelListenerBound = false;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    super(scene, {
      title: t('POKEDEX_TITLE'),
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 34,
      draggable: true,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      overlay: false,
      lockUi: false,
      depth: 180,
      onClose: () => {
        this.hideSearchInput();
        this.typeDropdownOpen = false;
        onClose?.();
      },
      onMinimize: (min) => {
        if (min) {
          this.hideSearchInput();
          this.typeDropdownOpen = false;
        } else {
          this.positionSearchInput();
        }
      },
    });

    this.initSpeciesData();
    this.createLayoutContainers();

    this.unsubLang = onLangChange(() => {
      this.setTitle(t('POKEDEX_TITLE'));
      this.render();
    });

    this.preloadUiIcons();

    // Mặc định ẩn — nếu không, `open` giữ `true` từ UiModal constructor
    // và isOpen() luôn trả true dù chưa hề mở → khoá di chuyển từ lúc vào game.
    this.close();
  }

  private initSpeciesData(): void {
    const raw = (rawSpeciesData as unknown as PokedexSpecies[]) || [];
    this.allSpecies = [...raw].sort((a, b) => a.dexNum - b.dexNum);
    this.totalSpeciesCount = this.allSpecies.length || 898;

    this.evoMap.clear();
    this.parentMap.clear();
    for (const sp of this.allSpecies) {
      if (sp.evolutions && sp.evolutions.length > 0) {
        this.evoMap.set(sp.id, sp.evolutions);
        for (const evo of sp.evolutions) {
          if (!this.parentMap.has(evo.to)) {
            this.parentMap.set(evo.to, { from: sp.id, ...evo });
          }
        }
      }
    }

    if (this.allSpecies.length > 0) {
      this.selectedSpecies = this.allSpecies[0];
    }
  }

  private preloadUiIcons(): void {
    const icons = [
      { key: 'pokedex_icon_own', url: `${SERVER_ORIGIN}/assets/ui/pokedex/icon_own.png` },
      { key: 'pokedex_icon_seen', url: `${SERVER_ORIGIN}/assets/ui/pokedex/icon_seen.png` },
      { key: 'pokedex_icon_hw', url: `${SERVER_ORIGIN}/assets/ui/pokedex/icon_hw.png` },
    ];
    for (const ic of icons) {
      void loadTextureImage(this.scene, ic.key, ic.url);
    }
  }

  private createLayoutContainers(): void {
    this.mainGfx = this.scene.add.graphics();
    this.headerContainer = this.scene.add.container(0, 0);
    this.listContainer = this.scene.add.container(0, 0);
    this.detailContainer = this.scene.add.container(0, 0);
    this.overlayContainer = this.scene.add.container(0, 0);

    this.contentContainer.add([
      this.mainGfx,
      this.headerContainer,
      this.listContainer,
      this.detailContainer,
      this.overlayContainer,
    ]);

    this.setupWheelListener();
  }

  private setupWheelListener(): void {
    if (this.wheelListenerBound) return;
    this.wheelListenerBound = true;

    this.scene.input.on('wheel', (pointer: Phaser.Input.Pointer, _gameObjects: any, _deltaX: number, deltaY: number) => {
      if (!this.isOpen() || this.isMinimized) return;

      const { scale } = this.getScaleAndBounds();
      const rect = this.scene.scale.canvas.getBoundingClientRect();
      const scaleX = rect.width / this.scene.scale.width;
      const scaleY = rect.height / this.scene.scale.height;

      const localX = (pointer.x - rect.left) / scaleX - this.currentX;
      const localY = (pointer.y - rect.top) / scaleY - this.currentY;

      if (localX >= 10 && localX <= 290 && localY >= 68 && localY <= 480) {
        const filtered = this.getFilteredSpecies();
        const maxScroll = Math.max(0, filtered.length - this.visibleItemCount);
        const step = deltaY > 0 ? 2 : -2;
        const newIndex = Phaser.Math.Clamp(this.scrollIndex + step, 0, maxScroll);
        if (newIndex !== this.scrollIndex) {
          this.scrollIndex = newIndex;
          this.renderList();
        }
      }
    });
  }

  public override show(): this {
    super.show();
    SoundManager.getInstance(this.scene).playSe('gui_pokedex_open');
    void this.refresh();
    return this;
  }

  public openModal(): void {
    this.show();
  }

  public override close(): this {
    this.hideSearchInput();
    this.typeDropdownOpen = false;
    super.close();
    return this;
  }

  public async refresh(): Promise<void> {
    try {
      const progress = await ColyseusManager.getInstance().fetchPokedexProgress();
      this.seenSet = new Set((progress.seen || []).map((s) => s.toLowerCase().trim()));
      this.caughtSet = new Set((progress.caught || []).map((s) => s.toLowerCase().trim()));
      this.totalSpeciesCount = progress.totalSpecies || this.allSpecies.length || 898;
    } catch {
      // Fallback
    }

    if (!this.selectedSpecies && this.allSpecies.length > 0) {
      this.selectedSpecies = this.allSpecies[0];
    }

    this.render();
  }

  protected override onDragEnd(): void {
    if (this.isOpen() && !this.isMinimized) {
      this.positionSearchInput();
    }
  }

  public override destroy(): void {
    this.unsubLang?.();
    if (this.searchInputEl && this.searchInputEl.parentNode) {
      this.searchInputEl.parentNode.removeChild(this.searchInputEl);
      this.searchInputEl = null;
    }
    super.destroy();
  }

  private getFilteredSpecies(): PokedexSpecies[] {
    let list = this.allSpecies;

    if (this.tabFilter === 'seen') {
      list = list.filter((s) => this.seenSet.has(s.id.toLowerCase()) || this.caughtSet.has(s.id.toLowerCase()));
    } else if (this.tabFilter === 'caught') {
      list = list.filter((s) => this.caughtSet.has(s.id.toLowerCase()));
    }

    if (this.typeFilter !== 'all') {
      const tf = this.typeFilter.toLowerCase();
      list = list.filter((s) => s.types.some((t) => t.toLowerCase() === tf));
    }

    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const nameMatch = s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
        const numMatch =
          String(s.dexNum).includes(q) ||
          `#${String(s.dexNum).padStart(3, '0')}`.includes(q) ||
          `#${s.dexNum}`.includes(q);
        return nameMatch || numMatch;
      });
    }

    return list;
  }

  private render(): void {
    this.mainGfx.clear();
    this.headerContainer.removeAll(true);
    this.listContainer.removeAll(true);
    this.detailContainer.removeAll(true);
    this.overlayContainer.removeAll(true);

    if (this.dropdownContainer) {
      this.dropdownContainer.destroy();
      this.dropdownContainer = undefined;
    }

    this.renderHeaderAndFilters();
    this.renderList();
    this.renderDetail();

    if (this.typeDropdownOpen) {
      this.renderTypeDropdownMenu();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. HEADER & BỘ LỌC
  // ══════════════════════════════════════════════════════════════════════════

  private renderHeaderAndFilters(): void {
    const g = this.mainGfx;

    g.lineStyle(1, 0x222a45, 1);
    g.lineBetween(12, 34, MODAL_W - 12, 34);

    // Đèn sensor Cyan Pokédex
    g.fillStyle(0x00cec9, 0.35);
    g.fillCircle(20, 17, 10);
    g.fillStyle(0x00cec9, 1);
    g.fillCircle(20, 17, 7);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(18, 15, 2.5);

    // Thống kê Đã gặp / Đã bắt
    const seenCount = this.seenSet.size;
    const caughtCount = this.caughtSet.size;

    const statsTxt = this.scene.add.text(
      36,
      17,
      `${t('POKEDEX_SEEN_LBL')}: ${seenCount}   |   ${t('POKEDEX_CAUGHT_LBL')}: ${caughtCount} / ${this.totalSpeciesCount}`,
      {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#cbd5e1',
      },
    ).setOrigin(0, 0.5);
    this.headerContainer.add(statsTxt);

    // 3 Tab Lọc (Tất cả / Đã gặp / Đã bắt)
    const tabs: Array<{ id: 'all' | 'seen' | 'caught'; label: string; count?: number }> = [
      { id: 'all', label: t('POKEDEX_TAB_ALL'), count: this.totalSpeciesCount },
      { id: 'seen', label: t('POKEDEX_TAB_SEEN'), count: seenCount },
      { id: 'caught', label: t('POKEDEX_TAB_CAUGHT'), count: caughtCount },
    ];

    const tabStartX = 412;
    const tabW = 94;
    const tabH = 22;
    const tabGap = 6;

    tabs.forEach((tb, i) => {
      const tx = tabStartX + i * (tabW + tabGap);
      const ty = 6;
      const isSelected = this.tabFilter === tb.id;

      const tabGfx = this.scene.add.graphics();
      const drawTab = (hover = false) => {
        tabGfx.clear();
        tabGfx.fillStyle(isSelected ? 0x0984e3 : hover ? 0x1f294e : 0x14182b, 1);
        tabGfx.fillRoundedRect(tx, ty, tabW, tabH, 4);
        tabGfx.lineStyle(1, isSelected ? 0x00cec9 : hover ? 0x485580 : 0x272d47, 1);
        tabGfx.strokeRoundedRect(tx, ty, tabW, tabH, 4);
      };
      drawTab(false);
      this.headerContainer.add(tabGfx);

      const tabText = this.scene.add.text(
        tx + tabW / 2,
        ty + tabH / 2,
        `${tb.label} (${tb.count})`,
        {
          fontSize: '10px',
          fontFamily: FONT.sans,
          fontStyle: isSelected ? 'bold' : 'normal',
          color: isSelected ? '#ffffff' : '#94a3b8',
        },
      ).setOrigin(0.5);
      this.headerContainer.add(tabText);

      const zone = this.scene.add.zone(tx + tabW / 2, ty + tabH / 2, tabW, tabH).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => drawTab(true));
      zone.on('pointerout', () => drawTab(false));
      zone.on('pointerdown', () => {
        if (this.tabFilter !== tb.id) {
          SoundManager.getInstance(this.scene).playSe('gui_sel_cursor');
          this.tabFilter = tb.id;
          this.scrollIndex = 0;
          this.render();
        }
      });
      this.headerContainer.add(zone);
    });

    // Ô Tìm kiếm (Search Bar) bên trái cột danh sách
    const searchX = 12;
    const searchY = 38;
    const searchW = 154;
    const searchH = 26;
    this.searchBoxBounds = { x: searchX, y: searchY, w: searchW, h: searchH };

    const searchGfx = this.scene.add.graphics();
    searchGfx.fillStyle(0x111628, 0.95);
    searchGfx.fillRoundedRect(searchX, searchY, searchW, searchH, 4);
    searchGfx.lineStyle(1.5, this.searchFocused ? 0x00cec9 : 0x2a3350, 1);
    searchGfx.strokeRoundedRect(searchX, searchY, searchW, searchH, 4);
    this.headerContainer.add(searchGfx);
    this.searchBoxGfx = searchGfx;

    const searchIcon = this.scene.add.text(searchX + 7, searchY + searchH / 2, '🔍', { fontSize: '10px' }).setOrigin(0, 0.5);
    this.headerContainer.add(searchIcon);

    if (this.searchQuery.trim()) {
      const clearBtn = this.scene.add.text(searchX + searchW - 8, searchY + searchH / 2, '✕', {
        fontSize: '10px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#94a3b8',
      }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

      clearBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        this.searchQuery = '';
        if (this.searchInputEl) this.searchInputEl.value = '';
        this.scrollIndex = 0;
        this.render();
      });
      this.headerContainer.add(clearBtn);
    }

    this.positionSearchInput();

    // Nút Dropdown Lọc theo Hệ (Type Filter Button)
    const typeBtnX = 172;
    const typeBtnY = 38;
    const typeBtnW = 108;
    const typeBtnH = 26;

    const typeGfx = this.scene.add.graphics();
    const curTypeColor = this.typeFilter === 'all' ? 0x222a45 : TYPE_COLORS[this.typeFilter] ?? 0x222a45;
    const drawTypeBtn = (hover = false) => {
      typeGfx.clear();
      typeGfx.fillStyle(this.typeDropdownOpen ? 0x1f294e : hover ? 0x1b2342 : 0x13172a, 1);
      typeGfx.fillRoundedRect(typeBtnX, typeBtnY, typeBtnW, typeBtnH, 4);
      typeGfx.lineStyle(1.5, this.typeDropdownOpen ? 0x00cec9 : hover ? 0x485580 : 0x2a3350, 1);
      typeGfx.strokeRoundedRect(typeBtnX, typeBtnY, typeBtnW, typeBtnH, 4);

      if (this.typeFilter !== 'all') {
        typeGfx.fillStyle(curTypeColor, 1);
        typeGfx.fillCircle(typeBtnX + 11, typeBtnY + typeBtnH / 2, 4.5);
      }
    };
    drawTypeBtn(false);
    this.headerContainer.add(typeGfx);

    const typeLabel = this.typeFilter === 'all' ? t('POKEDEX_TYPE_ALL') : this.typeFilter.toUpperCase();
    const typeText = this.scene.add.text(
      this.typeFilter === 'all' ? typeBtnX + 9 : typeBtnX + 20,
      typeBtnY + typeBtnH / 2,
      typeLabel,
      {
        fontSize: '10px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: this.typeFilter === 'all' ? '#cbd5e1' : '#ffffff',
      },
    ).setOrigin(0, 0.5);
    this.headerContainer.add(typeText);

    const typeArrow = this.scene.add.text(
      typeBtnX + typeBtnW - 9,
      typeBtnY + typeBtnH / 2,
      this.typeDropdownOpen ? '▲' : '▼',
      { fontSize: '8px', color: '#94a3b8' },
    ).setOrigin(1, 0.5);
    this.headerContainer.add(typeArrow);

    const typeZone = this.scene.add.zone(typeBtnX + typeBtnW / 2, typeBtnY + typeBtnH / 2, typeBtnW, typeBtnH).setInteractive({ useHandCursor: true });
    typeZone.on('pointerover', () => drawTypeBtn(true));
    typeZone.on('pointerout', () => drawTypeBtn(false));
    typeZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event?.stopPropagation();
      SoundManager.getInstance(this.scene).playSe('gui_sel_cursor');
      this.typeDropdownOpen = !this.typeDropdownOpen;
      this.render();
    });
    this.headerContainer.add(typeZone);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. DANH SÁCH LOÀI (CỘT TRÁI ~280px)
  // ══════════════════════════════════════════════════════════════════════════

  private renderList(): void {
    this.listContainer.removeAll(true);

    const filtered = this.getFilteredSpecies();
    const listX = 12;
    const listY = 70;
    const listW = 268;
    const listH = 404;

    const bgGfx = this.scene.add.graphics();
    bgGfx.fillStyle(0x0e1222, 0.95);
    bgGfx.fillRoundedRect(listX, listY, listW, listH, 6);
    bgGfx.lineStyle(1.5, 0x222a45, 1);
    bgGfx.strokeRoundedRect(listX, listY, listW, listH, 6);
    this.listContainer.add(bgGfx);

    if (filtered.length === 0) {
      const emptyTxt = this.scene.add.text(
        listX + listW / 2,
        listY + listH / 2,
        'Không tìm thấy Pokémon nào',
        {
          fontSize: '11px',
          fontFamily: FONT.sans,
          color: '#64748b',
        },
      ).setOrigin(0.5);
      this.listContainer.add(emptyTxt);
      return;
    }

    const itemW = listW - 14;
    const maxScroll = Math.max(0, filtered.length - this.visibleItemCount);
    this.scrollIndex = Phaser.Math.Clamp(this.scrollIndex, 0, maxScroll);

    const slice = filtered.slice(this.scrollIndex, this.scrollIndex + this.visibleItemCount);

    slice.forEach((sp, idx) => {
      const iy = listY + 5 + idx * this.itemHeight;
      const isSelected = this.selectedSpecies?.id === sp.id;
      const isCaught = this.caughtSet.has(sp.id.toLowerCase());
      const isSeen = isCaught || this.seenSet.has(sp.id.toLowerCase());

      const itemGfx = this.scene.add.graphics();
      const drawItem = (hover = false) => {
        itemGfx.clear();
        if (isSelected) {
          itemGfx.fillStyle(0x1e2a52, 1);
          itemGfx.fillRoundedRect(listX + 4, iy, itemW, this.itemHeight - 3, 4);
          itemGfx.lineStyle(1.5, 0x00cec9, 1);
          itemGfx.strokeRoundedRect(listX + 4, iy, itemW, this.itemHeight - 3, 4);
        } else if (hover) {
          itemGfx.fillStyle(0x171f3b, 0.9);
          itemGfx.fillRoundedRect(listX + 4, iy, itemW, this.itemHeight - 3, 4);
          itemGfx.lineStyle(1, 0x3d4a75, 1);
          itemGfx.strokeRoundedRect(listX + 4, iy, itemW, this.itemHeight - 3, 4);
        } else {
          itemGfx.fillStyle(0x12172a, 0.75);
          itemGfx.fillRoundedRect(listX + 4, iy, itemW, this.itemHeight - 3, 4);
          itemGfx.lineStyle(1, 0x1e2540, 0.8);
          itemGfx.strokeRoundedRect(listX + 4, iy, itemW, this.itemHeight - 3, 4);
        }
      };
      drawItem(false);
      this.listContainer.add(itemGfx);

      // Icon trạng thái
      const iconX = listX + 16;
      const iconY = iy + (this.itemHeight - 3) / 2;

      if (isCaught) {
        if (this.scene.textures.exists('pokedex_icon_own')) {
          const ic = this.scene.add.image(iconX, iconY, 'pokedex_icon_own').setDisplaySize(16, 16);
          this.listContainer.add(ic);
        } else {
          const ballGfx = this.scene.add.graphics();
          ballGfx.fillStyle(0xe74c3c, 1);
          ballGfx.fillCircle(iconX, iconY, 6);
          ballGfx.fillStyle(0xffffff, 1);
          ballGfx.fillRect(iconX - 6, iconY, 12, 6);
          ballGfx.fillStyle(0x2d3436, 1);
          ballGfx.fillRect(iconX - 6, iconY - 1, 12, 2);
          ballGfx.fillCircle(iconX, iconY, 2.5);
          ballGfx.fillStyle(0xffffff, 1);
          ballGfx.fillCircle(iconX, iconY, 1.2);
          this.listContainer.add(ballGfx);
        }
      } else if (isSeen) {
        if (this.scene.textures.exists('pokedex_icon_seen')) {
          const ic = this.scene.add.image(iconX, iconY, 'pokedex_icon_seen').setDisplaySize(16, 16);
          this.listContainer.add(ic);
        } else {
          const eyeTxt = this.scene.add.text(iconX, iconY, '👁', { fontSize: '11px' }).setOrigin(0.5);
          this.listContainer.add(eyeTxt);
        }
      } else {
        const unseenTxt = this.scene.add.text(iconX, iconY, '—', { fontSize: '12px', color: '#475569' }).setOrigin(0.5);
        this.listContainer.add(unseenTxt);
      }

      // Số thứ tự Pokédex
      const dexStr = `#${String(sp.dexNum).padStart(3, '0')}`;
      const dexTxt = this.scene.add.text(listX + 30, iconY, dexStr, {
        fontSize: '10px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: isSelected ? '#00cec9' : '#64748b',
      }).setOrigin(0, 0.5);
      this.listContainer.add(dexTxt);

      // Tên loài
      const displayName = isSeen ? sp.name : '???';
      const nameTxt = this.scene.add.text(listX + 70, iconY, displayName, {
        fontSize: '11.5px',
        fontFamily: FONT.sans,
        fontStyle: isSelected ? 'bold' : 'normal',
        color: isSeen ? (isSelected ? '#ffffff' : '#e2e8f0') : '#64748b',
      }).setOrigin(0, 0.5);
      this.listContainer.add(nameTxt);

      // Badges hệ
      if (isSeen && sp.types && sp.types.length > 0) {
        let badgeX = listX + itemW - 4;
        for (let tIdx = sp.types.length - 1; tIdx >= 0; tIdx--) {
          const tp = sp.types[tIdx].toLowerCase();
          const col = TYPE_COLORS[tp] ?? 0x777777;
          const label = tp.slice(0, 3).toUpperCase();

          const bText = this.scene.add.text(badgeX - 16, iconY, label, {
            fontSize: '8.5px',
            fontFamily: FONT.mono,
            fontStyle: 'bold',
            color: '#ffffff',
          }).setOrigin(0.5);

          const bW = Math.max(28, bText.width + 6);
          bText.setX(badgeX - bW / 2);

          const bGfx = this.scene.add.graphics();
          bGfx.fillStyle(col, 0.95);
          bGfx.fillRoundedRect(badgeX - bW, iconY - 8, bW, 16, 3);

          this.listContainer.add([bGfx, bText]);
          badgeX -= bW + 4;
        }
      }

      const itemZone = this.scene.add
        .zone(listX + 4 + itemW / 2, iy + (this.itemHeight - 3) / 2, itemW, this.itemHeight - 3)
        .setInteractive({ useHandCursor: true });
      itemZone.on('pointerover', () => drawItem(true));
      itemZone.on('pointerout', () => drawItem(false));
      itemZone.on('pointerdown', () => {
        SoundManager.getInstance(this.scene).playSe('gui_sel_cursor');
        this.selectedSpecies = sp;
        this.renderList();
        this.renderDetail();
      });
      this.listContainer.add(itemZone);
    });

    // Thanh cuộn Scrollbar
    if (filtered.length > this.visibleItemCount) {
      const scrollBarX = listX + listW - 9;
      const scrollBarY = listY + 8;
      const scrollBarH = listH - 16;

      const trackGfx = this.scene.add.graphics();
      trackGfx.fillStyle(0x14182b, 1);
      trackGfx.fillRoundedRect(scrollBarX, scrollBarY, 5, scrollBarH, 2.5);

      const thumbRatio = this.visibleItemCount / filtered.length;
      const thumbH = Math.max(22, scrollBarH * thumbRatio);
      const scrollRatio = this.scrollIndex / maxScroll;
      const thumbY = scrollBarY + (scrollBarH - thumbH) * scrollRatio;

      trackGfx.fillStyle(0x384570, 1);
      trackGfx.fillRoundedRect(scrollBarX, thumbY, 5, thumbH, 2.5);
      this.listContainer.add(trackGfx);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. KHUNG CHI TIẾT LOÀI (CỘT PHẢI ~418px)
  // ══════════════════════════════════════════════════════════════════════════

  private renderDetail(): void {
    this.detailContainer.removeAll(true);

    const detX = 288;
    const detY = 38;
    const detW = 420;
    const detH = 436;

    const bgGfx = this.scene.add.graphics();
    bgGfx.fillStyle(0x101528, 0.95);
    bgGfx.fillRoundedRect(detX, detY, detW, detH, 6);
    bgGfx.lineStyle(1.5, 0x222a45, 1);
    bgGfx.strokeRoundedRect(detX, detY, detW, detH, 6);

    bgGfx.lineStyle(2, 0x00cec9, 0.6);
    bgGfx.lineBetween(detX + 4, detY + 4, detX + 24, detY + 4);
    bgGfx.lineBetween(detX + 4, detY + 4, detX + 4, detY + 24);
    bgGfx.lineBetween(detX + detW - 24, detY + detH - 4, detX + detW - 4, detY + detH - 4);
    bgGfx.lineBetween(detX + detW - 4, detY + detH - 24, detX + detW - 4, detY + detH - 4);
    this.detailContainer.add(bgGfx);

    const sp = this.selectedSpecies;
    if (!sp) {
      const hint = this.scene.add.text(detX + detW / 2, detY + detH / 2, 'Chọn một Pokémon từ danh sách để xem chi tiết', {
        fontSize: '12px',
        fontFamily: FONT.sans,
        color: '#64748b',
      }).setOrigin(0.5);
      this.detailContainer.add(hint);
      return;
    }

    const isCaught = this.caughtSet.has(sp.id.toLowerCase());
    const isSeen = isCaught || this.seenSet.has(sp.id.toLowerCase());

    if (!isSeen) {
      this.renderUnseenDetail(detX, detY, detW, detH, sp);
      return;
    }

    // Bệ đỡ và Sprite Pokémon
    const spriteBoxX = detX + 14;
    const spriteBoxY = detY + 14;
    const spriteBoxW = 124;
    const spriteBoxH = 124;

    const spPedestal = this.scene.add.graphics();
    spPedestal.fillStyle(0x171f3a, 1);
    spPedestal.fillRoundedRect(spriteBoxX, spriteBoxY, spriteBoxW, spriteBoxH, 6);
    spPedestal.lineStyle(1.5, 0x28345c, 1);
    spPedestal.strokeRoundedRect(spriteBoxX, spriteBoxY, spriteBoxW, spriteBoxH, 6);

    spPedestal.fillStyle(0x00cec9, 0.08);
    spPedestal.fillCircle(spriteBoxX + spriteBoxW / 2, spriteBoxY + spriteBoxH / 2 + 10, 48);
    this.detailContainer.add(spPedestal);

    const spriteKey = `pokedex_sprite_${sp.id}`;
    const spriteUrl = sp.spriteUrl
      ? (sp.spriteUrl.startsWith('http') ? sp.spriteUrl : `${SERVER_ORIGIN}${sp.spriteUrl}`)
      : `${SERVER_ORIGIN}/assets/battlers/front/${sp.id}.png`;

    const spriteObj = this.scene.add.image(spriteBoxX + spriteBoxW / 2, spriteBoxY + spriteBoxH / 2 + 2, '').setVisible(false);
    this.detailContainer.add(spriteObj);

    if (this.scene.textures.exists(spriteKey)) {
      spriteObj.setTexture(spriteKey);
      spriteObj.setDisplaySize(96, 96).setVisible(true);
    } else {
      loadTextureImage(this.scene, spriteKey, spriteUrl).then((ok) => {
        if (ok && this.scene && this.isOpen() && this.selectedSpecies?.id === sp.id) {
          spriteObj.setTexture(spriteKey);
          spriteObj.setDisplaySize(96, 96).setVisible(true);
        }
      });
    }

    // Nút nghe tiếng kêu (Cry Sound Button)
    const cryBtnX = spriteBoxX;
    const cryBtnY = spriteBoxY + spriteBoxH + 8;
    const cryBtnW = spriteBoxW;
    const cryBtnH = 24;

    const cryGfx = this.scene.add.graphics();
    const drawCryBtn = (hover = false) => {
      cryGfx.clear();
      cryGfx.fillStyle(hover ? 0x1f2b54 : 0x161d36, 1);
      cryGfx.fillRoundedRect(cryBtnX, cryBtnY, cryBtnW, cryBtnH, 4);
      cryGfx.lineStyle(1.2, hover ? 0x00cec9 : 0x2c3b68, 1);
      cryGfx.strokeRoundedRect(cryBtnX, cryBtnY, cryBtnW, cryBtnH, 4);
    };
    drawCryBtn(false);
    this.detailContainer.add(cryGfx);

    const cryTxt = this.scene.add.text(cryBtnX + cryBtnW / 2, cryBtnY + cryBtnH / 2, t('POKEDEX_CRY_BTN'), {
      fontSize: '9.5px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#00cec9',
    }).setOrigin(0.5);
    this.detailContainer.add(cryTxt);

    const cryZone = this.scene.add.zone(cryBtnX + cryBtnW / 2, cryBtnY + cryBtnH / 2, cryBtnW, cryBtnH).setInteractive({ useHandCursor: true });
    cryZone.on('pointerover', () => drawCryBtn(true));
    cryZone.on('pointerout', () => drawCryBtn(false));
    cryZone.on('pointerdown', () => {
      SoundManager.getInstance(this.scene).playCry(sp.id);
      this.scene.tweens.add({
        targets: [cryTxt],
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 90,
        yoyo: true,
      });
    });
    this.detailContainer.add(cryZone);

    // Thông tin cơ bản bên phải sprite
    const infoX = spriteBoxX + spriteBoxW + 16;
    const infoY = spriteBoxY;

    // Số thứ tự + Tên
    const dexNumTxt = this.scene.add.text(infoX, infoY, `#${String(sp.dexNum).padStart(3, '0')}`, {
      fontSize: '13px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#00cec9',
    });
    const nameHeaderTxt = this.scene.add.text(infoX + dexNumTxt.width + 8, infoY - 2, sp.name.toUpperCase(), {
      fontSize: '17px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#ffffff',
    });
    this.detailContainer.add([dexNumTxt, nameHeaderTxt]);

    // Danh hiệu (Category)
    const catTxt = this.scene.add.text(infoX, infoY + 22, `${sp.category} Pokémon`, {
      fontSize: '11px',
      fontFamily: FONT.sans,
      fontStyle: 'italic',
      color: '#94a3b8',
    });
    this.detailContainer.add(catTxt);

    // Huy hiệu trạng thái: ĐÃ BẮT / ĐÃ GẶP
    const statusBg = this.scene.add.graphics();
    const stCol = isCaught ? 0x2ecc71 : 0x0984e3;
    const stLabel = isCaught ? t('POKEDEX_STATUS_CAUGHT') : t('POKEDEX_STATUS_SEEN');
    const stTxt = this.scene.add.text(infoX + 160, infoY + 22, stLabel, {
      fontSize: '9px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#ffffff',
    });
    statusBg.fillStyle(stCol, 0.9);
    statusBg.fillRoundedRect(infoX + 156, infoY + 20, stTxt.width + 8, 16, 3);
    this.detailContainer.add([statusBg, stTxt]);

    // Badges Hệ
    let curBx = infoX;
    sp.types.forEach((tp) => {
      const typeKey = tp.toLowerCase();
      const col = TYPE_COLORS[typeKey] ?? 0x777777;
      const bTxt = this.scene.add.text(curBx + 8, infoY + 46, typeKey.toUpperCase(), {
        fontSize: '9.5px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: '#ffffff',
      });
      const bW = bTxt.width + 16;
      const bG = this.scene.add.graphics();
      bG.fillStyle(col, 1);
      bG.fillRoundedRect(curBx, infoY + 44, bW, 18, 4);
      this.detailContainer.add([bG, bTxt]);
      curBx += bW + 8;
    });

    // Thông số thể chất: Chiều cao / Cân nặng
    const hwY = infoY + 70;
    const hStr = sp.height !== undefined ? `${sp.height} m` : '?';
    const wStr = sp.weight !== undefined ? `${sp.weight} kg` : '?';

    const hwTxt = this.scene.add.text(
      infoX,
      hwY,
      `📏 ${t('POKEDEX_PHYSICAL_HEIGHT')}: ${hStr}    ⚖ ${t('POKEDEX_PHYSICAL_WEIGHT')}: ${wStr}`,
      {
        fontSize: '11px',
        fontFamily: FONT.sans,
        color: '#cbd5e1',
      },
    );
    this.detailContainer.add(hwTxt);

    // Đặc tính (Abilities)
    if (sp.abilities && sp.abilities.length > 0) {
      const abStr = sp.abilities.map((a) => a.toUpperCase().replace(/_/g, ' ')).join(', ');
      const abTxt = this.scene.add.text(infoX, hwY + 20, `✨ ${t('POKEDEX_ABILITIES')}: ${abStr}`, {
        fontSize: '10.5px',
        fontFamily: FONT.sans,
        color: '#94a3b8',
      });
      this.detailContainer.add(abTxt);
    }

    // Hộp mô tả Pokédex (Description Box)
    const descY = spriteBoxY + spriteBoxH + 40;
    const descW = detW - 28;
    const descH = 50;

    const descGfx = this.scene.add.graphics();
    descGfx.fillStyle(0x131a33, 0.9);
    descGfx.fillRoundedRect(spriteBoxX, descY, descW, descH, 4);
    descGfx.lineStyle(1, 0x253154, 1);
    descGfx.strokeRoundedRect(spriteBoxX, descY, descW, descH, 4);
    this.detailContainer.add(descGfx);

    const descContent = sp.description || 'Không có mô tả cho loài này.';
    const descTxt = this.scene.add.text(spriteBoxX + 10, descY + 6, `“ ${descContent} ”`, {
      fontSize: '10.5px',
      fontFamily: FONT.sans,
      fontStyle: 'italic',
      color: '#e2e8f0',
      wordWrap: { width: descW - 20 },
      maxLines: 3,
    });
    this.detailContainer.add(descTxt);

    // Chỉ số cơ bản (Base Stats Bars)
    const statsY = descY + descH + 10;
    const statsDef = [
      { key: 'hp', label: 'HP', color: 0x2ecc71 },
      { key: 'attack', label: 'ATK', color: 0xe67e22 },
      { key: 'defense', label: 'DEF', color: 0xf1c40f },
      { key: 'spAttack', label: 'SPA', color: 0x3498db },
      { key: 'spDefense', label: 'SPD', color: 0x9b59b6 },
      { key: 'speed', label: 'SPE', color: 0xe91e63 },
    ] as const;

    const bst =
      sp.baseStatTotal ??
      (sp.baseStats.hp +
        sp.baseStats.attack +
        sp.baseStats.defense +
        sp.baseStats.spAttack +
        sp.baseStats.spDefense +
        sp.baseStats.speed);

    const statsHeader = this.scene.add.text(
      spriteBoxX,
      statsY,
      `${t('POKEDEX_STATS_TITLE')}  —  BST: ${bst}`,
      {
        fontSize: '10.5px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#fdcb6e',
      },
    );
    this.detailContainer.add(statsHeader);

    const statGfx = this.scene.add.graphics();
    this.detailContainer.add(statGfx);

    const colWidth = (descW - 12) / 2;
    const barW = 100;

    statsDef.forEach((st, i) => {
      const isCol2 = i >= 3;
      const rowIdx = i % 3;
      const sx = isCol2 ? spriteBoxX + colWidth + 12 : spriteBoxX;
      const sy = statsY + 18 + rowIdx * 16;
      const val = sp.baseStats[st.key] || 50;
      const ratio = Phaser.Math.Clamp(val / 180, 0.05, 1);

      const lbl = this.scene.add.text(sx, sy - 1, st.label, {
        fontSize: '9.5px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: '#94a3b8',
      });
      this.detailContainer.add(lbl);

      statGfx.fillStyle(0x1a223f, 1);
      statGfx.fillRoundedRect(sx + 32, sy + 1, barW, 8, 2);

      statGfx.fillStyle(st.color, 1);
      statGfx.fillRoundedRect(sx + 32, sy + 1, barW * ratio, 8, 2);

      const valTxt = this.scene.add.text(sx + 32 + barW + 8, sy - 1, String(val), {
        fontSize: '10px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: '#ffffff',
      });
      this.detailContainer.add(valTxt);
    });

    // Cây tiến hoá (Evolution Chain)
    const evoY = statsY + 70;
    this.renderEvolutionChain(spriteBoxX, evoY, descW, sp);
  }

  private renderUnseenDetail(x: number, y: number, w: number, _h: number, sp: PokedexSpecies): void {
    const boxX = x + 14;
    const boxY = y + 14;
    const boxW = 124;
    const boxH = 124;

    const g = this.scene.add.graphics();
    g.fillStyle(0x141a30, 1);
    g.fillRoundedRect(boxX, boxY, boxW, boxH, 6);
    g.lineStyle(1.5, 0x222a45, 1);
    g.strokeRoundedRect(boxX, boxY, boxW, boxH, 6);

    const questionIcon = this.scene.add.text(boxX + boxW / 2, boxY + boxH / 2, '?', {
      fontSize: '56px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#334155',
    }).setOrigin(0.5);
    this.detailContainer.add([g, questionIcon]);

    const infoX = boxX + boxW + 16;
    const infoY = boxY + 10;

    const dexTxt = this.scene.add.text(infoX, infoY, `#${String(sp.dexNum).padStart(3, '0')}`, {
      fontSize: '14px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#64748b',
    });
    const mysteryName = this.scene.add.text(infoX + dexTxt.width + 8, infoY - 2, '???', {
      fontSize: '18px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#64748b',
    });
    const statusTxt = this.scene.add.text(infoX, infoY + 28, t('POKEDEX_STATUS_UNSEEN'), {
      fontSize: '11px',
      fontFamily: FONT.sans,
      color: '#ef4444',
    });
    this.detailContainer.add([dexTxt, mysteryName, statusTxt]);

    const explainY = boxY + boxH + 30;
    const explainW = w - 28;

    const exGfx = this.scene.add.graphics();
    exGfx.fillStyle(0x131a33, 0.9);
    exGfx.fillRoundedRect(boxX, explainY, explainW, 90, 4);
    exGfx.lineStyle(1, 0x253154, 1);
    exGfx.strokeRoundedRect(boxX, explainY, explainW, 90, 4);
    this.detailContainer.add(exGfx);

    const msgTxt = this.scene.add.text(
      boxX + 16,
      explainY + 16,
      t('POKEDEX_UNSEEN_DESC'),
      {
        fontSize: '11.5px',
        fontFamily: FONT.sans,
        color: '#94a3b8',
        wordWrap: { width: explainW - 32 },
        lineSpacing: 4,
      },
    );
    this.detailContainer.add(msgTxt);
  }

  private renderEvolutionChain(x: number, y: number, _w: number, sp: PokedexSpecies): void {
    const header = this.scene.add.text(x, y, t('POKEDEX_EVO_TITLE'), {
      fontSize: '10.5px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#00cec9',
    });
    this.detailContainer.add(header);

    let rootId = sp.id;
    const visited = new Set<string>([rootId]);
    while (this.parentMap.has(rootId)) {
      const p = this.parentMap.get(rootId)!.from;
      if (visited.has(p)) break;
      visited.add(p);
      rootId = p;
    }

    const chain: Array<{ species: PokedexSpecies; methodDesc?: string }> = [];
    const rootSp = this.allSpecies.find((s) => s.id === rootId);
    if (!rootSp) {
      const noneTxt = this.scene.add.text(x, y + 20, t('POKEDEX_EVO_NONE'), {
        fontSize: '10px',
        fontFamily: FONT.sans,
        color: '#64748b',
      });
      this.detailContainer.add(noneTxt);
      return;
    }

    chain.push({ species: rootSp });

    let curId = rootId;
    let guard = 0;
    while (guard++ < 4) {
      const evos = this.evoMap.get(curId);
      if (!evos || evos.length === 0) break;

      const targetEvo = evos.find((e) => e.to === sp.id) || evos[0];
      const nextSp = this.allSpecies.find((s) => s.id === targetEvo.to);
      if (!nextSp) break;

      let methodDesc = '';
      if (targetEvo.method === 'level') {
        methodDesc = `Lv. ${targetEvo.level ?? '?'}`;
      } else if (targetEvo.method === 'item') {
        methodDesc = (targetEvo.item || 'Item').toUpperCase();
      } else if (targetEvo.method === 'time') {
        const tod = Array.isArray((targetEvo as any).timeOfDay)
          ? (targetEvo as any).timeOfDay.join('/').toUpperCase()
          : 'TIME';
        methodDesc = `❤+${tod}`;
      } else {
        methodDesc = targetEvo.method.toUpperCase();
      }

      chain.push({ species: nextSp, methodDesc });
      curId = nextSp.id;
    }

    if (chain.length <= 1 && (!sp.evolutions || sp.evolutions.length === 0)) {
      const noneTxt = this.scene.add.text(x, y + 20, t('POKEDEX_EVO_NONE'), {
        fontSize: '10.5px',
        fontFamily: FONT.sans,
        fontStyle: 'italic',
        color: '#64748b',
      });
      this.detailContainer.add(noneTxt);
      return;
    }

    let curX = x;
    const nodeY = y + 20;

    chain.forEach((node, idx) => {
      const isCur = node.species.id === sp.id;
      const isSeen = this.caughtSet.has(node.species.id) || this.seenSet.has(node.species.id);
      const nodeName = isSeen ? node.species.name : '???';

      const nTxt = this.scene.add.text(curX + 8, nodeY + 5, nodeName, {
        fontSize: '10px',
        fontFamily: FONT.sans,
        fontStyle: isCur ? 'bold' : 'normal',
        color: isCur ? '#00cec9' : '#cbd5e1',
      });

      const nodeW = Math.max(70, nTxt.width + 16);
      const nodeH = 22;
      nTxt.setX(curX + nodeW / 2).setOrigin(0.5);

      const nGfx = this.scene.add.graphics();
      nGfx.fillStyle(isCur ? 0x1d2a52 : 0x141a30, 1);
      nGfx.fillRoundedRect(curX, nodeY, nodeW, nodeH, 4);
      nGfx.lineStyle(1.2, isCur ? 0x00cec9 : 0x2d3a63, 1);
      nGfx.strokeRoundedRect(curX, nodeY, nodeW, nodeH, 4);

      const zone = this.scene.add.zone(curX + nodeW / 2, nodeY + nodeH / 2, nodeW, nodeH).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        SoundManager.getInstance(this.scene).playSe('gui_sel_cursor');
        this.selectedSpecies = node.species;
        this.render();
      });

      this.detailContainer.add([nGfx, nTxt, zone]);
      curX += nodeW;

      if (idx < chain.length - 1) {
        const nextNode = chain[idx + 1];
        const arrowStr = `➔ ${nextNode.methodDesc || ''}`;
        const arrowTxt = this.scene.add.text(curX + 6, nodeY + 4, arrowStr, {
          fontSize: '9px',
          fontFamily: FONT.mono,
          color: '#fdcb6e',
        });
        this.detailContainer.add(arrowTxt);
        curX += arrowTxt.width + 12;
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. DROPDOWN HỆ (TYPE MENU)
  // ══════════════════════════════════════════════════════════════════════════

  private renderTypeDropdownMenu(): void {
    if (this.dropdownContainer) {
      this.dropdownContainer.destroy();
    }
    this.dropdownContainer = this.scene.add.container(0, 0);
    this.overlayContainer.add(this.dropdownContainer);

    const dropX = 172;
    const dropY = 66;
    const dropW = 108;
    const itemH = 20;

    const typesList: Array<{ id: string; label: string }> = [
      { id: 'all', label: t('POKEDEX_TYPE_ALL') },
      ...ALL_TYPES.map((tp) => ({ id: tp, label: tp.toUpperCase() })),
    ];

    const totalMenuH = typesList.length * itemH + 6;

    const menuGfx = this.scene.add.graphics();
    menuGfx.fillStyle(0x0e1324, 0.98);
    menuGfx.fillRoundedRect(dropX, dropY, dropW, totalMenuH, 4);
    menuGfx.lineStyle(1.5, 0x00cec9, 1);
    menuGfx.strokeRoundedRect(dropX, dropY, dropW, totalMenuH, 4);
    this.dropdownContainer.add(menuGfx);

    typesList.forEach((tp, idx) => {
      const iy = dropY + 3 + idx * itemH;
      const isSelected = this.typeFilter === tp.id;
      const col = tp.id === 'all' ? 0x222a45 : TYPE_COLORS[tp.id] ?? 0x777777;

      const itemGfx = this.scene.add.graphics();
      const drawItem = (hover = false) => {
        itemGfx.clear();
        if (isSelected || hover) {
          itemGfx.fillStyle(isSelected ? 0x1e2a52 : 0x161d36, 1);
          itemGfx.fillRoundedRect(dropX + 3, iy, dropW - 6, itemH - 1, 3);
        }
      };
      drawItem(false);
      this.dropdownContainer!.add(itemGfx);

      if (tp.id !== 'all') {
        const dotGfx = this.scene.add.graphics();
        dotGfx.fillStyle(col, 1);
        dotGfx.fillCircle(dropX + 11, iy + itemH / 2, 3.5);
        this.dropdownContainer!.add(dotGfx);
      }

      const itemTxt = this.scene.add.text(
        tp.id === 'all' ? dropX + 8 : dropX + 18,
        iy + itemH / 2,
        tp.label,
        {
          fontSize: '9.5px',
          fontFamily: FONT.sans,
          fontStyle: isSelected ? 'bold' : 'normal',
          color: isSelected ? '#00cec9' : '#cbd5e1',
        },
      ).setOrigin(0, 0.5);
      this.dropdownContainer!.add(itemTxt);

      const zone = this.scene.add.zone(dropX + dropW / 2, iy + itemH / 2, dropW - 6, itemH).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => drawItem(true));
      zone.on('pointerout', () => drawItem(false));
      zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        SoundManager.getInstance(this.scene).playSe('gui_sel_cursor');
        this.typeFilter = tp.id;
        this.typeDropdownOpen = false;
        this.scrollIndex = 0;
        this.render();
      });
      this.dropdownContainer!.add(zone);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. HTML SEARCH INPUT CONTROLS
  // ══════════════════════════════════════════════════════════════════════════

  private ensureSearchInput(): HTMLInputElement {
    if (this.searchInputEl) return this.searchInputEl;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = t('POKEDEX_SEARCH_PLACEHOLDER');
    input.value = this.searchQuery;
    input.style.position = 'fixed';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.color = '#f1f5f9';
    input.style.fontFamily = FONT.sans || 'sans-serif';
    input.style.padding = '0 4px';
    input.style.zIndex = '240';
    input.style.display = 'none';

    input.addEventListener('focus', () => {
      this.searchFocused = true;
      if (this.searchBoxGfx) {
        this.searchBoxGfx.clear();
        this.searchBoxGfx.fillStyle(0x111628, 0.95);
        this.searchBoxGfx.fillRoundedRect(
          this.searchBoxBounds.x,
          this.searchBoxBounds.y,
          this.searchBoxBounds.w,
          this.searchBoxBounds.h,
          4,
        );
        this.searchBoxGfx.lineStyle(1.5, 0x00cec9, 1);
        this.searchBoxGfx.strokeRoundedRect(
          this.searchBoxBounds.x,
          this.searchBoxBounds.y,
          this.searchBoxBounds.w,
          this.searchBoxBounds.h,
          4,
        );
      }
    });

    input.addEventListener('blur', () => {
      this.searchFocused = false;
      if (this.searchBoxGfx) {
        this.searchBoxGfx.clear();
        this.searchBoxGfx.fillStyle(0x111628, 0.95);
        this.searchBoxGfx.fillRoundedRect(
          this.searchBoxBounds.x,
          this.searchBoxBounds.y,
          this.searchBoxBounds.w,
          this.searchBoxBounds.h,
          4,
        );
        this.searchBoxGfx.lineStyle(1.5, 0x2a3350, 1);
        this.searchBoxGfx.strokeRoundedRect(
          this.searchBoxBounds.x,
          this.searchBoxBounds.y,
          this.searchBoxBounds.w,
          this.searchBoxBounds.h,
          4,
        );
      }
    });

    input.addEventListener('input', () => {
      this.searchQuery = input.value;
      this.scrollIndex = 0;
      this.render();
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        if (input.value) {
          input.value = '';
          this.searchQuery = '';
          this.scrollIndex = 0;
          this.render();
        } else {
          input.blur();
        }
      }
    });

    document.body.appendChild(input);
    this.searchInputEl = input;
    return input;
  }

  private positionSearchInput(): void {
    const input = this.ensureSearchInput();
    if (!this.isOpen() || this.isMinimized) {
      input.style.display = 'none';
      return;
    }

    const { scale } = this.getScaleAndBounds();
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;

    const padLeft = this.contentContainer.x;
    const padTop = this.contentContainer.y;
    const localX = padLeft + this.searchBoxBounds.x + 22;
    const localY = padTop + this.searchBoxBounds.y + 2;
    const w = this.searchBoxBounds.w - 36;
    const h = this.searchBoxBounds.h - 4;

    input.style.left = `${rect.left + (this.currentX + localX * scale) * scaleX}px`;
    input.style.top = `${rect.top + (this.currentY + localY * scale) * scaleY}px`;
    input.style.width = `${Math.max(10, w * scale * scaleX)}px`;
    input.style.height = `${Math.max(10, h * scale * scaleY)}px`;
    input.style.fontSize = `${Math.max(10, Math.round(10.5 * scale))}px`;
    input.style.display = 'block';
  }

  private hideSearchInput(): void {
    if (this.searchInputEl) {
      this.searchInputEl.style.display = 'none';
      this.searchInputEl.blur();
    }
  }
}
