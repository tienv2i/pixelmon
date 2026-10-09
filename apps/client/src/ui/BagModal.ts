import Phaser from 'phaser';
import { FONT } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange, getLang } from '../i18n';
import { ColyseusManager, type InventoryItem } from '../network/ColyseusManager';
import { isUsableItem, resolveItemEffect } from '@pixelmon/shared';
import type { PokemonData } from './PokemonSummaryModal';

const MODAL_W = 600;
const MODAL_H = 430;
const COLS = 5;
const ROWS = 5;
const PAGE_SIZE = COLS * ROWS; // 25 slots per page
const SLOT = 46;
const GAP = 6;
const GRID_X = 8;
const GRID_Y = 46;

/** Nhãn pocket 1..8 chuẩn Essentials Pokémon v21.1 */
const POCKET_LABELS: Record<number, string> = {
  1: 'BAG_ITEMS',
  2: 'BAG_MEDICINE',
  3: 'BAG_POKEBALL',
  4: 'BAG_MACHINE',
  5: 'BAG_BERRIES',
  6: 'BAG_MAIL',
  7: 'BAG_BATTLE',
  8: 'BAG_KEY_ITEMS',
};

/** Icon đại diện cho từng Pocket */
const POCKET_ICONS: Record<number, string> = {
  0: '🌟',
  1: '🎒',
  2: '💊',
  3: '🔴',
  4: '💿',
  5: '🍓',
  6: '✉️',
  7: '⚔️',
  8: '🔑',
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
 * **BagModal** — Túi đồ hiển thị toàn bộ vật phẩm (Display All), hỗ trợ ô tìm kiếm real-time
 * và dropdown phân loại theo 8 nhóm chuẩn Pokémon Essentials (Plan 45 §6.2).
 */
export class BagModal extends UiModal {
  private items: InventoryItem[] = [];
  private selected: InventoryItem | null = null;
  private selectedPokemon: PokemonData | null = null;
  private party: PokemonData[] = [];

  private gfx!: Phaser.GameObjects.Graphics;
  private icons!: Phaser.GameObjects.Container;
  private detail!: Phaser.GameObjects.Container;
  private unsubLang?: () => void;

  /** Filter & Search state: pocketId 0 = Display All */
  private currentPocket = 0;
  private searchQuery = '';
  private currentPage = 0;

  /** HTML Search Input & Dropdown Menu */
  private searchInputEl: HTMLInputElement | null = null;
  private searchFocused = false;
  private searchBoxGfx?: Phaser.GameObjects.Graphics;
  private searchBoxBounds = { x: 0, y: 0, w: 0, h: 0 };

  private dropdownOpen = false;
  private dropdownContainer?: Phaser.GameObjects.Container;
  private onCanvasClick?: () => void;

  private onUse?: (itemId: string, pokemonId: string) => void;
  private onHold?: (itemId: string, pokemonId: string) => void;

  /**
   * Mở `PartySelectModal` để chọn Pokémon mục tiêu (inject từ WorldScene).
   * Dùng chung cho mọi tác vụ chọn Pokémon trong party.
   */
  private onPickTarget?: (opts: {
    title: string;
    hint?: string;
    filterAlive?: boolean;
    onSelect: (pokemon: PokemonData) => void;
  }) => void;

  constructor(
    scene: Phaser.Scene,
    options: {
      party?: PokemonData[];
      onUse?: (itemId: string, pokemonId: string) => void;
      onHold?: (itemId: string, pokemonId: string) => void;
      onPickTarget?: (opts: {
        title: string;
        hint?: string;
        filterAlive?: boolean;
        onSelect: (pokemon: PokemonData) => void;
      }) => void;
      onClose?: () => void;
    } = {},
  ) {
    super(scene, {
      title: t('BAG_TITLE'),
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
      depth: 230,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      padding: { top: 8, right: 12, bottom: 10, left: 12 },
      onClose: () => {
        this.hideSearchInput();
        options.onClose?.();
      },
    });

    this.onUse = options.onUse;
    this.onHold = options.onHold;
    this.onPickTarget = options.onPickTarget;
    this.party = options.party ?? [];

    this.gfx = scene.add.graphics();
    this.icons = scene.add.container(0, 0);
    this.detail = scene.add.container(0, 0);
    this.contentContainer.add(this.gfx);
    this.contentContainer.add(this.icons);
    this.contentContainer.add(this.detail);

    this.close();
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('BAG_TITLE'));
      this.render();
    });

    this.onCanvasClick = () => {
      if (this.searchInputEl && document.activeElement === this.searchInputEl) {
        this.searchInputEl.blur();
      }
    };
    this.scene.input.on('pointerdown', this.onCanvasClick);
  }

  public override destroy(): void {
    this.unsubLang?.();
    if (this.onCanvasClick) {
      this.scene.input.off('pointerdown', this.onCanvasClick);
    }
    this.removeSearchInput();
    super.destroy();
  }

  public override show(): void {
    super.show();
    this.dropdownOpen = false;
    void this.refresh();
  }

  public override close(): void {
    this.hideSearchInput();
    this.dropdownOpen = false;
    super.close();
  }

  protected override onDragMove(): void {
    if (this.open && !this.isMinimized) {
      this.positionSearchInput(this.searchBoxBounds.x + 28, this.searchBoxBounds.y + 3, this.searchBoxBounds.w - 36, this.searchBoxBounds.h - 6);
    }
  }

  protected override onDragEnd(): void {
    if (this.open && !this.isMinimized) {
      this.positionSearchInput(this.searchBoxBounds.x + 28, this.searchBoxBounds.y + 3, this.searchBoxBounds.w - 36, this.searchBoxBounds.h - 6);
    }
  }

  /** Nạp lại túi đồ từ server. */
  async refresh(): Promise<void> {
    this.items = await ColyseusManager.getInstance().fetchInventory();
    if (this.selected && !this.items.some((i) => i.itemId === this.selected?.itemId)) {
      this.selected = null;
    }
    this.render();
  }

  /** Nhận `bag_update` từ server (broadcast realtime). */
  setItems(items: InventoryItem[]): void {
    this.items = items;
    if (this.selected && !items.some((i) => i.itemId === this.selected?.itemId)) {
      this.selected = null;
    }
    this.render();
  }

  setParty(party: PokemonData[]): void {
    this.party = party;
    if (this.selectedPokemon && !party.some((p) => p.id === this.selectedPokemon?.id)) {
      this.selectedPokemon = null;
    }
  }

  /** Danh sách pocket hợp lệ: 0 là Display All, 1..8 là từng nhóm */
  private getDropdownCategories(): Array<{ id: number; label: string; icon: string }> {
    return [
      { id: 0, label: t('BAG_DISPLAY_ALL'), icon: '🌟' },
      { id: 1, label: t('BAG_ITEMS'), icon: '🎒' },
      { id: 2, label: t('BAG_MEDICINE'), icon: '💊' },
      { id: 3, label: t('BAG_POKEBALL'), icon: '🔴' },
      { id: 4, label: t('BAG_MACHINE'), icon: '💿' },
      { id: 5, label: t('BAG_BERRIES'), icon: '🍓' },
      { id: 6, label: t('BAG_MAIL'), icon: '✉️' },
      { id: 7, label: t('BAG_BATTLE'), icon: '⚔️' },
      { id: 8, label: t('BAG_KEY_ITEMS'), icon: '🔑' },
    ];
  }

  /** Lọc danh sách items theo dropdown phân loại và từ khoá tìm kiếm */
  private filteredItems(): InventoryItem[] {
    let list = this.items;
    if (this.currentPocket !== 0) {
      list = list.filter((i) => (i.pocket || 1) === this.currentPocket);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter((i) => {
        // Guard: server có thể gửi slot thiếu metadata (vd broadcast cũ) — bỏ qua
        // thay vì crash cả modal.
        const name = i.name ?? '';
        const itemId = i.itemId ?? '';
        const nameMatch = name.toLowerCase().includes(q) || itemId.toLowerCase().includes(q);
        const descMatch = (i.description || '').toLowerCase().includes(q);
        const effSummary = this.getItemEffectSummary(i.itemId).toLowerCase();
        return nameMatch || descMatch || effSummary.includes(q);
      });
    }
    return list;
  }

  private render(): void {
    this.gfx.clear();
    this.icons.removeAll(true);
    this.detail.removeAll(true);
    if (this.dropdownContainer) {
      this.dropdownContainer.destroy();
      this.dropdownContainer = undefined;
    }

    this.renderTopControls();
    this.renderGrid();
    this.renderDetail();

    // Render dropdown layer trên cùng nếu đang mở
    if (this.dropdownOpen) {
      this.renderDropdownMenu();
    }
  }

  /** Render thanh công cụ phía trên: Ô Search (trái) và Dropdown Phân loại (phải) */
  private renderTopControls(): void {
    const topY = 6;
    const topH = 28;

    // 1. Ô tìm kiếm (Search Bar) bên trái
    const searchX = 0;
    const searchW = 280;
    this.searchBoxBounds = { x: searchX, y: topY, w: searchW, h: topH };

    const searchGfx = this.scene.add.graphics();
    searchGfx.fillStyle(0x131728, 0.95);
    searchGfx.fillRoundedRect(searchX, topY, searchW, topH, 4);
    searchGfx.lineStyle(1.5, this.searchFocused ? 0x00cec9 : 0x2b3350, 1);
    searchGfx.strokeRoundedRect(searchX, topY, searchW, topH, 4);
    this.icons.add(searchGfx);
    this.searchBoxGfx = searchGfx;

    // Icon kính lúp 🔍
    const searchIcon = this.scene.add
      .text(searchX + 8, topY + topH / 2, '🔍', { fontSize: '11px' })
      .setOrigin(0, 0.5);
    this.icons.add(searchIcon);

    // Nút Clear search (nếu có query)
    if (this.searchQuery.trim()) {
      const clearTxt = this.scene.add
        .text(searchX + searchW - 10, topY + topH / 2, '✕', {
          fontSize: '11px',
          fontFamily: FONT.sans,
          fontStyle: 'bold',
          color: '#8c98ba',
        })
        .setOrigin(1, 0.5);
      this.icons.add(clearTxt);

      const clearZone = this.scene.add
        .zone(searchX + searchW - 14, topY + topH / 2, 20, topH)
        .setInteractive({ useHandCursor: true });
      clearZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        this.searchQuery = '';
        if (this.searchInputEl) this.searchInputEl.value = '';
        this.currentPage = 0;
        this.render();
      });
      this.icons.add(clearZone);
    }

    this.positionSearchInput(searchX + 28, topY + 4, searchW - 46, topH - 8);

    // 2. Dropdown phân loại bên phải
    const dropX = 290;
    const dropW = 286;
    const categories = this.getDropdownCategories();
    const curCat = categories.find((c) => c.id === this.currentPocket) || categories[0]!;

    const dropGfx = this.scene.add.graphics();
    const drawDrop = (hover = false) => {
      dropGfx.clear();
      dropGfx.fillStyle(this.dropdownOpen ? 0x222a4d : hover ? 0x1d2341 : 0x14182a, 1);
      dropGfx.fillRoundedRect(dropX, topY, dropW, topH, 4);
      dropGfx.lineStyle(1.5, this.dropdownOpen ? 0x00cec9 : hover ? 0x485580 : 0x2a3352, 1);
      dropGfx.strokeRoundedRect(dropX, topY, dropW, topH, 4);
    };
    drawDrop(false);
    this.icons.add(dropGfx);

    // Label và icon dropdown
    const dropLabel = `${curCat.icon}  ${curCat.label}`;
    const dropTxt = this.scene.add
      .text(dropX + 10, topY + topH / 2, dropLabel, {
        fontSize: '11px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: this.dropdownOpen ? '#00cec9' : '#e2e8f0',
      })
      .setOrigin(0, 0.5);
    this.icons.add(dropTxt);

    // Mũi tên chỉ xuống ▼ / ▲
    const arrowTxt = this.scene.add
      .text(dropX + dropW - 12, topY + topH / 2, this.dropdownOpen ? '▲' : '▼', {
        fontSize: '10px',
        fontFamily: FONT.sans,
        color: this.dropdownOpen ? '#00cec9' : '#8ca0ba',
      })
      .setOrigin(1, 0.5);
    this.icons.add(arrowTxt);

    const dropZone = this.scene.add
      .zone(dropX + dropW / 2, topY + topH / 2, dropW, topH)
      .setInteractive({ useHandCursor: true });
    dropZone.on('pointerover', () => drawDrop(true));
    dropZone.on('pointerout', () => drawDrop(false));
    dropZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event?.stopPropagation();
      this.dropdownOpen = !this.dropdownOpen;
      this.render();
    });
    this.icons.add(dropZone);
  }

  /** Render menu dropdown dạng popup nổi */
  private renderDropdownMenu(): void {
    const dropX = 290;
    const dropY = 38;
    const dropW = 286;
    const categories = this.getDropdownCategories();
    const itemH = 25;
    const totalMenuH = categories.length * itemH + 6;

    // 1. Lớp backdrop trong suốt bao phủ toàn bộ modal để đóng dropdown khi click bất kỳ đâu ra ngoài
    const backdropZone = this.scene.add
      .zone(-12, -42, MODAL_W, MODAL_H)
      .setOrigin(0, 0)
      .setInteractive();
    backdropZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event?.stopPropagation();
      this.dropdownOpen = false;
      this.render();
    });
    this.contentContainer.add(backdropZone);

    // 2. Dropdown Container nằm trên cùng
    this.dropdownContainer = this.scene.add.container(0, 0);
    this.contentContainer.add(this.dropdownContainer);
    this.contentContainer.bringToTop(this.dropdownContainer);

    const menuGfx = this.scene.add.graphics();
    menuGfx.fillStyle(0x0f1322, 0.98);
    menuGfx.fillRoundedRect(dropX, dropY, dropW, totalMenuH, 5);
    menuGfx.lineStyle(1.5, 0x00cec9, 1);
    menuGfx.strokeRoundedRect(dropX, dropY, dropW, totalMenuH, 5);
    this.dropdownContainer.add(menuGfx);

    categories.forEach((cat, idx) => {
      const iy = dropY + 3 + idx * itemH;
      const isSelected = cat.id === this.currentPocket;
      const count = cat.id === 0 ? this.items.length : this.items.filter((i) => (i.pocket || 1) === cat.id).length;

      const itemGfx = this.scene.add.graphics();
      const drawItem = (hover = false) => {
        itemGfx.clear();
        if (isSelected || hover) {
          itemGfx.fillStyle(isSelected ? 0x222f54 : 0x1b2342, 1);
          itemGfx.fillRoundedRect(dropX + 3, iy, dropW - 6, itemH - 1, 3);
        }
      };
      drawItem(false);
      this.dropdownContainer!.add(itemGfx);

      const itemTxt = this.scene.add
        .text(dropX + 10, iy + itemH / 2, `${cat.icon}  ${cat.label}`, {
          fontSize: '10.5px',
          fontFamily: FONT.sans,
          fontStyle: isSelected ? 'bold' : 'normal',
          color: isSelected ? '#00cec9' : '#cbd5e1',
        })
        .setOrigin(0, 0.5);
      this.dropdownContainer!.add(itemTxt);

      const countTxt = this.scene.add
        .text(dropX + dropW - 12, iy + itemH / 2, `(${count})`, {
          fontSize: '9.5px',
          fontFamily: FONT.mono,
          color: isSelected ? '#00cec9' : '#718096',
        })
        .setOrigin(1, 0.5);
      this.dropdownContainer!.add(countTxt);

      const zone = this.scene.add
        .zone(dropX + dropW / 2, iy + itemH / 2, dropW - 6, itemH)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => drawItem(true));
      zone.on('pointerout', () => drawItem(false));
      zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        this.currentPocket = cat.id;
        this.dropdownOpen = false;
        this.currentPage = 0;
        this.selected = null;
        this.render();
      });
      this.dropdownContainer!.add(zone);
    });
  }

  /** Đảm bảo và tái sử dụng ô HTML input tìm kiếm */
  private ensureSearchInput(): HTMLInputElement {
    if (this.searchInputEl) return this.searchInputEl;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = t('BAG_SEARCH_PLACEHOLDER');
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
      if (this.searchBoxGfx && this.searchBoxBounds.w > 0) {
        this.searchBoxGfx.clear();
        this.searchBoxGfx.fillStyle(0x131728, 0.95);
        this.searchBoxGfx.fillRoundedRect(this.searchBoxBounds.x, this.searchBoxBounds.y, this.searchBoxBounds.w, this.searchBoxBounds.h, 4);
        this.searchBoxGfx.lineStyle(1.5, 0x00cec9, 1);
        this.searchBoxGfx.strokeRoundedRect(this.searchBoxBounds.x, this.searchBoxBounds.y, this.searchBoxBounds.w, this.searchBoxBounds.h, 4);
      }
    });

    input.addEventListener('blur', () => {
      this.searchFocused = false;
      if (this.searchBoxGfx && this.searchBoxBounds.w > 0) {
        this.searchBoxGfx.clear();
        this.searchBoxGfx.fillStyle(0x131728, 0.95);
        this.searchBoxGfx.fillRoundedRect(this.searchBoxBounds.x, this.searchBoxBounds.y, this.searchBoxBounds.w, this.searchBoxBounds.h, 4);
        this.searchBoxGfx.lineStyle(1.5, 0x2b3350, 1);
        this.searchBoxGfx.strokeRoundedRect(this.searchBoxBounds.x, this.searchBoxBounds.y, this.searchBoxBounds.w, this.searchBoxBounds.h, 4);
      }
    });

    input.addEventListener('input', () => {
      this.searchQuery = input.value;
      this.currentPage = 0;
      this.render();
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        if (input.value) {
          input.value = '';
          this.searchQuery = '';
          this.currentPage = 0;
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

  private positionSearchInput(x: number, y: number, w: number, h: number): void {
    const input = this.ensureSearchInput();
    if (!this.open || this.isMinimized) {
      input.style.display = 'none';
      return;
    }
    const { scale } = this.getScaleAndBounds();
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;

    const padLeft = this.contentContainer.x;
    const padTop = this.contentContainer.y;
    const localX = padLeft + x;
    const localY = padTop + y;

    input.style.left = `${rect.left + (this.currentX + localX * scale) * scaleX}px`;
    input.style.top = `${rect.top + (this.currentY + localY * scale) * scaleY}px`;
    input.style.width = `${Math.max(10, w * scale * scaleX)}px`;
    input.style.height = `${Math.max(10, h * scale * scaleY)}px`;
    input.style.fontSize = `${Math.max(10, Math.round(11 * scale))}px`;
    input.style.display = 'block';
  }

  private hideSearchInput(): void {
    if (this.searchInputEl) {
      this.searchInputEl.style.display = 'none';
      this.searchInputEl.blur();
    }
  }

  private removeSearchInput(): void {
    if (this.searchInputEl) {
      this.searchInputEl.remove();
      this.searchInputEl = null;
    }
  }

  /** Lưới 5x5 ô chứa vật phẩm kèm hỗ trợ phân trang và cuộn chuột */
  private renderGrid(): void {
    const list = this.filteredItems();
    const startX = GRID_X;
    const startY = GRID_Y;
    const pad = 8;
    const gridW = COLS * (SLOT + GAP) - GAP + pad * 2; // 270px
    const gridH = ROWS * (SLOT + GAP) - GAP + pad * 2; // 270px

    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (this.currentPage >= totalPages) this.currentPage = totalPages - 1;
    if (this.currentPage < 0) this.currentPage = 0;

    const pageStartIndex = this.currentPage * PAGE_SIZE;
    const pageItems = list.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);

    // Khung nền lưới
    this.gfx.fillStyle(0x131627, 0.98);
    this.gfx.fillRoundedRect(startX - pad, startY - pad, gridW, gridH, 6);
    this.gfx.lineStyle(1.5, 0x2a3254, 1);
    this.gfx.strokeRoundedRect(startX - pad, startY - pad, gridW, gridH, 6);

    // Vùng cuộn chuột
    const scrollZone = this.scene.add
      .zone(startX - pad + gridW / 2, startY - pad + gridH / 2, gridW, gridH)
      .setInteractive();
    scrollZone.on('wheel', (_ptr: any, _dx: number, dy: number) => {
      if (dy > 0 && this.currentPage < totalPages - 1) {
        this.currentPage++;
        this.render();
      } else if (dy < 0 && this.currentPage > 0) {
        this.currentPage--;
        this.render();
      }
    });
    this.icons.add(scrollZone);

    if (list.length === 0) {
      const emptyTxt = this.scene.add
        .text(startX - pad + gridW / 2, startY - pad + gridH / 2, t('BAG_NO_MATCH'), {
          fontSize: '11px',
          fontFamily: FONT.sans,
          color: '#6e7a9c',
          align: 'center',
          wordWrap: { width: gridW - 20 },
        })
        .setOrigin(0.5);
      this.icons.add(emptyTxt);
    }

    // Vẽ 25 ô
    for (let idx = 0; idx < PAGE_SIZE; idx++) {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = startX + col * (SLOT + GAP);
      const y = startY + row * (SLOT + GAP);
      const item = pageItems[idx];

      const isSel = Boolean(item && this.selected?.itemId === item.itemId);

      const slotGfx = this.scene.add.graphics();
      const drawSlot = (hover = false) => {
        slotGfx.clear();
        slotGfx.fillStyle(isSel ? 0x273461 : hover ? 0x212747 : item ? 0x1b203a : 0x14172a, 1);
        slotGfx.fillRoundedRect(x, y, SLOT, SLOT, 4);
        slotGfx.lineStyle(1.5, isSel ? 0x00cec9 : hover ? 0x4e5a88 : item ? 0x2f375e : 0x1f2440, 1);
        slotGfx.strokeRoundedRect(x, y, SLOT, SLOT, 4);
      };
      drawSlot(false);
      this.icons.add(slotGfx);

      if (!item) continue;

      // Icon item
      if (item.iconUrl) {
        const iconKey = `item_icon_${item.itemId}`;
        const placeholderKey = `__MISSING:${item.itemId}`;
        const img = this.scene.add.image(x + SLOT / 2, y + SLOT / 2 - 3, this.scene.textures.exists(iconKey) ? iconKey : placeholderKey);
        img.setDisplaySize(30, 30);
        this.icons.add(img);

        if (!this.scene.textures.exists(iconKey)) {
          loadTextureImage(this.scene, iconKey, item.iconUrl).then((ok) => {
            if (ok && img.active) {
              img.setTexture(iconKey);
              img.setDisplaySize(30, 30);
            }
          });
        }
      }

      // Huy hiệu số lượng
      const qtyPillW = Math.max(18, String(item.quantity).length * 7 + 8);
      const qtyPillH = 13;
      const qtyPillX = x + SLOT - qtyPillW - 2;
      const qtyPillY = y + SLOT - qtyPillH - 2;

      this.gfx.fillStyle(0x0c0f1c, 0.88);
      this.gfx.fillRoundedRect(qtyPillX, qtyPillY, qtyPillW, qtyPillH, 2);
      this.gfx.lineStyle(1, 0x2c3558, 0.8);
      this.gfx.strokeRoundedRect(qtyPillX, qtyPillY, qtyPillW, qtyPillH, 2);

      const qty = this.scene.add
        .text(qtyPillX + qtyPillW / 2, qtyPillY + qtyPillH / 2, `${item.quantity}`, {
          fontSize: '9px',
          fontFamily: FONT.mono,
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0.5);
      this.icons.add(qty);

      // Zone chọn
      const zone = this.scene.add
        .zone(x + SLOT / 2, y + SLOT / 2, SLOT, SLOT)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (!isSel) drawSlot(true);
      });
      zone.on('pointerout', () => {
        if (!isSel) drawSlot(false);
      });
      zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        this.selected = item;
        this.render();
      });
      this.icons.add(zone);
    }

    // Thanh phân trang phía dưới lưới
    const pagY = GRID_Y - pad + gridH + 8; // 316px
    const pagH = 28;

    this.gfx.fillStyle(0x131627, 0.95);
    this.gfx.fillRoundedRect(startX - pad, pagY, gridW, pagH, 4);
    this.gfx.lineStyle(1, 0x252b47, 0.9);
    this.gfx.strokeRoundedRect(startX - pad, pagY, gridW, pagH, 4);

    const canPrev = this.currentPage > 0;
    const prevBtnW = 26;
    const prevBtnX = startX - pad + 4;
    const prevGfx = this.scene.add.graphics();
    prevGfx.fillStyle(canPrev ? 0x222846 : 0x161a2d, 1);
    prevGfx.fillRoundedRect(prevBtnX, pagY + 2, prevBtnW, pagH - 4, 3);
    prevGfx.lineStyle(1, canPrev ? 0x3d4975 : 0x222742, 1);
    prevGfx.strokeRoundedRect(prevBtnX, pagY + 2, prevBtnW, pagH - 4, 3);
    this.icons.add(prevGfx);

    const prevTxt = this.scene.add
      .text(prevBtnX + prevBtnW / 2, pagY + pagH / 2, '◀', {
        fontSize: '10px',
        fontFamily: FONT.sans,
        color: canPrev ? '#00cec9' : '#454f6b',
      })
      .setOrigin(0.5);
    this.icons.add(prevTxt);

    if (canPrev) {
      const pZone = this.scene.add
        .zone(prevBtnX + prevBtnW / 2, pagY + pagH / 2, prevBtnW, pagH - 4)
        .setInteractive({ useHandCursor: true });
      pZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        this.currentPage--;
        this.render();
      });
      this.icons.add(pZone);
    }

    const canNext = this.currentPage < totalPages - 1;
    const nextBtnW = 26;
    const nextBtnX = startX - pad + gridW - nextBtnW - 4;
    const nextGfx = this.scene.add.graphics();
    nextGfx.fillStyle(canNext ? 0x222846 : 0x161a2d, 1);
    nextGfx.fillRoundedRect(nextBtnX, pagY + 2, nextBtnW, pagH - 4, 3);
    nextGfx.lineStyle(1, canNext ? 0x3d4975 : 0x222742, 1);
    nextGfx.strokeRoundedRect(nextBtnX, pagY + 2, nextBtnW, pagH - 4, 3);
    this.icons.add(nextGfx);

    const nextTxt = this.scene.add
      .text(nextBtnX + nextBtnW / 2, pagY + pagH / 2, '▶', {
        fontSize: '10px',
        fontFamily: FONT.sans,
        color: canNext ? '#00cec9' : '#454f6b',
      })
      .setOrigin(0.5);
    this.icons.add(nextTxt);

    if (canNext) {
      const nZone = this.scene.add
        .zone(nextBtnX + nextBtnW / 2, pagY + pagH / 2, nextBtnW, pagH - 4)
        .setInteractive({ useHandCursor: true });
      nZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        this.currentPage++;
        this.render();
      });
      this.icons.add(nZone);
    }

    const pagLabel = `${t('BAG_QTY')}: ${list.length}  ·  ${this.currentPage + 1}/${totalPages}`;
    const pagTxt = this.scene.add
      .text(startX - pad + gridW / 2, pagY + pagH / 2, pagLabel, {
        fontSize: '10.5px',
        fontFamily: FONT.mono,
        color: '#8ca0ba',
      })
      .setOrigin(0.5);
    this.icons.add(pagTxt);
  }

  /** Cột chi tiết bên phải hiển thị item được chọn và các nút hành động */
  private renderDetail(): void {
    const rx = 290;
    const ry = 38;
    const rw = 286;
    const rh = 306;

    this.gfx.fillStyle(0x131627, 0.98);
    this.gfx.fillRoundedRect(rx, ry, rw, rh, 6);
    this.gfx.lineStyle(1.5, 0x2a3254, 1);
    this.gfx.strokeRoundedRect(rx, ry, rw, rh, 6);

    const item = this.selected;
    if (!item) {
      const emptyIcon = this.scene.add.text(rx + rw / 2, ry + rh / 2 - 24, '🎒', {
        fontSize: '36px',
      }).setOrigin(0.5);
      this.detail.add(emptyIcon);

      const emptyKey = this.items.length === 0 ? 'BAG_EMPTY_POCKET' : 'BAG_SELECT_ITEM';
      const txt = mkText(this.scene, emptyKey, {
        fontSize: '11px',
        fontFamily: FONT.sans,
        color: '#6e7a9c',
        align: 'center',
        wordWrap: { width: rw - 36 },
      }, rx + rw / 2, ry + rh / 2 + 20).setOrigin(0.5);
      this.detail.add(txt);
      return;
    }

    // 1. Header chi tiết: Khung icon to
    const iconBoxSize = 44;
    const iconX = rx + 12;
    const iconY = ry + 12;
    this.gfx.fillStyle(0x1d233e, 1);
    this.gfx.fillRoundedRect(iconX, iconY, iconBoxSize, iconBoxSize, 6);
    this.gfx.lineStyle(1.5, 0x3d4975, 1);
    this.gfx.strokeRoundedRect(iconX, iconY, iconBoxSize, iconBoxSize, 6);

    if (item.iconUrl) {
      const iconKey = `item_icon_${item.itemId}`;
      const placeholderKey = `__MISSING:${item.itemId}`;
      const img = this.scene.add.image(iconX + iconBoxSize / 2, iconY + iconBoxSize / 2, this.scene.textures.exists(iconKey) ? iconKey : placeholderKey);
      img.setDisplaySize(32, 32);
      this.detail.add(img);

      if (!this.scene.textures.exists(iconKey)) {
        loadTextureImage(this.scene, iconKey, item.iconUrl).then((ok) => {
          if (ok && img.active) {
            img.setTexture(iconKey);
            img.setDisplaySize(32, 32);
          }
        });
      }
    }

    // Tên item
    const nameTxt = this.scene.add.text(rx + 64, ry + 12, item.name, {
      fontSize: '13px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#ffffff',
      wordWrap: { width: rw - 74 },
    });
    this.detail.add(nameTxt);

    // Số lượng & Giá trị
    const metaStr = `${t('BAG_QTY')}: ${item.quantity}  ·  $${(item.sellPrice || item.buyPrice || 0).toLocaleString()}`;
    const metaTxt = this.scene.add.text(rx + 64, ry + 34, metaStr, {
      fontSize: '10.5px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#fdcb6e',
    });
    this.detail.add(metaTxt);

    // Đường gạch ngang phân cách
    this.gfx.lineStyle(1, 0x252b47, 0.9);
    this.gfx.lineBetween(rx + 12, ry + 62, rx + rw - 12, ry + 62);

    // 2. Mô tả
    const desc = item.description || t('BAG_NO_DESC');
    const descTxt = this.scene.add.text(rx + 12, ry + 68, '', {
      fontSize: '10.5px',
      fontFamily: FONT.sans,
      color: '#a4b3d1',
      lineSpacing: 2.5,
      wordWrap: { width: rw - 24 },
    });
    descTxt.setText(desc.length > 110 ? `${desc.slice(0, 110)}…` : desc);
    this.detail.add(descTxt);

    // 3. Tóm tắt hiệu ứng
    const effSummary = this.getItemEffectSummary(item.itemId);
    let nextContentY = ry + 124;
    if (effSummary) {
      const effBoxH = 24;
      const effY = ry + 122;
      this.gfx.fillStyle(0x182436, 0.9);
      this.gfx.fillRoundedRect(rx + 12, effY, rw - 24, effBoxH, 4);
      this.gfx.lineStyle(1, 0x26495c, 0.8);
      this.gfx.strokeRoundedRect(rx + 12, effY, rw - 24, effBoxH, 4);

      const effIcon = this.scene.add.text(rx + 18, effY + effBoxH / 2, '⚡', {
        fontSize: '11px',
      }).setOrigin(0, 0.5);
      this.detail.add(effIcon);

      const effTxt = this.scene.add.text(rx + 34, effY + effBoxH / 2, effSummary, {
        fontSize: '10px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#00cec9',
      }).setOrigin(0, 0.5);
      this.detail.add(effTxt);

      nextContentY = effY + effBoxH + 8;
    }

    // 4. Chọn Pokémon mục tiêu (nếu item dùng được ngoài trận)
    const needTarget = this.isUsableOutsideBattle(item.itemId);
    let actionY: number;

    if (needTarget) {
      const targetCardY = nextContentY;
      const targetCardH = 48;
      this.gfx.fillStyle(0x161a2f, 0.95);
      this.gfx.fillRoundedRect(rx + 12, targetCardY, rw - 24, targetCardH, 4);
      this.gfx.lineStyle(1.5, this.selectedPokemon ? 0x00cec9 : 0x2d365a, 0.9);
      this.gfx.strokeRoundedRect(rx + 12, targetCardY, rw - 24, targetCardH, 4);

      const lbl = mkText(this.scene, 'BAG_TARGET', {
        fontSize: '9.5px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#00cec9',
      }, rx + 18, targetCardY + 6);
      this.detail.add(lbl);

      if (this.selectedPokemon) {
        const pkmIconKey = `pkm_icon_${this.selectedPokemon.species_id}`;
        const pkmIconUrl = `/assets/icons/pokemon/${this.selectedPokemon.species_id}.png`;
        const pImg = this.scene.add.image(rx + 28, targetCardY + 30, this.scene.textures.exists(pkmIconKey) ? pkmIconKey : `__MISSING:${this.selectedPokemon.species_id}`);
        pImg.setDisplaySize(24, 24);
        this.detail.add(pImg);

        if (!this.scene.textures.exists(pkmIconKey)) {
          loadTextureImage(this.scene, pkmIconKey, pkmIconUrl).then((ok) => {
            if (ok && pImg.active) {
              pImg.setTexture(pkmIconKey);
              pImg.setDisplaySize(24, 24);
            }
          });
        }

        const nameStr = `${this.selectedPokemon.nickname || this.selectedPokemon.species_id} Lv.${this.selectedPokemon.level}`;
        const selTxt = this.scene.add.text(rx + 46, targetCardY + 22, nameStr, {
          fontSize: '10px',
          fontFamily: FONT.sans,
          fontStyle: 'bold',
          color: '#ffffff',
        });
        this.detail.add(selTxt);

        const curHp = this.selectedPokemon.current_hp ?? 0;
        const maxHp = this.selectedPokemon.stats?.hp ?? 10;
        const ratio = Phaser.Math.Clamp(curHp / maxHp, 0, 1);
        const hpColor = ratio > 0.5 ? 0x00b894 : ratio > 0.2 ? 0xfdcb6e : 0xff7675;
        this.gfx.fillStyle(0x0c0f1c, 1);
        this.gfx.fillRoundedRect(rx + 46, targetCardY + 36, 75, 4, 1);
        if (ratio > 0) {
          this.gfx.fillStyle(hpColor, 1);
          this.gfx.fillRoundedRect(rx + 46, targetCardY + 36, Math.max(3, Math.round(75 * ratio)), 4, 1);
        }

        const hpTxt = this.scene.add.text(rx + 126, targetCardY + 38, `${curHp}/${maxHp}`, {
          fontSize: '8.5px',
          fontFamily: FONT.mono,
          color: '#8c98ba',
        }).setOrigin(0, 0.5);
        this.detail.add(hpTxt);
      } else {
        const noTargetTxt = this.scene.add.text(
          rx + 18,
          targetCardY + 24,
          t('BAG_NO_TARGET'),
          { fontSize: '10px', fontFamily: FONT.sans, color: '#63708e' },
        );
        this.detail.add(noTargetTxt);
      }

      // Nút mở PartySelectModal (CHỌN POKÉMON)
      const pickW = 72;
      const pickH = 24;
      const pickX = rx + rw - 12 - pickW - 6;
      const pickY = targetCardY + 12;
      const pickG = this.scene.add.graphics();
      const drawPickBtn = (hover = false) => {
        pickG.clear();
        pickG.fillStyle(hover ? 0x223c4a : 0x1b2c3a, 1);
        pickG.fillRoundedRect(pickX, pickY, pickW, pickH, 4);
        pickG.lineStyle(1.5, hover ? 0x00cec9 : 0x17b3af, 1);
        pickG.strokeRoundedRect(pickX, pickY, pickW, pickH, 4);
      };
      drawPickBtn(false);
      this.detail.add(pickG);

      const pickTxt = mkText(this.scene, 'BAG_PICK', {
        fontSize: '8.5px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: '#00cec9',
      }, pickX + pickW / 2, pickY + pickH / 2).setOrigin(0.5);
      this.detail.add(pickTxt);

      const pickZone = this.scene.add
        .zone(pickX + pickW / 2, pickY + pickH / 2, pickW, pickH)
        .setInteractive({ useHandCursor: true });
      pickZone.on('pointerover', () => {
        drawPickBtn(true);
        pickTxt.setColor('#ffffff');
      });
      pickZone.on('pointerout', () => {
        drawPickBtn(false);
        pickTxt.setColor('#00cec9');
      });
      pickZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event?.stopPropagation();
        this.openPartySelect(item, 'pick');
      });
      this.detail.add(pickZone);

      actionY = targetCardY + targetCardH + 10;
    } else {
      actionY = nextContentY + 8;
    }

    // 5. Hai nút hành động: SỬ DỤNG (USE) & CẦM (HOLD)
    const btnW = rw - 24;
    const btnH = 28;

    const mkActionBtn = (
      label: string,
      color: number,
      hoverBg: number,
      enabled: boolean,
      y: number,
      cb: () => void,
    ) => {
      const g = this.scene.add.graphics();
      const drawAction = (hover = false) => {
        g.clear();
        g.fillStyle(hover && enabled ? hoverBg : enabled ? 0x1c223c : 0x141727, 1);
        g.fillRoundedRect(rx + 12, y, btnW, btnH, 4);
        g.lineStyle(1.5, enabled ? (hover ? color : 0x3d4975) : 0x242a42, enabled ? 1 : 0.5);
        g.strokeRoundedRect(rx + 12, y, btnW, btnH, 4);
      };
      drawAction(false);
      this.detail.add(g);

      const colorHex = `#${color.toString(16).padStart(6, '0')}`;
      const txt = this.scene.add
        .text(rx + 12 + btnW / 2, y + btnH / 2, label, {
          fontSize: '11px',
          fontFamily: FONT.sans,
          fontStyle: 'bold',
          color: enabled ? colorHex : '#4e5875',
        })
        .setOrigin(0.5);
      this.detail.add(txt);

      if (enabled) {
        const zone = this.scene.add
          .zone(rx + 12 + btnW / 2, y + btnH / 2, btnW, btnH)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => {
          drawAction(true);
          txt.setColor('#ffffff');
        });
        zone.on('pointerout', () => {
          drawAction(false);
          txt.setColor(colorHex);
        });
        zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
          ptr.event?.stopPropagation();
          cb();
        });
        this.detail.add(zone);
      }
    };

    // Nút SỬ DỤNG (USE)
    mkActionBtn(t('BAG_BTN_USE'), 0x00cec9, 0x183742, true, actionY, () => {
      if (!this.onUse) return;
      if (!needTarget) {
        this.onUse(item.itemId, '');
        return;
      }
      this.openPartySelect(item, 'use');
    });

    // Nút CẦM (ĐEO) (HOLD)
    mkActionBtn(t('BAG_BTN_HOLD'), 0xfdcb6e, 0x3a3321, Boolean(this.onHold), actionY + btnH + 6, () => {
      if (!this.onHold) return;
      this.openPartySelect(item, 'hold');
    });
  }

  /** Mở PartySelectModal để chọn Pokémon mục tiêu cho item này. */
  private openPartySelect(item: InventoryItem, action: 'use' | 'hold' | 'pick'): void {
    if (!this.onPickTarget) return;

    const effect = resolveItemEffect(item.itemId);
    // Nếu là item hồi sinh (revive) -> không filter alive để chọn được Pokémon đã ngất
    // Các item hồi máu, chữa trạng thái, buff, evo stone... -> chỉ chọn Pokémon còn sống
    const filterAlive = action === 'hold' ? false : effect?.kind === 'revive' ? false : true;

    const hint =
      action === 'hold'
        ? t('PARTY_SELECT_HOLD')
        : action === 'use'
        ? t('PARTY_SELECT_USE')
        : t('PARTY_SELECT_HINT');

    this.onPickTarget({
      title: t('PARTY_SELECT_TITLE'),
      hint,
      filterAlive,
      onSelect: (pokemon) => {
        this.selectedPokemon = pokemon;
        this.render();
        if (action === 'use') {
          this.onUse?.(item.itemId, pokemon.id);
        } else if (action === 'hold') {
          this.onHold?.(item.itemId, pokemon.id);
        }
      },
    });
  }

  /** Tóm tắt hiệu ứng gameplay của vật phẩm */
  private getItemEffectSummary(itemId: string): string {
    const e = resolveItemEffect(itemId);
    if (!e) return '';
    const isVi = getLang() === 'vi';
    switch (e.kind) {
      case 'catch_ball':
        if (e.rate >= 255) return isVi ? 'Bắt 100% (Master)' : '100% Catch Rate';
        return isVi ? `Tỉ lệ bắt ×${e.rate}` : `Catch Rate ×${e.rate}`;
      case 'heal':
        if (e.hp === Infinity) return isVi ? 'Hồi đầy HP' : 'Restores full HP';
        return isVi ? `Hồi +${e.hp} HP` : `Restores +${e.hp} HP`;
      case 'revive':
        if (e.pct >= 1) return isVi ? 'Hồi sinh đầy HP' : 'Revives with 100% HP';
        return isVi ? `Hồi sinh ${Math.round(e.pct * 100)}% HP` : `Revives with ${Math.round(e.pct * 100)}% HP`;
      case 'revive_all':
        return isVi ? 'Hồi sinh toàn bộ Pokémon ngất (đầy HP)' : 'Revives all fainted party members (full HP)';
      case 'cure_status': {
        const statuses = e.status.map((s) => {
          if (s === 'poison' || s === 'badly_poisoned') return isVi ? 'Độc' : 'Poison';
          if (s === 'paralysis') return isVi ? 'Tê liệt' : 'Paralysis';
          if (s === 'sleep') return isVi ? 'Ngủ' : 'Sleep';
          if (s === 'freeze') return isVi ? 'Đóng băng' : 'Freeze';
          if (s === 'burn') return isVi ? 'Bỏng' : 'Burn';
          return s;
        });
        const uniq = Array.from(new Set(statuses));
        if (uniq.length >= 4) return isVi ? 'Chữa mọi trạng thái' : 'Cures all statuses';
        return isVi ? `Chữa: ${uniq.join(', ')}` : `Cures: ${uniq.join(', ')}`;
      }
      case 'buff':
        return isVi ? `Tăng ${e.stat.toUpperCase()} (+${e.stages})` : `Boosts ${e.stat.toUpperCase()} (+${e.stages})`;
      case 'evo_stone':
        return isVi ? 'Đá tiến hoá' : 'Evolution Stone';
      case 'level_up':
        return isVi ? `Tăng +${e.levels} Cấp` : `Levels up +${e.levels}`;
      case 'exp_boost':
        return isVi ? `Tăng EXP ×${e.mult}` : `EXP Boost ×${e.mult}`;
      default:
        return '';
    }
  }

  /** Item này có cần chọn Pokémon mục tiêu khi dùng ngoài battle không. */
  private isUsableOutsideBattle(itemId: string): boolean {
    const e = resolveItemEffect(itemId);
    if (!e) return false;
    // Ball + buff chỉ dùng trong battle → không cần target ở đây.
    if (e.kind === 'catch_ball' || e.kind === 'buff') return false;
    if (e.kind === 'exp_boost') return false;
    // Sacred Ash hồi sinh cả đội → không cần chọn 1 Pokémon mục tiêu.
    if (e.kind === 'revive_all') return false;
    return isUsableItem(itemId);
  }
}