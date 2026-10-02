import Phaser from 'phaser';
import { PlayerSprite, registerPlayerAnims, type Dir } from '../entities/PlayerSprite';
import { loadSpriteSheet } from '../entities/SpriteSheetLoader';
import { ColyseusManager } from '../network/ColyseusManager';
import { TILE_SIZE, PLAYER_SPEED, MOVE_COOLDOWN_MS, MAPS } from '@pixelmon/shared';
import { loadTiledMap, DEFAULT_MAP_ID, TILED_MAPS } from '../world/TiledMapLoader';
import { buildPlaceholderMap, MAP_W, MAP_H } from '../world/PlaceholderMap';
import { findPath, pathToPixels } from '../world/Pathfinder';
import { getCollisionGrid, type CollisionGrid } from '../world/CollisionGrid';
import { PlayerHud } from '../ui/PlayerHud';
import { PartyStrip, type PartyMember } from '../ui/PartyStrip';
import { Minimap } from '../ui/Minimap';
import { ChatLog } from '../ui/ChatLog';
import { SettingsPanel, type DebugMapInfo, type DebugPlayerInfo } from '../ui/SettingsPanel';
import { ConfirmModal } from '../ui/ConfirmModal';
import { HelpModal } from '../ui/HelpModal';
import { PcBoxModal } from '../ui/PcBoxModal';
import { PokemonSummaryModal, type PokemonData } from '../ui/PokemonSummaryModal';
import { TopMenu } from '../ui/TopMenu';
import { InfoPanel } from '../ui/InfoPanel';
import { UiZoomManager } from '../ui/UiZoomManager';
import { FONT } from '../ui/theme';
import { TEX } from './BootScene';

/** Bật để thấy FPS + toạ độ. */
const DEBUG = false;

/**
 * Depth cho các công cụ debug của Settings > tab Debug.
 * Phải > 30 (tầng `overhead` của tilemap) để không bị map che, và < 100 (HUD).
 */
const DEBUG_GRID_DEPTH = 31;
const DEBUG_TRACKER_DEPTH = 33;

/**
 * Tới `maxDelta` px theo hướng `to`, KHÔNG BAO GIỜ vượt qua đích.
 * Phaser 3.90 không có `Phaser.Math.MoveTowards` (chỉ có `Linear` → lerp
 * tiệm cận), nên tự cung cấp ở đây.
 */
