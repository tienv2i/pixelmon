import Phaser from 'phaser';
import { PlayerSprite, registerPlayerAnims, type Dir } from '../entities/PlayerSprite';
import { loadSpriteSheet } from '../entities/SpriteSheetLoader';
import { ColyseusManager } from '../network/ColyseusManager';
import { TILE_SIZE, PLAYER_SPEED, MOVE_COOLDOWN_MS, MAPS, resolveSpawnTile } from '@pixelmon/shared';
import { loadTiledMap, DEFAULT_MAP_ID, TILED_MAPS } from '../world/TiledMapLoader';
import { buildPlaceholderMap, MAP_W, MAP_H } from '../world/PlaceholderMap';
import { findPath, pathToPixels } from '../world/Pathfinder';
import { getCollisionGrid, type CollisionGrid } from '../world/CollisionGrid';
import { PlayerHud } from '../ui/PlayerHud';
import { PartyStrip, type PartyMember } from '../ui/PartyStrip';
import { Minimap } from '../ui/Minimap';
import { ChatLog } from '../ui/ChatLog';
import { SettingsPanel } from '../ui/SettingsPanel';
import { loadSettings, saveSettings, type GameViewAnchor } from '../ui/SettingsStorage';
import {
  DebugModal,
  MAP_LAYER_KEYS,
  type MapLayerKey,
  type DebugMapInfo,
  type DebugPlayerInfo,
} from '../ui/DebugModal';
import { DebugConsole } from '../ui/DebugConsole';
import { DebugTrackerWidget } from '../ui/DebugTrackerWidget';
import {
  DebugMapWidget,
  DebugPlayerWidget,
  DebugCoordWidget,
  DebugPerfWidget,
} from '../ui/DebugInfoWidgets';
import { ConfirmModal } from '../ui/ConfirmModal';
import { HelpModal } from '../ui/HelpModal';
import { PcBoxModal } from '../ui/PcBoxModal';
import { PokemonSummaryModal, type PokemonData } from '../ui/PokemonSummaryModal';
import { TopMenu } from '../ui/TopMenu';
import { InfoPanel } from '../ui/InfoPanel';
import { UiZoomManager } from '../ui/UiZoomManager';
import { FONT } from '../ui/theme';
import { t } from '../i18n';
import { TEX } from './BootScene';

/** Bật để thấy FPS + toạ độ. */
const DEBUG = false;

/**
 * Depth cho các công cụ debug của Settings > tab Debug.
 * Phải > 30 (tầng `overhead` của tilemap) để không bị map che, và < 100 (HUD).
 */
const DEBUG_GRID_DEPTH = 31;
const DEBUG_COLLISION_DEPTH = 31.5;
const DEBUG_WARP_DEPTH = 32;
const DEBUG_TRACKER_DEPTH = 33;

