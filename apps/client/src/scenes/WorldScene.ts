import Phaser from 'phaser';
import { PlayerSprite, registerPlayerAnims, type Dir } from '../entities/PlayerSprite';
import { loadSpriteSheet } from '../entities/SpriteSheetLoader';
import { ColyseusManager } from '../network/ColyseusManager';
import { TILE_SIZE, PLAYER_SPEED } from '@pixelmon/shared';
import { loadTiledMap, DEFAULT_MAP_ID, TILED_MAPS } from '../world/TiledMapLoader';
import { buildPlaceholderMap, MAP_W, MAP_H } from '../world/PlaceholderMap';
import { findPath, pathToPixels } from '../world/Pathfinder';
import { PlayerHud } from '../ui/PlayerHud';
import { PartyStrip, type PartyMember } from '../ui/PartyStrip';
import { Minimap } from '../ui/Minimap';
import { ChatLog } from '../ui/ChatLog';
import { SettingsPanel } from '../ui/SettingsPanel';
import { ConfirmModal } from '../ui/ConfirmModal';
import { HelpModal } from '../ui/HelpModal';
import { TopMenu } from '../ui/TopMenu';
import { InfoPanel } from '../ui/InfoPanel';
import { UiZoomManager } from '../ui/UiZoomManager';
import { FONT } from '../ui/theme';
import { TEX } from './BootScene';

/** Bật để thấy FPS + toạ độ. */
const DEBUG = false;

/** Bật để dùng Tiled map thật (thay vì PlaceholderMap). */
let USE_TILED_MAP = true;

/**
 * Origin server (khớp `ColyseusManager`).
 *
 * `spriteUrl` trả về từ API là đường dẫn tương đối `/sprites/...`; game client
 * chạy ở origin khác (Vite :5173) nên phải nối absolute trước khi load.
 */
const SERVER_ORIGIN: string = (() => {
  const url: string = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567';
  return url.replace(/^ws/, 'http');
})();

/**
 * WorldScene — bản demo bộ khung UI:
 * 1. Vùng map tượng trưng (PlaceholderMap) — chưa render map thật.
 * 2. Camera follow + setBounds (map 60×45 > viewport → camera trượt).
 * 3. HUD: PlayerHud (bảng avatar + tên + 2 loại tiền), PartyStrip (dọc trái).
 * 4. **TopMenu** — dãy icon nhỏ neo giữa cạnh trên.
 * 5. **InfoPanel** — khối giờ + thời tiết góc trên phải.
 * 6. **Minimap** — popup dưới InfoPanel, bật/tắt qua icon GPS (hoặc phím M).
 * 7. **HelpModal** — bảng hướng dẫn điều khiển dạng popup modal chuẩn.
 *
 * Network (Colyseus) logic giữ nguyên từ bản cũ.
 */
export class WorldScene extends Phaser.Scene {
  private player!: PlayerSprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private remotePlayers = new Map<string, PlayerSprite>();
  private canMove = true;
  private lastMoveSent = 0;
  private moving = false;

  private uiZoom!: UiZoomManager;
  private topMenu!: TopMenu;
  private infoPanel!: InfoPanel;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private mapLayer!: Phaser.Tilemaps.TilemapLayer;
  private tiledLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private hud!: PlayerHud;
  private partyStrip!: PartyStrip;
  private minimap!: Minimap;
  private chatLog!: ChatLog;
  private settingsPanel!: SettingsPanel;
  private confirmModal!: ConfirmModal;
  private helpModal!: HelpModal;
  private moveButton: 'left' | 'right' = 'left';
  private manualMiniMode?: boolean;
  private playerSheetKey: string = TEX.hero;
  private playerFrameCount = 16;

  private debugText?: Phaser.GameObjects.Text;

  // Click-to-move (chuột phải)
  private movePath: Array<{ x: number; y: number }> = [];
  private pointerTarget?: Phaser.Geom.Point;
  private hoverGfx?: Phaser.GameObjects.Graphics;
  private destGfx?: Phaser.GameObjects.Graphics;
  private hoverTileX = -1;
  private hoverTileY = -1;

  /** Trạng thái kéo pan camera (middle-button hoặc Shift+left). */
  private camDrag?: {
    pointerId: number;
    startWorldX: number;
    startWorldY: number;
    startPointerX: number;
    startPointerY: number;
  };

  /** Đang chờ refresh camera ignore list sau khi panel relayout. */
  private camRefreshPending = false;

  // mock data (sẽ thay bằng Colyseus state / API thật)
  private mockHp = 86;
  private mockMaxHp = 100;
  private mockMoney = 5000;
  private mockRealMoney = 0;

  constructor() {
    super('World');
  }

  async create() {
    // Register legacy 12-frame anim trước (backup nếu hero sheet chưa load kịp)
    registerPlayerAnims(this, TEX.trainer, 12);

    await this.createWorld();
    this.createInput();
    this.createHud();
    this.setupNetwork();
    this.setupCameraFollow();
    this.setupDebug();

    // Tách camera UI — scroll chỉ zoom world, không zoom HUD.
    // ĐẶT SAU createHud() + setupDebug() vì cần đủ object HUD.
    this.setupUiCamera();
  }

