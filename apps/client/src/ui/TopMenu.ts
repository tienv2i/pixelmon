import Phaser from 'phaser';
import { C, FONT } from './theme';
import type { UiZoomManager } from './UiZoomManager';
import type { HudMode } from './HudManager';
import { SelectToolsModal } from './SelectToolsModal';
import { t, type I18nKey } from '../i18n';

/**
 * Định nghĩa 1 icon trên toolbar.
 * - `label` là getter động: luôn trả về chuỗi theo ngôn ngữ hiện tại
 *   → đảm bảo chỉ hiển thị 1 trong 2 ngôn ngữ.
 */
export interface MenuIconDef {
  key: string;
  readonly label: string;
}

/** Key i18n của từng icon — nguồn dịch duy nhất cho nhãn toolbar. */
const MENU_LABEL_KEYS = {
  pokedex: 'MENU_POKEDEX',
  bag: 'MENU_BAG',
  team: 'MENU_TEAM',
  pc: 'MENU_PC',
  map: 'MENU_MAP',
  gps: 'MENU_GPS',
  debug: 'MENU_DEBUG',
  settings: 'MENU_SETTINGS',
  help: 'MENU_HELP',
  logout: 'MENU_LOGOUT',
} as const satisfies Record<string, I18nKey>;

export type MenuIconKey = keyof typeof MENU_LABEL_KEYS;

/** Nhãn hiển thị của icon theo ngôn ngữ hiện tại. */
export function menuIconLabel(key: string): string {
  const k = (MENU_LABEL_KEYS as Record<string, I18nKey>)[key];
  return k ? t(k) : key;
}

const ICONS: Array<MenuIconDef & { i18nKey: I18nKey }> = (
  [
    { key: 'pokedex', i18nKey: 'MENU_POKEDEX' },
    { key: 'bag', i18nKey: 'MENU_BAG' },
    { key: 'team', i18nKey: 'MENU_TEAM' },
    { key: 'pc', i18nKey: 'MENU_PC' },
    { key: 'map', i18nKey: 'MENU_MAP' },
    { key: 'gps', i18nKey: 'MENU_GPS' },
    { key: 'debug', i18nKey: 'MENU_DEBUG' },
    { key: 'settings', i18nKey: 'MENU_SETTINGS' },
    { key: 'help', i18nKey: 'MENU_HELP' },
    { key: 'logout', i18nKey: 'MENU_LOGOUT' },
  ] as Array<{ key: string; i18nKey: I18nKey }>
).map((d) => ({
  key: d.key,
  i18nKey: d.i18nKey,
  get label(): string {
    return t(d.i18nKey);
  },
}));

/**
 * Vẽ biểu tượng Pixel Art sắc nét cho từng nút chức năng trên Toolbar:
 * Sử dụng lưới toạ độ chuẩn hoá để scale theo kích thước nút mà không bị mờ.
 */