function moveTowards(from: number, to: number, maxDelta: number): number {
  if (Math.abs(to - from) <= maxDelta) return to;
  return from + Math.sign(to - from) * maxDelta;
}

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
  private pcBoxModal!: PcBoxModal;
  private pokemonSummaryModal!: PokemonSummaryModal;
  /** Lưới toạ độ 32px vẽ trong world space (công cụ debug map). */
  private gridOverlay?: Phaser.GameObjects.Graphics;
  /** Nhãn toạ độ bám theo nhân vật (công cụ tracking toạ độ). */
  private coordTracker?: Phaser.GameObjects.Text;
  private currentMapId: string = DEFAULT_MAP_ID;
  private speedMultiplier = 1;
  private playerPokemonParty: PokemonData[] = [];
  private playerPokemonBox: PokemonData[] = [];
  private moveButton: 'left' | 'right' = 'left';
  private manualMiniMode?: boolean;
  private playerSheetKey: string = TEX.hero;
  private playerFrameCount = 16;
  private localPlayerSynced = false;

  private debugText?: Phaser.GameObjects.Text;

  // Click-to-move (chuột phải)
  private movePath: Array<{ x: number; y: number }> = [];
  private pointerTarget?: Phaser.Geom.Point;
  private hoverGfx?: Phaser.GameObjects.Graphics;
  private destGfx?: Phaser.GameObjects.Graphics;
  private hoverTileX = -1;
  private hoverTileY = -1;

  // ── Tile-based movement (Phase 2) ──────────────────────────────────────
  /** Grid va chạm thật của map hiện tại (SSOT: server JSON). */
  private collision!: CollisionGrid;
  /** Nhịp bước đi: bấm phím = 1 ô, giữ phím lặp mỗi MOVE_COOLDOWN_MS. */
  private nextStepAt = 0;
  /** Đang nhảy ledge (tween 2 ô) → tạm khoá input. */
  private isJumping = false;
  /** Chu kỳ gửi `move` lên server (ms) — tránh spam, khớp nhịp bước. */
  private lastNetMoveAt = 0;
  /** Hướng đang giữ phím để lặp bước. */
  private heldDir: Dir | null = null;
  /** Hướng đệm khi đang trượt ô — bước tiếp ngay khi tới tâm ô. */
  private bufferedDir: Dir | null = null;
  /** Đang trượt tới tâm ô (grid-step) → chưa nhận bước mới. */
  private isWalking = false;
  /** Điểm pixel xuất phát của bước trượt hiện tại. */
  private stepStartX = 0;
  private stepStartY = 0;
  /** Điểm pixel đích (tâm ô) của bước trượt hiện tại. */
  private stepTargetX = 0;
  private stepTargetY = 0;
  /** Hướng của bước trượt hiện tại. */
  private stepDir: Dir = 'down';
  /** Tốc độ trượt (px/s) — khớp đúng MOVE_COOLDOWN_MS để 1 ô = 1 nhịp bước. */
  private static readonly WALK_SPEED_PX = (TILE_SIZE / MOVE_COOLDOWN_MS) * 1000;
  /** Đang lướt nước (Surf). */
  private surfing = false;
  /** Khoá warp vừa kích hoạt — tránh bắn `change_map` liên tục cùng một ô. */
  private lastWarpKey = '';

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

    // Grid va chạm thật của map hiện tại (SSOT → dùng chung client/server).
    this.collision = getCollisionGrid(DEFAULT_MAP_ID);

    // Spawn: ưu tiên spawn khai báo trong MAPS, snap về tâm ô; nếu ô blocked
    // → tìm ô walkable gần nhất. Fallback về giữa map khi không có metadata.
    const meta = MAPS[DEFAULT_MAP_ID];
    const spawnPx = meta?.spawn ?? { x: mapWidth / 2, y: mapHeight / 2 };
    const spawnTile = {
      x: Math.floor(spawnPx.x / TILE_SIZE),
      y: Math.floor(spawnPx.y / TILE_SIZE),
    };
    const safeSpawn = this.collision.nearestWalkable(spawnTile.x, spawnTile.y) ?? spawnTile;
    const spawnX = safeSpawn.x * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = safeSpawn.y * TILE_SIZE + TILE_SIZE / 2;

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

    // Nạp previewUrl128 (128px) cho avatar nhân vật nếu có
    const preview128Path = userSprite?.previewUrl128
      ? (userSprite.previewUrl128.startsWith('/') ? SERVER_ORIGIN + userSprite.previewUrl128 : userSprite.previewUrl128)
      : SERVER_ORIGIN + '/sprites/previews/hero-64-128.png';

    if (preview128Path && !this.textures.exists('user_preview_128')) {
      await new Promise<void>((resolve) => {
        this.load.image('user_preview_128', preview128Path);
        this.load.once('complete', () => resolve());
        this.load.once('loaderror', () => resolve());
        this.load.start();
      });
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
      // Server xác nhận đổi map (warp) → client rejoin room mới.
      remote.onMessage('player_moved_map', (data) => this.onServerChangeMap(data));
      // Server từ chối bước đi (chống gian lận) → kéo vị trí về đúng server.
      remote.onMessage('move_rejected', (data) => this.onMoveRejected(data));
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
      ...(this.pcBoxModal ? this.pcBoxModal.getGameObjects() : []),
      ...(this.pokemonSummaryModal ? this.pokemonSummaryModal.getGameObjects() : []),
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
    // Công cụ debug (grid overlay, nhãn tracking toạ độ) thuộc thế giới game.
    if (this.gridOverlay) objs.push(this.gridOverlay);
    if (this.coordTracker) objs.push(this.coordTracker);

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
        this.settingsPanel?.setHudCheckbox('minimap', this.minimap.isVisible());
      });
      // H → ẩn/hiện bảng hướng dẫn
      this.input.keyboard.on('keydown-H', () => {
        this.helpModal?.toggle();
        this.topMenu?.setActive(this.helpModal?.isOpen() ? 'help' : '');
      });
      // B → mở/đóng PC Box
      this.input.keyboard.on('keydown-B', () => {
        this.pcBoxModal?.toggle();
        this.topMenu?.setActive(this.pcBoxModal?.isOpen() ? 'pc' : '');
        if (this.pcBoxModal?.isOpen()) {
          this.loadPlayerPokemon();
        }
      });
      // P → mở/đóng Party
      this.input.keyboard.on('keydown-P', () => {
        this.partyStrip?.toggle();
        this.topMenu?.setActive(this.partyStrip?.isOpen() ? 'team' : '');
        this.settingsPanel?.setHudCheckbox('party', this.partyStrip?.isOpen());
        if (this.partyStrip?.isOpen()) {
          this.loadPlayerPokemon();
        }
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
        if (
          this.settingsPanel?.isOpen() ||
          this.confirmModal?.isOpen() ||
          this.helpModal?.isOpen() ||
          this.pcBoxModal?.isOpen() ||
          this.pokemonSummaryModal?.isOpen()
        )
          return;
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

    const path = findPath(this.player.x, this.player.y, x, y, (c, r) => this.canEnterTile(c, r));
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
    this.hud = new PlayerHud(
      this,
      this.playerSheetKey,
      hudFrame,
      hudFrameSize,
      () => this.settingsPanel?.setHudCheckbox('profile', false),
    );
    this.hud.setUiZoomManager(this.uiZoom);
    this.hud.update({
      name,
      money: this.mockMoney,
      realMoney: this.mockRealMoney,
    });

    // PartyStrip (trái, dọc) — neo ngay dưới PlayerHud
    this.partyStrip = new PartyStrip(
      this,
      [],
      (member) => {
        if (member.pokemonData) {
          this.pokemonSummaryModal.showPokemon(member.pokemonData);
        }
      },
      () => {
        this.topMenu?.setActive('');
        this.settingsPanel?.setHudCheckbox('party', false);
      },
    );
    this.partyStrip.setUiZoomManager(this.uiZoom);
    this.layoutLeftColumn();
    this.scale.on('ui-zoom-change', () => this.layoutLeftColumn());

    // Nạp dữ liệu Pokémon của người chơi từ server
    this.loadPlayerPokemon();

    // ChatLog (phải-dưới)
    this.chatLog = new ChatLog(
      this,
      (msg) => {
        ColyseusManager.getInstance().sendChat(msg);
      },
      () => this.settingsPanel?.setHudCheckbox('chat', false),
    );
    this.chatLog.setUiZoomManager(this.uiZoom);

    // Minimap (popup dưới InfoPanel — mặc định ẩn, bật qua icon GPS)
    this.minimap = new Minimap(this);
    this.minimap.setUiZoomManager(this.uiZoom);
    this.minimap.update(this.player.x, this.player.y, this.cameras.main);

    // InfoPanel (góc trên phải) — giờ + thời tiết. Minimap neo dưới panel này.
    this.infoPanel = new InfoPanel(
      this,
      (ColyseusManager.getInstance().id || '').length,
      () => this.settingsPanel?.setHudCheckbox('clock', false),
    );
    this.infoPanel.setUiZoomManager(this.uiZoom);
    this.minimap.setAnchorYSource(() => this.infoPanel.getBottomY());

    // Settings panel (Esc / icon ⚙)
    this.settingsPanel = new SettingsPanel(this, {
      onToggleProfile: (v) => this.hud.setVisible(v),
      onToggleClock: (v) => this.infoPanel.setVisible(v),
      onToggleParty: (v) => {
        this.partyStrip.setVisible(v);
        this.topMenu?.setActive(v ? 'team' : '');
      },
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
      // ── Tab Debug (chỉ hiện khi role >= moderator) ──
      canAccessDebug: ColyseusManager.getInstance().hasDebugAccess(),
      onToggleDebugToolbar: (v) => {
        this.topMenu?.setIconVisible('debug', v);
        this.settingsPanel?.setDebugCheckbox('toolbar', v);
      },
      onToggleGrid: (v) => {
        this.setGridOverlay(v);
        this.settingsPanel?.setDebugCheckbox('grid', v);
      },
      onToggleCoordTracking: (v) => {
        this.setCoordTracking(v);
        this.settingsPanel?.setDebugCheckbox('tracking', v);
      },
      onDebugTeleport: (x, y) => this.teleportPlayer(x, y),
      onDebugSwitchMap: (mapId, x, y) => this.switchMap(mapId, x, y),
      onDebugSetSpeed: (mult) => {
        this.speedMultiplier = mult;
      },
      onDebugRunCommand: (cmd) => this.handleDebugCommand(cmd),
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

    // PokemonSummaryModal — bảng thông tin chi tiết từng Pokémon
    this.pokemonSummaryModal = new PokemonSummaryModal(this);
    this.pokemonSummaryModal.setUiZoomManager(this.uiZoom);

    // PcBoxModal — hộp lưu trữ Pokémon (PC Box)
    this.pcBoxModal = new PcBoxModal(
      this,
      this.pokemonSummaryModal,
      (newParty) => this.onPartyUpdated(newParty),
      () => this.topMenu?.setActive(''),
    );
    this.pcBoxModal.setUiZoomManager(this.uiZoom);

    // ── Công cụ Debug (chỉ bật cho tài khoản moderator trở lên) ──
    this.setupDebugTools();
    // Đồng bộ trạng thái đã lưu: thanh công cụ + grid + tracking.
    this.syncDebugTools();

    // Phím tắt F3 / F2 mở Settings ở tab Debug
    this.input.keyboard?.on('keydown-F3', (e: KeyboardEvent) => {
      e.preventDefault();
      this.openDebugTab();
    });
    this.input.keyboard?.on('keydown-F2', (e: KeyboardEvent) => {
      e.preventDefault();
      this.openDebugTab();
    });

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
    this.pcBoxModal?.relayout();
    this.pokemonSummaryModal?.relayout();
    if (this.minimap && this.player) {
      this.minimap.update(this.player.x, this.player.y, this.cameras.main);
    }
  }

  /** Nạp dữ liệu Pokémon của người chơi (Party + PC Box) từ API */
  private async loadPlayerPokemon(): Promise<void> {
    try {
      const token = localStorage.getItem('pixelmon.token');
      if (!token) {
        console.warn('[loadPlayerPokemon] no token in localStorage');
        return;
      }
      const res = await fetch(`${SERVER_ORIGIN}/api/pokemon`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok) {
        this.playerPokemonParty = data.party || [];
        this.playerPokemonBox = data.box || [];
        console.log(`[loadPlayerPokemon] loaded ${this.playerPokemonParty.length} party, ${this.playerPokemonBox.length} box`);
        this.pcBoxModal?.setStorageData(this.playerPokemonParty, this.playerPokemonBox);
        this.syncPartyStrip();
      } else {
        console.warn('[loadPlayerPokemon] API error:', data);
      }
    } catch (err) {
      console.error('[loadPlayerPokemon]', err);
    }
  }

  private syncPartyStrip(): void {
    const members: Array<PartyMember | null> = [];
    for (let i = 0; i < 6; i++) {
      const pkm = this.playerPokemonParty[i];
      if (pkm) {
        const maxHp = pkm.stats?.hp || 100;
        members.push({
          id: pkm.id,
          name: pkm.nickname || pkm.species_id,
          species_id: pkm.species_id,
          level: pkm.level,
          hp: pkm.current_hp ?? maxHp,
          maxHp,
          rarity: pkm.shiny ? 'legendary' : 'common',
          pokemonData: pkm,
        });
      } else {
        members.push(null);
      }
    }
    this.partyStrip?.setMembers(members);
    this.scheduleCameraRefresh();
  }

  private onPartyUpdated(newParty: PokemonData[]): void {
    this.playerPokemonParty = [...newParty];
    this.syncPartyStrip();
  }

  private isSmallViewport(): boolean {
    return this.scale.width < 800 || this.scale.height < 600;
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
        this.settingsPanel?.setHudCheckbox('minimap', this.minimap.isVisible());
        break;
      }
      case 'debug':
        this.openDebugTab();
        break;
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
        this.settingsPanel?.setHudCheckbox('party', this.partyStrip.isOpen());
        if (this.partyStrip.isOpen()) {
          this.loadPlayerPokemon();
        }
        break;
      }
      case 'pc': {
        this.pcBoxModal.toggle();
        this.topMenu?.setActive(this.pcBoxModal.isOpen() ? 'pc' : '');
        if (this.pcBoxModal.isOpen()) {
          this.loadPlayerPokemon();
        }
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
      const isMe =
        sessionId === network.world?.sessionId ||
        ps.username === myUserId ||
        ps.id === myUserId ||
        (myUserId && ps.displayName === network.name && ps.username === myUserId);
      if (isMe) {
        if (!this.localPlayerSynced && typeof ps.x === 'number' && typeof ps.y === 'number' && (ps.x > 0 || ps.y > 0)) {
          this.localPlayerSynced = true;
          this.player.setPosition(ps.x, ps.y);
          if (ps.direction) this.player.setDirection(ps.direction);
          console.log(`[world] restored player position from DB: (${ps.x}, ${ps.y}, ${ps.direction})`);
        }
        return;
      }

      let rp = this.remotePlayers.get(sessionId);
      if (!rp) {
        // Remote player chưa có sprite → dùng hero sheet trước, nâng cấp sau khi load xong
        const sheetKey = this.textures.exists(TEX.hero) ? TEX.hero : TEX.trainer;
        const frameCount = sheetKey === TEX.hero ? 16 : 12;
        rp = new PlayerSprite(this, ps.x, ps.y, sheetKey, ps.username?.length ?? 1, frameCount);
        rp.setDisplayName(ps.displayName);
        this.remotePlayers.set(sessionId, rp);
        (rp as any).targetX = ps.x;
        (rp as any).targetY = ps.y;
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
      // Không snap thẳng — chỉ đặt mục tiêu, `interpolateRemotePlayers` nội suy
      // mượt tới đó (server chỉ gửi vị trí mỗi nhịp bước ~150ms).
      (rp as any).targetX = ps.x;
      (rp as any).targetY = ps.y;
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
   * Di chuyển 1 bước dọc theo path click-to-move (tile-based).
   * Trả về `true` nếu đang di chuyển (để animation walk chạy).
   * Mỗi lần gọi tiến đúng 1 ô (snap tâm ô), nghỉ `MOVE_COOLDOWN_MS` giữa các ô.
   * Khi tới đích → dừng, trả về `false`.
   */
  private advanceAlongPath(_delta: number): boolean {
    if (this.movePath.length === 0) {
      this.pointerTarget = undefined;
      return false;
    }

    const target = this.movePath[0];
    const tile = {
      x: Math.floor(target.x / TILE_SIZE),
      y: Math.floor(target.y / TILE_SIZE),
    };

    // Đang trượt tới tâm ô → chờ xong mới nhận ô kế tiếp (giữ animation).
    if (this.isWalking) return true;

    // Chưa tới nhịp bước kế tiếp → coi như vẫn đang đi (giữ animation).
    if (this.time.now < this.nextStepAt) return true;

    this.nextStepAt = this.time.now + MOVE_COOLDOWN_MS;

    // Ô bị chặn (path cũ / dữ liệu đổi) → huỷ phần còn lại.
    if (!this.canEnterTile(tile.x, tile.y)) {
      this.cancelAutoMove();
      return false;
    }

    const dir = this.directionTo(this.player.x, this.player.y, target.x, target.y);
    this.stepTo(tile.x, tile.y, dir);

    // Đã tới ô này → sang ô tiếp theo.
    this.movePath.shift();
    return this.movePath.length > 0;
  }

  /**
   * Một bước tile-based: bắt đầu trạng thái trượt tới tâm ô (không snap tức thì),
   * đổi hướng, gửi `move` (throttle). Warp/surf được kiểm tra khi ĐÃ tới nơi
   * (`finishStep`) để toạ độ luôn là tâm ô.
   */
  private stepTo(tileX: number, tileY: number, dir: Dir): void {
    const center = this.tileCenter(tileX, tileY);
    this.stepStartX = this.player.x;
    this.stepStartY = this.player.y;
    this.stepTargetX = center.x;
    this.stepTargetY = center.y;
    this.stepDir = dir;
    this.isWalking = true;
    this.player.setDirection(dir);

    // Cập nhật trạng thái surf khi bước vào/ra ô nước.
    const inWater = this.collision.isWater(tileX, tileY);
    if (inWater !== this.surfing) {
      this.surfing = inWater;
      this.player.setSurfing(inWater);
    }

    this.sendMoveThrottled(center.x, center.y, dir);
  }

  /**
   * Nội suy trượt ô theo delta (Delta Grid-Step) — thay cho snap 32px từng nấc.
   * Trả về `true` nếu vẫn đang trượt (để update giữ animation).
   *
   * Khi đã tới tâm ô (sai số < 1px) → khoá vị trí, gọi `onTileEntered`
   * (warp / grass) rồi nối bước ngay nếu có phím giữ hoặc phím đệm.
   */
  private advanceStep(delta: number): boolean {
    if (!this.isWalking) return false;

    const step = (WorldScene.WALK_SPEED_PX * delta) / 1000;
    const total = Phaser.Math.Distance.Between(
      this.stepStartX, this.stepStartY, this.stepTargetX, this.stepTargetY,
    );
    // Vận tốc TUYẾN TÍNH không đổi.
    // KHÔNG dùng `Phaser.Math.Linear(cur, target, step/total)` — đó là suy giảm
    // mũ: mỗi frame chỉ ăn ~11% quãng đường CÒN LẠI nên 1 ô (32px) mất
    // 500–650ms thay vì 150ms, nhân vật "trôi lờ đờ" ở cuối ô và khoá input.
    // `MoveTowards` tiến đúng `step` px/frame → hoàn tất chính xác sau 150ms.
    const newX = moveTowards(this.player.x, this.stepTargetX, step);
    const newY = moveTowards(this.player.y, this.stepTargetY, step);
    this.player.setPosition(newX, newY);

    const remaining = Phaser.Math.Distance.Between(newX, newY, this.stepTargetX, this.stepTargetY);
    const progress = total > 0 ? Math.min(Math.max(1 - remaining / total, 0), 1) : 1;
    this.player.animateWalk(delta, true, progress);

    if (remaining > 0.01) return true;

    // Đã tới tâm ô đích — snap chính xác rồi xử lý logic sau bước.
    this.player.setPosition(this.stepTargetX, this.stepTargetY);
    this.isWalking = false;

    const col = Math.floor(this.stepTargetX / TILE_SIZE);
    const row = Math.floor(this.stepTargetY / TILE_SIZE);
    this.onTileEntered(col, row, this.stepDir);

    // Nối bước ngay nếu có phím đệm (không cần chờ nhịp cooldown).
    const next = this.bufferedDir;
    this.bufferedDir = null;
    if (next && !this.isJumping && this.handleInputDirection(next)) {
      return true;
    }
    this.nextStepAt = 0; // cho phép bấm phím mới ngay lập tức
    return false;
  }

  /** Tâm pixel của ô (col, row). */
  private tileCenter(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  /** Hướng từ điểm pixel A → B (chỉ 4 hướng, ưu tiên trục lệch nhiều hơn). */
  private directionTo(ax: number, ay: number, bx: number, by: number): Dir {
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    if (Math.abs(dy) > 0.001) return dy > 0 ? 'down' : 'up';
    return this.player.getDirection();
  }

  /** Gửi vị trí lên server, throttle theo nhịp bước. */
  private sendMoveThrottled(x: number, y: number, dir: Dir): void {
    const now = this.time.now;
    if (now - this.lastNetMoveAt < MOVE_COOLDOWN_MS - 10) return;
    this.lastNetMoveAt = now;
    ColyseusManager.getInstance().sendMove(x, y, dir);
  }

  /**
   * Ô (col,row) có thể đi vào không?
   * - Nước: chỉ khi đang Surf.
   * - Ledge: đi vào được (xử lý nhảy riêng ở `handleInputDirection`).
   */
  private canEnterTile(col: number, row: number): boolean {
    return this.collision.isWalkable(col, row, { canSurf: this.surfing });
  }

  /** Vector đơn vị của 4 hướng. */
  private static dirToVector(dir: Dir): { dx: number; dy: number } {
    switch (dir) {
      case 'up': return { dx: 0, dy: -1 };
      case 'down': return { dx: 0, dy: 1 };
      case 'left': return { dx: -1, dy: 0 };
      case 'right': return { dx: 1, dy: 0 };
    }
  }

  /**
   * Xử lý khi người chơi bấm/giữ 1 hướng: 1 ô nếu trống, nhảy 2 ô nếu là ledge,
   * chặn nếu bị va chạm.
   */
  private handleInputDirection(dir: Dir): boolean {
    if (this.isJumping) return false;
    // Đang trượt ô → chưa nhận bước mới (input đã được đệm ở update).
    if (this.isWalking) return false;

    const col = Math.floor(this.player.x / TILE_SIZE);
    const row = Math.floor(this.player.y / TILE_SIZE);

    // 1. Ledge: đứng trên ô ledge + bấm ĐÚNG hướng → nhảy 2 ô.
    const ledgeDir = this.collision.getLedgeDirection(col, row);
    if (ledgeDir) {
      if (ledgeDir !== dir) return false; // sai hướng → chặn
      const v = WorldScene.dirToVector(dir);
      const landX = col + v.dx * 2;
      const landY = row + v.dy * 2;
      if (!this.canEnterTile(landX, landY)) return false;
      this.jumpLedge(landX, landY, dir);
      return true;
    }

    // 2. Bước thường: 1 ô.
    const v = WorldScene.dirToVector(dir);
    const nx = col + v.dx;
    const ny = row + v.dy;
    if (!this.canEnterTile(nx, ny)) {
      // Không đi được — vẫn quay mặt sang hướng đó (phản hồi trực quan).
      this.player.setDirection(dir);
      return false;
    }
    this.stepTo(nx, ny, dir);
    return true;
  }

  /** Nhảy ledge: tween 2 ô, khoá input, gửi vị trí đáp. */
  private jumpLedge(landX: number, landY: number, dir: Dir): void {
    this.isJumping = true;
    this.cancelAutoMove();
    this.bufferedDir = null;
    const center = this.tileCenter(landX, landY);
    this.player.jumpTo(center.x, center.y, dir, 220, () => {
      this.isJumping = false;
      this.surfing = this.collision.isWater(landX, landY);
      this.player.setSurfing(this.surfing);
      this.sendMoveThrottled(center.x, center.y, dir);
      this.onTileEntered(landX, landY, dir);
    });
  }

  /** Sau mỗi bước: kiểm tra warp (cửa nhà) và cỏ cao (encounter). */
  private onTileEntered(col: number, row: number, _dir: Dir): void {
    // Warp → yêu cầu server chuyển map (Phase 3 xử lý broadcast).
    const warp = this.collision.getWarpAt(col, row);
    if (warp) {
      const zoneKey = `${this.currentMapId}:${col},${row}`;
      if (this.lastWarpKey !== zoneKey) {
        this.lastWarpKey = zoneKey;
        ColyseusManager.getInstance().sendChangeMap(warp.toMap ?? '', warp.toX ?? 0, warp.toY ?? 0);
      }
      return;
    }

    // Grass encounter (hiện dữ liệu chưa bật flag GRASS → luôn false).
    if (this.collision.isGrass(col, row) && this.canMove && !this.scene.isSleeping()) {
      const rate = MAPS[this.currentMapId]?.encounterRate ?? 0;
      if (rate > 0 && Math.random() * 100 < Math.min(rate, 12) * 0.1) {
        this.startBattle();
      }
    }
  }

  /** Xử lý yêu cầu đổi map từ server (`player_moved_map`). */
  private async onServerChangeMap(data: any): Promise<void> {
    const mapId = data?.mapId;
    if (!mapId || !TILED_MAPS[mapId]) return;
    await this.switchMap(mapId, data.x, data.y);
  }

  /** Server từ chối bước đi → snap về vị trí authoritative của server. */
  private onMoveRejected(data: any): void {
    if (typeof data?.x !== 'number' || typeof data?.y !== 'number') return;
    this.cancelAutoMove();
    // Server từ chối → toạ độ authoritative, phải bỏ bước trượt đang dở.
    this.isWalking = false;
    this.bufferedDir = null;
    this.nextStepAt = 0;
    this.player.setPosition(data.x, data.y);
    if (data.direction) this.player.setDirection(data.direction);
  }

  // ── 5. Update ───────────────────────────────────────────────────────────

  /**
   * Nội suy vị trí remote player (LERP) — server chỉ gửi vị trí mỗi nhịp bước
   * (~150ms), nên cần nội suy để chuyển động mượt thay vì nhảy từng ô 32px.
   * Hệ số nội suy theo delta để mượt đều ở mọi FPS.
   */
  private interpolateRemotePlayers(delta: number): void {
    if (this.remotePlayers.size === 0) return;
    const t = Math.min(delta / 100, 1); // ~100ms để bắt kịp mục tiêu
    this.remotePlayers.forEach((rp) => {
      const targetX = (rp as any).targetX as number | undefined;
      const targetY = (rp as any).targetY as number | undefined;
      if (targetX === undefined || targetY === undefined) return;
      if (Math.abs(rp.x - targetX) < 0.5 && Math.abs(rp.y - targetY) < 0.5) {
        if (rp.x !== targetX || rp.y !== targetY) rp.setPosition(targetX, targetY);
        return;
      }
      rp.setPosition(
        Phaser.Math.Linear(rp.x, targetX, t),
        Phaser.Math.Linear(rp.y, targetY, t),
      );
    });
  }

  update(time: number, delta: number): void {
    if (!this.cursors || !this.canMove) return;

    const left = this.cursors.left.isDown || !!this.wasd?.A?.isDown;
    const right = this.cursors.right.isDown || !!this.wasd?.D?.isDown;
    const up = this.cursors.up.isDown || !!this.wasd?.W?.isDown;
    const down = this.cursors.down.isDown || !!this.wasd?.S?.isDown;

    // Một hướng tại một thời điểm (ưu tiên trái/phải như bản cũ).
    let keyDirection: Dir | null = null;
    if (left) keyDirection = 'left';
    else if (right) keyDirection = 'right';
    else if (up) keyDirection = 'up';
    else if (down) keyDirection = 'down';

    // Bỏ giữ phím → reset CẢ heldDir lẫn bufferedDir.
    // Trước đây chỉ xóa heldDir nên cú "nhấp" (tap ~100–200ms) vẫn để lại hướng
    // trong bufferedDir → advanceStep() sau khi tới tâm ô tự ép bước thêm ô thứ 2.
    if (!keyDirection) {
      this.heldDir = null;
      this.bufferedDir = null;
    }

    // Ưu tiên nội suy trượt ô — mọi input khác chờ tới tâm ô rồi xử lý.
    const walking = this.advanceStep(delta);

    if (keyDirection && !this.isJumping && !walking) {
      if (this.movePath.length > 0) this.cancelAutoMove();
      // Chỉ animate walk khi thật sự bước được ô (tránh đứng đánh võng trước tường).
      let stepped = false;

      // Bước nếu là lần bấm đầu tiên HOẶC đã qua nhịp MOVE_COOLDOWN_MS.
      const firstPress = this.heldDir !== keyDirection;
      if (firstPress || this.time.now >= this.nextStepAt) {
        this.nextStepAt = this.time.now + MOVE_COOLDOWN_MS;
        stepped = this.handleInputDirection(keyDirection);
      } else {
        stepped = true; // vẫn trong nhịp bước vừa thực hiện → giữ anim
      }
      this.heldDir = keyDirection;
      this.bufferedDir = null;
      this.moving = stepped;
    } else if (keyDirection && this.isJumping) {
      this.moving = true;
    } else if (keyDirection && walking) {
      // Đang trượt ô — đệm hướng CHỈ KHI phím vẫn đang tiếp tục được giữ
      // (đã clear ở nhánh `!keyDirection` phía trên nên tap không còn gây bước 2).
      this.bufferedDir = keyDirection;
      this.heldDir = keyDirection;
      this.moving = true;
    } else if (this.isJumping) {
      this.moving = true;
    } else if (walking) {
      // Không còn phím giữ nhưng vẫn trượt → giữ anim tới nơi.
      this.moving = true;
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

    // Khi đang trượt ô, advanceStep đã gọi animateWalk với progress —
    // không gọi thêm ở đây để tránh fallback timer ghi đè frame.
    if (!walking) {
      this.player.animateWalk(delta, this.moving);
    }
    this.interpolateRemotePlayers(delta);
    this.updateCoordTracker();
    this.minimap?.update(this.player.x, this.player.y, this.cameras.main);

    // Cập nhật thông số thời gian thực vào tab Debug (nếu đang mở)
    if (this.settingsPanel?.isOpen() && this.settingsPanel.getActiveTab() === 'debug') {
      const mapMeta = MAPS[this.currentMapId];
      const tmj = TILED_MAPS[this.currentMapId];
      const objGroup = tmj?.layers?.find((l: any) => l.type === 'objectgroup');
      const warpsCount = objGroup?.objects?.length ?? 0;

      const mapInfo: DebugMapInfo = {
        id: this.currentMapId,
        name: mapMeta?.name ?? this.currentMapId,
        widthTiles: Math.round(this.mapWidth / TILE_SIZE),
        heightTiles: Math.round(this.mapHeight / TILE_SIZE),
        widthPx: Math.round(this.mapWidth),
        heightPx: Math.round(this.mapHeight),
        layersCount: this.tiledLayers.length || 1,
        warpsCount,
        tilesetName:
          this.currentMapId.includes('house') || this.currentMapId.includes('lab')
            ? 'Interior general.png'
            : 'Outside.png',
      };

      const cam = this.cameras.main;
      const playerInfo: DebugPlayerInfo = {
        x: this.player.x,
        y: this.player.y,
        tileX: Math.floor(this.player.x / TILE_SIZE),
        tileY: Math.floor(this.player.y / TILE_SIZE),
        direction: this.player.getDirection(),
        isMoving: this.moving,
        speed: PLAYER_SPEED * this.speedMultiplier,
        fps: Math.round(this.game.loop.actualFps),
        camX: Math.round(cam.scrollX),
        camY: Math.round(cam.scrollY),
        zoom: cam.zoom,
      };

      this.settingsPanel.updateDebugInfo(mapInfo, playerInfo);
    }

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

  // ── 6. Debug Helpers ────────────────────────────────────────────────────

  /** Mở Settings ở tab Debug (chỉ hoạt động khi user đủ quyền). */
  public openDebugTab(): void {
    if (!ColyseusManager.getInstance().hasDebugAccess()) {
      this.chatLog?.addLine('[debug] Cần quyền moderator trở lên để dùng công cụ Debug.');
      return;
    }
    this.settingsPanel?.openDebugTab();
    this.topMenu?.setActive('settings');
  }

  /**
   * Khởi tạo & đồng bộ trạng thái 3 công cụ debug từ Settings:
   * thanh công cụ Debug, lưới toạ độ, bộ theo dõi toạ độ.
   */
  private setupDebugTools(): void {
    // Depth phải CAO hơn mọi tầng tilemap (ground 10, deco 12, overhead 30)
    // để lưới vẽ đè lên nhà/cây — công cụ kiểm tra ô mà bị tàng che thì vô nghĩa.
    // 31: cao hơn overhead (30) nhưng vẫn dưới HUD (100+).
    this.gridOverlay = this.add
      .graphics()
      .setDepth(DEBUG_GRID_DEPTH)
      .setVisible(false)
      .setScrollFactor(1);
    this.registerWorldObject(this.gridOverlay);

    // Nhãn toạ độ nằm trên tầng overhead + trên đầu nhân vật.
    // `stroke` đen để đọc được trên nền cỏ/sàn sáng.
    this.coordTracker = this.add
      .text(0, 0, '', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#00cec9',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEBUG_TRACKER_DEPTH)
      .setScrollFactor(1)
      .setVisible(false);
    this.registerWorldObject(this.coordTracker);
  }

  /** Áp dụng trạng thái đã lưu (từ Settings) vào UI — gọi sau khi tạo panel. */
  private syncDebugTools(): void {
    // Không đủ quyền → ẩn hẳn icon Debug trên TopMenu, không mở debug tab.
    if (!ColyseusManager.getInstance().hasDebugAccess()) {
      this.topMenu?.setIconVisible('debug', false);
      return;
    }
    const st = this.settingsPanel?.getDebugState();
    if (!st) return;
    this.topMenu?.setIconVisible('debug', st.toolbar);
    this.setGridOverlay(st.grid);
    this.setCoordTracking(st.tracking);
  }

  private setGridOverlay(on: boolean): void {
    if (!this.gridOverlay) return;
    this.gridOverlay.setVisible(on);
    if (on) this.drawGrid();
  }

  private setCoordTracking(on: boolean): void {
    this.coordTracker?.setVisible(on);
    if (!on) this.coordTracker?.setText('');
  }

  /** Vẽ lưới 32px phủ toàn map để kiểm tra toạ độ ô & vùng va chạm. */
  private drawGrid(): void {
    const g = this.gridOverlay;
    if (!g) return;
    g.clear();

    const cols = Math.round(this.mapWidth / TILE_SIZE);
    const rows = Math.round(this.mapHeight / TILE_SIZE);

    // Lưới phụ (viền từng ô)
    g.lineStyle(1, 0x00cec9, 0.35);
    for (let c = 0; c <= cols; c++) {
      g.lineBetween(c * TILE_SIZE, 0, c * TILE_SIZE, rows * TILE_SIZE);
    }
    for (let r = 0; r <= rows; r++) {
      g.lineBetween(0, r * TILE_SIZE, cols * TILE_SIZE, r * TILE_SIZE);
    }

    // Lưới chính (mỗi 8 ô) — dùng để đếm nhanh toạ độ khi debug map
    g.lineStyle(1, 0xfdcb6e, 0.8);
    for (let c = 0; c <= cols; c += 8) g.lineBetween(c * TILE_SIZE, 0, c * TILE_SIZE, rows * TILE_SIZE);
    for (let r = 0; r <= rows; r += 8) g.lineBetween(0, r * TILE_SIZE, cols * TILE_SIZE, r * TILE_SIZE);

    // Đánh dấu tâm ô spawn
    const meta = MAPS[this.currentMapId];
    if (meta?.spawn) {
      g.fillStyle(0xff7675, 0.9);
      g.fillCircle(meta.spawn.x, meta.spawn.y, 4);
    }
  }

  /** Cập nhật nhãn tracking toạ độ — bám theo nhân vật, đổi màu khi đang trượt ô. */
  private updateCoordTracker(): void {
    const t = this.coordTracker;
    if (!t || !t.visible || !this.player) return;

    const col = Math.floor(this.player.x / TILE_SIZE);
    const row = Math.floor(this.player.y / TILE_SIZE);
    const state = this.isWalking ? 'SLIDING' : this.moving ? 'WALK' : 'IDLE';
    t.setText(`[${col}, ${row}]  ${Math.round(this.player.x)},${Math.round(this.player.y)}  ${state}`);
    // Đặt phía TRÊN bảng tên (nameOffsetY) — nếu đặt tại y - TILE_SIZE - 8
    // sẽ trùng vị trí bảng tên → 2 dòng chồng lên nhau không đọc được.
    // +18 = chiều cao 1 dòng text (≈11px) + 7px lề an toàn.
    t.setPosition(this.player.x, this.player.y - this.player.nameOffsetY - 18);
  }

  public teleportPlayer(x: number, y: number): void {
    const maxX = this.mapWidth - TILE_SIZE;
    const maxY = this.mapHeight - TILE_SIZE;
    const clampedX = Phaser.Math.Clamp(x, 0, maxX);
    const clampedY = Phaser.Math.Clamp(y, 0, maxY);

    this.cancelAutoMove();
    // Teleport = snap tức thì → huỷ bước trượt đang dở để không trôi về đích cũ.
    this.isWalking = false;
    this.bufferedDir = null;
    this.nextStepAt = 0;
    // Snap về tâm ô gần nhất để giữ mô hình tile-based.
    const col = Math.floor(clampedX / TILE_SIZE);
    const row = Math.floor(clampedY / TILE_SIZE);
    const safe = this.collision.nearestWalkable(col, row, { canSurf: this.surfing }) ?? { x: col, y: row };
    const center = this.tileCenter(safe.x, safe.y);

    this.player.setPosition(center.x, center.y);
    this.surfing = this.collision.isWater(safe.x, safe.y);
    this.player.setSurfing(this.surfing);
    ColyseusManager.getInstance().sendMove(center.x, center.y, this.player.getDirection());
    console.log(`[debug] teleported player to (${center.x}, ${center.y})`);
  }

  public async switchMap(mapId: string, targetX?: number, targetY?: number): Promise<void> {
    if (!TILED_MAPS[mapId]) {
      console.warn(`[debug] map "${mapId}" not found in TILED_MAPS`);
      this.settingsPanel?.log(`Không tìm thấy map: "${mapId}"`);
      return;
    }

    try {
      // 1. Huỷ các layer cũ
      if (this.tiledLayers && this.tiledLayers.length > 0) {
        this.tiledLayers.forEach((l) => l.destroy());
        this.tiledLayers = [];
      }
      if (this.mapLayer) {
        this.mapLayer.destroy();
      }

      // 2. Nạp map mới
      const loaded = await loadTiledMap(this, mapId, 10);
      this.tiledLayers = loaded.layers;
      this.mapLayer = loaded.layers[0];
      this.mapWidth = loaded.width;
      this.mapHeight = loaded.height;
      this.currentMapId = mapId;
      // Cập nhật grid va chạm sang map mới + reset trạng thái warp.
      this.collision = getCollisionGrid(mapId);
      this.lastWarpKey = '';
      this.isJumping = false;
      this.heldDir = null;
      this.bufferedDir = null;
      this.isWalking = false;
      this.nextStepAt = 0;
      // Đổi map → vẽ lại lưới toạ độ cho map mới
      if (this.gridOverlay?.visible) this.drawGrid();

      // 3. Đặt lại toạ độ người chơi
      const meta = MAPS[mapId];
      const spawnX = targetX ?? meta?.spawn.x ?? loaded.width / 2;
      const spawnY = targetY ?? meta?.spawn.y ?? loaded.height / 2;
      this.teleportPlayer(spawnX, spawnY);

      // 4. Giới hạn camera bounds
      this.physics.world?.setBounds(0, 0, loaded.width, loaded.height);
      this.updateCameraBounds();

      // 5. Cập nhật ignore list camera UI
      this.registerWorldObject(...loaded.layers);

      this.settingsPanel?.log(`Đã chuyển thành công sang map "${meta?.name ?? mapId}"!`);
    } catch (err: any) {
      console.error(`[debug] switchMap error:`, err);
      this.settingsPanel?.log(`Lỗi tải map: ${err.message}`);
    }
  }

  private handleDebugCommand(cmd: string): string {
    const parts = cmd.trim().split(/\s+/);
    const action = parts[0]?.toLowerCase();

    if (action === '/tp') {
      if (parts.length === 2) {
        this.switchMap(parts[1]);
        return `Đang chuyển tới map: ${parts[1]}`;
      } else if (parts.length >= 3) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        this.teleportPlayer(x, y);
        return `Teleport tới: (${x}, ${y})`;
      }
      return 'Cú pháp: /tp <x> <y> hoặc /tp <mapId>';
    }

    if (action === '/speed') {
      const mult = parseFloat(parts[1]);
      if (!isNaN(mult) && mult > 0) {
        this.speedMultiplier = mult;
        return `Tốc độ di chuyển: ${mult}x`;
      }
      return 'Cú pháp: /speed <hệ số>';
    }

    if (action === '/pos') {
      return `Pos: (${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}), Tile: [${Math.floor(
        this.player.x / TILE_SIZE,
      )}, ${Math.floor(this.player.y / TILE_SIZE)}]`;
    }

    return `Lệnh không hợp lệ: ${cmd}`;
  }
}