  // ── 1. World ────────────────────────────────────────────────────────────

  private async createWorld(): Promise<void> {
    // Load map (Tiled hoặc placeholder)
    let mapWidth = MAP_W;
    let mapHeight = MAP_H;
    let mapLayers: Phaser.Tilemaps.TilemapLayer[] = [];

    if (USE_TILED_MAP && TILED_MAPS[DEFAULT_MAP_ID]) {
      try {
        const loaded = await loadTiledMap(this, DEFAULT_MAP_ID, 10);
        mapLayers = loaded.layers;
        mapWidth = loaded.width;
        mapHeight = loaded.height;
        this.tiledLayers = mapLayers; // Lưu lại để getWorldObjects() include
        console.log(
          `[world] loaded Tiled map "${DEFAULT_MAP_ID}": ${mapWidth}×${mapHeight}, ${mapLayers.length} layers`,
        );
      } catch (err) {
        console.warn('[world] failed to load Tiled map, fallback to placeholder:', err);
        USE_TILED_MAP = false;
      }
    }

    if (!USE_TILED_MAP || mapLayers.length === 0) {
      // Fallback: placeholder map (đã generate texture)
      this.mapLayer = buildPlaceholderMap(this);
      this.tiledLayers = []; // Reset
      mapWidth = MAP_W;
      mapHeight = MAP_H;
    } else {
      // Map Tiled — dùng layer đầu tiên làm reference (depth_base = 10)
      this.mapLayer = mapLayers[0];
    }

    // Lưu kích thước map để camera follow + clamp
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;

    // Spawn player ở giữa map
    const spawnX = mapWidth / 2;
    const spawnY = mapHeight / 2;

    // Tạo sprite — ưu tiên sprite user được gán trong thư viện admin,
    // nếu không có → hero sheet (đã load ở BootScene), cuối cùng → trainer.
    const network = ColyseusManager.getInstance();
    const seed = (network.id || '').length || 1;
    let sheetKey: string = this.textures.exists(TEX.hero) ? TEX.hero : TEX.trainer;
    let frameCount = sheetKey === TEX.hero ? 16 : 12;

    const userSprite = network.userSprite;
    if (userSprite) {
      // sheetUrl là đường dẫn tương đối `/sprites/...` do server Express trả về —
      // game client chạy ở origin khác (Vite :5173) nên phải nối absolute.
      const absUrl = userSprite.sheetUrl.startsWith('/')
        ? SERVER_ORIGIN + userSprite.sheetUrl
        : userSprite.sheetUrl;
      const loaded = await loadSpriteSheet(
        this,
        'user_sprite',
        absUrl,
        userSprite.frameW || 64,
        userSprite.frameCount || 16,
      );
      if (loaded) {
        sheetKey = loaded;
        frameCount = userSprite.frameCount || 16;
        console.log(`[world] using assigned sprite "${userSprite.name}" (${frameCount} frames)`);
      }
    }

    // Register anim với frame count tương ứng
    registerPlayerAnims(this, sheetKey, frameCount);
    this.playerSheetKey = sheetKey;
    this.playerFrameCount = frameCount;

    this.player = new PlayerSprite(this, spawnX, spawnY, sheetKey, seed, frameCount);
    this.player.setDisplayName(network.name || 'Guest');
    this.player.setDepth(20);

    // Remote players cũng dùng hero sheet (nếu có)
    const remote = network.world;
    if (remote) {
      remote.onStateChange((state) => this.syncRemotePlayers(state));
      remote.onMessage('chat', (data) => this.showChat(data.from, data.message));
    }

    // ⚠️ BỎ global click → random battle. Trước đây `pointerdown` bắn 30% mỗi cú click
    // bất kỳ (chạm UI, click trống, click button...) → cửa sổ battle hiện ra "tự nhiên".
    // Battle giờ chỉ mở qua: bấm trực tiếp lên nhân vật, hoặc gặp grass encounter thật.
  }

  private mapWidth = 60 * 32;
  private mapHeight = 45 * 32;

  /**
   * Cập nhật camera bounds để căn giữa map khi viewport lớn hơn map,
   * hoặc kẹp camera trong phạm vi map khi map lớn hơn viewport.
   */
  updateCameraBounds(): void {
    const cam = this.cameras.main;
    if (!cam) return;

    const zoomX = cam.zoomX || cam.zoom || 1;
    const zoomY = cam.zoomY || cam.zoom || 1;
    const dw = cam.width / zoomX;
    const dh = cam.height / zoomY;

    const diffX = dw - this.mapWidth;
    const diffY = dh - this.mapHeight;

    // Nếu viewport lớn hơn map, offset sang âm để tâm camera trùng tâm map
    const boundX = diffX > 0 ? -diffX / 2 : 0;
    const boundY = diffY > 0 ? -diffY / 2 : 0;
    const boundW = diffX > 0 ? dw : this.mapWidth;
    const boundH = diffY > 0 ? dh : this.mapHeight;

    cam.setBounds(boundX, boundY, boundW, boundH);
  }