function drawPixelIcon(
  gfx: Phaser.GameObjects.Graphics,
  key: string,
  cx: number,
  cy: number,
  size: number,
): void {
  const p = Math.max(1.5, Math.floor(size / 14)); // pixel unit size

  switch (key) {
    case 'pokedex': {
      // Cuốn Pokédex đỏ viền tối, đèn cyan tròn góc trên
      gfx.fillStyle(0xd63031, 1);
      gfx.fillRect(cx - 5 * p, cy - 6 * p, 10 * p, 12 * p);
      gfx.fillStyle(0x2d3436, 1);
      gfx.fillRect(cx - 6 * p, cy - 6 * p, 2 * p, 12 * p); // gáy
      gfx.fillStyle(0x00cec9, 1);
      gfx.fillRect(cx - 3 * p, cy - 4 * p, 3 * p, 3 * p); // đèn sensor
      gfx.fillStyle(0xffffff, 0.9);
      gfx.fillRect(cx - 3 * p, cy + 1 * p, 6 * p, 3 * p); // màn hình hiển thị
      break;
    }
    case 'bag': {
      // Ba lô phiêu lưu màu cam/vàng, quai đeo nâu
      gfx.fillStyle(0xe67e22, 1);
      gfx.fillRect(cx - 5 * p, cy - 3 * p, 10 * p, 9 * p);
      gfx.fillStyle(0xf1c40f, 1);
      gfx.fillRect(cx - 5 * p, cy - 6 * p, 10 * p, 4 * p); // nắp ba lô
      gfx.fillStyle(0xd35400, 1);
      gfx.fillRect(cx - 2 * p, cy - 2 * p, 4 * p, 4 * p); // túi trước
      gfx.fillStyle(0xecf0f1, 1);
      gfx.fillRect(cx - 1 * p, cy - 4 * p, 2 * p, 2 * p); // khóa bạc
      break;
    }
    case 'team': {
      // Biểu tượng Pokéball pixel art kinh điển
      const r = 5 * p;
      // Nửa trên đỏ
      gfx.fillStyle(0xe74c3c, 1);
      gfx.fillRect(cx - r, cy - r, r * 2, r);
      // Nửa dưới trắng
      gfx.fillStyle(0xf5f6fa, 1);
      gfx.fillRect(cx - r, cy, r * 2, r);
      // Viền & dải ngang đen
      gfx.fillStyle(0x2f3640, 1);
      gfx.fillRect(cx - r, cy - 1 * p, r * 2, 2 * p);
      // Nút tròn tâm
      gfx.fillStyle(0x2f3640, 1);
      gfx.fillRect(cx - 2 * p, cy - 2 * p, 4 * p, 4 * p);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(cx - 1 * p, cy - 1 * p, 2 * p, 2 * p);
      break;
    }
    case 'pc': {
      // Màn hình máy tính PC retro màu kem xám, màn hình cyan
      gfx.fillStyle(0xdfe6e9, 1);
      gfx.fillRect(cx - 5 * p, cy - 6 * p, 10 * p, 8 * p); // viền màn hình
      gfx.fillStyle(0x00cec9, 1);
      gfx.fillRect(cx - 4 * p, cy - 5 * p, 8 * p, 6 * p); // màn hình hiển thị
      gfx.fillStyle(0xffffff, 0.8);
      gfx.fillRect(cx - 3 * p, cy - 4 * p, 2 * p, 2 * p); // ánh sáng phản chiếu
      // Chân đế máy tính
      gfx.fillStyle(0xb2bec3, 1);
      gfx.fillRect(cx - 1 * p, cy + 2 * p, 2 * p, 2 * p); // trụ
      gfx.fillRect(cx - 4 * p, cy + 4 * p, 8 * p, 2 * p); // đế
      break;
    }
    case 'map': {
      // Tấm bản đồ cuộn màu ngà viền nâu với nét gấp khúc
      gfx.fillStyle(0xf5f6fa, 1);
      gfx.fillRect(cx - 6 * p, cy - 5 * p, 12 * p, 10 * p);
      gfx.fillStyle(0x7f8c8d, 1);
      gfx.fillRect(cx - 6 * p, cy - 6 * p, 12 * p, 2 * p);
      gfx.fillRect(cx - 6 * p, cy + 4 * p, 12 * p, 2 * p);
      // Đường nét & điểm X đỏ
      gfx.fillStyle(0x00cec9, 1);
      gfx.fillRect(cx - 3 * p, cy - 2 * p, 4 * p, 1 * p);
      gfx.fillRect(cx + 1 * p, cy - 1 * p, 1 * p, 3 * p);
      gfx.fillStyle(0xe74c3c, 1);
      gfx.fillRect(cx + 2 * p, cy + 1 * p, 2 * p, 2 * p); // dấu X
      break;
    }
    case 'gps': {
      // Biểu tượng ghim vị trí (Pin marker)
      gfx.fillStyle(0xe74c3c, 1);
      gfx.fillRect(cx - 4 * p, cy - 6 * p, 8 * p, 6 * p);
      gfx.fillRect(cx - 3 * p, cy, 6 * p, 3 * p);
      gfx.fillRect(cx - 1 * p, cy + 3 * p, 2 * p, 3 * p); // đầu nhọn
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(cx - 2 * p, cy - 4 * p, 4 * p, 3 * p); // tâm trắng
      break;
    }
    case 'settings': {
      // Bánh răng pixel 8 cánh
      gfx.fillStyle(0x00cec9, 1);
      // Khối giữa
      gfx.fillRect(cx - 4 * p, cy - 4 * p, 8 * p, 8 * p);
      // 4 vấu răng vuông
      gfx.fillRect(cx - 2 * p, cy - 6 * p, 4 * p, 2 * p); // trên
      gfx.fillRect(cx - 2 * p, cy + 4 * p, 4 * p, 2 * p); // dưới
      gfx.fillRect(cx - 6 * p, cy - 2 * p, 2 * p, 4 * p); // trái
      gfx.fillRect(cx + 4 * p, cy - 2 * p, 2 * p, 4 * p); // phải
      // Tâm rỗng
      gfx.fillStyle(0x13152c, 1);
      gfx.fillRect(cx - 2 * p, cy - 2 * p, 4 * p, 4 * p);
      break;
    }
    case 'help': {
      // Dấu hỏi pixel retro vàng
      gfx.fillStyle(0xfdcb6e, 1);
      gfx.fillRect(cx - 3 * p, cy - 5 * p, 6 * p, 2 * p);
      gfx.fillRect(cx + 1 * p, cy - 3 * p, 2 * p, 3 * p);
      gfx.fillRect(cx - 1 * p, cy, 2 * p, 2 * p);
      gfx.fillRect(cx - 1 * p, cy + 3 * p, 2 * p, 2 * p); // chấm dưới
      break;
    }
    case 'debug': {
      // Biểu tượng Bug / Terminal pixel: chip/bọ vi mạch màu xanh mint + anten đỏ
      gfx.fillStyle(0x00b894, 1);
      gfx.fillRect(cx - 3 * p, cy - 3 * p, 6 * p, 7 * p); // thân chip
      gfx.fillStyle(0x55efc4, 1);
      gfx.fillRect(cx - 2 * p, cy - 5 * p, 4 * p, 2 * p); // đầu
      gfx.fillStyle(0xff7675, 1);
      gfx.fillRect(cx - 3 * p, cy - 7 * p, 1 * p, 2 * p); // anten trái
      gfx.fillRect(cx + 2 * p, cy - 7 * p, 1 * p, 2 * p); // anten phải
      // Chân chip vi mạch
      gfx.fillStyle(0x00cec9, 1);
      gfx.fillRect(cx - 5 * p, cy - 2 * p, 2 * p, 1 * p);
      gfx.fillRect(cx + 3 * p, cy - 2 * p, 2 * p, 1 * p);
      gfx.fillRect(cx - 5 * p, cy + 2 * p, 2 * p, 1 * p);
      gfx.fillRect(cx + 3 * p, cy + 2 * p, 2 * p, 1 * p);
      break;
    }
    case 'logout': {
      // Cánh cửa mở màu xanh tím + mũi tên thoát pixel đỏ
      gfx.fillStyle(0x6c5ce7, 1);
      gfx.fillRect(cx - 5 * p, cy - 5 * p, 6 * p, 10 * p); // cửa
      gfx.fillStyle(0x00cec9, 1);
      gfx.fillRect(cx - 4 * p, cy, 2 * p, 2 * p); // tay nắm
      // Mũi tên chỉ ra ngoài
      gfx.fillStyle(0xff7675, 1);
      gfx.fillRect(cx + 1 * p, cy - 1 * p, 4 * p, 2 * p);
      gfx.fillRect(cx + 3 * p, cy - 3 * p, 2 * p, 2 * p);
      gfx.fillRect(cx + 3 * p, cy + 1 * p, 2 * p, 2 * p);
      break;
    }
    default: {
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(cx - 3 * p, cy - 3 * p, 6 * p, 6 * p);
      break;
    }
  }
}

