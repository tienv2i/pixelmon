import Phaser from 'phaser';
import { FONT } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange } from '../i18n';
import { ColyseusManager, type InventoryItem } from '../network/ColyseusManager';

const MODAL_W = 560;
const MODAL_H = 400;
const COLS = 5;
const ROWS = 5;
const SLOT = 44;
const GAP = 6;
const GRID_X = 18;
const GRID_Y = 42;

/**
 * **StoreModal** — Cửa hàng mua/bán (Plan 45 §2.3).
 * - Tab Mua: danh sách `GET /api/inventory/store` (đã enrich giá/tên/icon).
 * - Tab Bán: túi đồ của người chơi với giá `sellPrice`.
 * - Server xác nhận qua `store_action` → `bag_update` + money sync.
 */
export class StoreModal extends UiModal {
  private items: InventoryItem[] = [];
  private storeStock: InventoryItem[] = [];
  private selected: InventoryItem | null = null;
  private tab: 'buy' | 'sell' = 'buy';
  private qty = 1;
  private money = 0;

  private gfx!: Phaser.GameObjects.Graphics;
  private icons!: Phaser.GameObjects.Container;
  private detail!: Phaser.GameObjects.Container;
  private unsubLang?: () => void;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    super(scene, {
      title: t('STORE_TITLE'),
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
      depth: 235,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      padding: { top: 6, right: 10, bottom: 10, left: 10 },
      onClose: () => onClose?.(),
    });

    this.gfx = scene.add.graphics();
    this.icons = scene.add.container(0, 0);
    this.detail = scene.add.container(0, 0);
    this.contentContainer.add(this.gfx);
    this.contentContainer.add(this.icons);
    this.contentContainer.add(this.detail);