  private setupCameraFollow(): void {
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    cam.setZoom(1);
    this.updateCameraBounds();
    cam.startFollow(this.player, true, 0.12, 0.12);
  }

  /**
   * Game zoom: chỉ zoom camera world, KHÔNG đụng camera UI nên HUD giữ nguyên size.
   * Được `main.ts` gọi từ scroll wheel.
   */
  zoomGameBy(delta: number, screenX?: number, screenY?: number): void {
    this.setGameZoom(this.cameras.main.zoom + delta, screenX, screenY);
  }

  /** Set zoom thế giới tuyệt đối (dùng cho nút Reset). */
  setGameZoom(zoom: number, screenX?: number, screenY?: number): void {
    const cam = this.cameras.main;
    const next = Phaser.Math.Clamp(zoom, 0.5, 3.0);
    if (Math.abs(next - cam.zoom) < 0.0001) return;

    const cx = screenX ?? this.scale.width / 2;
    const cy = screenY ?? this.scale.height / 2;
    const before = cam.getWorldPoint(cx, cy);
    cam.setZoom(next);
    this.updateCameraBounds();
    const after = cam.getWorldPoint(cx, cy);
    const targetX = cam.scrollX - (after.x - before.x);
    const targetY = cam.scrollY - (after.y - before.y);
    cam.scrollX = cam.useBounds ? cam.clampX(targetX) : targetX;
    cam.scrollY = cam.useBounds ? cam.clampY(targetY) : targetY;
    this.minimap?.update(this.player.x, this.player.y, cam);
  }

  getGameZoom(): number {
    return this.cameras.main.zoom;
  }