class IconButton {
  readonly gfx: Phaser.GameObjects.Graphics;
  readonly zone: Phaser.GameObjects.Zone;
  private hover = false;
  private active = false;
  private currentX = 0;
  private currentY = 0;
  private currentSize = 28;
  private currentVisible = true;
  /** Key i18n của nhãn hover (nếu có) — tự cập nhật khi đổi ngôn ngữ. */

  get key(): string {
    return this.def.key;
  }

  get visible(): boolean {
    return this.currentVisible;
  }

  constructor(
    scene: Phaser.Scene,
    private def: MenuIconDef,
    private onClick: (key: string) => void,
    private onHover: ((label: string | null) => void) | null,
  ) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(140);
    this.zone = scene.add
      .zone(0, 0, 28, 28)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(142);

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.onClick(this.def.key);
    });
    this.zone.on('pointerover', () => {
      this.hover = true;
      this.onHover?.(this.def.label);
      this.draw();
    });
    this.zone.on('pointerout', () => {
      this.hover = false;
      this.onHover?.(null);
      this.draw();
    });

    this.draw();
  }

  setPosition(x: number, y: number, size = 28): void {
    this.currentX = x;
    this.currentY = y;
    this.currentSize = size;

    const touchSize = Math.max(36, size + 8);
    this.zone.setSize(touchSize, touchSize);
    this.zone.setPosition(x + size / 2, y + size / 2);

    this.draw();
  }

  setActive(v: boolean): void {
    if (this.active === v) return;
    this.active = v;
    this.draw();
  }

  setVisible(v: boolean): void {
    this.currentVisible = v;
    this.gfx.setVisible(v);
    this.zone.setVisible(v);
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, this.zone];
  }

  destroy(): void {
    this.gfx.destroy();
    this.zone.destroy();
  }

  private draw(): void {
    const s = this.currentSize;
    const x = this.currentX;
    const y = this.currentY;

    this.gfx.clear();

    // Nền button
    if (this.active) {
      this.gfx.fillStyle(0x00cec9, 0.28);
    } else if (this.hover) {
      this.gfx.fillStyle(C.panel, 0.98);
    } else {
      this.gfx.fillStyle(C.panel, 0.85);
    }
    this.gfx.fillRoundedRect(x, y, s, s, 6);

    // Viền
    if (this.hover || this.active) {
      this.gfx.lineStyle(1.5, C.accent, 1);
    } else {
      this.gfx.lineStyle(1, C.border, 0.8);
    }
    this.gfx.strokeRoundedRect(x, y, s, s, 6);

    // Vẽ biểu tượng Pixel Art
    drawPixelIcon(this.gfx, this.def.key, x + s / 2, y + s / 2, s);
  }
}