/**
 * 3 tầng tilemap chuẩn của bản đồ Essentials (khớp `TiledMapLoader`).
 * Dùng để bật/tắt từng lớp ở tab Debug → kiểm tra lỗi "nhân vật bị che"
 * hoặc "thiếu trang trí" mà không cần sửa code.
 */

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
  private debugModal!: DebugModal;
  private debugConsole!: DebugConsole;
  private debugTrackerWidget!: DebugTrackerWidget;
  private debugMapWidget!: DebugMapWidget;
  private debugPlayerWidget!: DebugPlayerWidget;
  private debugCoordWidget!: DebugCoordWidget;
  private debugPerfWidget!: DebugPerfWidget;
  private noclip = false;
  /** Lưới toạ độ 32px vẽ trong world space (công cụ debug map). */
  private gridOverlay?: Phaser.GameObjects.Graphics;
  /** Overlay vẽ vùng va chạm (blocked/water/grass/ledge) từng ô. */
  private collisionOverlay?: Phaser.GameObjects.Graphics;
  /** Overlay vẽ điểm warp (cổng chuyển map) trên bản đồ. */
  private warpOverlay?: Phaser.GameObjects.Graphics;
  /** Nhãn toạ độ bám theo nhân vật (công cụ tracking toạ độ). */
  private coordTracker?: Phaser.GameObjects.Text;
  /** Trạng thái hiển thị của từng lớp tilemap (Ground/Decoration/Overhead). */
  private layerVisibility: Record<MapLayerKey, boolean> = {
    ground: true,
    decoration: true,
    overhead: true,
  };
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
  private showMouseTracking = true;
  private showTargetMarker = true;

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
    const network = ColyseusManager.getInstance();
    const savedLoc = network.savedLocation;
    const initialMapId =
      savedLoc?.mapId && (TILED_MAPS[savedLoc.mapId] || MAPS[savedLoc.mapId])
        ? savedLoc.mapId
        : DEFAULT_MAP_ID;
    this.currentMapId = initialMapId;

    // Load map (Tiled hoặc placeholder)
    let mapWidth = MAP_W;
    let mapHeight = MAP_H;
    let mapLayers: Phaser.Tilemaps.TilemapLayer[] = [];

    if (USE_TILED_MAP && TILED_MAPS[initialMapId]) {
      try {
        const loaded = await loadTiledMap(this, initialMapId, 10);
        mapLayers = loaded.layers;
        mapWidth = loaded.width;
        mapHeight = loaded.height;
        this.tiledLayers = mapLayers; // Lưu lại để getWorldObjects() include
        console.log(
          `[world] loaded Tiled map "${initialMapId}": ${mapWidth}×${mapHeight}, ${mapLayers.length} layers`,
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
    this.collision = getCollisionGrid(initialMapId);

    // Spawn: ưu tiên toạ độ đã lưu, rồi đến spawn khai báo trong MAPS, snap về tâm ô; nếu ô blocked
    // → tìm ô walkable gần nhất. Fallback về giữa map khi không có metadata.
    const meta = MAPS[initialMapId];
    // MAPS.spawn là TILE coords → convert sang pixel (savedLoc đã là pixel).
    let spawnPx = meta?.spawn
      ? { x: meta.spawn.x * TILE_SIZE + TILE_SIZE / 2, y: meta.spawn.y * TILE_SIZE + TILE_SIZE / 2 }
      : { x: mapWidth / 2, y: mapHeight / 2 };
    if (
      savedLoc &&
      savedLoc.mapId === initialMapId &&
      typeof savedLoc.x === 'number' &&
      typeof savedLoc.y === 'number' &&
      (savedLoc.x > 0 || savedLoc.y > 0)
    ) {
      spawnPx = { x: savedLoc.x, y: savedLoc.y };
    }
    const spawnTile = {
      x: Math.floor(spawnPx.x / TILE_SIZE),
      y: Math.floor(spawnPx.y / TILE_SIZE),
    };
    const safeSpawn = this.collision.nearestWalkable(spawnTile.x, spawnTile.y) ?? spawnTile;
    const spawnX = safeSpawn.x * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = safeSpawn.y * TILE_SIZE + TILE_SIZE / 2;

    // Tạo sprite — ưu tiên sprite user được gán trong thư viện admin,
    // nếu không có → hero sheet (đã load ở BootScene), cuối cùng → trainer.
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
    if (savedLoc?.direction) {
      this.player.setDirection(savedLoc.direction as Dir);
    }
    network.updateLocation(initialMapId, spawnX, spawnY, this.player.getDirection());

    // Remote players & server messages
    this.bindWorldRoomEvents();

    // ⚠️ BỎ global click → random battle. Trước đây `pointerdown` bắn 30% mỗi cú click
    // bất kỳ (chạm UI, click trống, click button...) → cửa sổ battle hiện ra "tự nhiên".
    // Battle giờ chỉ mở qua: bấm trực tiếp lên nhân vật, hoặc gặp grass encounter thật.
  }

  /** Lắng nghe các sự kiện từ room World của Colyseus. */
  private bindWorldRoomEvents(): void {
    const remote = ColyseusManager.getInstance().world;
    if (!remote) return;
    remote.onStateChange((state) => this.syncRemotePlayers(state));
    remote.onMessage('chat', (data) => this.showChat(data.from, data.message));
    // Server xác nhận đổi map (warp) → client rejoin room mới.
    remote.onMessage('player_moved_map', (data) => this.onServerChangeMap(data));
    // Server từ chối bước đi (chống gian lận) → kéo vị trí về đúng server.
    remote.onMessage('move_rejected', (data) => this.onMoveRejected(data));
  }

  private mapWidth = 60 * 32;
  private mapHeight = 45 * 32;
  private viewAnchor: GameViewAnchor = 'center';

  /**
   * Cập nhật camera bounds và follow offset theo mốc neo viewAnchor
   * (căn 4 cạnh, 4 góc hoặc center khi viewport lớn hơn map, hoặc dịch tâm camera khi theo dõi player).
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

    // 1. Tính boundX theo mốc neo (khi viewport lớn hơn map)
    let boundX = 0;
    if (diffX > 0) {
      if (this.viewAnchor === 'left' || this.viewAnchor === 'top-left' || this.viewAnchor === 'bottom-left') {
        boundX = 0;
      } else if (this.viewAnchor === 'right' || this.viewAnchor === 'top-right' || this.viewAnchor === 'bottom-right') {
        boundX = -diffX;
      } else {
        boundX = -diffX / 2;
      }
    }

    // 2. Tính boundY theo mốc neo (khi viewport lớn hơn map)
    let boundY = 0;
    if (diffY > 0) {
      if (this.viewAnchor === 'top' || this.viewAnchor === 'top-left' || this.viewAnchor === 'top-right') {
        boundY = 0;
      } else if (this.viewAnchor === 'bottom' || this.viewAnchor === 'bottom-left' || this.viewAnchor === 'bottom-right') {
        boundY = -diffY;
      } else {
        boundY = -diffY / 2;
      }
    }

    const boundW = diffX > 0 ? dw : this.mapWidth;
    const boundH = diffY > 0 ? dh : this.mapHeight;

    cam.setBounds(boundX, boundY, boundW, boundH);

    // 3. Camera follow offset khi camera theo dõi player trên map lớn
    let offX = 0;
    if (this.viewAnchor === 'left' || this.viewAnchor === 'top-left' || this.viewAnchor === 'bottom-left') {
      offX = Math.round(dw * 0.22);
    } else if (this.viewAnchor === 'right' || this.viewAnchor === 'top-right' || this.viewAnchor === 'bottom-right') {
      offX = -Math.round(dw * 0.22);
    }

    let offY = 0;
    if (this.viewAnchor === 'top' || this.viewAnchor === 'top-left' || this.viewAnchor === 'top-right') {
      offY = Math.round(dh * 0.22);
    } else if (this.viewAnchor === 'bottom' || this.viewAnchor === 'bottom-left' || this.viewAnchor === 'bottom-right') {
      offY = -Math.round(dh * 0.22);
    }

    cam.setFollowOffset(offX, offY);
  }

  public setViewAnchor(anchor: GameViewAnchor): void {
    this.viewAnchor = anchor;
    this.updateCameraBounds();
  }

  private setupCameraFollow(): void {
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    const saved = loadSettings();
    const targetZoom = typeof saved.zoom?.gameZoom === 'number' ? saved.zoom.gameZoom : 1.0;
    cam.setZoom(targetZoom);
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
    saveSettings({ zoom: { gameZoom: next } });
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
      ...(this.debugModal ? this.debugModal.getGameObjects() : []),
      ...(this.debugConsole ? this.debugConsole.getGameObjects() : []),
      ...(this.debugTrackerWidget ? this.debugTrackerWidget.getGameObjects() : []),
      ...(this.debugMapWidget ? this.debugMapWidget.getGameObjects() : []),
      ...(this.debugPlayerWidget ? this.debugPlayerWidget.getGameObjects() : []),
      ...(this.debugCoordWidget ? this.debugCoordWidget.getGameObjects() : []),
      ...(this.debugPerfWidget ? this.debugPerfWidget.getGameObjects() : []),
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
    // Công cụ debug (grid/collision/warp overlay, nhãn tracking toạ độ) thuộc thế giới game.
    if (this.gridOverlay) objs.push(this.gridOverlay);
    if (this.collisionOverlay) objs.push(this.collisionOverlay);
    if (this.warpOverlay) objs.push(this.warpOverlay);
    if (this.coordTracker) objs.push(this.coordTracker);
    if (this.hoverGfx) objs.push(this.hoverGfx);
    if (this.destGfx) objs.push(this.destGfx);

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
          this.debugModal?.isOpen() ||
          this.confirmModal?.isOpen() ||
          this.helpModal?.isOpen() ||
          this.pcBoxModal?.isOpen() ||
          this.pokemonSummaryModal?.isOpen() ||
          this.topMenu?.isToolsModalOpen()
        )
          return;

        // Chỉ bỏ qua nếu thực sự nhấp vào UI element có depth >= 100 và đang hiển thị
        const isUiClick = over.some((o: any) => {
          if (!o || o.visible === false || o.input?.enabled === false) return false;
          let parent = o.parentContainer;
          while (parent) {
            if (parent.visible === false) return false;
            parent = parent.parentContainer;
          }
          let d = o.depth ?? 0;
          let pNode = o.parentContainer;
          while (pNode) {
            d = Math.max(d, pNode.depth ?? 0);
            pNode = pNode.parentContainer;
          }
          return d >= 100;
        });
        if (isUiClick) return;

        const wantPan = p.middleButtonDown() || (p.leftButtonDown() && p.event?.shiftKey);
        if (wantPan) return;

        const isLeft = p.leftButtonDown() || p.button === 0;
        const isRight = p.rightButtonDown() || p.button === 2;
        if (!isLeft && !isRight) return;

        const wp = this.cameras.main.getWorldPoint(p.x, p.y);
        this.issueMoveTo(wp.x, wp.y);
      },
    );

    // Middle-button (hoặc Shift + left) → drag pan camera
    this.input.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (this.settingsPanel?.isOpen() || this.debugModal?.isOpen()) return;
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

    // Khởi tạo đồ hoạ Mouse Tracking & Đích đến (depth 35 & 34 nằm trên mọi lớp tilemap)
    this.hoverGfx = this.add.graphics().setDepth(35);
    this.registerWorldObject(this.hoverGfx);

    this.destGfx = this.add.graphics().setDepth(34);
    this.registerWorldObject(this.destGfx);
  }

  // ── Hover tile + click-to-move ──────────────────────────────────────────

  /** Highlight ô dưới con trỏ chuột (Mouse Tracking: làm dấu ô có chuột lướt ngang). */
  private updateHoverTile(px: number, py: number): void {
    if (!this.showMouseTracking) {
      if (this.hoverGfx) this.hoverGfx.clear();
      this.hoverTileX = -1;
      this.hoverTileY = -1;
      return;
    }

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
      this.hoverGfx = this.add.graphics().setDepth(35);
      this.registerWorldObject(this.hoverGfx);
    }
    this.hoverGfx.clear();
    this.hoverGfx.setDepth(35);

    const walkable = this.canEnterTile(col, row);
    const color = walkable ? 0x00cec9 : 0xff7675;

    // 1. Nền mờ nhẹ làm dấu ô có chuột lướt ngang
    this.hoverGfx.fillStyle(color, 0.22);
    this.hoverGfx.fillRect(cx, cy, TILE_SIZE, TILE_SIZE);

    // 2. Viền ngoài
    this.hoverGfx.lineStyle(2, color, 0.95);
    this.hoverGfx.strokeRect(cx + 0.5, cy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

    // 3. Bốn góc L (corner accents) sắc nét tạo cảm giác lưới tracking pixel art
    const cornerLen = 6;
    this.hoverGfx.lineStyle(2.5, 0xffffff, 1);
    // Top-left
    this.hoverGfx.lineBetween(cx, cy, cx + cornerLen, cy);
    this.hoverGfx.lineBetween(cx, cy, cx, cy + cornerLen);
    // Top-right
    this.hoverGfx.lineBetween(cx + TILE_SIZE, cy, cx + TILE_SIZE - cornerLen, cy);
    this.hoverGfx.lineBetween(cx + TILE_SIZE, cy, cx + TILE_SIZE, cy + cornerLen);
    // Bottom-left
    this.hoverGfx.lineBetween(cx, cy + TILE_SIZE, cx + cornerLen, cy + TILE_SIZE);
    this.hoverGfx.lineBetween(cx, cy + TILE_SIZE, cx, cy + TILE_SIZE - cornerLen);
    // Bottom-right
    this.hoverGfx.lineBetween(cx + TILE_SIZE, cy + TILE_SIZE, cx + TILE_SIZE - cornerLen, cy + TILE_SIZE);
    this.hoverGfx.lineBetween(cx + TILE_SIZE, cy + TILE_SIZE, cx + TILE_SIZE, cy + cornerLen);
  }

  /** Bật click-to-move: đánh dấu ngay ô click và tự động tìm đường di chuyển. */
  private issueMoveTo(x: number, y: number): void {
    const maxCols = Math.floor(this.mapWidth / TILE_SIZE);
    const maxRows = Math.floor(this.mapHeight / TILE_SIZE);
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (col < 0 || row < 0 || col >= maxCols || row >= maxRows) {
      return;
    }

    // 1. Luôn luôn đánh dấu ô đích được click để người dùng nhận biết ngay lập tức!
    const targetCenter = this.tileCenter(col, row);
    this.pointerTarget = new Phaser.Geom.Point(targetCenter.x, targetCenter.y);
    this.drawDestination();

    // 2. Tìm path: nếu ô click là vật cản, tìm ô lân cận đi được gần nhất
    let targetX = targetCenter.x;
    let targetY = targetCenter.y;
    if (!this.canEnterTile(col, row)) {
      const nearest = this.collision.nearestWalkable(col, row, { canSurf: this.surfing });
      if (nearest) {
        const nearCenter = this.tileCenter(nearest.x, nearest.y);
        targetX = nearCenter.x;
        targetY = nearCenter.y;
      }
    }

    const path = findPath(this.player.x, this.player.y, targetX, targetY, (c, r) => this.canEnterTile(c, r));
    if (path.length === 0) {
      // Thử fallback trực tiếp nếu ô đích là ô lân cận đi được
      const curCol = Math.floor(this.player.x / TILE_SIZE);
      const curRow = Math.floor(this.player.y / TILE_SIZE);
      const destCol = Math.floor(targetX / TILE_SIZE);
      const destRow = Math.floor(targetY / TILE_SIZE);
      const isNeighbor = Math.abs(destCol - curCol) + Math.abs(destRow - curRow) === 1;
      if (isNeighbor && this.canEnterTile(destCol, destRow)) {
        this.movePath = [this.tileCenter(destCol, destRow)];
        this.nextStepAt = 0;
        return;
      }

      // Nếu hoàn toàn không có đường tới đích, xoá marker sau 700ms
      this.movePath = [];
      this.time.delayedCall(700, () => {
        if (this.movePath.length === 0 && !this.isWalking) {
          this.pointerTarget = undefined;
          this.destGfx?.clear();
        }
      });
      return;
    }

    this.movePath = pathToPixels(path);
    this.nextStepAt = 0;
  }

  /** Hủy lệnh di chuyển tự động (khi người chơi bấm bàn phím). */
  private cancelAutoMove(): void {
    this.movePath = [];
    this.pointerTarget = undefined;
    this.destGfx?.clear();
  }

  /**
   * Vẽ ô đích click-to-move: tô sậm rõ rệt ô được click di chuyển tới + viền sáng + chấm tâm.
   * KHÔNG vẽ đường path — chỉ đánh dấu ô đích.
   */
  private drawDestination(): void {
    if (!this.pointerTarget || !this.showTargetMarker) {
      this.destGfx?.clear();
      return;
    }

    const col = Math.floor(this.pointerTarget.x / TILE_SIZE);
    const row = Math.floor(this.pointerTarget.y / TILE_SIZE);
    const cx = col * TILE_SIZE;
    const cy = row * TILE_SIZE;

    if (!this.destGfx) {
      this.destGfx = this.add.graphics().setDepth(34);
      this.registerWorldObject(this.destGfx);
    }
    this.destGfx.clear();
    this.destGfx.setDepth(34);

    // 1. Nền tô sậm rõ rệt (đen sậm 65% tương phản cao)
    this.destGfx.fillStyle(0x000000, 0.65);
    this.destGfx.fillRect(cx, cy, TILE_SIZE, TILE_SIZE);

    // 2. Viền sáng neon nổi bật (cyan)
    this.destGfx.lineStyle(2, 0x00cec9, 1);
    this.destGfx.strokeRect(cx + 1, cy + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // 3. Viền trong mảnh tinh tế
    this.destGfx.lineStyle(1, 0x81ecec, 0.45);
    this.destGfx.strokeRect(cx + 3, cy + 3, TILE_SIZE - 6, TILE_SIZE - 6);

    // 4. Chấm tâm kép
    this.destGfx.fillStyle(0x00cec9, 0.95);
    this.destGfx.fillCircle(cx + TILE_SIZE / 2, cy + TILE_SIZE / 2, 4);
    this.destGfx.fillStyle(0xffffff, 1);
    this.destGfx.fillCircle(cx + TILE_SIZE / 2, cy + TILE_SIZE / 2, 1.5);
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
      () => this.layoutLeftColumn(),
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
      onToggleClock: (v) => {
        this.infoPanel.setVisible(v);
        this.layoutRightColumn();
      },
      onToggleParty: (v) => {
        this.partyStrip.setVisible(v);
        this.topMenu?.setActive(v ? 'team' : '');
      },
      onToggleChat: (v) => this.chatLog.setVisible(v),
      onToggleMinimap: (v) => {
        this.minimap.setVisible(v);
        this.topMenu?.setActive(v ? 'gps' : '');
        this.layoutRightColumn();
      },
      onToggleMiniMode: (v) => {
        this.manualMiniMode = v;
        this.applyViewportHudMode();
        this.layoutLeftColumn();
        this.layoutRightColumn();
        this.topMenu.relayout();
      },
      onMoveButtonChange: (btn) => {
        this.moveButton = btn;
      },
      onToggleMouseTracking: (v) => {
        this.showMouseTracking = v;
        if (!v && this.hoverGfx) this.hoverGfx.clear();
      },
      onToggleTargetMarker: (v) => {
        this.showTargetMarker = v;
        if (!v && this.destGfx) this.destGfx.clear();
      },
      onViewAnchorChange: (anchor) => {
        this.setViewAnchor(anchor);
      },
      onUiZoomIn: () => this.uiZoom.zoomIn(),
      onUiZoomOut: () => this.uiZoom.zoomOut(),
      onUiZoomReset: () => this.uiZoom.reset(),
      onGameZoomIn: () => this.zoomGameBy(0.2),
      onGameZoomOut: () => this.zoomGameBy(-0.2),
      onGameZoomReset: () => this.setGameZoom(1.0),
      getGameZoom: () => this.getGameZoom(),
      // Anti-aliasing / pixelArt chỉ đọc 1 lần lúc boot game → báo người chơi reload
      onToggleAntiAlias: (enabled) => {
        this.chatLog?.addLine(
          enabled ? t('RENDER_RELOAD_ON') : t('RENDER_RELOAD_OFF'),
        );
      },
      onLogout: () => this.confirmLogout(),
      onClose: () => undefined,
    });
    this.settingsPanel.setUiZoomManager(this.uiZoom);

    // ── Debug Modal (Bảng Debug riêng biệt) ──
    this.debugModal = new DebugModal(this, {
      onToggleGrid: (v) => this.setGridOverlay(v),
      onToggleCollision: (v) => this.setCollisionOverlay(v),
      onToggleWarp: (v) => this.setWarpOverlay(v),
      onToggleMapLayer: (key, v) => this.setMapLayerVisible(key, v),
      onToggleConsole: (v) => {
        if (v) this.debugConsole.show();
        else this.debugConsole.close();
        this.layoutRightColumn();
      },
      onToggleTrackerWidget: (v) => {
        if (v) this.debugTrackerWidget.show();
        else this.debugTrackerWidget.close();
        this.layoutRightColumn();
      },
      onToggleMapWidget: (v) => {
        if (v) this.debugMapWidget.show();
        else this.debugMapWidget.close();
        this.layoutRightColumn();
      },
      onTogglePlayerWidget: (v) => {
        if (v) this.debugPlayerWidget.show();
        else this.debugPlayerWidget.close();
        this.layoutRightColumn();
      },
      onToggleCoordWidget: (v) => {
        if (v) this.debugCoordWidget.show();
        else this.debugCoordWidget.close();
        this.layoutRightColumn();
      },
      onTogglePerfWidget: (v) => {
        if (v) this.debugPerfWidget.show();
        else this.debugPerfWidget.close();
        this.layoutRightColumn();
      },
      onToggleNoclip: (v) => this.setNoclip(v),
      onTeleport: (x, y) => this.teleportPlayer(x, y),
      onSwitchMap: (mapId, x, y) => this.switchMap(mapId, x, y),
      onSetSpeed: (mult) => {
        this.speedMultiplier = mult;
      },
      onClose: () => {
        this.topMenu?.setActive('');
      },
    });
    this.debugModal.setUiZoomManager(this.uiZoom);

    // ── 4 Widgets Thông tin Debug (Bản đồ, Nhân vật, Toạ độ, Hiệu năng) neo Cột Phải ──
    this.debugMapWidget = new DebugMapWidget(this, {
      onClose: () => {
        this.debugModal?.setToggleState('mapWidget', false);
        this.layoutRightColumn();
      },
      onResetPosition: () => this.layoutRightColumn(),
      onVisibilityChange: () => this.layoutRightColumn(),
    });
    this.debugMapWidget.setUiZoomManager(this.uiZoom);
    this.debugMapWidget.close();

    this.debugPlayerWidget = new DebugPlayerWidget(this, {
      onClose: () => {
        this.debugModal?.setToggleState('playerWidget', false);
        this.layoutRightColumn();
      },
      onResetPosition: () => this.layoutRightColumn(),
      onVisibilityChange: () => this.layoutRightColumn(),
    });
    this.debugPlayerWidget.setUiZoomManager(this.uiZoom);
    this.debugPlayerWidget.close();

    this.debugCoordWidget = new DebugCoordWidget(this, {
      onClose: () => {
        this.debugModal?.setToggleState('coordWidget', false);
        this.layoutRightColumn();
      },
      onResetPosition: () => this.layoutRightColumn(),
      onVisibilityChange: () => this.layoutRightColumn(),
    });
    this.debugCoordWidget.setUiZoomManager(this.uiZoom);
    this.debugCoordWidget.close();

    this.debugPerfWidget = new DebugPerfWidget(this, {
      onClose: () => {
        this.debugModal?.setToggleState('perfWidget', false);
        this.layoutRightColumn();
      },
      onResetPosition: () => this.layoutRightColumn(),
      onVisibilityChange: () => this.layoutRightColumn(),
    });
    this.debugPerfWidget.setUiZoomManager(this.uiZoom);
    this.debugPerfWidget.close();

    // Widget debug tạo SAU setupUiCamera() → đăng ký ignore cho camera world,
    // nếu không sẽ bị cả world + ui camera render → hiện 2 lần.
    this.registerHudObject(
      ...this.debugMapWidget.getGameObjects(),
      ...this.debugPlayerWidget.getGameObjects(),
      ...this.debugCoordWidget.getGameObjects(),
      ...this.debugPerfWidget.getGameObjects(),
    );

    // ── Debug Console (Khung console lệnh dock cạnh phải) ──
    this.debugConsole = new DebugConsole(this, {
      onRunCommand: (cmd) => this.handleDebugCommand(cmd),
      onClose: () => {
        this.debugModal?.setToggleState('console', false);
        this.layoutRightColumn();
      },
      onVisibilityChange: () => {
        this.layoutRightColumn();
      },
    });
    this.debugConsole.setUiZoomManager(this.uiZoom);
    this.debugConsole.close();

    // ── Debug Tracker Widget (Widget nhỏ toạ độ chuột & player + noclip) ──
    this.debugTrackerWidget = new DebugTrackerWidget(this, {
      onToggleNoclip: (v) => this.setNoclip(v),
      onClose: () => {
        this.debugModal?.setToggleState('trackerWidget', false);
        this.layoutRightColumn();
      },
      onResetPosition: () => this.layoutRightColumn(),
      onVisibilityChange: () => {
        this.layoutRightColumn();
      },
    });
    this.debugTrackerWidget.setUiZoomManager(this.uiZoom);
    this.debugTrackerWidget.close();

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
    this.syncDebugTools();

    // Phím tắt F3 / F2 mở Debug Modal riêng
    this.input.keyboard?.on('keydown-F3', (e: KeyboardEvent) => {
      e.preventDefault();
      this.toggleDebugModal();
    });
    this.input.keyboard?.on('keydown-F2', (e: KeyboardEvent) => {
      e.preventDefault();
      this.toggleDebugModal();
    });

    // Áp dụng các cài đặt đã lưu vào UI và Scene
    const savedSettings = loadSettings();
    if (savedSettings.hud.profile === false) this.hud.setVisible(false);
    if (savedSettings.hud.clock === false) this.infoPanel.setVisible(false);
    if (savedSettings.hud.party === false) this.partyStrip.setVisible(false);
    if (savedSettings.hud.chat === false) this.chatLog.setVisible(false);
    if (savedSettings.hud.minimap === true) {
      this.minimap.setVisible(true);
      this.topMenu?.setActive('gps');
    }
    if (savedSettings.hud.miniMode === true) {
      this.manualMiniMode = true;
    }
    this.moveButton = savedSettings.gameplay.moveButton;
    if (typeof savedSettings.gameplay.mouseTracking === 'boolean') {
      this.showMouseTracking = savedSettings.gameplay.mouseTracking;
    }
    if (typeof savedSettings.gameplay.targetMarker === 'boolean') {
      this.showTargetMarker = savedSettings.gameplay.targetMarker;
    }
    if (savedSettings.gameplay.viewAnchor) {
      this.viewAnchor = savedSettings.gameplay.viewAnchor;
      this.updateCameraBounds();
    }
    if (typeof savedSettings.zoom.gameZoom === 'number' && Math.abs(savedSettings.zoom.gameZoom - 1.0) > 0.01) {
      this.setGameZoom(savedSettings.zoom.gameZoom);
    }

    // Tự động lưu toạ độ khi đóng tab hoặc tải lại trang
    window.addEventListener('beforeunload', () => {
      if (this.player) {
        ColyseusManager.getInstance().updateLocation(
          this.currentMapId,
          this.player.x,
          this.player.y,
          this.player.getDirection(),
        );
      }
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
    this.layoutRightColumn();
    this.topMenu?.relayout();
    this.chatLog?.relayout();
    this.settingsPanel?.relayout();
    this.debugModal?.relayout();
    this.debugConsole?.relayout();
    this.debugTrackerWidget?.relayout();
    this.debugMapWidget?.relayout();
    this.debugPlayerWidget?.relayout();
    this.debugCoordWidget?.relayout();
    this.debugPerfWidget?.relayout();
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
   * Xếp cột trái theo dạng STACK PANEL (tự động dồn từ trên xuống dưới):
   * 1. PlayerHud ở đỉnh trên trái.
   * 2. PartyStrip neo ngay bên dưới PlayerHud (nếu không bị kéo tự do).
   * Hỗ trợ double click / tap trên vạch kéo của PartyStrip để trở về vị trí stack này!
   */
  private layoutLeftColumn(): void {
    const z = this.uiZoom?.uiZoom ?? 1;
    const pad = (this.isSmallViewport() ? 6 : 8) * z;
    let nextY = pad;

    // 1. Player HUD (nếu hiển thị)
    if (this.hud && this.hudVisible && (this.hud as any).visible !== false) {
      nextY += this.hud.getSize().h + pad;
    }

    // 2. PartyStrip (nếu hiển thị)
    if (this.partyStrip) {
      if (!this.hudVisible) {
        this.partyStrip.setVisible(false);
      } else {
        if (!this.partyStrip.isCustomPositioned()) {
          this.partyStrip.setDefaultOffsetY(nextY);
          this.partyStrip.anchorY = nextY;
          this.partyStrip.relayoutPublic();
        }
        if (this.partyStrip.isVisible()) {
          nextY += this.partyStrip.getActualSize().h + pad;
        }
      }
    }
  }

  /**
   * Xếp các panel ở cạnh phải màn hình theo dạng STACK (tự động dồn xuống dưới):
   * 1. InfoPanel (Thời tiết + Đồng hồ) ở đỉnh góc trên phải.
   * 2. Minimap neo ngay dưới InfoPanel (nếu mở).
   * 3. DebugTrackerWidget (panel tracking nhỏ không titlebar).
   * 4. DebugMapWidget (panel bản đồ ghim).
   * 5. DebugPlayerWidget (panel nhân vật ghim).
   * 6. DebugCoordWidget (panel toạ độ & chuột ghim).
   * 7. DebugPerfWidget (panel hiệu năng & server ghim).
   * 8. DebugConsole neo ngay dưới cùng stack.
   * Khi bất kỳ panel nào mở/đóng, các panel bên dưới tự động trượt lên / dồn xuống liền mạch!
   */
  private layoutRightColumn(): void {
    const pad = 6;
    let nextY = 8;

    // 1. InfoPanel
    if (this.infoPanel && this.infoPanel.isVisible()) {
      nextY = this.infoPanel.getBottomY();
    }

    // 2. Minimap
    if (this.minimap) {
      this.minimap.setAnchorY(nextY);
      if (this.minimap.isVisible()) {
        nextY = this.minimap.getBottomY();
      }
    }

    // 3. DebugTrackerWidget
    if (this.debugTrackerWidget) {
      if (!this.debugTrackerWidget.isCustomPositioned()) {
        this.debugTrackerWidget.setStackOffsetY(nextY + pad);
      }
      if (this.debugTrackerWidget.isOpen()) {
        nextY = this.debugTrackerWidget.getBottomY();
      }
    }

    // 4. DebugMapWidget (Ghim Bản đồ)
    if (this.debugMapWidget) {
      if (!this.debugMapWidget.isCustomPositioned()) {
        this.debugMapWidget.setStackOffsetY(nextY + pad);
      }
      if (this.debugMapWidget.isOpen()) {
        nextY = this.debugMapWidget.getBottomY();
      }
    }

    // 5. DebugPlayerWidget (Ghim Nhân vật)
    if (this.debugPlayerWidget) {
      if (!this.debugPlayerWidget.isCustomPositioned()) {
        this.debugPlayerWidget.setStackOffsetY(nextY + pad);
      }
      if (this.debugPlayerWidget.isOpen()) {
        nextY = this.debugPlayerWidget.getBottomY();
      }
    }

    // 6. DebugCoordWidget (Ghim Toạ độ & Chuột)
    if (this.debugCoordWidget) {
      if (!this.debugCoordWidget.isCustomPositioned()) {
        this.debugCoordWidget.setStackOffsetY(nextY + pad);
      }
      if (this.debugCoordWidget.isOpen()) {
        nextY = this.debugCoordWidget.getBottomY();
      }
    }

    // 7. DebugPerfWidget (Ghim Hiệu năng & Server)
    if (this.debugPerfWidget) {
      if (!this.debugPerfWidget.isCustomPositioned()) {
        this.debugPerfWidget.setStackOffsetY(nextY + pad);
      }
      if (this.debugPerfWidget.isOpen()) {
        nextY = this.debugPerfWidget.getBottomY();
      }
    }

    // 8. DebugConsole
    if (this.debugConsole) {
      if (!this.debugConsole.isCustomPositioned()) {
        this.debugConsole.setStackOffsetY(nextY + pad);
      }
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
        this.layoutRightColumn();
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
      title: t('WS_LOGOUT_TITLE'),
      message: t('WS_LOGOUT_MSG'),
      confirmText: t('WS_LOGOUT_OK'),
      cancelText: t('WS_LOGOUT_CANCEL'),
      confirmColor: 0xc0392b,
      onConfirm: () => {
        if (this.player) {
          ColyseusManager.getInstance().sendMove(this.player.x, this.player.y, this.player.getDirection() || 'down');
          ColyseusManager.getInstance().updateLocation(this.currentMapId, this.player.x, this.player.y, this.player.getDirection());
        }
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
          const targetCol = Math.floor(ps.x / TILE_SIZE);
          const targetRow = Math.floor(ps.y / TILE_SIZE);
          let targetX = ps.x;
          let targetY = ps.y;
          if (!this.noclip && !this.collision.isWalkable(targetCol, targetRow)) {
            const safe = this.collision.nearestWalkable(targetCol, targetRow, {}, 12);
            if (safe) {
              targetX = safe.x * TILE_SIZE + TILE_SIZE / 2;
              targetY = safe.y * TILE_SIZE + TILE_SIZE / 2;
            }
          }
          this.player.setPosition(targetX, targetY);
          if (ps.direction) this.player.setDirection(ps.direction);
          console.log(`[world] restored player position from DB: (${targetX}, ${targetY}, ${ps.direction})`);
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
      return false;
    }

    // Đang trượt tới tâm ô → chờ xong mới nhận ô kế tiếp (giữ animation).
    if (this.isWalking) return true;

    // Chưa tới nhịp bước kế tiếp → coi như vẫn đang đi (giữ animation).
    if (this.time.now < this.nextStepAt) return true;

    const target = this.movePath.shift()!;
    const tile = {
      x: Math.floor(target.x / TILE_SIZE),
      y: Math.floor(target.y / TILE_SIZE),
    };

    // Ô bị chặn (path cũ / dữ liệu đổi) → huỷ phần còn lại.
    if (!this.canEnterTile(tile.x, tile.y)) {
      this.cancelAutoMove();
      return false;
    }

    const dir = this.directionTo(this.player.x, this.player.y, target.x, target.y);
    this.nextStepAt = this.time.now + MOVE_COOLDOWN_MS;
    this.stepTo(tile.x, tile.y, dir);
    return true;
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
    ColyseusManager.getInstance().sendMove(x, y, dir, this.noclip);
    ColyseusManager.getInstance().updateLocation(this.currentMapId, x, y, dir);
  }

  /**
   * Ô (col,row) có thể đi vào không?
   * - Nước: chỉ khi đang Surf.
   * - Ledge: đi vào được (xử lý nhảy riêng ở `handleInputDirection`).
   */
  private canEnterTile(col: number, row: number): boolean {
    if (this.noclip) return true;
    const curCol = Math.floor(this.player.x / TILE_SIZE);
    const curRow = Math.floor(this.player.y / TILE_SIZE);
    // Nếu nhân vật hiện tại đang bị kẹt trong ô blocked (ví dụ tắt noclip bên trong tường/mái nhà),
    // cho phép đi vào ô walkable gần nhất để thoát ra ngoài!
    if (!this.collision.isWalkable(curCol, curRow, { canSurf: this.surfing })) {
      const safe = this.collision.nearestWalkable(curCol, curRow, { canSurf: this.surfing }, 12);
      if (safe && col === safe.x && row === safe.y) return true;
    }
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
    await ColyseusManager.getInstance().joinWorld(mapId);
    this.bindWorldRoomEvents();
  }

  /** Server từ chối bước đi → snap về vị trí authoritative của server. */
  private onMoveRejected(data: any): void {
    if (this.noclip) return;
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

    // 1. Nếu không bấm phím và đang có lộ trình click-to-move mà chưa bước → kích hoạt bước kế tiếp ngay
    if (!keyDirection && !this.isWalking && this.movePath.length > 0 && !this.isJumping) {
      this.advanceAlongPath(delta);
    }

    // 2. Ưu tiên nội suy trượt ô — mọi input khác chờ tới tâm ô rồi xử lý.
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
    } else if (walking || this.isWalking || this.movePath.length > 0) {
      this.moving = true;
    } else {
      this.moving = false;
      // Đã tới đích hoàn toàn và không còn trượt ô → xoá marker
      if (this.pointerTarget) {
        this.pointerTarget = undefined;
        this.destGfx?.clear();
      }
    }

    // Khi đang trượt ô, advanceStep đã gọi animateWalk với progress —
    // không gọi thêm ở đây để tránh fallback timer ghi đè frame.
    if (!walking) {
      this.player.animateWalk(delta, this.moving);
    }
    this.interpolateRemotePlayers(delta);
    this.updateCoordTracker();
    this.minimap?.update(this.player.x, this.player.y, this.cameras.main);

    // Cập nhật ô mouse tracking liên tục theo toạ độ chuột thời gian thực
    if (this.showMouseTracking) {
      const activePointer = this.input.activePointer;
      if (activePointer && !this.settingsPanel?.isOpen()) {
        this.updateHoverTile(activePointer.x, activePointer.y);
      }
    }

    // Cập nhật thông số thời gian thực vào DebugModal (nếu đang mở)
    if (this.debugModal?.isOpen()) {
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
        isNoclip: this.noclip,
      };

      this.debugModal.updateInfo(mapInfo, playerInfo);
    }

    // Cập nhật toạ độ chuột và nhân vật vào DebugTrackerWidget & 4 Widgets ghim (nếu đang mở)
    const pointer = this.input.activePointer;
    const cam = this.cameras.main;
    const worldPoint = cam.getWorldPoint(pointer.x, pointer.y);
    const mouseCol = Math.floor(worldPoint.x / TILE_SIZE);
    const mouseRow = Math.floor(worldPoint.y / TILE_SIZE);
    const playerCol = Math.floor(this.player.x / TILE_SIZE);
    const playerRow = Math.floor(this.player.y / TILE_SIZE);
    const fps = Math.round(this.game.loop.actualFps);

    if (this.debugTrackerWidget?.isOpen()) {
      this.debugTrackerWidget.updateCoords(
        mouseCol,
        mouseRow,
        worldPoint.x,
        worldPoint.y,
        playerCol,
        playerRow,
        this.player.x,
        this.player.y,
        this.player.getDirection(),
        this.moving,
        this.currentMapId,
        fps,
        cam.scrollX,
        cam.scrollY,
      );
    }

    if (this.debugMapWidget?.isOpen()) {
      const tileset =
        this.currentMapId.includes('house') || this.currentMapId.includes('lab')
          ? 'Interior'
          : 'Outdoor';
      this.debugMapWidget.updateMapInfo(
        this.currentMapId,
        Math.round(this.mapWidth / TILE_SIZE),
        Math.round(this.mapHeight / TILE_SIZE),
        this.tiledLayers.length || 1,
        tileset,
      );
    }

    if (this.debugPlayerWidget?.isOpen()) {
      this.debugPlayerWidget.updatePlayerInfo(
        playerCol,
        playerRow,
        this.player.x,
        this.player.y,
        this.player.getDirection(),
        this.moving,
        this.noclip,
      );
    }

    if (this.debugCoordWidget?.isOpen()) {
      const isBlocked = !this.collision?.isWalkable(mouseCol, mouseRow);
      const isWater = this.collision?.isWater(mouseCol, mouseRow);
      const tileType = isBlocked ? t('WS_TILE_WALL') : isWater ? t('WS_TILE_WATER') : t('WS_TILE_NORMAL');
      this.debugCoordWidget.updateCoordInfo(mouseCol, mouseRow, worldPoint.x, worldPoint.y, tileType);
    }

    if (this.debugPerfWidget?.isOpen()) {
      this.debugPerfWidget.updatePerfInfo(fps, cam.scrollX, cam.scrollY, cam.zoom, 'Online', 15);
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

  /** Mở/đóng modal Debug (chỉ hoạt động khi user đủ quyền). */
  public toggleDebugModal(): void {
    if (!ColyseusManager.getInstance().hasDebugAccess()) {
      this.chatLog?.addLine(t('WS_NEED_MOD'));
      return;
    }
    this.debugModal.toggle();
    this.topMenu?.setActive(this.debugModal.isOpen() ? 'debug' : '');
  }

  /** Alias cho toggleDebugModal (dùng cho phím tắt F3/F2/TopMenu) */
  public openDebugTab(): void {
    this.toggleDebugModal();
  }

  /** Bật / tắt chế độ đi xuyên tường (NOCLIP) */
  public setNoclip(enabled: boolean): void {
    this.noclip = enabled;
    this.debugTrackerWidget?.setNoclipState(enabled);
    this.debugModal?.setToggleState('noclip', enabled);
    const msg = enabled ? t('WS_NOCLIP_MSG_ON') : t('WS_NOCLIP_MSG_OFF');
    this.chatLog?.addLine(`[debug] ${msg}`);
    this.debugConsole?.addLog(msg, enabled ? '#fab1a0' : '#b2bec3');

    // Đồng bộ ngay vị trí hiện tại lên server để server cập nhật toạ độ chuẩn xác
    if (this.player) {
      ColyseusManager.getInstance().sendTeleport(this.player.x, this.player.y, this.player.getDirection());
      ColyseusManager.getInstance().updateLocation(this.currentMapId, this.player.x, this.player.y, this.player.getDirection());
    }
  }

  /**
   * Khởi tạo các công cụ debug đồ hoạ trong world space:
   * lưới toạ độ, overlay va chạm, warp overlay, nhãn tracking.
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

    // Overlay va chạm + warp — cùng depth với lưới (trên overhead 30, dưới HUD 100).
    this.collisionOverlay = this.add
      .graphics()
      .setDepth(DEBUG_COLLISION_DEPTH)
      .setVisible(false)
      .setScrollFactor(1);
    this.registerWorldObject(this.collisionOverlay);

    this.warpOverlay = this.add
      .graphics()
      .setDepth(DEBUG_WARP_DEPTH)
      .setVisible(false)
      .setScrollFactor(1);
    this.registerWorldObject(this.warpOverlay);

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

  /** Kiểm tra quyền và ẩn/hiện icon Debug trên thanh TopMenu */
  private syncDebugTools(): void {
    if (!ColyseusManager.getInstance().hasDebugAccess()) {
      this.topMenu?.setIconVisible('debug', false);
      return;
    }
    this.topMenu?.setIconVisible('debug', true);
  }

  private setGridOverlay(on: boolean): void {
    if (!this.gridOverlay) return;
    this.gridOverlay.setVisible(on);
    if (on) this.drawGrid();
  }

  /** Bật/tắt overlay vùng va chạm. */
  private setCollisionOverlay(on: boolean): void {
    if (!this.collisionOverlay) return;
    this.collisionOverlay.setVisible(on);
    if (on) this.drawCollisionOverlay();
  }

  /** Bật/tắt overlay điểm warp. */
  private setWarpOverlay(on: boolean): void {
    if (!this.warpOverlay) return;
    this.warpOverlay.setVisible(on);
    if (on) this.drawWarpOverlay();
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

    // Đánh dấu tâm ô spawn (MAPS.spawn là TILE coords → vẽ ở pixel)
    const meta = MAPS[this.currentMapId];
    if (meta?.spawn) {
      g.fillStyle(0xff7675, 0.9);
      g.fillCircle(meta.spawn.x * TILE_SIZE + TILE_SIZE / 2, meta.spawn.y * TILE_SIZE + TILE_SIZE / 2, 4);
    }
  }

  /**
   * Vẽ overlay vùng va chạm theo cờ `CollisionGrid` (SSOT server JSON):
   * - 🔴 Blocked (tường/cây/đá)      — fill đỏ
   * - 🔵 Water (cần Surf)             — fill xanh dương
   * - 🟢 Grass (gây encounter)        — fill xanh lá
   * - 🟠 Ledge (vách nhảy 1 chiều)   — fill cam + mũi tên hướng rơi
   * Ô đi được không vẽ gì (lớp map gốc hiển thị).
   */
  private drawCollisionOverlay(): void {
    const g = this.collisionOverlay;
    if (!g) return;
    g.clear();

    const cols = Math.round(this.mapWidth / TILE_SIZE);
    const rows = Math.round(this.mapHeight / TILE_SIZE);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = c * TILE_SIZE;
        const py = r * TILE_SIZE;

        // Thứ tự ưu tiên: BLOCKED trước (nước sâu/thác mang cả WATER|BLOCKED —
        // vẽ xanh dương sẽ gây hiểu nhầm là đi được), rồi mới tới nước/ledge/cỏ.
        if (!this.collision.isWalkable(c, r, { canSurf: true })) {
          g.fillStyle(0xff7675, 0.5);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        } else if (this.collision.isWater(c, r)) {
          g.fillStyle(0x74b9ff, 0.45);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        } else if (this.collision.isLedge(c, r)) {
          g.fillStyle(0xfdcb6e, 0.5);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Mũi tên nhỏ hướng rơi để phân biệt 4 chiều của ledge.
          const dir = this.collision.getLedgeDirection(c, r);
          const cx = px + TILE_SIZE / 2;
          const cy = py + TILE_SIZE / 2;
          g.lineStyle(2, 0xe17055, 0.95);
          const arrow = 7;
          if (dir === 'down') g.lineBetween(cx, cy - arrow, cx, cy + arrow);
          else if (dir === 'up') g.lineBetween(cx, cy + arrow, cx, cy - arrow);
          else if (dir === 'left') g.lineBetween(cx + arrow, cy, cx - arrow, cy);
          else if (dir === 'right') g.lineBetween(cx - arrow, cy, cx + arrow, cy);
        } else if (this.collision.isGrass(c, r)) {
          g.fillStyle(0x55efc4, 0.4);
          g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  /**
   * Vẽ overlay các điểm warp (cổng chuyển map) — chấm tím giữa ô + viền,
   * giúp đối chiếu nhanh với dữ liệu `objects[].type === 'warp'` trong server JSON.
   */
  private drawWarpOverlay(): void {
    const g = this.warpOverlay;
    if (!g) return;
    g.clear();

    const cols = Math.round(this.mapWidth / TILE_SIZE);
    const rows = Math.round(this.mapHeight / TILE_SIZE);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const warp = this.collision.getWarpAt(c, r);
        if (!warp) continue;
        const cx = c * TILE_SIZE + TILE_SIZE / 2;
        const cy = r * TILE_SIZE + TILE_SIZE / 2;
        // Viền ô warp
        g.lineStyle(2, 0xa29bfe, 0.95);
        g.strokeRect(c * TILE_SIZE + 2, r * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        // Chấm giữa + vòng trong
        g.fillStyle(0x6c5ce7, 0.95);
        g.fillCircle(cx, cy, 6);
        g.fillStyle(0xfdcb6e, 1);
        g.fillCircle(cx, cy, 2.5);
      }
    }
  }

  /**
   * Bật/tắt một lớp tilemap (`ground` / `decoration` / `overhead`).
   * Gọi lại mỗi lần `switchMap()` để áp dụng trạng thái đã lưu cho map mới.
   */
  public setMapLayerVisible(key: MapLayerKey, visible: boolean): void {
    this.layerVisibility[key] = visible;
    for (const layer of this.tiledLayers) {
      // Tên layer trong .tmj là "Ground" / "Decoration" / "Overhead".
      const name = layer.layer?.name?.toLowerCase() ?? '';
      if (name.includes(key)) layer.setVisible(visible);
    }
    // Nếu là bản đồ placeholder (không có tiledLayers) thì không làm gì.
  }

  /** Trạng thái hiển thị hiện tại của 3 lớp tilemap (Settings đọc để đồng bộ UI). */
  public getLayerVisibility(): Record<MapLayerKey, boolean> {
    return { ...this.layerVisibility };
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

  public teleportPlayer(x: number, y: number): { x: number; y: number } {
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
    ColyseusManager.getInstance().sendTeleport(center.x, center.y, this.player.getDirection());
    ColyseusManager.getInstance().updateLocation(this.currentMapId, center.x, center.y, this.player.getDirection());
    console.log(`[debug] teleported player to (${center.x}, ${center.y})`);
    return center;
  }

  public async switchMap(mapId: string, targetX?: number, targetY?: number): Promise<void> {
    if (!TILED_MAPS[mapId]) {
      console.warn(`[debug] map "${mapId}" not found in TILED_MAPS`);
      this.debugConsole?.addLog(`${t('WS_MAP_NOT_FOUND')}"${mapId}"`, '#ff7675');
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
      // Đổi map → vẽ lại các overlay debug cho map mới
      if (this.gridOverlay?.visible) this.drawGrid();
      if (this.collisionOverlay?.visible) this.drawCollisionOverlay();
      if (this.warpOverlay?.visible) this.drawWarpOverlay();
      // Áp dụng lại trạng thái 3 lớp tilemap (layers vừa được tạo mới).
      for (const key of MAP_LAYER_KEYS) this.setMapLayerVisible(key, this.layerVisibility[key]);

      // 3. Đặt lại toạ độ người chơi
      // targetX/targetY nhận từ server là PIXEL (đã snap sẵn). Nếu không có
      // (debug switchMap) → dùng spawn chung của map (MAPS[id].spawn = TILE coords).
      const meta = MAPS[mapId];
      const spawnTile = resolveSpawnTile(mapId);
      const fallbackPx = this.tileCenter(spawnTile.x, spawnTile.y);
      const spawnX = targetX ?? fallbackPx.x;
      const spawnY = targetY ?? fallbackPx.y;
      // Dùng toạ độ ĐÃ snap (teleportPlayer trả về) cho mọi message gửi server,
      // tránh gửi lại toạ độ gốc chưa snap → server ghi đè sang vị trí sai.
      const landed = this.teleportPlayer(spawnX, spawnY);

      // 4. Giới hạn camera bounds
      this.physics.world?.setBounds(0, 0, loaded.width, loaded.height);
      this.updateCameraBounds();

      // 5. Cập nhật ignore list camera UI
      this.registerWorldObject(...loaded.layers);

      // 6. Tham gia phòng Colyseus của map mới
      await ColyseusManager.getInstance().joinWorld(mapId);
      this.bindWorldRoomEvents();
      // Gửi toạ độ đã snap (không phải spawnX/spawnY gốc) → server không ghi đè.
      ColyseusManager.getInstance().sendTeleport(landed.x, landed.y, this.player?.getDirection());

      this.debugConsole?.addLog(`Đã chuyển sang map "${meta?.name ?? mapId}"!`, '#55efc4');
    } catch (err: any) {
      console.error(`[debug] switchMap error:`, err);
      this.debugConsole?.addLog(`Lỗi tải map: ${err.message}`, '#ff7675');
    }
  }

  private handleDebugCommand(cmd: string): string | void {
    const parts = cmd.trim().split(/\s+/);
    const action = parts[0]?.toLowerCase();

    if (action === '/help') {
      return [
        t('WS_HELP_HEADER'),
        t('WS_HELP_HELP'),
        t('WS_HELP_MAP'),
        t('WS_HELP_POS'),
        t('WS_HELP_SERVER'),
        t('WS_HELP_TP'),
        t('WS_HELP_SPEED'),
        t('WS_HELP_NOCLIP'),
        t('WS_HELP_OVERLAY'),
        t('WS_HELP_LAYER'),
        t('WS_HELP_CLEAR'),
      ].join('\n');
    }

    if (action === '/map') {
      const meta = MAPS[this.currentMapId];
      const tmj = TILED_MAPS[this.currentMapId];
      const objGroup = tmj?.layers?.find((l: any) => l.type === 'objectgroup');
      const warpsCount = objGroup?.objects?.length ?? 0;
      return [
        `Bản đồ: ${meta?.name ?? this.currentMapId} (${this.currentMapId})`,
        `Kích thước: ${Math.round(this.mapWidth / TILE_SIZE)}×${Math.round(this.mapHeight / TILE_SIZE)} tiles (${this.mapWidth}×${this.mapHeight}px)`,
        `Số lớp: ${this.tiledLayers.length || 1} | Điểm warp: ${warpsCount}`,
        `Tileset: ${this.currentMapId.includes('house') || this.currentMapId.includes('lab') ? 'Interior general.png' : 'Outside.png'}`,
      ].join('\n');
    }

    if (action === '/pos') {
      const tileX = Math.floor(this.player.x / TILE_SIZE);
      const tileY = Math.floor(this.player.y / TILE_SIZE);
      const cam = this.cameras.main;
      return [
        `Pixel: (${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}) | Tile: [${tileX}, ${tileY}]`,
        `Hướng: ${this.player.getDirection().toUpperCase()} | Noclip: ${this.noclip ? 'BẬT' : 'TẮT'}`,
        `Camera: (${Math.round(cam.scrollX)}, ${Math.round(cam.scrollY)}) | Zoom: ${cam.zoom.toFixed(2)}x`,
      ].join('\n');
    }

    if (action === '/server') {
      const client = ColyseusManager.getInstance();
      return [
        `Origin: ${SERVER_ORIGIN}`,
        `Room: ${this.currentMapId}`,
        `Session ID: ${client.id ?? 'Connected'}`,
        `Debug Access: ${client.hasDebugAccess() ? t('WS_DEBUG_ACCESS_YES') : t('WS_DEBUG_ACCESS_NO')}`,
      ].join('\n');
    }

    if (action === '/noclip') {
      const arg = parts[1]?.toLowerCase();
      const next = arg === 'on' ? true : arg === 'off' ? false : !this.noclip;
      this.setNoclip(next);
      return `${t('WS_NOCLIP_MODE')}${next ? t('WS_NOCLIP_ON') : t('WS_NOCLIP_OFF')}`;
    }

    if (action === '/clear') {
      this.debugConsole?.clearLogs();
      return;
    }

    if (action === '/tp') {
      if (parts.length === 2) {
        this.switchMap(parts[1]);
        return `${t('WS_TP_MOVING')}${parts[1]}`;
      } else if (parts.length >= 3) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        this.teleportPlayer(x, y);
        return `${t('WS_TELEPORT_TO')}(${x}, ${y})`;
      }
      return t('WS_CMD_TP');
    }

    if (action === '/speed') {
      const mult = parseFloat(parts[1]);
      if (!isNaN(mult) && mult > 0) {
        this.speedMultiplier = mult;
        return `${t('WS_SPEED')}${mult}x`;
      }
      return t('WS_CMD_SPEED');
    }

    // ── Overlay & lớp bản đồ ──
    if (action === '/overlay') {
      const key = parts[1]?.toLowerCase();
      if (!key || !['grid', 'collision', 'warp'].includes(key)) {
        return t('WS_CMD_OVERLAY');
      }
      const curr =
        key === 'grid'
          ? (this.gridOverlay?.visible ?? false)
          : key === 'collision'
            ? (this.collisionOverlay?.visible ?? false)
            : (this.warpOverlay?.visible ?? false);
      if (parts.length < 3) {
        return `${t('WS_OVERLAY_STATE')}${key}": ${curr ? t('WS_OVERLAY_ON') : t('WS_OVERLAY_OFF')}`;
      }
      const on = parts[2].toLowerCase() !== 'off';
      if (key === 'grid') {
        this.setGridOverlay(on);
        this.debugModal?.setToggleState('grid', on);
      } else if (key === 'collision') {
        this.setCollisionOverlay(on);
        this.debugModal?.setToggleState('collision', on);
      } else {
        this.setWarpOverlay(on);
        this.debugModal?.setToggleState('warp', on);
      }
      return `${t('WS_OVERLAY_STATE')}${key}": ${on ? t('WS_OVERLAY_ENABLED') : t('WS_OVERLAY_DISABLED')}`;
    }

    // `/layer <ground|decoration|overhead> [on|off]` — bật/tắt 1 lớp tilemap.
    if (action === '/layer') {
      const key = parts[1]?.toLowerCase() as MapLayerKey | undefined;
      if (!key || !MAP_LAYER_KEYS.includes(key)) {
        return t('WS_CMD_LAYER');
      }
      if (parts.length < 3) {
        return `${t('WS_LAYER_STATE')}${key}": ${this.layerVisibility[key] ? t('WS_LAYER_ON') : t('WS_LAYER_OFF')}`;
      }
      const on = parts[2].toLowerCase() !== 'off';
      this.setMapLayerVisible(key, on);
      this.debugModal?.setToggleState(`layer_${key}`, on);
      return `${t('WS_LAYER_STATE')}${key}": ${on ? t('WS_LAYER_VISIBLE') : t('WS_LAYER_HIDDEN')}`;
    }

    return `${t('WS_CMD_INVALID')}${cmd}${t('WS_CMD_HELP')}`;
  }
}