  /**
   * Tách 2 camera để scroll chỉ zoom thế giới, không zoom UI:
   * - `cameras.main` → chỉ render world (map, nhân vật). Đây là camera được zoom.
   * - `cameras.ui`   → chỉ render HUD, zoom cố định 1, nền trong suốt.
   *
   * Vì `setScrollFactor(0)` chỉ cố định *vị trí* chứ không cố định *kích thước*,
   * UI vẫn bị camera zoom phóng to nếu dùng chung camera với world.
   */
  private setupUiCamera(): void {
    const world = this.cameras.main;

    // Camera UI: phủ toàn màn hình, zoom 1, không có nền, không scroll.
    const ui = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    ui.setName('ui');
    ui.transparent = true;
    ui.setScroll(0, 0);
    ui.setZoom(1);
    this.uiCam = ui;

    // Camera world không render HUD; camera UI không render world.
    world.ignore(this.getHudObjects());
    ui.ignore(this.getWorldObjects());

    // Camera UI phải bám theo kích thước canvas khi resize.
    // Đồng thời panel (PartyStrip/ChatLog) tạo lại object trong relayout() →
    // phải đăng ký lại camera để tránh render đôi.
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      ui.setSize(size.width, size.height);
      this.updateCameraBounds();
      this.scheduleCameraRefresh();
    });
  }

  /** Gọi refreshHudCameras() ở frame kế tiếp (sau khi panel kịp relayout). */
  private scheduleCameraRefresh(): void {
    if (this.camRefreshPending) return;
    this.camRefreshPending = true;
    this.time.delayedCall(0, () => {
      this.camRefreshPending = false;
      this.refreshHudCameras();
    });
  }

  /** Các object thuộc HUD — chỉ camera UI render. */
  private getHudObjects(): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [
      ...this.hud.getGameObjects(),
      ...this.partyStrip.getGameObjects(),
      ...this.minimap.getGameObjects(),
      ...this.chatLog.getGameObjects(),
      ...this.topMenu.getGameObjects(),
      ...this.infoPanel.getGameObjects(),
      ...this.settingsPanel.getGameObjects(),
      ...this.confirmModal.getGameObjects(),
      ...(this.helpModal ? this.helpModal.getGameObjects() : []),
    ];
    if (this.debugText) objs.push(this.debugText);
    return objs;
  }

  /** Các object thuộc thế giới — chỉ camera world render. */
  private getWorldObjects(): Phaser.GameObjects.GameObject[] {
    const objs: Phaser.GameObjects.GameObject[] = [
      this.player,
      // PHẢI kèm nameText + shadow của local player, nếu không 2 object này
      // sẽ không bị ignore ở uiCam → render bởi cả 2 camera → bảng tên nhân đôi.
      ...this.player.getChildObjects(),
    ];

    // Map Tiled có nhiều tilelayer (Ground/Decoration/Overhead) → push tất cả.
    if (this.tiledLayers.length > 0) {
      objs.push(...this.tiledLayers);
    } else if (this.mapLayer) {
      objs.push(this.mapLayer);
    }

    for (const rp of this.remotePlayers) {
      objs.push(rp[1], ...rp[1].getChildObjects());
    }
    return objs;
  }

  /**
   * Đăng ký object **thế giới** xuất hiện sau khi setupUiCamera (ví dụ: người chơi
   * khác, text chat nổi). Cần để UI camera không render trùng → tránh sai vị trí
   * khi zoom.
   */
  private registerWorldObject(...objs: Phaser.GameObjects.GameObject[]): void {
    if (!this.uiCam) return;
    for (const o of objs) {
      if (!o || o.scene === null) continue;
      this.uiCam.ignore(o);
    }
  }

  /** Đăng ký object HUD xuất hiện sau (với camera world không render HUD). */
  private registerHudObject(...objs: Phaser.GameObjects.GameObject[]): void {
    if (!this.uiCam) return;
    this.cameras.main.ignore(objs);
  }

  /**
   * Gọi lại sau khi panel relayout tạo object mới — đăng ký lại camera.
   * Panel (PartyStrip, ChatLog...) destroy + tạo object mới trong relayout(),
   * cần world.ignore() các object mới này để tránh render đôi.
   */
  refreshHudCameras(): void {
    if (!this.uiCam) return;
    const all = this.getHudObjects();
    this.cameras.main.ignore(all);
    this.uiCam.ignore(this.getWorldObjects());
  }

  // ── 2. Input ────────────────────────────────────────────────────────────

  private createInput(): void {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D') as typeof this.wasd;

      // WASD/Arrows cũng cancel click-to-move
      const cancelMove = () => this.cancelAutoMove();
      this.input.keyboard.on('keydown-W', cancelMove);
      this.input.keyboard.on('keydown-A', cancelMove);
      this.input.keyboard.on('keydown-S', cancelMove);
      this.input.keyboard.on('keydown-D', cancelMove);
      this.cursors.left.on('down', cancelMove);
      this.cursors.right.on('down', cancelMove);
      this.cursors.up.on('down', cancelMove);
      this.cursors.down.on('down', cancelMove);

      // Esc → mở/đóng settings panel
      this.input.keyboard.on('keydown-ESC', () => this.settingsPanel?.toggle());
      // M → toggle minimap (bên cạnh icon GPS)
      this.input.keyboard.on('keydown-M', () => {
        this.minimap.toggle();
        this.topMenu?.setActive(this.minimap.isVisible() ? 'gps' : '');
      });
      // H → ẩn/hiện bảng hướng dẫn
      this.input.keyboard.on('keydown-H', () => {
        this.helpModal?.toggle();
        this.topMenu?.setActive(this.helpModal?.isOpen() ? 'help' : '');
      });
    }

    this.setupPointerInput();
  }

  /**
   * Input chuột trong vùng gameplay:
   *
   * - **Hover chuột** → highlight ô đích (viền sáng cyan trên ô đó).
   * - **Chuột phải** → click-to-move: đánh dấu ô đích (làm sậm + viền), di chuyển tự động.
   * - **Giữ chuột giữa + kéo** / **Shift + chuột trái + kéo** → pan camera.
   *
   * Highlight ô theo `pointermove` → `getWorldPoint` → `pixelToTile` → tileToPixel.
   * Không vẽ path — chỉ làm viền sáng trên ô đích.
   */
  private setupPointerInput(): void {
    this.input.mouse?.disableContextMenu();

    // Click-to-move (mặc định Chuột trái / Touch, hoặc Chuột phải theo cài đặt)
    this.input.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (this.settingsPanel?.isOpen() || this.confirmModal?.isOpen() || this.helpModal?.isOpen()) return;
        if (over.length > 0) return;

        const wantPan = p.middleButtonDown() || (p.leftButtonDown() && p.event.shiftKey);
        if (wantPan) return;

        const isMove =
          this.moveButton === 'left'
            ? p.leftButtonDown() || p.button === 0
            : p.rightButtonDown() || p.button === 2;

        if (!isMove) return;
        const wp = this.cameras.main.getWorldPoint(p.x, p.y);
        this.issueMoveTo(wp.x, wp.y);
      },
    );

    // Middle-button (hoặc Shift + left) → drag pan camera
    this.input.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (this.settingsPanel?.isOpen()) return;
        const wantPan = p.middleButtonDown() || (p.leftButtonDown() && p.event.shiftKey);
        if (!wantPan) return;
        if (over.length > 0) return; // đang click lên UI → bỏ qua

        const cam = this.cameras.main;
        this.camDrag = {
          pointerId: p.id,
          startWorldX: cam.scrollX,
          startWorldY: cam.scrollY,
          startPointerX: p.x,
          startPointerY: p.y,
        };
        cam.stopFollow(); // camera tự do khi kéo
        this.cancelAutoMove(); // huỷ lệnh chạy tự động
        p.event?.stopPropagation();
      },
    );

    // Hover → highlight ô đích
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.settingsPanel?.isOpen()) return;
      if (this.camDrag && this.camDrag.pointerId === p.id) {
        // Đang pan camera — update scroll
        const cam = this.cameras.main;
        const zoom = cam.zoom;
        const dx = (p.x - this.camDrag.startPointerX) / zoom;
        const dy = (p.y - this.camDrag.startPointerY) / zoom;
        const nextX = this.camDrag.startWorldX - dx;
        const nextY = this.camDrag.startWorldY - dy;
        cam.scrollX = cam.useBounds ? cam.clampX(nextX) : nextX;
        cam.scrollY = cam.useBounds ? cam.clampY(nextY) : nextY;
        return;
      }
      // Highlight ô dưới con trỏ
      this.updateHoverTile(p.x, p.y);
    });

    const endPan = (p: Phaser.Input.Pointer) => {
      if (!this.camDrag || this.camDrag.pointerId !== p.id) return;
      this.camDrag = undefined;
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      this.cameras.main.setRoundPixels(true);
      this.minimap?.update(this.player.x, this.player.y, this.cameras.main);
    };
    this.input.on('pointerup', endPan);
    this.input.on('pointerupoutside', endPan);
  }

  // ── Hover tile + click-to-move ──────────────────────────────────────────

  /** Highlight ô dưới con trỏ chuột. */
  private updateHoverTile(px: number, py: number): void {
    const wp = this.cameras.main.getWorldPoint(px, py);
    const col = Math.floor(wp.x / TILE_SIZE);
    const row = Math.floor(wp.y / TILE_SIZE);
    const cx = col * TILE_SIZE;
    const cy = row * TILE_SIZE;

    // Ngoài phạm vi map (vùng trống khi map căn giữa) → xoá highlight
    const maxCols = Math.floor(this.mapWidth / TILE_SIZE);
    const maxRows = Math.floor(this.mapHeight / TILE_SIZE);
    if (col < 0 || row < 0 || col >= maxCols || row >= maxRows) {
      if (this.hoverGfx) this.hoverGfx.clear();
      this.hoverTileX = -1;
      this.hoverTileY = -1;
      return;
    }

    if (this.hoverTileX === cx && this.hoverTileY === cy) return;
    this.hoverTileX = cx;
    this.hoverTileY = cy;

    if (!this.hoverGfx) {
      // KHÔNG setScrollFactor(0) — highlight phải nằm trong WORLD space
      // (world coords) để khớp với toạ độ chuột đã convert qua getWorldPoint.
      this.hoverGfx = this.add.graphics().setDepth(6);
      this.registerWorldObject(this.hoverGfx);
    }
    this.hoverGfx.clear();
    this.hoverGfx.lineStyle(2, 0x00cec9, 0.7);
    this.hoverGfx.strokeRect(cx + 1, cy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  /** Bật click-to-move: tính path bằng A* rồi tự di chuyển. */
  private issueMoveTo(x: number, y: number): void {
    const maxCols = Math.floor(this.mapWidth / TILE_SIZE);
    const maxRows = Math.floor(this.mapHeight / TILE_SIZE);
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (col < 0 || row < 0 || col >= maxCols || row >= maxRows) {
      return;
    }

    const path = findPath(this.player.x, this.player.y, x, y);
    if (path.length === 0) return;
    this.movePath = pathToPixels(path);
    this.pointerTarget = new Phaser.Geom.Point(x, y);

    // Vẽ ô đích sậm + viền sáng
    this.drawDestination();
  }

  /** Hủy lệnh di chuyển tự động (khi người chơi bấm bàn phím). */
  private cancelAutoMove(): void {
    this.movePath = [];
    this.pointerTarget = undefined;
    this.destGfx?.clear();
  }

  /**
   * Vẽ ô đích click-to-move: nền sậm + viền sáng + chấm nhỏ ở giữa.
   * KHÔNG vẽ đường path — chỉ đánh dấu ô đích.
   */
  private drawDestination(): void {
    if (!this.pointerTarget) return;

    const col = Math.floor(this.pointerTarget.x / TILE_SIZE);
    const row = Math.floor(this.pointerTarget.y / TILE_SIZE);
    const cx = col * TILE_SIZE;
    const cy = row * TILE_SIZE;

    if (!this.destGfx) {
      // KHÔNG setScrollFactor(0) — marker phải nằm trong WORLD space.
      this.destGfx = this.add.graphics().setDepth(7);
      this.registerWorldObject(this.destGfx);
    }
    this.destGfx.clear();

    // Nền sậm (đen 40%)
    this.destGfx.fillStyle(0x000000, 0.4);
    this.destGfx.fillRect(cx, cy, TILE_SIZE, TILE_SIZE);

    // Viền sáng (cyan)
    this.destGfx.lineStyle(2, 0x00cec9, 0.9);
    this.destGfx.strokeRect(cx + 1, cy + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Chấm nhỏ ở tâm
    this.destGfx.fillStyle(0x00cec9, 0.8);
    this.destGfx.fillCircle(cx + TILE_SIZE / 2, cy + TILE_SIZE / 2, 4);
  }

  // ── 3. HUD / panels ─────────────────────────────────────────────────────

  private createHud(): void {
    // UI zoom — tách biệt hoàn toàn với game zoom (camera, scroll wheel)
    this.uiZoom = new UiZoomManager(this);

    // PlayerHud (trái-trên) — bảng: avatar lớn bên trái, tên + 2 loại tiền bên phải
    const name = ColyseusManager.getInstance().name || 'Trainer';
    const is16 = this.playerFrameCount === 16;
    const hudFrame = is16 ? '0_0' : 0;
    const hudFrameSize = is16 ? 64 : 32;
    this.hud = new PlayerHud(this, this.playerSheetKey, hudFrame, hudFrameSize);
    this.hud.setUiZoomManager(this.uiZoom);
    this.hud.update({
      name,
      money: this.mockMoney,
      realMoney: this.mockRealMoney,
    });

    // PartyStrip (trái, dọc) — neo ngay dưới PlayerHud
    const mockParty: Array<PartyMember | null> = [
      { name: 'Charmander', hp: 22, maxHp: 28, rarity: 'common' },
      { name: 'Pikachu', hp: 18, maxHp: 22, rarity: 'uncommon' },
      { name: 'Bulbasaur', hp: 15, maxHp: 20, rarity: 'common' },
      null,
      null,
      null,
    ];
    this.partyStrip = new PartyStrip(this, mockParty);
    this.partyStrip.setUiZoomManager(this.uiZoom);
    this.layoutLeftColumn();
    this.scale.on('ui-zoom-change', () => this.layoutLeftColumn());

    // ChatLog (phải-dưới)
    this.chatLog = new ChatLog(this, (msg) => {
      ColyseusManager.getInstance().sendChat(msg);
    });
    this.chatLog.setUiZoomManager(this.uiZoom);

    // Minimap (popup dưới InfoPanel — mặc định ẩn, bật qua icon GPS)
    this.minimap = new Minimap(this);
    this.minimap.setUiZoomManager(this.uiZoom);
    this.minimap.update(this.player.x, this.player.y, this.cameras.main);

    // InfoPanel (góc trên phải) — giờ + thời tiết. Minimap neo dưới panel này.
    this.infoPanel = new InfoPanel(this, (ColyseusManager.getInstance().id || '').length);
    this.infoPanel.setUiZoomManager(this.uiZoom);
    this.minimap.setAnchorYSource(() => this.infoPanel.getBottomY());

    // Settings panel (Esc / icon ⚙)
    this.settingsPanel = new SettingsPanel(this, {
      onToggleProfile: (v) => this.hud.setVisible(v),
      onToggleClock: (v) => this.infoPanel.setVisible(v),
      onToggleParty: (v) => this.partyStrip.setVisible(v),
      onToggleChat: (v) => this.chatLog.setVisible(v),
      onToggleMinimap: (v) => {
        this.minimap.setVisible(v);
        this.topMenu?.setActive(v ? 'gps' : '');
      },
      onToggleMiniMode: (v) => {
        this.manualMiniMode = v;
        this.applyViewportHudMode();
        this.layoutLeftColumn();
        this.topMenu.relayout();
      },
      onMoveButtonChange: (btn) => {
        this.moveButton = btn;
      },
      onUiZoomIn: () => this.uiZoom.zoomIn(),
      onUiZoomOut: () => this.uiZoom.zoomOut(),
      onUiZoomReset: () => this.uiZoom.reset(),
      onGameZoomIn: () => this.zoomGameBy(0.2),
      onGameZoomOut: () => this.zoomGameBy(-0.2),
      onGameZoomReset: () => this.setGameZoom(1.0),
      getGameZoom: () => this.getGameZoom(),
      onLogout: () => this.confirmLogout(),
      onClose: () => undefined,
    });
    this.settingsPanel.setUiZoomManager(this.uiZoom);

    // Confirm Modal — hộp thoại xác nhận đăng xuất
    this.confirmModal = new ConfirmModal(this);

    // TopMenu — dãy icon nhỏ neo giữa cạnh trên
    this.topMenu = new TopMenu(this, (key) => this.onTopMenuIcon(key));
    this.topMenu.setUiZoomManager(this.uiZoom);
    this.topMenu.setBoundsConstraints(
      () => this.hud.getSize().w + (this.isSmallViewport() ? 6 : 8) * (this.uiZoom?.uiZoom ?? 1),
      () =>
        this.scale.width -
        (this.infoPanel.getSize().w + (this.isSmallViewport() ? 6 : 8) * (this.uiZoom?.uiZoom ?? 1)),
    );

    // HelpModal — bảng hướng dẫn điều khiển dạng popup modal chuẩn
    this.helpModal = new HelpModal(this, () => {
      this.topMenu?.setActive('');
    });
    this.helpModal.setUiZoomManager(this.uiZoom);

    // Áp dụng responsive mode ban đầu và lắng nghe sự kiện
    this.relayoutAllPanels();
    this.scale.on('resize', () => this.relayoutAllPanels());
    this.scale.on('breakpoint-change', () => this.relayoutAllPanels());
    this.scale.on('ui-zoom-change', () => this.relayoutAllPanels());
  }

  private relayoutAllPanels(): void {
    this.applyViewportHudMode();
    this.hud?.relayout();
    this.infoPanel?.relayout();
    this.layoutLeftColumn();
    this.topMenu?.relayout();
    this.chatLog?.relayout();
    this.settingsPanel?.relayout();
    this.helpModal?.relayout();
    if (this.minimap && this.player) {
      this.minimap.update(this.player.x, this.player.y, this.cameras.main);
    }
  }

  private isSmallViewport(): boolean {
    return this.scale.width < 640 || this.scale.height < 500;
  }

  private applyViewportHudMode(): void {
    const isMini = this.manualMiniMode !== undefined ? this.manualMiniMode : this.isSmallViewport();
    const mode = isMini ? 'mini' : 'normal';
    this.hud?.setHudMode(mode);
    this.partyStrip?.setHudMode(mode);
    this.infoPanel?.setHudMode(mode);
    this.chatLog?.setHudMode(mode);
    this.minimap?.setHudMode(mode);
    this.topMenu?.setHudMode(mode);
  }

  /**
   * Xếp cột trái: PlayerHud ở trên, PartyStrip ngay bên dưới.
   * Gọi lại khi zoom hoặc resize để 2 khung không chồng lên nhau.
   */
  private layoutLeftColumn(): void {
    const z = this.uiZoom?.uiZoom ?? 1;
    const hudSize = this.hud.getSize();
    const pad = (this.isSmallViewport() ? 6 : 8) * z;
    this.partyStrip.anchorY = pad + hudSize.h + pad;
    this.partyStrip.relayoutPublic();
    if (!this.hudVisible) {
      this.partyStrip.setVisible(false);
    }
  }

  private hudVisible = true;

  private applyHudVisible(on: boolean): void {
    this.hudVisible = on;
    this.hud.setVisible(on);
    this.partyStrip.setVisible(on);
    this.chatLog.setVisible(on);
  }

  private onTopMenuIcon(key: string): void {
    switch (key) {
      case 'gps': {
        this.minimap.toggle();
        this.topMenu?.setActive(this.minimap.isVisible() ? 'gps' : '');
        break;
      }
      case 'settings':
        this.settingsPanel.toggle();
        break;
      case 'help': {
        this.helpModal.toggle();
        this.topMenu?.setActive(this.helpModal.isOpen() ? 'help' : '');
        break;
      }
      case 'logout':
        this.confirmLogout();
        break;
      case 'team': {
        this.partyStrip.toggle();
        this.topMenu?.setActive(this.partyStrip.isOpen() ? 'team' : '');
        break;
      }
      case 'pokedex':
      case 'bag':
      case 'map':
      default:
        // Các icon khác hiện chỉ là nút bấm — chưa cần popup.
        this.chatLog?.addLine(`[${key}] chưa implement`);
        break;
    }
  }

  private confirmLogout(): void {
    this.confirmModal.show({
      title: '⚠ XÁC NHẬN ĐĂNG XUẤT',
      message: 'Bạn có chắc chắn muốn đăng xuất tài khoản và quay trở lại màn hình đăng nhập không?',
      confirmText: 'Đăng xuất',
      cancelText: 'Huỷ bỏ',
      confirmColor: 0xc0392b,
      onConfirm: () => {
        ColyseusManager.getInstance().disconnect();
        this.scene.start('Login');
      },
    });
  }

  private setupDebug(): void {
    if (DEBUG) {
      this.debugText = this.add
        .text(10, 120, '', {
          fontSize: '11px',
          fontFamily: FONT.mono,
          color: '#00cec9',
        })
        .setDepth(300)
        .setScrollFactor(0);
    }
  }

  // ── 4. Network ──────────────────────────────────────────────────────────

  private setupNetwork(): void {
    // (đã xử lý trong createWorld — tách riêng để dễ bảo trì)
  }

  private syncRemotePlayers(state: any): void {
    if (!state?.players) return;
    const network = ColyseusManager.getInstance();
    const myUserId = network.id;

    const seen = new Set<string>();
    state.players.forEach((ps: any, sessionId: string) => {
      seen.add(sessionId);
      if (ps.username === myUserId || ps.id === myUserId) return;
      if (myUserId && ps.displayName === network.name && ps.username === myUserId) return;

      let rp = this.remotePlayers.get(sessionId);
      if (!rp) {
        // Remote player chưa có sprite → dùng hero sheet trước, nâng cấp sau khi load xong
        const sheetKey = this.textures.exists(TEX.hero) ? TEX.hero : TEX.trainer;
        const frameCount = sheetKey === TEX.hero ? 16 : 12;
        rp = new PlayerSprite(this, ps.x, ps.y, sheetKey, ps.username?.length ?? 1, frameCount);
        rp.setDisplayName(ps.displayName);
        this.remotePlayers.set(sessionId, rp);
        // Sprite tạo SAU setupUiCamera() → phải ignore thủ công ở UI camera,
        // nếu không nó bị render bởi cả 2 camera → nhân đôi + sai vị trí khi zoom.
        this.registerWorldObject(rp, ...rp.getChildObjects());

        // Nếu server trả sprite được gán → load sheet thay thế (async)
        if (ps.spriteUrl) {
          const key = `remote_sprite_${sessionId}`;
          const url = ps.spriteUrl.startsWith('/') ? SERVER_ORIGIN + ps.spriteUrl : ps.spriteUrl;
          loadSpriteSheet(this, key, url, ps.spriteFrame || 64, ps.spriteFrameCount || 16).then(
            (loaded) => {
              if (loaded) {
                rp!.swapSheet(loaded, ps.spriteFrameCount || 16);
              }
            },
          );
        }
      }
      rp.setPosition(ps.x, ps.y);
      if (ps.direction) rp.setDirection(ps.direction);
    });

    for (const [sid, sprite] of this.remotePlayers) {
      if (!seen.has(sid)) {
        sprite.destroy();
        this.remotePlayers.delete(sid);
      }
    }
  }

  private showChat(from: string, message: string): void {
    const text = this.add
      .text(this.player.x, this.player.y - TILE_SIZE - 4, `${from}: ${message}`, {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#fff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(20);
    // Text nổi ở world-space → phải ignore ở UI camera để không render sai vị trí khi zoom.
    this.registerWorldObject(text);
    this.tweens.add({
      targets: text,
      y: text.y - 30,
      alpha: 0,
      duration: 3000,
      onComplete: () => text.destroy(),
    });
  }

  private startBattle(): void {
    this.canMove = false;
    const network = ColyseusManager.getInstance();
    this.scene.sleep();
    network.joinBattle();
    this.scene.launch('Battle');
  }

  /**
   * Di chuyển 1 bước dọc theo path click-to-move.
   * Trả về `true` nếu đang di chuyển (để animation walk chạy).
   * Khi tới đích → dừng, trả về `false`.
   */
  private advanceAlongPath(delta: number): boolean {
    if (this.movePath.length === 0) {
      this.pointerTarget = undefined;
      return false;
    }

    const target = this.movePath[0];
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = PLAYER_SPEED * TILE_SIZE * (delta / 1000);

    // Hướng di chuyển
    let direction: Dir = this.player.getDirection();
    if (Math.abs(dx) > Math.abs(dy)) {
      direction = dx > 0 ? 'right' : 'left';
    } else if (Math.abs(dy) > 0.001) {
      direction = dy > 0 ? 'down' : 'up';
    }

    if (dist <= step) {
      // Đã tới ô này → nhảy tới ô tiếp theo
      this.player.setPosition(target.x, target.y);
      this.player.setDirection(direction);
      this.movePath.shift();
      // throttle network
      const now = performance.now();
      if (now - this.lastMoveSent > 100) {
        this.lastMoveSent = now;
        ColyseusManager.getInstance().sendMove(this.player.x, this.player.y, direction);
      }
      return this.movePath.length > 0;
    }

    // Chưa tới → tiến thêm 1 bước
    const nx = this.player.x + (dx / dist) * step;
    const ny = this.player.y + (dy / dist) * step;
    this.player.setPosition(nx, ny);
    this.player.setDirection(direction);

    const now = performance.now();
    if (now - this.lastMoveSent > 100) {
      this.lastMoveSent = now;
      ColyseusManager.getInstance().sendMove(nx, ny, direction);
    }
    return true;
  }

  // ── 5. Update ───────────────────────────────────────────────────────────

  update(time: number, delta: number): void {
    if (!this.cursors || !this.canMove) return;

    const left = this.cursors.left.isDown || !!this.wasd?.A?.isDown;
    const right = this.cursors.right.isDown || !!this.wasd?.D?.isDown;
    const up = this.cursors.up.isDown || !!this.wasd?.W?.isDown;
    const down = this.cursors.down.isDown || !!this.wasd?.S?.isDown;

    let vx = 0;
    let vy = 0;
    let keyDirection: Dir = 'down';

    if (left) {
      vx = -1;
      keyDirection = 'left';
    } else if (right) {
      vx = 1;
      keyDirection = 'right';
    } else if (up) {
      vy = -1;
      keyDirection = 'up';
    } else if (down) {
      vy = 1;
      keyDirection = 'down';
    }

    const isKeyboardMoving = vx !== 0 || vy !== 0;

    if (isKeyboardMoving) {
      if (this.movePath.length > 0) {
        this.cancelAutoMove();
      }
      this.moving = true;
      const speed = PLAYER_SPEED * TILE_SIZE;
      const nextX = this.player.x + vx * speed * (delta / 1000);
      const nextY = this.player.y + vy * speed * (delta / 1000);

      const maxX = this.mapWidth - TILE_SIZE;
      const maxY = this.mapHeight - TILE_SIZE;

      this.player.setPosition(Phaser.Math.Clamp(nextX, 0, maxX), Phaser.Math.Clamp(nextY, 0, maxY));
      this.player.setDirection(keyDirection);

      // throttle ~10/s
      if (time - this.lastMoveSent > 100) {
        this.lastMoveSent = time;
        ColyseusManager.getInstance().sendMove(this.player.x, this.player.y, keyDirection);
      }
    } else if (this.movePath.length > 0) {
      this.moving = this.advanceAlongPath(delta);
      // Đã tới đích → xoá marker
      if (!this.moving && this.movePath.length === 0) {
        this.pointerTarget = undefined;
        this.destGfx?.clear();
      }
    } else {
      this.moving = false;
    }

    this.player.animateWalk(delta, this.moving);
    this.minimap?.update(this.player.x, this.player.y, this.cameras.main);

    if (DEBUG && this.debugText) {
      const cam = this.cameras.main;
      this.debugText.setText(
        `FPS ${Math.round(this.game.loop.actualFps)}\n` +
          `px ${Math.round(this.player.x)},${Math.round(this.player.y)}\n` +
          `cam ${Math.round(cam.scrollX)},${Math.round(cam.scrollY)}\n` +
          `zoom ${cam.zoom}`,
      );
    }
  }
}