/**
 * **TopMenu** — thanh công cụ menu phía trên:
 * - Hưởng chung UI Zoom với toàn bộ hệ thống HUD.
 * - Biểu tượng dạng Pixel Art sắc nét retro.
 * - Hỗ trợ cả 2 chế độ: Normal dàn ngang và Mini pop-up toggle.
 */
export class TopMenu {
  private buttons: IconButton[] = [];
  private toggleButton: IconButton;
  private toolsModal: SelectToolsModal;
  private hint?: Phaser.GameObjects.Text;
  private activeKey = '';
  private hoverLabel: string | null = null;
  private leftBoundFn?: () => number;
  private rightBoundFn?: () => number;

  private isMini = false;
  private _uiZoomManager?: UiZoomManager;
  /** Các icon bị ẩn (vd: debug toolbar tắt trong Settings). */
  private hiddenIcons = new Set<string>();

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.toolsModal.setUiZoomManager(m);
    this.scene.scale.on('ui-zoom-change', () => this.relayout());
  }

  /** Bật/tắt hiển thị một icon trên thanh công cụ. */
  setIconVisible(key: string, visible: boolean): void {
    if (visible) this.hiddenIcons.delete(key);
    else this.hiddenIcons.add(key);
    this.toolsModal.setHiddenTools(this.hiddenIcons);
    this.relayout();
  }

  /** Mở modal Select Tools */
  openToolsModal(): void {
    this.toolsModal.show();
  }

  /** Đóng modal Select Tools */
  closeToolsModal(): void {
    this.toolsModal.close();
  }

  /** Kiểm tra modal Select Tools đang mở hay đóng */
  isToolsModalOpen(): boolean {
    return this.toolsModal.isOpen();
  }

  /** Danh sách icon đang hiển thị (đã trừ icon bị ẩn). */
  private visibleIcons(): MenuIconDef[] {
    return ICONS.filter((d) => !this.hiddenIcons.has(d.key));
  }

  /** Vị trí thứ tự của icon trong dãy icon đang hiển thị (-1 nếu bị ẩn). */
  private visibleIndexOf(key: string): number {
    return this.visibleIcons().findIndex((d) => d.key === key);
  }

  constructor(
    private scene: Phaser.Scene,
    private onIconClick: (key: string) => void,
  ) {
    // Modal chọn công cụ kích thước lớn tối ưu cho di động / màn hình nhỏ
    this.toolsModal = new SelectToolsModal(scene, {
      onSelectTool: (k) => {
        this.toolsModal.close();
        this.onIconClick(k);
      },
    });
    this.toolsModal.close();

    // Nút toggle mở Select Tools Modal
    this.toggleButton = new IconButton(
      scene,
      { key: 'settings', label: 'Select Tools' },
      () => {
        if (this.toolsModal.isOpen()) {
          this.toolsModal.close();
        } else {
          this.toolsModal.show();
        }
      },
      (l) => {
        this.hoverLabel = l;
        this.updateHint();
      },
    );
    this.toggleButton.setVisible(false);

    // Các icon chính khi ở màn hình lớn / chế độ Normal
    this.buttons = ICONS.map(
      (def) =>
        new IconButton(
          scene,
          def,
          (k) => {
            this.onIconClick(k);
          },
          (l) => {
            this.hoverLabel = l;
            this.updateHint();
          },
        ),
    );

    this.hint = scene.add
      .text(0, 0, '', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: C.text,
        backgroundColor: '#0f1020ee',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(150)
      .setVisible(false);

    this.relayout();
  }

  setBoundsConstraints(leftFn: () => number, rightFn: () => number): void {
    this.leftBoundFn = leftFn;
    this.rightBoundFn = rightFn;
    this.relayout();
  }

  setActive(key: string): void {
    this.activeKey = key;
    this.buttons.forEach((b) => b.setActive(b.key === key));
  }

  setHudMode(mode: HudMode): void {
    const mini = mode === 'mini';
    if (this.isMini !== mini) {
      this.isMini = mini;
      if (!mini) this.toolsModal.close();
      this.relayout();
    }
  }

  setVisible(v: boolean): void {
    if (!v) {
      this.toggleButton.setVisible(false);
      this.buttons.forEach((b) => b.setVisible(false));
      this.toolsModal.close();
      this.hint?.setVisible(false);
    } else {
      this.relayout();
    }
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    const list: Phaser.GameObjects.GameObject[] = [
      ...this.toggleButton.getGameObjects(),
      ...this.toolsModal.getGameObjects(),
    ];
    this.buttons.forEach((b) => list.push(...b.getGameObjects()));
    if (this.hint) list.push(this.hint);
    return list;
  }

  destroy(): void {
    this.toolsModal.destroy();
    this.toggleButton.destroy();
    this.buttons.forEach((b) => b.destroy());
    this.hint?.destroy();
  }

  private updateHint(): void {
    if (!this.hint) return;
    if (!this.hoverLabel) {
      this.hint.setVisible(false);
      return;
    }
    this.hint.setText(this.hoverLabel).setVisible(true);
    this.relayout();
  }

  relayout(): void {
    const z = this._uiZoomManager?.uiZoom ?? 1.25;
    const W = this.scene.scale.width;
    const isSmall = this.isMini || W < 800 || this.scene.scale.height < 600;

    const baseBtnSize = Math.round(26 * z);
    const gap = Math.round(6 * z);

    if (isSmall) {
      // ── CHẾ ĐỘ MINI HOẶC MÀN HÌNH NHỎ: 1 Nút bấm to mở Select Tools Modal ──
      const btnSize = Math.max(32, Math.round(baseBtnSize * 1.15));
      const x0 = Math.floor(W / 2 - btnSize / 2);
      const y0 = Math.round(6 * z);

      this.toggleButton.setVisible(true);
      this.toggleButton.setPosition(x0, y0, btnSize);

      // Ẩn toàn bộ nút ngang
      this.buttons.forEach((b) => b.setVisible(false));

      if (this.hint && this.hint.visible) {
        this.hint.setPosition(x0 + btnSize / 2, y0 + btnSize + 6);
      }
    } else {
      // ── CHẾ ĐỘ NORMAL: Dàn ngang toàn bộ icon ──
      this.toggleButton.setVisible(false);

      const icons = this.visibleIcons();
      const iconSize = baseBtnSize;
      const totalW = icons.length * iconSize + (icons.length - 1) * gap;

      const leftLimit = this.leftBoundFn ? this.leftBoundFn() + 8 : 180 * z;
      const rightLimit = this.rightBoundFn ? this.rightBoundFn() - 8 : W - 90 * z;
      const availW = rightLimit - leftLimit;

      const x0 =
        availW >= totalW
          ? Math.floor(leftLimit + (availW - totalW) / 2)
          : Math.max(12, Math.floor((W - totalW) / 2));
      const y0 = Math.round(6 * z);

      this.buttons.forEach((b) => {
        if (this.hiddenIcons.has(b.key)) {
          b.setVisible(false);
          return;
        }
        const idx = this.visibleIndexOf(b.key);
        b.setVisible(true);
        b.setPosition(x0 + idx * (iconSize + gap), y0, iconSize);
      });

      if (this.hint && this.hint.visible) {
        this.hint.setPosition(x0 + totalW / 2, y0 + iconSize + 6);
      }
    }
  }
}

export { ICONS as TOP_MENU_ICONS };
