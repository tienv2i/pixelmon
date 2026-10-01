import Phaser from 'phaser';
import { C } from './theme';

/**
 * Chế độ hiển thị của HUD — dùng chung cho mọi thanh công cụ.
 *
 * - `normal` — kích thước đầy đủ.
 * - `mini`   — bản rút gọn, dùng khi viewport nhỏ (tự động) hoặc người chơi ép.
 * - `hidden` — ẩn hết, chỉ còn phím tắt để gọi lại.
 */
export type HudMode = 'normal' | 'mini' | 'hidden';

/** Cách thanh công cụ được đặt trên màn hình. */
export type HudDockMode = 'docked' | 'floating';

/** Góc neo của thanh công cụ khi ở chế độ `docked`. */
export type HudAnchor =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

const LS_KEY = 'pixelmon.hud';
const MARGIN = 8;
const GAP = 6;
/** Chiều cao vùng kéo (title bar) của panel khi ở chế độ floating. */
const DRAG_HANDLE_H = 14;
/** Viewport nhỏ hơn ngưỡng này → tự ép `mini`. */
const MINI_BREAKPOINT_W = 720;
const MINI_BREAKPOINT_H = 540;

export interface HudToolConfig {
  /** Định danh duy nhất — dùng làm khoá lưu vị trí khi kéo. */
  id: string;
  /** Góc neo khi ở chế độ `docked`. */
  anchor: HudAnchor;
  /** Danh sách object thuộc thanh công cụ (dùng cho camera ignore + drag). */
  getObjects(): Phaser.GameObjects.GameObject[];
  /** Kích thước panel ĐÃ nhân với uiZoom. */
  getSize(): { w: number; h: number };
  /** Panel có cho kéo tự do được không (mặc định có). */
  draggable?: boolean;
  /** Gọi khi đổi chế độ hiển thị — panel tự rút gọn/ẩn bên trong. */
  onMode?(mode: HudMode): void;
  /** Gọi sau khi vị trí container thay đổi (panel có thể cần vẽ lại). */
  onMoved?(x: number, y: number): void;
}

interface HudToolEntry {
  cfg: HudToolConfig;
  container: Phaser.GameObjects.Container;
  /** Vị trí neo gốc (đã tính theo góc màn hình, chưa cộng offset khi kéo). */
  dockX: number;
  dockY: number;
  /** Offset do người chơi kéo (chỉ dùng ở chế độ floating). */
  offX: number;
  offY: number;
  /** Vùng kéo ở đầu panel. */
  handle?: Phaser.GameObjects.Zone;
}

interface HudPersisted {
  mode?: HudMode;
  dock?: HudDockMode;
  /** true nếu đang ẩn hết (mode === 'hidden'). */
  hidden?: boolean;
  offsets?: Record<string, { x: number; y: number }>;
}

/**
 * **HudManager** — trung tâm điều phối toàn bộ thanh công cụ (HUD).
 *
 * Thay thế `Toolbar.ts` đã bị xoá ở Plan 16. Gom 4 nhóm chức năng:
 *
 * 1. **Chế độ hiển thị** — `normal` / `mini` / `hidden`, có **auto-mini** khi
 *    viewport nhỏ hơn `720×540` và tự trở lại `normal` khi viewport to lại.
 * 2. **Neo vs tự do** — `docked` (panel bám góc màn hình, không kéo được) hoặc
 *    `floating` (kéo bằng title bar, vị trí được lưu lại).
 * 3. **Ẩn hết thanh công cụ** — `hidden`, gọi lại bằng phím tắt.
 * 4. **Camera** — gom object HUD để `WorldScene` `ignore()` đúng camera.
 *
 * Mỗi thanh công cụ được bọc trong một `Container` nên chỉ cần dịch chuyển
 * container là panel đổi vị trí, không phải sửa từng object.
 */
export class HudManager {
  private readonly scene: Phaser.Scene;
  private tools: HudToolEntry[] = [];

  private _mode: HudMode = 'normal';
  private _dock: HudDockMode = 'docked';
  /** true nếu `mini` đang được bật do viewport nhỏ (không phải do người chơi chọn). */
  private miniByViewport = false;
  /** mode người chơi chọn, dùng để khôi phục khi viewport to lại. */
  private userMode: HudMode = 'normal';

  private dragging?: {
    entry: HudToolEntry;
    pointerId: number;
    grabX: number;
    grabY: number;
    startX: number;
    startY: number;
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const saved = this.load();
    this._mode = saved.hidden ? 'hidden' : (saved.mode ?? 'normal');
    this.userMode = this._mode === 'hidden' ? 'normal' : this._mode;
    this._dock = saved.dock ?? 'docked';

    // Auto-mini theo kích thước viewport.
    this.scene.scale.on('resize', () => {
      this.checkAutoMini();
      this.apply();
    });
  }

  // ── Registry ────────────────────────────────────────────────────────────