    this.close();
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('STORE_TITLE'));
      this.render();
    });
  }

  public override destroy(): void {
    this.unsubLang?.();
    super.destroy();
  }

  public override show(): void {
    super.show();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    // Hàng bán lấy 1 lần từ server (đã enrich name/price/icon) — cache static.
    if (this.storeStock.length === 0) {
      this.storeStock = await ColyseusManager.getInstance().fetchStoreStock();
    }
    this.items = await ColyseusManager.getInstance().fetchInventory();
    this.money = await ColyseusManager.getInstance().fetchMoney();
    this.render();
  }

  /** Danh sách mua — `GET /api/inventory/store` (đã enrich từ server). */
  private buyList(): InventoryItem[] {
    return this.storeStock;
  }

  private currentList(): InventoryItem[] {
    return this.tab === 'buy' ? this.buyList() : this.items;
  }

  private render(): void {
    this.gfx.clear();
    this.icons.removeAll(true);
    this.detail.removeAll(true);

    this.renderTabs();
    this.renderGrid();
    this.renderDetail();
  }

  private renderTabs(): void {
    const tabs: Array<{ id: 'buy' | 'sell'; label: string }> = [
      { id: 'buy', label: t('STORE_TAB_BUY') },
      { id: 'sell', label: t('STORE_TAB_SELL') },
    ];
    tabs.forEach((tb, i) => {
      const tx = 14 + i * 70;
      const isActive = tb.id === this.tab;
      this.gfx.fillStyle(isActive ? 0x2e355b : 0x1d213a, 1);
      this.gfx.fillRoundedRect(tx, 6, 66, 24, 4);
      this.gfx.lineStyle(1.5, isActive ? 0x00cec9 : 0x2e355b, 1);
      this.gfx.strokeRoundedRect(tx, 6, 66, 24, 4);
      const txt = this.scene.add
        .text(tx + 33, 18, tb.label, {
          fontSize: '11px',
          fontFamily: FONT.sans,
          fontStyle: 'bold',
          color: isActive ? '#00cec9' : '#8c94b8',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      txt.on('pointerdown', () => {
        this.tab = tb.id;
        this.selected = null;
        this.render();
      });
      this.icons.add(txt);
    });

    // Ví tiền
    const moneyTxt = this.scene.add
      .text(MODAL_W - 20, 18, `${t('STORE_MONEY')}: $${this.money.toLocaleString()}`, {
        fontSize: '11px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: '#fdcb6e',
      })
      .setOrigin(1, 0.5);
    this.icons.add(moneyTxt);
  }

  private renderGrid(): void {
    const list = this.currentList();
    const startX = GRID_X;
    const startY = GRID_Y;
    const pad = 8;
    const gridW = COLS * (SLOT + GAP) - GAP + pad * 2;
    const gridH = ROWS * (SLOT + GAP) - GAP + pad * 2;

    this.gfx.fillStyle(0x181a2e, 1);
    this.gfx.fillRoundedRect(startX - pad, startY - pad, gridW, gridH, 6);
    this.gfx.lineStyle(1.5, 0x2e355b, 1);
    this.gfx.strokeRoundedRect(startX - pad, startY - pad, gridW, gridH, 6);

    if (list.length === 0) {
      const txt = mkText(this.scene, 'STORE_EMPTY', {
        fontSize: '12px',
        fontFamily: FONT.sans,
        color: '#718096',
        align: 'center',
      }, startX - pad + gridW / 2, startY - pad + gridH / 2).setOrigin(0.5);
      this.icons.add(txt);
      return;
    }

    for (let idx = 0; idx < COLS * ROWS; idx++) {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = startX + col * (SLOT + GAP);
      const y = startY + row * (SLOT + GAP);
      const item = list[idx];

      const isSel = item && this.selected?.itemId === item.itemId;
      this.gfx.fillStyle(isSel ? 0x2d3766 : item ? 0x222646 : 0x1b1e36, 1);
      this.gfx.fillRoundedRect(x, y, SLOT, SLOT, 4);
      this.gfx.lineStyle(1.5, isSel ? 0x00cec9 : item ? 0x3d4475 : 0x262a4a, 1);
      this.gfx.strokeRoundedRect(x, y, SLOT, SLOT, 4);

      if (!item) continue;

      if (item.iconUrl) {
        const img = this.scene.add.image(x + SLOT / 2, y + SLOT / 2 - 4, `__MISSING:${item.itemId}`);
        img.setDisplaySize(28, 28);
        this.icons.add(img);
        const key = `item_icon_${item.itemId}`;
        if (this.scene.textures.exists(key)) {
          img.setTexture(key);
        } else {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => {
            if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, el);
            if (img.active) {
              img.setTexture(key);
              img.setDisplaySize(28, 28);
            }
          };
          el.src = item.iconUrl;
        }
      }

      const price = this.tab === 'buy' ? item.buyPrice : item.sellPrice;
      const priceTxt = this.scene.add
        .text(x + SLOT - 3, y + SLOT - 3, `$${price}`, {
          fontSize: '9px',
          fontFamily: FONT.mono,
          fontStyle: 'bold',
          color: '#fdcb6e',
        })
        .setOrigin(1, 1);
      this.icons.add(priceTxt);

      const zone = this.scene.add.zone(x + SLOT / 2, y + SLOT / 2, SLOT, SLOT).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        this.selected = item;
        this.render();
      });
      this.icons.add(zone);
    }
  }

  private renderDetail(): void {
    const rx = 282;
    const ry = 34;
    const rw = 248;
    const rh = 294;

    this.gfx.fillStyle(0x181a2e, 1);
    this.gfx.fillRoundedRect(rx, ry, rw, rh, 6);
    this.gfx.lineStyle(1.5, 0x2e355b, 1);
    this.gfx.strokeRoundedRect(rx, ry, rw, rh, 6);

    const item = this.selected;
    if (!item) {
      const emptyIcon = this.scene.add.text(rx + rw / 2, ry + rh / 2 - 20, '🏪', {
        fontSize: '32px',
      }).setOrigin(0.5);
      this.detail.add(emptyIcon);

      const txt = mkText(this.scene, 'STORE_ITEM_EMPTY', {
        fontSize: '11px',
        fontFamily: FONT.sans,
        color: '#718096',
        align: 'center',
      }, rx + rw / 2, ry + rh / 2 + 16).setOrigin(0.5);
      this.detail.add(txt);
      return;
    }

    // Khung icon item
    const iconBoxSize = 44;
    const iconX = rx + 12;
    const iconY = ry + 12;
    this.gfx.fillStyle(0x272b49, 1);
    this.gfx.fillRoundedRect(iconX, iconY, iconBoxSize, iconBoxSize, 4);
    this.gfx.lineStyle(1, 0x3d4475, 1);
    this.gfx.strokeRoundedRect(iconX, iconY, iconBoxSize, iconBoxSize, 4);

    if (item.iconUrl) {
      const img = this.scene.add.image(iconX + iconBoxSize / 2, iconY + iconBoxSize / 2, `__MISSING:${item.itemId}`);
      img.setDisplaySize(32, 32);
      this.detail.add(img);
      const key = `item_icon_${item.itemId}`;
      if (this.scene.textures.exists(key)) {
        img.setTexture(key);
      } else {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => {
          if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, el);
          if (img.active) {
            img.setTexture(key);
            img.setDisplaySize(32, 32);
          }
        };
        el.src = item.iconUrl;
      }
    }

    const nameTxt = this.scene.add.text(rx + 62, ry + 12, item.name, {
      fontSize: '13px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#ffffff',
      wordWrap: { width: rw - 74 },
    });
    this.detail.add(nameTxt);

    const price = this.tab === 'buy' ? item.buyPrice : item.sellPrice;
    const priceTxt = this.scene.add.text(
      rx + 62,
      ry + 32,
      `${t('BAG_PRICE')}: $${price}`,
      { fontSize: '11px', fontFamily: FONT.mono, color: '#fdcb6e' },
    );
    this.detail.add(priceTxt);

    // Đường gạch ngang
    this.gfx.lineStyle(1, 0x2e355b, 0.8);
    this.gfx.lineBetween(rx + 12, ry + 62, rx + rw - 12, ry + 62);

    // Mô tả item
    const desc = item.description ?? t('BAG_NO_DESC');
    const descTxt = this.scene.add.text(rx + 12, ry + 70, '', {
      fontSize: '11px',
      fontFamily: FONT.sans,
      color: '#a0aec0',
      lineSpacing: 3,
      wordWrap: { width: rw - 24 },
    });
    descTxt.setText(desc.length > 130 ? `${desc.slice(0, 130)}…` : desc);
    this.detail.add(descTxt);

    // Thẻ chọn số lượng & Tổng tiền
    const cardY = ry + 130;
    const cardH = 68;
    this.gfx.fillStyle(0x141629, 0.95);
    this.gfx.fillRoundedRect(rx + 12, cardY, rw - 24, cardH, 4);
    this.gfx.lineStyle(1, 0x2e355b, 0.9);
    this.gfx.strokeRoundedRect(rx + 12, cardY, rw - 24, cardH, 4);

    // Hàng 1: Tổng tiền
    const totalTxt = this.scene.add.text(
      rx + 20,
      cardY + 8,
      `${t('STORE_TOTAL')}: $${(price * this.qty).toLocaleString()}`,
      { fontSize: '12px', fontFamily: FONT.mono, fontStyle: 'bold', color: '#fdcb6e' },
    );
    this.detail.add(totalTxt);

    // Hàng 2: Stepper controls: [ -10 ] [ - ]  Qty  [ + ] [ +10 ]
    const btnRowY = cardY + 32;
    const mkSmall = (label: string, bx: number, bw: number, cb: () => void) => {
      const g = this.scene.add.graphics();
      g.fillStyle(0x272b49, 1);
      g.fillRoundedRect(bx, btnRowY, bw, 24, 4);
      g.lineStyle(1, 0x00cec9, 0.8);
      g.strokeRoundedRect(bx, btnRowY, bw, 24, 4);
      this.detail.add(g);
      const txt = this.scene.add
        .text(bx + bw / 2, btnRowY + 12, label, {
          fontSize: '11px',
          fontFamily: FONT.sans,
          fontStyle: 'bold',
          color: '#00cec9',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      txt.on('pointerdown', cb);
      this.detail.add(txt);
    };

    // Nút -10
    mkSmall('-10', rx + 20, 30, () => {
      this.qty = Math.max(1, this.qty - 10);
      this.render();
    });
    // Nút -
    mkSmall('−', rx + 54, 24, () => {
      this.qty = Math.max(1, this.qty - 1);
      this.render();
    });

    // Số lượng hiển thị
    const qtyTxt = this.scene.add.text(rx + 104, btnRowY + 12, `${this.qty}`, {
      fontSize: '12px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.detail.add(qtyTxt);

    // Nút +
    mkSmall('+', rx + 130, 24, () => {
      this.qty = Math.min(99, this.qty + 1);
      this.render();
    });
    // Nút +10
    mkSmall('+10', rx + 158, 30, () => {
      this.qty = Math.min(99, this.qty + 10);
      this.render();
    });

    // Nút xác nhận hành động MUA / BÁN
    const btnW = rw - 24;
    const btnH = 34;
    const btnY = cardY + cardH + 16;
    const isBuy = this.tab === 'buy';
    const mainColor = isBuy ? 0x00cec9 : 0xfdcb6e;

    const g = this.scene.add.graphics();
    g.fillStyle(0x272b49, 1);
    g.fillRoundedRect(rx + 12, btnY, btnW, btnH, 4);
    g.lineStyle(1.5, mainColor, 0.9);
    g.strokeRoundedRect(rx + 12, btnY, btnW, btnH, 4);
    this.detail.add(g);

    const label = isBuy
      ? t('STORE_BUY').replace('{n}', String(this.qty))
      : t('STORE_SELL').replace('{n}', String(this.qty));
    const btnTxt = this.scene.add
      .text(rx + 12 + btnW / 2, btnY + btnH / 2, label, {
        fontSize: '12px',
        fontFamily: FONT.sans,
        fontStyle: 'bold',
        color: `#${mainColor.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btnTxt.on('pointerdown', () => {
      const net = ColyseusManager.getInstance();
      net.sendStoreAction(this.tab, item.itemId, this.qty);
      this.close();
    });
    this.detail.add(btnTxt);
  }
}