  /** Đăng ký một thanh công cụ. Gọi sau khi panel đã dựng xong. */
  register(cfg: HudToolConfig): void {
    const container = this.scene.add.container(0, 0);
    container.setScrollFactor(0);

    const savedOffset = this.loadOffsets()[cfg.id];
    const entry: HudToolEntry = {
      cfg,
      container,
      dockX: 0,
      dockY: 0,
      offX: cfg.draggable === false ? 0 : (savedOffset?.x ?? 0),
      offY: cfg.draggable === false ? 0 : (savedOffset?.y ?? 0),
    };

    container.add(cfg.getObjects());
    this.buildHandle(entry);

    this.tools.push(entry);
    this.apply();
  }

  /** Tạo vùng kéo ở title bar của panel (chỉ dùng khi floating). */
  private buildHandle(entry: HudToolEntry): void {
    if (entry.cfg.draggable === false) return;

    const handle = this.scene.add
      .zone(0, 0, 10, DRAG_HANDLE_H)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true, draggable: false });

    handle.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Chỉ kéo được ở chế độ floating.
      if (this._dock !== 'floating') return;
      const { x, y } = entry.container;
      this.dragging = {
        entry,
        pointerId: p.id,
        grabX: p.x,
        grabY: p.y,
        startX: x,
        startY: y,
      };
      p.event?.stopPropagation();
    });

    entry.handle = handle;
    entry.container.add(handle);
  }

  // ── State ───────────────────────────────────────────────────────────────

  get mode(): HudMode {
    return this._mode;
  }

  get dockMode(): HudDockMode {
    return this._dock;
  }

  /** true nếu đang ẩn hết thanh công cụ. */
  get isHidden(): boolean {
    return this._mode === 'hidden';
  }

  /**
   * Đặt chế độ hiển thị.
   * - `mini` do người chơi chọn → `userMode = 'mini'`, tắt cờ auto.
   * - `normal` → huỷ cờ auto, `userMode = 'normal'`.
   * - `hidden` → lưu `hidden` để khôi phục đúng mode trước đó.
   */
  setMode(mode: HudMode): void {
    this._mode = mode;
    if (mode !== 'mini') {
      this.userMode = mode === 'hidden' ? this.userMode : mode;
      if (mode === 'normal') this.miniByViewport = false;
    }
    this.apply();
    this.save();
  }

  /** `normal` → `mini` → `hidden` → `normal`. */
  cycleMode(): void {
    const next: HudMode =
      this._mode === 'normal' ? 'mini' : this._mode === 'mini' ? 'hidden' : 'normal';
    // Bỏ cờ auto để lựa chọn của người chơi không bị viewport ghi đè.
    this.miniByViewport = false;
    this.setMode(next);
  }

  /** Chuyển `docked` ↔ `floating`. Về `docked` thì xoá offset kéo. */
  setDockMode(mode: HudDockMode): void {
    this._dock = mode;
    if (mode === 'docked') {
      for (const t of this.tools) {
        t.offX = 0;
        t.offY = 0;
      }
      this.saveOffsets({});
    }
    this.apply();
    this.save();
  }

  toggleDock(): void {
    this.setDockMode(this._dock === 'docked' ? 'floating' : 'docked');
  }

  /** Ẩn/hiện toàn bộ thanh công cụ. */
  toggleHidden(): void {
    if (this.isHidden) {
      this.setMode(this.userMode);
    } else {
      // Nhớ mode hiện tại để bấm lần nữa là về đúng trạng thái trước.
      this.userMode = this._mode;
      this.setMode('hidden');
    }
  }

  /** Bật/tắt mini thủ công (không ẩn). */
  toggleMini(): void {
    if (this._mode === 'mini') {
      this.miniByViewport = false;
      this.setMode('normal');
    } else {
      this.miniByViewport = false;
      this.userMode = 'mini';
      this.setMode('mini');
    }
  }

  /** Tự ép mini khi viewport nhỏ, tự trở lại khi viewport to. */
  private checkAutoMini(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const small = w < MINI_BREAKPOINT_W || h < MINI_BREAKPOINT_H;

    if (small && !this.miniByViewport && this._mode === 'normal') {
      this.miniByViewport = true;
      this._mode = 'mini';
      this.apply();
      return;
    }
    if (!small && this.miniByViewport) {
      this.miniByViewport = false;
      this._mode = this.userMode === 'mini' ? 'normal' : this.userMode;
      if (this._mode === 'hidden') this._mode = 'normal';
      this.apply();
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────

  /**
   * Tính vị trí cho mọi thanh công cụ rồi đặt container.
   *
   * Các panel dùng chung một góc sẽ được xếp chồng theo thứ tự đăng ký
   * (trên→dưới với góc trên, dưới→trên với góc dưới) để không chồng lên nhau.
   */
  apply(): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const visible = this._mode !== 'hidden';

    // Nhóm theo góc neo để xếp chồng.
    const groups = new Map<HudAnchor, HudToolEntry[]>();
    for (const t of this.tools) {
      const list = groups.get(t.cfg.anchor) ?? [];
      list.push(t);
      groups.set(t.cfg.anchor, list);
    }

    for (const [anchor, list] of groups) {
      const isCenter = anchor === 'top-center' || anchor === 'bottom-center';
      const fromTop = anchor === 'top-left' || anchor === 'top-center';

      // Vị trí neo gốc cho panel đầu tiên của nhóm.
      let cursor = fromTop ? MARGIN : H - MARGIN;

      list.forEach((entry, i) => {
        const size = entry.cfg.getSize();
        const { w, h } = size;

        let dockX: number;
        let dockY: number;

        if (isCenter) {
          dockX = Math.round((W - w) / 2);
        } else if (anchor.endsWith('left')) {
          dockX = MARGIN;
        } else {
          dockX = W - w - MARGIN;
        }

        if (fromTop) {
          dockY = cursor;
          cursor += h + GAP;
        } else {
          cursor -= h;
          dockY = cursor;
          cursor -= GAP;
        }

        // Panel trước bị ẩn (ví dụ Minimap mặc định tắt) thì không chừa chỗ.
        if (!visible && i === 0) {
          dockY = fromTop ? MARGIN : H - MARGIN;
        }

        entry.dockX = dockX;
        entry.dockY = dockY;

        const x = dockX + (this._dock === 'floating' ? entry.offX : 0);
        const y = dockY + (this._dock === 'floating' ? entry.offY : 0);

        entry.container.setPosition(x, y);
        entry.container.setVisible(visible);
        entry.cfg.onMoved?.(x, y);

        // Vùng kéo chỉ sống trong chế độ floating.
        const handleW = Math.max(10, w);
        entry.handle?.setSize(handleW, Math.min(DRAG_HANDLE_H, h));
        entry.handle?.setPosition(0, 0);
        entry.handle?.setInteractive(this._dock === 'floating' && visible);
      });
    }

    // Báo cho panel biết mode hiện tại (rút gọn / ẩn bên trong).
    for (const t of this.tools) t.cfg.onMode?.(this._mode);
  }

  /** Gọi mỗi frame để xử lý kéo-thả. */
  update(): void {
    if (!this.dragging) return;
    const d = this.dragging;
    const p = this.scene.input.activePointer;
    if (p.id !== d.pointerId) return;

    const size = d.entry.cfg.getSize();
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;

    // Clamp để panel không bị kéo ra ngoài màn hình.
    const maxX = W - size.w - MARGIN;
    const maxY = H - size.h - MARGIN;
    const nx = Phaser.Math.Clamp(d.startX + (p.x - d.grabX), MARGIN, Math.max(MARGIN, maxX));
    const ny = Phaser.Math.Clamp(d.startY + (p.y - d.grabY), MARGIN, Math.max(MARGIN, maxY));

    d.entry.container.setPosition(nx, ny);
    d.entry.offX = nx - d.entry.dockX;
    d.entry.offY = ny - d.entry.dockY;
    d.entry.cfg.onMoved?.(nx, ny);
  }

  /** Kết thúc kéo → lưu offset của panel vừa kéo. */
  endDrag(): void {
    if (!this.dragging) return;
    const offsets = this.loadOffsets();
    offsets[this.dragging.entry.cfg.id] = {
      x: this.dragging.entry.offX,
      y: this.dragging.entry.offY,
    };
    this.dragging = undefined;
    this.saveOffsets(offsets);
  }

  // ── Camera / persistence ────────────────────────────────────────────────

  /** Tất cả object HUD (kể cả container + vùng kéo) để WorldScene gán camera. */
  getGameObjects(): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [];
    for (const t of this.tools) {
      out.push(t.container);
      out.push(...t.cfg.getObjects());
    }
    return out;
  }

  /** true nếu điểm (px, py) nằm trên vùng HUD — dùng để chặn input gameplay. */
  isPointerOverHud(px: number, py: number): boolean {
    if (this._mode === 'hidden') return false;
    for (const t of this.tools) {
      if (!t.container.visible) continue;
      const size = t.cfg.getSize();
      const { x, y } = t.container;
      if (px >= x && px <= x + size.w && py >= y && py <= y + size.h) return true;
    }
    return false;
  }

  private load(): HudPersisted {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as HudPersisted;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ mode: this.userMode, dock: this._dock, hidden: this.isHidden }),
      );
    } catch {
      // localStorage bị chặn — bỏ qua, HUD vẫn hoạt động trong phiên này.
    }
  }

  private loadOffsets(): Record<string, { x: number; y: number }> {
    try {
      const raw = localStorage.getItem(`${LS_KEY}.offsets`);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveOffsets(offsets: Record<string, { x: number; y: number }>): void {
    try {
      localStorage.setItem(`${LS_KEY}.offsets`, JSON.stringify(offsets));
    } catch {
      // Bỏ qua.
    }
  }

  destroy(): void {
    this.tools.forEach((t) => {
      t.handle?.destroy();
      t.container.destroy();
    });
    this.tools = [];
  }
}

/** Màu viền dùng chung cho vùng kéo (giữ nguyên palette). */
export const DRAG_COLOR = C.accent;
