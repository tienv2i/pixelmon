import Phaser from 'phaser';
import { PlayerSprite, registerPlayerAnims, PLAYER_DEPTH, type Dir } from '../entities/PlayerSprite';
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
import { PokedexModal } from '../ui/PokedexModal';
import { TownMapModal } from '../ui/TownMapModal';
import { BagModal } from '../ui/BagModal';
import { StoreModal } from '../ui/StoreModal';
import { TradeModal } from '../ui/TradeModal';
import { EvolveModal } from '../ui/EvolveModal';
import { PartySelectModal } from '../ui/PartySelectModal';
import { DialogueModal } from '../ui/DialogueModal';
import { loadNpcSpriteSheet } from '../entities/NpcSpriteLoader';
import { BattleModal } from '../ui/BattleModal';
import { TopMenu } from '../ui/TopMenu';
import { InfoPanel } from '../ui/InfoPanel';
import { UiZoomManager } from '../ui/UiZoomManager';
import type { UiModal } from '../ui/UiModal';
import { FONT } from '../ui/theme';
import { t } from '../i18n';
import { TEX } from './BootScene';
import { SoundManager } from '../audio/SoundManager';

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
/** Overlay tile property — nằm trên warp, dưới HUD. */
const DEBUG_PROP_DEPTH = 34;
/** Ô đánh dấu bởi `/tile` — cao nhất trong nhóm overlay debug. */
const DEBUG_MARKER_DEPTH = 35;

/**
 * Tên đọc được của `terrain_tag` (RMXP/Essentials) — khớp bảng trong
 * `scripts/build-server-map.ts` (`TERRAIN_TAG_TO_FLAG`). Chỉ dùng cho debug.
 */
function describeTerrainTag(tag: number): string {
  const names: Record<number, string> = {
    1: 'Ledge (jump down)',
    2: 'Grass',
    3: 'Sand',
    4: 'Rock',
    5: 'DeepWater',
    6: 'StillWater',
    7: 'Water',
    8: 'Waterfall',
    9: 'WaterfallCrest',
    10: 'TallGrass',
    11: 'UnderwaterGrass',
    12: 'Ice',
    13: 'Neutral',
    14: 'SootGrass',
    15: 'Bridge',
    16: 'Puddle',
  };
  return names[tag] ?? `unknown(${tag})`;
}

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
  /** Modal trận wild đang mở (Plan 44) — undefined khi không trong trận. */
  private battleModal?: BattleModal;
  /** Đang chờ mở modal (chống `battle_init` gọi 2 lần tạo 2 modal). */
  private battleStarting = false;
  // ── Plan 47: trạng thái trận PvP hiện tại ──
  private pvpIsPvp = false;
  /** `roomId` của BattleRoom — chỉ có khi mình là bên FOE (vào bằng joinById). */
  private pvpRoomId = '';
  private pvpSeat: 'ally' | 'foe' = 'ally';
  private pvpFoeName = '';
  private pvpAllyName = '';
  private pvpRewardMoney = 0;
  /**
   * Đang mở hộp thoại "chấp nhận thách PvP" (phía người nhận lời thách).
   *
   * Quan trọng: `confirmModal` nằm trong `isBlockingUiOpen()` → mở là mất
   * quyền điều khiển nhân vật. Lời thách có thể bị huỷ từ phía server
   * (hết hạn / người thách offline / lỗi tạo phòng) mà người chơi không bấm
   * được nút → phải tự đóng modal để trả lại quyền di chuyển.
   */
  private pvpChallengePromptOpen = false;
  private pokemonSummaryModal!: PokemonSummaryModal;
  private pokedexModal!: PokedexModal;
  private townMapModal!: TownMapModal;
  // ── Plan 45: Túi đồ / Store / Trade / Tiến hoá ──
  private bagModal!: BagModal;
  private storeModal!: StoreModal;
  private tradeModal!: TradeModal;
  private evolveModal!: EvolveModal;
  /** Mini party box — chọn Pokémon cho switch / dùng item / gán item ngoài trận. */
  private partySelectModal!: PartySelectModal;
  /** Hộp thoại cốt truyện NPC. */
  private dialogueModal!: DialogueModal;
  /** Danh sách ID các huấn luyện viên đã bị đánh bại. */
  private defeatedTrainers = new Set<string>();
  /** Cooldown giữa các lần tương tác / rematch với từng NPC (timestamp ms). */
  private npcCooldowns = new Map<string, number>();
  /** Thời gian cooldown mặc định cho tương tác NPC (ms). */
  private npcCooldownDuration = 3000;
  /** Trainer ID đang diễn ra trận đấu (để ghi nhận khi thắng). */
  private currentBattleTrainerId?: string;
  /** Danh sách sprites NPC đang render trên map hiện tại. */
  private npcSprites: Phaser.GameObjects.Sprite[] = [];
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
  /** Overlay đánh dấu ô theo tile property trong Tiled (vd `terrain_tag=2`). */
  private propOverlay?: Phaser.GameObjects.Graphics;
  /** Overlay đánh dấu 1 ô cụ thể do lệnh `/tile` chọn (viền + nhãn toạ độ). */
  private tileMarker?: Phaser.GameObjects.Graphics;
  /** Nhãn toạ độ gắn trên ô đang được `/tile` đánh dấu. */
  private tileMarkerLabel?: Phaser.GameObjects.Text;
  /**
   * Lớp phủ tối khi trời tối (ngày/đêm từ server). Rectangle fullscreen,
   * scrollFactor 0, chỉ camera world render — HUD không bị tối theo.
   */
  private nightOverlay?: Phaser.GameObjects.Rectangle;
  /** Phase ngày/đêm đang hiển thị — tránh set alpha mỗi frame state. */
  private shownPhase = '';
  /** Tọa độ ô đang được `/tile` đánh dấu (`null` = chưa đánh dấu). */
  private markedTile: { x: number; y: number } | null = null;
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
    this.player.setDepth(PLAYER_DEPTH);
    if (savedLoc?.direction) {
      this.player.setDirection(savedLoc.direction as Dir);
    }
    network.updateLocation(initialMapId, spawnX, spawnY, this.player.getDirection());

    // Remote players & server messages
    this.bindWorldRoomEvents();

    // Nạp NPC cho bản đồ ban đầu
    await this.spawnNpcsForCurrentMap();

    // Nạp trạng thái trainer đã đánh bại + khởi tạo SoundManager
    this.loadDefeatedTrainers();
    SoundManager.getInstance(this);

    // ⚠️ BỎ global click → random battle. Trước đây `pointerdown` bắn 30% mỗi cú click
    // bất kỳ (chạm UI, click trống, click button...) → cửa sổ battle hiện ra "tự nhiên".
    // Battle giờ chỉ mở qua: bấm trực tiếp lên nhân vật, hoặc gặp grass encounter thật.
  }

  /** Lắng nghe các sự kiện từ room World của Colyseus. */
  private bindWorldRoomEvents(): void {
    const remote = ColyseusManager.getInstance().world;
    if (!remote) return;
    remote.onStateChange((state) => {
      this.syncRemotePlayers(state);
      this.syncWorldClock(state);
    });
    remote.onMessage('chat', (data) => this.showChat(data.from, data.message));
    // Server xác nhận đổi map (warp) → client rejoin room mới.
    remote.onMessage('player_moved_map', (data) => this.onServerChangeMap(data));
    // Server từ chối bước đi (chống gian lận) → kéo vị trí về đúng server.
    remote.onMessage('move_rejected', (data) => this.onMoveRejected(data));
    // Server roll encounter xong → vào trận wild (Plan 44 Phase 0).
    remote.onMessage('battle_init', (data) => this.onBattleInit(data));
    // Server phản hồi lệnh debug `/spawn` (đã qua kiểm tra role).
    remote.onMessage('debug_msg', (data) => this.onDebugMsg(data));
    // Server broadcast túi đồ (Plan 45 §1.2) → refresh BagModal nếu đang mở.
    remote.onMessage('bag_update', (data) => this.onBagUpdate(data));
    // Server thông báo tiến hoá (Plan 45 §3.2) → hiện EvolveModal.
    remote.onMessage('evolved', (data) => this.onEvolved(data));

    // ── Plan 47: PvP challenge ──
    remote.onMessage('pvp_challenge_incoming', (data) => this.onPvpChallengeIncoming(data));
    remote.onMessage('pvp_challenge_sent', (data) => this.onPvpChallengeSent(data));
    remote.onMessage('pvp_result', (data) => this.onPvpResult(data));
    remote.onMessage('pvp_cancelled', (data) => this.onPvpCancelled(data));
  }

  /** Nhận `bag_update` từ server → refresh BagModal. */
  private onBagUpdate(data: any): void {
    const items = Array.isArray(data?.items) ? data.items : [];
    this.bagModal.setItems(items);
    // Đồng bộ money từ server (store_action).
    void ColyseusManager.getInstance().fetchMoney().then((m) => {
      this.mockMoney = m;
      this.hud?.update({ money: m });
    });
    // Đồng bộ lại held_item trên PartyStrip / Summary (đeo/tháo item).
    void this.loadPlayerPokemon();
  }

  /** Nhận `evolved` từ server → hiện EvolveModal. */
  private onEvolved(data: any): void {
    const pokemonId = String(data?.pokemonId ?? '');
    const from = String(data?.from ?? '');
    const to = String(data?.to ?? '');
    if (!pokemonId || !from || !to) return;
    this.evolveModal.showEvolved(pokemonId, from, to);
  }

  // ── Plan 47: PvP challenge UI ────────────────────────────────────────────

  /** Đối thủ gửi lời thách đấu → hiện ConfirmModal đồng ý/từ chối. */
  private onPvpChallengeIncoming(data: any): void {
    const fromName = String(data?.fromName ?? 'Người chơi');
    this.chatLog?.addSystemLine(
      `[PvP] ${fromName} muốn thách đấu bạn!`,
      '#f39c12',
    );
    // Đang có modal khoá UI (đánh nhau, đang xem túi…) → tự động từ chối.
    if (this.isBlockingUiOpen() || this.battleStarting) {
      ColyseusManager.getInstance().sendPvpResponse(false);
      return;
    }
    this.closeAllTopDialogs();
    this.pvpChallengePromptOpen = true;
    this.confirmModal.show({
      title: '⚔ THÁCH ĐẤU PVP',
      message: `${fromName} muốn thách đấu bạn! Chấp nhận?`,
      confirmText: 'Chấp nhận',
      cancelText: 'Từ chối',
      confirmColor: 0x2980b9,
      onConfirm: () => {
        this.pvpChallengePromptOpen = false;
        ColyseusManager.getInstance().sendPvpResponse(true);
      },
      onCancel: () => {
        this.pvpChallengePromptOpen = false;
        ColyseusManager.getInstance().sendPvpResponse(false);
      },
    });
  }

  /** Đã gửi lời thách → báo trong chat. */
  private onPvpChallengeSent(data: any): void {
    const toName = String(data?.toName ?? '');
    this.chatLog?.addSystemLine(
      `[PvP] Đã gửi lời thách đấu tới ${toName}. Đang chờ phản hồi...`,
      '#7bed9f',
    );
  }

  /** Server từ chối lời thách (lý do cụ thể). */
  private onPvpResult(data: any): void {
    if (data?.ok === false && data?.message) {
      this.chatLog?.addSystemLine(`[PvP] ${data.message}`, '#e74c3c');
    }
  }

  /** Lời thách bị huỷ (hết hạn / từ chối / đối thủ offline / lỗi phòng). */
  private onPvpCancelled(data: any): void {
    const reason = String(data?.reason ?? '');
    const msg =
      reason === 'declined'
        ? 'Đối thủ đã từ chối thách đấu.'
        : reason === 'expired'
        ? 'Lời thách đấu đã hết hạn.'
        : reason === 'offline'
        ? 'Đối thủ đã rời khỏi trò chơi.'
        : reason === 'failed'
        ? 'Không tạo được phòng PvP, vui lòng thử lại.'
        : reason === 'in_battle'
        ? 'Một trong hai đang trong trận đấu.'
        : reason === 'no_team'
        ? 'Cần ít nhất 1 Pokémon còn sống.'
        : 'Lời thách đấu đã bị huỷ.';
    this.chatLog?.addSystemLine(`[PvP] ${msg}`, '#e67e22');
    // Hộp thoại "chấp nhận thách đấu" vẫn mở (người chơi chưa kịp bấm) →
    // nếu không đóng, `isBlockingUiOpen()` luôn true và nhân vật đứng im vĩnh viễn.
    if (this.pvpChallengePromptOpen) {
      this.pvpChallengePromptOpen = false;
      this.confirmModal.close();
    }
  }

  /**
   * Click vào người chơi khác → hỏi xác nhận rồi gửi lời thách PvP.
   * Chỉ dùng `targetSessionId`; server tự kiểm tra map PvP / level / đang bận.
   */
  private promptPvpChallenge(targetSessionId: string, targetName: string): void {
    if (this.isBlockingUiOpen() || this.battleStarting) return;

    // Map không bật PvP → không mở hộp thoại (nếu không mỗi lần click người chơi
    // lại hiện modal khoá UI rồi bị server từ chối, khiến "mất quyền điều khiển").
    if (!MAPS[this.currentMapId]?.pvp) {
      this.chatLog?.addSystemLine('[PvP] Khu vực này không cho phép PvP.', '#e74c3c');
      return;
    }

    this.closeAllTopDialogs();
    this.confirmModal.show({
      title: '⚔ THÁCH ĐẤU PVP',
      message: `Gửi lời thách đấu tới ${targetName}?`,
      confirmText: 'Thách đấu',
      cancelText: 'Huỷ',
      confirmColor: 0x2980b9,
      onConfirm: () => ColyseusManager.getInstance().sendPvpChallenge(undefined, targetSessionId),
    });
  }

  /** Server trả kết quả lệnh debug (`/spawn`) → hiện vào khung chat. */
  private onDebugMsg(data: any): void {
    const msg = String(data?.message ?? '').trim();
    if (!msg) return;
    const color = data?.level === 'error' ? '#ff7675' : '#55efc4';
    this.chatLog?.addSystemLine(msg, color);
  }

  /** Server đã roll encounter hoặc kích hoạt trainer battle → dừng di chuyển, vào battle room bằng token. */
  private onBattleInit(data: any): void {
    const token = data?.token;
    if (!token) return;
    // Reset PvP trước để trận wild/trainer kế không kế thừa state cũ.
    this.pvpIsPvp = false;
    this.pvpRoomId = '';
    this.pvpSeat = 'ally';
    this.pvpFoeName = '';
    this.pvpAllyName = '';
    this.pvpRewardMoney = 0;
    const isTrainer = Boolean(data?.isTrainer);
    const trainerName = data?.trainerName || data?.trainerId;
    if (trainerName && !this.currentBattleTrainerId) {
      this.currentBattleTrainerId = String(data?.trainerId || trainerName);
    }
    if (!isTrainer && !data?.isPvp) {
      this.reportEncounter(data);
    }
    // PvP: foe nhận `roomId` để joinById; ally (bên thách) không có roomId → create.
    if (data?.isPvp) {
      this.pvpIsPvp = true;
      this.pvpFoeName = String(data?.foeName ?? '');
      this.pvpAllyName = String(data?.allyName ?? '');
      this.pvpRewardMoney = Number(data?.rewardMoney ?? 0);
      if (data?.roomId) this.pvpRoomId = String(data.roomId);
      if (data?.seat) this.pvpSeat = data.seat;
    }
    this.startBattle(token, data?.foe, data?.ally, isTrainer, trainerName, data);
  }

  /**
   * Hiện toạ độ lên khung chat khi Pokémon hoang xuất hiện:
   * - **Character**: toạ độ nhân vật (pixel + ô) lúc gặp.
   * - **Pokemon**: toạ độ ô Pokémon xuất hiện (server gửi trong `battle_init.tile`).
   */
  private reportEncounter(data: any): void {
    const tile = data?.tile as { x?: number; y?: number } | undefined;
    const charTileX = Math.floor(this.player.x / TILE_SIZE);
    const charTileY = Math.floor(this.player.y / TILE_SIZE);

    const lines = [
      `Character: (${charTileX}, ${charTileY}) [pixel ${Math.round(this.player.x)}, ${Math.round(this.player.y)}]`,
    ];
    if (tile && Number.isInteger(tile.x) && Number.isInteger(tile.y)) {
      lines.push(`Pokemon: (${tile.x}, ${tile.y})`);
    } else {
      // Fallback: không có tile từ server → ô nhân vật đứng (spawn tại chỗ).
      lines.push(`Pokemon: (${charTileX}, ${charTileY})`);
    }
    this.chatLog?.addSystemBlock(lines.join('\n'), '#fdcb6e');
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

    // BattleModal phát `battle_ended` khi trận kết thúc → mở lại input +
    // nạp lại party (HP/EXP/level có thể đã thay đổi trong trận). Plan 44.
    this.events.on('battle_ended', () => this.onBattleEnded());
  }

  /** Kết thúc trận đấu → đóng modal, mở khoá di chuyển, cập nhật trainer và đồng bộ party từ API. */
  private onBattleEnded(result?: string): void {
    if (this.currentBattleTrainerId && (result === 'win' || result === 'caught')) {
      this.defeatedTrainers.add(this.currentBattleTrainerId);
      this.saveDefeatedTrainers();
      // Rematch cooldown 60s
      this.npcCooldowns.set(this.currentBattleTrainerId, Date.now() + 60000);
      this.chatLog?.addSystemLine(`[Huấn luyện viên] Bạn đã đánh bại HLV ${this.currentBattleTrainerId}!`, '#2ecc71');
    }
    this.currentBattleTrainerId = undefined;
    this.battleModal = undefined;
    this.battleStarting = false;
    // Reset trạng thái PvP để trận wild/trainer kế tiếp không bị kế thừa.
    this.pvpIsPvp = false;
    this.pvpRoomId = '';
    this.pvpSeat = 'ally';
    this.pvpFoeName = '';
    this.pvpAllyName = '';
    this.pvpRewardMoney = 0;
    this.canMove = true;
    this.cancelAutoMove();
    void this.loadPlayerPokemon();
    console.log('[battle] world resumed after battle');
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
      ...(this.battleModal ? this.battleModal.getGameObjects() : []),
      ...(this.pokemonSummaryModal ? this.pokemonSummaryModal.getGameObjects() : []),
      ...(this.pokedexModal ? this.pokedexModal.getGameObjects() : []),
      ...(this.townMapModal ? this.townMapModal.getGameObjects() : []),
      // ── Plan 45: Túi đồ / Store / Trade / Tiến hoá ──
      // Nằm trong getHudObjects() để setupUiCamera() ignore giúp.
      // Lý do: các modal này được tạo trong createHud() — chạy TRƯỚC
      // setupUiCamera() — nên registerHudObject() lúc khởi tạo là no-op
      // (this.uiCam chưa có). Không khai báo ở đây → cả world camera và
      // UI camera đều render → hiện 2 khung modal chồng lên nhau.
      ...(this.bagModal ? this.bagModal.getGameObjects() : []),
      ...(this.storeModal ? this.storeModal.getGameObjects() : []),
      ...(this.tradeModal ? this.tradeModal.getGameObjects() : []),
      ...(this.evolveModal ? this.evolveModal.getGameObjects() : []),
      ...(this.partySelectModal ? this.partySelectModal.getGameObjects() : []),
      ...(this.dialogueModal ? this.dialogueModal.getGameObjects() : []),
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
    // Marker `/tile` + nhãn toạ độ + overlay property — tạo SAU setupUiCamera,
    // nên phải kê khai ở đây để main camera ignore (tránh render đôi 2 camera).
    if (this.tileMarker) objs.push(this.tileMarker);
    if (this.tileMarkerLabel) objs.push(this.tileMarkerLabel);
    if (this.propOverlay) objs.push(this.propOverlay);

    // Map Tiled có nhiều tilelayer (Ground/Decoration/Overhead) → push tất cả.
    if (this.tiledLayers.length > 0) {
      objs.push(...this.tiledLayers);
    } else if (this.mapLayer) {
      objs.push(this.mapLayer);
    }

    for (const rp of this.remotePlayers) {
      objs.push(rp[1], ...rp[1].getChildObjects());
    }

    if (this.npcSprites.length > 0) {
      objs.push(...this.npcSprites);
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

      // Esc → đóng modal top nếu đang mở, hoặc mở/đóng settings panel
      this.input.keyboard.on('keydown-ESC', () => {
        // Ứng cứu: battle modal kẹt (chết kết nối / server đóng phòng mà
        // `finish()` không chạy) → ESC ép kết thúc để trả quyền điều khiển.
        if (this.battleModal?.isOpen() && !this.battleModal.isEnded()) {
          this.battleModal.forceClose();
          return;
        }
        if (this.isAnyTopDialogOpen()) {
          this.closeAllTopDialogs();
          this.syncTopMenuActive();
        } else {
          this.toggleTopDialog('settings');
        }
      });
      this.setupKeyboardInput();
      // Space → tương tác với NPC ở ô trước mặt nếu không có modal chặn
      this.input.keyboard.on('keydown-SPACE', () => {
        if (this.isBlockingUiOpen() || this.dialogueModal.isOpen()) return;
        if (this.chatLog?.isInputFocused()) return;

        const v = WorldScene.dirToVector(this.player.getDirection());
        const facingCol = Math.floor(this.player.x / TILE_SIZE) + v.dx;
        const facingRow = Math.floor(this.player.y / TILE_SIZE) + v.dy;
        const targetNpc = this.collision.getNpcSpawns().find((n) => n.x === facingCol && n.y === facingRow);
        if (targetNpc) {
          this.interactWithNpc(targetNpc);
        }
      });
    }

    this.setupPointerInput();
  }

  /**
   * Gắn phím tắt trực quan:
   * - D: Bật/tắt Pokédex (PokedexModal)
   * - M: Bật/tắt Bản đồ thế giới (TownMapModal)
   * - B: Bật/tắt Túi đồ (BagModal)
   * - P: Bật/tắt Đội hình (PartyStrip)
   * - H: Bật/tắt Hướng dẫn (HelpModal)
   */
  private setupKeyboardInput(): void {
    if (!this.input.keyboard) return;

    // K / D → Bật/tắt Pokédex (PokedexModal)
    this.input.keyboard.on('keydown-K', () => {
      if (this.chatLog?.isInputFocused()) return;
      this.openPokedex();
    });
    // M → Bật/tắt Bản đồ thế giới (TownMapModal)
    this.input.keyboard.on('keydown-M', () => {
      if (this.chatLog?.isInputFocused()) return;
      this.openTownMap();
    });
    // B → Bật/tắt Túi đồ (BagModal)
    this.input.keyboard.on('keydown-B', () => {
      if (this.chatLog?.isInputFocused()) return;
      this.toggleTopDialog('bag');
    });
    // H → mở/đóng bảng hướng dẫn
    this.input.keyboard.on('keydown-H', () => {
      if (this.chatLog?.isInputFocused()) return;
      this.toggleTopDialog('help');
    });
    // P → mở/đóng Party
    this.input.keyboard.on('keydown-P', () => {
      if (this.chatLog?.isInputFocused()) return;
      this.partyStrip?.toggle();
      this.topMenu?.setActive(this.partyStrip?.isOpen() ? 'team' : '');
      this.settingsPanel?.setHudCheckbox('party', this.partyStrip?.isOpen());
      if (this.partyStrip?.isOpen()) {
        this.loadPlayerPokemon();
      }
    });
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
  /**
   * UI nào đang chặn tương tác với gameplay (click-to-move / pan / hover) phía dưới?
   *
   * SSOT: **bất kỳ modal nào có `lockUi: true`** (SettingsPanel, ConfirmModal,
   * BattleModal, SelectToolsModal) đều đã bật `overlayBlocker` phủ toàn màn hình →
   * gameplay phía dưới phải bị chặn hoàn toàn.
   *
   * Modal `lockUi: false` (HelpModal, PcBoxModal, PokemonSummaryModal, PartyStrip…)
   * không phủ màn hình → vẫn cho click xuyên qua vùng trống, nên KHÔNG chặn ở đây;
   * việc chặn cục bộ do `over` + depth trong `isClickOnUiLayer()` bên dưới.
   */
  private isBlockingUiOpen(): boolean {
    return Boolean(
      this.pokedexModal?.isOpen() ||
        this.townMapModal?.isOpen() ||
        this.bagModal?.isOpen() ||
        this.storeModal?.isOpen() ||
        this.tradeModal?.isOpen() ||
        this.pcBoxModal?.isOpen() ||
        this.settingsPanel?.isOpen() ||
        this.helpModal?.isOpen() ||
        this.debugModal?.isOpen() ||
        this.pokemonSummaryModal?.isOpen() ||
        this.partySelectModal?.isOpen() ||
        this.confirmModal?.isOpen() ||
        this.battleModal?.isOpen() ||
        this.topMenu?.isToolsModalOpen(),
    );
  }

  /**
   * Click có rơi vào UI overlay (depth >= 100) không?
   *
   * Dùng `pointerover` — Phaser chỉ liệt kê object **thực sự nhận input** tại điểm
   * chuột, và đã loại object `visible: false` / `input.enabled: false`.
   */
  private isClickOnUiLayer(over: Phaser.GameObjects.GameObject[]): boolean {
    return over.some((o: any) => {
      if (!o || o.visible === false || o.input?.enabled === false) return false;
      // Object nằm trong container ẩn (vd modal minimize) → coi như không có UI ở đó.
      let parent = o.parentContainer;
      while (parent) {
        if (parent.visible === false) return false;
        parent = parent.parentContainer;
      }
      // Depth của child = max(depth mình, depth mọi container cha).
      let d = o.depth ?? 0;
      let pNode = o.parentContainer;
      while (pNode) {
        d = Math.max(d, pNode.depth ?? 0);
        pNode = pNode.parentContainer;
      }
      return d >= 100;
    });
  }

  private setupPointerInput(): void {
    this.input.mouse?.disableContextMenu();

    // Click-to-move (mặc định Chuột trái / Touch, hoặc Chuột phải theo cài đặt)
    this.input.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        // Modal `lockUi` che màn hình → chặn mọi tương tác gameplay.
        if (this.isBlockingUiOpen()) return;

        // Modal popup đang mở → không cho click xuyên xuống map.
        // KHÔNG gộp panel HUD thường trực (partyStrip, infoPanel…): chúng không có
        // nút đóng nên `isOpen()` luôn true → sẽ chặn click-to-move vĩnh viễn.
        // Với panel HUD, `isClickOnUiLayer()` đã loại đúng vùng bị che.
        const anyModalOpen =
          this.debugModal?.isOpen() ||
          this.helpModal?.isOpen() ||
          this.pcBoxModal?.isOpen() ||
          this.pokemonSummaryModal?.isOpen();
        if (anyModalOpen) return;

        // UI nằm trên camera riêng (`uiCam`) — camera được `cameras.add()` sau
        // `cameras.main` nên nằm TRÊN trong danh sách. Phaser hit-test `uiCam`
        // TRƯỚC rồi return ngay khi thấy object (xem InputPlugin.hitTestPointer):
        //   "if (over.length > 0) { pointer.camera = camera; return over; }"
        // ⇒ `over` chỉ chứa object của `uiCam` → `over.length > 0` ⇔ click vào UI.
        // Dùng cách này thay vì whitelist tên modal: mọi UI (chat, nút settings,
        // nút OK battle, HUD panel…) đều tự động bị chặn, không bỏ sót.
        if (over.length > 0) return;

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
        if (this.isBlockingUiOpen()) return;
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
      if (this.isBlockingUiOpen()) return;
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

    const path = findPath(
      this.player.x,
      this.player.y,
      targetX,
      targetY,
      (c, r, fc, fr) => {
        // `passage` chặn hướng tại ô đích → cần biết hướng đi (từ ô cha sang ô này).
        if (fc === undefined || fr === undefined) return this.canEnterTile(c, r);
        const dc = c - fc;
        const dr = r - fr;
        const dir: Dir = dc > 0 ? 'right' : dc < 0 ? 'left' : dr > 0 ? 'down' : 'up';
        return this.canEnterTile(c, r, dir);
      },
    );
    if (path.length === 0) {
      // Thử fallback trực tiếp nếu ô đích là ô lân cận đi được
      const curCol = Math.floor(this.player.x / TILE_SIZE);
      const curRow = Math.floor(this.player.y / TILE_SIZE);
      const destCol = Math.floor(targetX / TILE_SIZE);
      const destRow = Math.floor(targetY / TILE_SIZE);
      const isNeighbor = Math.abs(destCol - curCol) + Math.abs(destRow - curRow) === 1;
      const ndc = destCol - curCol;
      const ndr = destRow - curRow;
      const stepDir: Dir =
        ndc > 0 ? 'right' : ndc < 0 ? 'left' : ndr > 0 ? 'down' : 'up';
      if (isNeighbor && this.canEnterTile(destCol, destRow, stepDir)) {
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

    // ChatLog (phải-dưới) — có ô nhập chữ cố định, nhận chat + lệnh `/`.
    this.chatLog = new ChatLog(
      this,
      (msg) => this.handleChatInput(msg),
      () => this.settingsPanel?.setHudCheckbox('chat', false),
    );
    this.chatLog.setUiZoomManager(this.uiZoom);
    // Moderator+ → ô chat gợi ý lệnh debug (bấm Enter để focus nhanh).
    this.chatLog.setDebugMode(ColyseusManager.getInstance().hasDebugAccess());
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => this.chatLog?.focusInput());
    }

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
      onClose: () => this.syncTopMenuActive(),
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
        this.syncTopMenuActive();
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

    // Dialogue Modal — hộp thoại hội thoại cốt truyện Pokémon
    this.dialogueModal = new DialogueModal(this);
    this.dialogueModal.setUiZoomManager(this.uiZoom);

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
      this.syncTopMenuActive();
    });
    this.helpModal.setUiZoomManager(this.uiZoom);

    // PokemonSummaryModal — bảng thông tin chi tiết từng Pokémon
    this.pokemonSummaryModal = new PokemonSummaryModal(this);
    this.pokemonSummaryModal.setUiZoomManager(this.uiZoom);
    // Tab "Vật phẩm" → mở BagModal để đổi item đang cầm.
    this.pokemonSummaryModal.onOpenBag = () => {
      this.toggleTopDialog('bag');
    };

    // ── Plan 45: Túi đồ / Store / Trade / Tiến hoá ──
    // PartySelectModal — mini party box dùng chung cho mọi tác vụ chọn Pokémon
    // (dùng item, gán item, switch, trade).
    // onSelect/onCancel được gán động mỗi lần mở qua openPartySelect().
    this.partySelectModal = new PartySelectModal(this, {
      title: t('PARTY_SELECT_TITLE'),
      party: this.playerPokemonParty,
    });

    this.pokedexModal = new PokedexModal(this, () => this.syncTopMenuActive());
    this.pokedexModal.setUiZoomManager(this.uiZoom);

    this.townMapModal = new TownMapModal(this, () => this.syncTopMenuActive());
    this.townMapModal.setUiZoomManager(this.uiZoom);

    this.bagModal = new BagModal(this, {
      party: this.playerPokemonParty,
      onUse: (itemId, pokemonId) => {
        ColyseusManager.getInstance().sendUseItem(itemId, pokemonId);
      },
      onHold: (itemId, pokemonId) => {
        ColyseusManager.getInstance().sendHoldItem(pokemonId, itemId);
      },
      // Dùng/gán item → mở mini party box để chọn Pokémon mục tiêu.
      onPickTarget: (opts) => this.openPartySelect(opts),
      onClose: () => this.syncTopMenuActive(),
    });
    this.bagModal.setUiZoomManager(this.uiZoom);

    this.storeModal = new StoreModal(this, () => this.syncTopMenuActive());
    this.storeModal.setUiZoomManager(this.uiZoom);

    this.tradeModal = new TradeModal(this, () => this.syncTopMenuActive());
    this.tradeModal.setUiZoomManager(this.uiZoom);

    this.evolveModal = new EvolveModal(this);
    this.evolveModal.setUiZoomManager(this.uiZoom);

    // Lưu ý: KHÔNG gọi registerHudObject() ở đây — createHud() chạy TRƯỚC
    // setupUiCamera() nên this.uiCam chưa tồn tại (lệnh sẽ no-op).
    // 4 modal này đã được khai báo trong getHudObjects() để setupUiCamera()
    // ignore giúp (tránh world + UI camera render trùng → 2 khung chồng nhau).

    // PcBoxModal — hộp lưu trữ Pokémon (PC Box)
    this.pcBoxModal = new PcBoxModal(
      this,
      this.pokemonSummaryModal,
      (newParty) => this.onPartyUpdated(newParty),
      () => this.syncTopMenuActive(),
    );
    this.pcBoxModal.setUiZoomManager(this.uiZoom);

    // ── Công cụ Debug (chỉ bật cho tài khoản moderator trở lên) ──
    this.setupDebugTools();
    this.syncDebugTools();
    // Lưu ý: các overlay debug (tileMarker, propOverlay...) đã được
    // `registerWorldObject()` ignore ở `uiCam` → chỉ main camera render.
    // TUYỆT ĐỐI không gọi `main.ignore()` cho chúng — nếu không cả 2 camera
    // đều bỏ qua → overlay biến mất khỏi màn hình.

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
        const isShiny = Boolean(pkm.shiny);
        const baseName = pkm.nickname || pkm.species_id;
        const displayName = isShiny ? `S. ${baseName}` : baseName;
        members.push({
          id: pkm.id,
          name: displayName,
          species_id: pkm.species_id,
          level: pkm.level,
          hp: pkm.current_hp ?? maxHp,
          maxHp,
          rarity: isShiny ? 'legendary' : 'common',
          shiny: isShiny,
          heldItem: (pkm as PokemonData & { held_item?: string | null }).held_item ?? null,
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

  /**
   * Mở `PartySelectModal` (mini party box) để chọn 1 Pokémon trong đội.
   * Dùng chung cho: dùng item, gán item, switch, trade…
   * `opts.onSelect` được gán động rồi mở modal.
   */
  private openPartySelect(opts: {
    title: string;
    hint?: string;
    filterAlive?: boolean;
    onSelect: (pokemon: PokemonData, index: number) => void;
  }): void {
    const modal = this.partySelectModal;
    modal.setTitle(opts.title);
    modal.setParty(this.playerPokemonParty);
    modal.setFilterAlive(opts.filterAlive ?? false);
    modal.setHint(opts.hint ?? t('PARTY_SELECT_HINT'));
    modal.onSelect = opts.onSelect;
    modal.onCancel = () => undefined;
    modal.show();
  }

  /**
   * Danh sách các key của hộp thoại ở hàng top.
   * Mỗi thời điểm chỉ mở duy nhất MỘT hộp thoại trong nhóm này.
   */
  private readonly TOP_DIALOG_KEYS = [
    'pokedex',
    'map',
    'bag',
    'store',
    'trade',
    'pc',
    'settings',
    'help',
    'debug',
  ] as const;

  public getTopDialog(key: string): UiModal | undefined {
    switch (key) {
      case 'pokedex':
        return this.pokedexModal;
      case 'map':
        return this.townMapModal;
      case 'bag':
        return this.bagModal;
      case 'store':
        return this.storeModal;
      case 'trade':
        return this.tradeModal;
      case 'pc':
        return this.pcBoxModal;
      case 'settings':
        return this.settingsPanel;
      case 'help':
        return this.helpModal;
      case 'debug':
        return this.debugModal;
      default:
        return undefined;
    }
  }

  /** Kiểm tra xem có bất kỳ hộp thoại hàng top nào đang mở hay không */
  public isAnyTopDialogOpen(): boolean {
    return this.TOP_DIALOG_KEYS.some((k) => this.getTopDialog(k)?.isOpen());
  }

  /** Đóng tất cả các hộp thoại ở hàng top (ngoại trừ exceptKey nếu chỉ định) */
  public closeAllTopDialogs(exceptKey?: string): void {
    for (const k of this.TOP_DIALOG_KEYS) {
      if (k === exceptKey) continue;
      const modal = this.getTopDialog(k);
      if (modal && modal.isOpen()) {
        modal.close();
      }
    }
    if (this.topMenu?.isToolsModalOpen()) {
      this.topMenu.closeToolsModal();
    }
  }

  /** Đồng bộ icon active trên TopMenu theo hộp thoại hàng top đang mở (nếu có) */
  public syncTopMenuActive(): void {
    for (const k of this.TOP_DIALOG_KEYS) {
      const modal = this.getTopDialog(k);
      if (modal && modal.isOpen()) {
        this.topMenu?.setActive(k);
        return;
      }
    }
    this.topMenu?.setActive('');
  }

  /**
   * Bật/tắt hộp thoại hàng top:
   * Mỗi lần chỉ mở một khung: nếu đã mở thì đóng lại, nếu khung khác đang mở thì đóng khung cũ và mở khung mới.
   */
  public toggleTopDialog(key: string): void {
    const targetModal = this.getTopDialog(key);
    if (!targetModal) return;

    if (key === 'debug' && !ColyseusManager.getInstance().hasDebugAccess()) {
      this.chatLog?.addLine(t('WS_NEED_MOD'));
      return;
    }

    if (targetModal.isOpen()) {
      targetModal.close();
      SoundManager.getInstance(this).playSe('gui_menu_close');
      this.syncTopMenuActive();
      return;
    }

    // Đóng toàn bộ các hộp thoại top khác trước khi mở khung mới
    this.closeAllTopDialogs(key);

    // Chuẩn bị dữ liệu trước khi mở
    if (key === 'pc') {
      this.loadPlayerPokemon();
    } else if (key === 'trade') {
      this.tradeModal.setParty(this.playerPokemonParty);
    } else if (key === 'map') {
      this.townMapModal.setCurrentMapId(this.currentMapId);
    }

    targetModal.show();
    this.topMenu?.setActive(key);

    if (key === 'pokedex') {
      SoundManager.getInstance(this).playSe('gui_pokedex_open');
    } else if (key === 'map') {
      SoundManager.getInstance(this).playSe('gui_menu_open');
    }
  }

  public openPokedex(): void {
    this.toggleTopDialog('pokedex');
  }

  public openTownMap(): void {
    this.toggleTopDialog('map');
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
      case 'team': {
        this.partyStrip.toggle();
        this.topMenu?.setActive(this.partyStrip.isOpen() ? 'team' : '');
        this.settingsPanel?.setHudCheckbox('party', this.partyStrip.isOpen());
        if (this.partyStrip.isOpen()) {
          this.loadPlayerPokemon();
        }
        break;
      }
      case 'pokedex':
        this.openPokedex();
        break;
      case 'map':
        this.openTownMap();
        break;
      case 'debug':
      case 'settings':
      case 'help':
      case 'pc':
      case 'bag':
      case 'store':
      case 'trade':
        this.toggleTopDialog(key);
        break;
      case 'logout':
        this.confirmLogout();
        break;
      default:
        // Các icon khác hiện chỉ là nút bấm — chưa cần popup.
        this.chatLog?.addLine(`[${key}] chưa implement`);
        break;
    }
  }

  private confirmLogout(): void {
    this.closeAllTopDialogs();
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

        // Plan 47: click trái vào người chơi khác → mở hộp thoại thách đấu PvP.
        rp.setInteractive({ useHandCursor: true });
        rp.on('pointerdown', (p: Phaser.Input.Pointer) => {
          if (p.button !== 0) return;
          this.promptPvpChallenge(sessionId, ps.displayName);
        });

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

  /**
   * Đồng bộ ngày/đêm + thời tiết từ server (`WorldState.timeOfDay/weather/
   * gameMinutes`) → InfoPanel hiển thị + lớp phủ tối bản đồ.
   *
   * Chỉ chạy khi phase đổi để tránh set alpha mỗi nhịp state (Colyseus sync
   * state liên tục theo chuyển động người chơi).
   */
  private syncWorldClock(state: any): void {
    if (!state) return;
    const phase = typeof state.timeOfDay === 'string' ? state.timeOfDay : 'day';
    const weather = typeof state.weather === 'string' ? state.weather : 'sunny';
    const gameMinutes = typeof state.gameMinutes === 'number' ? state.gameMinutes : 0;

    this.infoPanel?.setServerClock(phase, weather, gameMinutes);
    if (phase === this.shownPhase) return;
    this.shownPhase = phase;

    const overlay = this.ensureNightOverlay();
    // Độ tối theo phase: đêm rõ rệt, chạng vạng nhẹ, ngày trong.
    const alpha = phase === 'night' ? 0.38 : phase === 'dusk' || phase === 'dawn' ? 0.14 : 0;
    const tint = phase === 'night' ? 0x1a2350 : 0x53350a;
    overlay.setFillStyle(tint, alpha).setVisible(alpha > 0);
  }

  /**
   * Tạo (1 lần) lớp phủ tối fullscreen cho camera world. `scrollFactor(0)` +
   * bám kích thước viewport khi resize; đăng ký `registerWorldObject` để camera
   * UI bỏ qua (HUD giữ nguyên độ sáng).
   */
  private ensureNightOverlay(): Phaser.GameObjects.Rectangle {
    if (this.nightOverlay) return this.nightOverlay;
    const { width, height } = this.scale;
    const rect = this.add.rectangle(0, 0, width + 4, height + 4, 0x1a2350, 0);
    rect.setOrigin(0, 0).setScrollFactor(0).setDepth(5000).setVisible(false);
    this.registerWorldObject(rect);
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      rect.setSize(size.width + 4, size.height + 4);
    });
    this.nightOverlay = rect;
    return rect;
  }

  private showChat(from: string, message: string): void {
    // Ghi vào khung chat (kênh chính) — trước đây chỉ hiện chữ nổi nên người
    // chơi gõ tin không thấy gì trong khung chat.
    this.chatLog?.addLine(`${from}: ${message}`);

    // Chữ nổi trên đầu nhân vật (giữ lại cho chat kiểu Pokemon).
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

  /**
   * Bắt đầu trận (wild encounter hoặc PvP).
   *
   * Server roll encounter ở `handleMove` rồi gửi `battle_init {token, foe, ally}`.
   * Client mở **BattleModal popup** (không launch scene riêng):
   *   1. Dừng di chuyển + khoá input.
   *   2. Tạo BattleModal (lockUi) và join battle room bằng token.
   *   3. Khi modal đóng → `battle_ended` → mở lại input + refresh party.
   */
  private startBattle(
    token: string,
    foe: unknown,
    ally: unknown,
    isTrainer?: boolean,
    trainerName?: string,
    rawInit?: any,
  ): void {
    // Guard: nhiều `battle_init` liên tiếp (hoặc async race) → chỉ mở 1 modal.
    if (this.battleStarting || this.battleModal) return;
    this.battleStarting = true;
    this.canMove = false;
    this.cancelAutoMove();

    /**
     * Mở khoá điều khiển khi không mở được battle (join fail / exception).
     * Bắt buộc phải có: mọi nhánh lỗi phải trả `canMove = true` + `battleStarting
     * = false`, nếu không người chơi đứng im vĩnh viễn.
     */
    const releaseControls = (result: string): void => {
      this.battleStarting = false;
      this.battleModal = undefined;
      this.onBattleEnded(result);
    };

    const network = ColyseusManager.getInstance();

    // Watchdog: nếu `joinBattle`/`create` treo (server không phản hồi — không
    // resolve cũng không reject) thì `.catch` ở dưới KHÔNG chạy. Sau 15s vẫn
    // `battleStarting` mà chưa có modal → trả quyền điều khiển.
    this.time.delayedCall(15_000, () => {
      if (this.battleStarting && !this.battleModal) {
        console.warn('[battle] startBattle watchdog — releasing stuck controls');
        releaseControls('error');
      }
    });

    // PvP: bên foe dùng joinById (room do bên thách tạo), bên thách dùng create.
    const joinPromise = this.pvpIsPvp && this.pvpRoomId
      ? network.joinBattleById(this.pvpRoomId, token)
      : network.joinBattle(token);

    joinPromise
      .then(() => {
        if (!network.battle) {
          // Join thất bại (token hết hạn / phòng full / mất mạng) → huỷ mở modal.
          releaseControls('error');
          return;
        }
        const init = {
          token,
          foe: foe as any,
          ally: (ally ?? []) as any,
          isTrainer,
          trainerName,
          isPvp: this.pvpIsPvp || undefined,
          foeName: this.pvpFoeName || undefined,
        };
        return BattleModal.loadTextures(this, init as any).then(() => {
          if (!this.scene.isActive()) {
            releaseControls('error');
            return;
          }
          this.battleModal = new BattleModal(
            this,
            init as any,
            (result) => this.onBattleEnded(result),
            () => this.chatLog?.addSystemLine(t('BATTLE_RUN_SAFETY'), '#7bed9f'),
          );
          // Gán seat sớm để BattleModal vẽ đúng góc nhìn ngay từ frame đầu.
          this.battleModal.onSeatAssigned = (seat) => {
            this.pvpSeat = seat;
          };
          this.battleModal.setUiZoomManager(this.uiZoom);
          this.battleStarting = false;
          // Modal tạo SAU setupUiCamera() → phải đăng ký world.ignore(),
          // nếu không cả 2 camera render → hiện 2 khung chồng nhau.
          this.registerHudObject(...this.battleModal.getGameObjects());
        });
      })
      .catch((err) => {
        // Bất kỳ exception nào (join / load texture / constructor modal) → trả
        // quyền điều khiển thay vì để `canMove=false` treo vĩnh viễn.
        console.error('[battle] startBattle failed:', err);
        releaseControls('error');
      });
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
   * - `dir` (tuỳ chọn): kiểm thêm `passage` chặn hướng tại ô đích.
   */
  private canEnterTile(col: number, row: number, dir?: Dir): boolean {
    if (this.noclip) return true;
    const curCol = Math.floor(this.player.x / TILE_SIZE);
    const curRow = Math.floor(this.player.y / TILE_SIZE);
    // Nếu nhân vật hiện tại đang bị kẹt trong ô blocked (ví dụ tắt noclip bên trong tường/mái nhà),
    // cho phép đi vào ô walkable gần nhất để thoát ra ngoài!
    if (!this.collision.isWalkable(curCol, curRow, { canSurf: this.surfing })) {
      const safe = this.collision.nearestWalkable(curCol, curRow, { canSurf: this.surfing }, 12);
      if (safe && col === safe.x && row === safe.y) return true;
    }
    if (dir && this.collision.isDirBlocked(col, row, dir)) return false;
    // NPC chặn đường đi (không thể đi xuyên qua NPC)
    const npcs = this.collision.getNpcSpawns();
    if (npcs.some((npc) => npc.x === col && npc.y === row)) return false;
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
      if (!this.canEnterTile(landX, landY, dir)) return false;
      this.jumpLedge(landX, landY, dir);
      return true;
    }

    // 2. Bước thường: 1 ô.
    const v = WorldScene.dirToVector(dir);
    const nx = col + v.dx;
    const ny = row + v.dy;
    if (!this.canEnterTile(nx, ny, dir)) {
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

  /** Sau mỗi bước: kiểm tra warp (cửa nhà). */
  private onTileEntered(col: number, row: number, _dir: Dir): void {
    // Warp → yêu cầu server chuyển map (Phase 3 xử lý broadcast).
    const warp = this.collision.getWarpAt(col, row);
    if (warp) {
      const zoneKey = `${this.currentMapId}:${col},${row}`;
      if (this.lastWarpKey !== zoneKey) {
        this.lastWarpKey = zoneKey;
        ColyseusManager.getInstance().sendChangeMap(warp.toMap ?? '', warp.toX ?? 0, warp.toY ?? 0);
      }
    }
    // ⚠️ KHÔNG roll encounter ở client (Plan 44 Phase 0): server roll trong
    // handleMove rồi push `battle_init` — tránh race với move throttled và
    // tránh client tự mở trận ở ô không phải cỏ.
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

  /** Lấy key lưu trữ trạng thái trainer theo user. */
  private getTrainerStorageKey(): string {
    const net = ColyseusManager.getInstance();
    const user = net.name || net.id || 'guest';
    return `pixelmon_defeated_trainers_${user}`;
  }

  /** Nạp danh sách ID các trainer đã bị đánh bại từ localStorage. */
  private loadDefeatedTrainers(): void {
    try {
      const key = this.getTrainerStorageKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.defeatedTrainers = new Set(arr);
        }
      }
    } catch (e) {
      console.warn('[world] failed to load defeated trainers', e);
    }
  }

  /** Lưu danh sách ID các trainer đã bị đánh bại vào localStorage. */
  private saveDefeatedTrainers(): void {
    try {
      const key = this.getTrainerStorageKey();
      localStorage.setItem(key, JSON.stringify(Array.from(this.defeatedTrainers)));
    } catch (e) {
      console.warn('[world] failed to save defeated trainers', e);
    }
  }

  /** Kiểm tra xem NPC có phải là huấn luyện viên đối thủ không. */
  private isTrainerNpc(npc: import('@pixelmon/shared').MapObjectNpc): boolean {
    if (npc.trainer) return true;
    const id = (npc.npcId || '').toLowerCase();
    if (id.startsWith('trainer') || id.startsWith('gym') || id.startsWith('leader') || id.startsWith('route')) return true;
    if (id.includes('trainer') || id.includes('leader') || id.includes('gym')) return true;
    return false;
  }

  /**
   * Tương tác trò chuyện với NPC.
   */
  public interactWithNpc(npc: import('@pixelmon/shared').MapObjectNpc): void {
    const now = Date.now();
    const cdUntil = this.npcCooldowns.get(npc.npcId);
    if (cdUntil && now < cdUntil) {
      const remainSec = Math.ceil((cdUntil - now) / 1000);
      this.chatLog?.addSystemLine(`[NPC] Đang bận... Vui lòng thử lại sau ${remainSec}s.`, '#f39c12');
      return;
    }

    // Set cooldown tương tác chống spam
    this.npcCooldowns.set(npc.npcId, now + this.npcCooldownDuration);

    // Âm thanh mở hội thoại
    SoundManager.getInstance(this).playSe('gui_menu_open');

    // Tự động quay mặt player về phía NPC nếu đang đứng cạnh
    const playerCol = Math.floor(this.player.x / TILE_SIZE);
    const playerRow = Math.floor(this.player.y / TILE_SIZE);
    const dx = npc.x - playerCol;
    const dy = npc.y - playerRow;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      if (dx === 1) this.player.setDirection('right');
      else if (dx === -1) this.player.setDirection('left');
      else if (dy === 1) this.player.setDirection('down');
      else if (dy === -1) this.player.setDirection('up');
    }

    const isTrainer = this.isTrainerNpc(npc);

    if (isTrainer) {
      const speaker = npc.name || npc.npcId || 'Huấn luyện viên';
      if (this.defeatedTrainers.has(npc.npcId)) {
        // Huấn luyện viên đã bị đánh bại: thoại thắng cuộc / tái đấu
        const victoryLines = [
          'Cậu quả là một huấn luyện viên xuất sắc!',
          'Các Pokémon của cậu phối hợp thật tuyệt vời. Hẹn gặp lại trong trận tái đấu sau!',
        ];
        this.dialogueModal.startDialogue({
          speakerName: speaker,
          dialogueLines: victoryLines,
        });
      } else {
        // Huấn luyện viên chưa bị đánh bại: Đọc câu thoại thách đấu từ dialog
        const rawDialog = npc.dialog;
        const challengeLines = Array.isArray(rawDialog) && rawDialog.length > 0
          ? rawDialog
          : (typeof rawDialog === 'string' && rawDialog ? [rawDialog] : ['Tôi là huấn luyện viên ở đây! Hãy đấu một trận nào!']);

        this.dialogueModal.startDialogue({
          speakerName: speaker,
          dialogueLines: challengeLines,
          onComplete: () => {
            this.currentBattleTrainerId = npc.npcId;
            const remote = ColyseusManager.getInstance().world;
            if (remote) {
              const trainerId = (npc as any).trainerId || npc.name || npc.npcId;
              remote.send('start_trainer_battle', {
                trainerId,
                npcId: npc.npcId,
                trainerName: npc.name || npc.npcId,
              });
            }
          },
        });
      }
    } else {
      // NPC dân làng / chỉ dẫn
      const rawDialog = npc.dialog;
      const lines = Array.isArray(rawDialog)
        ? rawDialog
        : (typeof rawDialog === 'string' && rawDialog ? [rawDialog] : ['...']);

      this.dialogueModal.startDialogue({
        speakerName: npc.name || npc.npcId || 'NPC',
        dialogueLines: lines,
      });
    }
  }

  /**
   * Tạo / nạp các NPC trên map hiện tại.
   */
  private async spawnNpcsForCurrentMap(): Promise<void> {
    // 1. Dọn dẹp NPC cũ
    for (const sprite of this.npcSprites) {
      sprite.destroy();
    }
    this.npcSprites = [];

    // 2. Lấy danh sách NPC từ map hiện tại
    const npcs = this.collision.getNpcSpawns();
    if (!npcs || npcs.length === 0) return;

    for (const npc of npcs) {
      const spriteName = npc.sprite || 'guide';
      const texKey = `npc_${spriteName}`;
      const url = `/sprites/npcs/${spriteName}.png`;

      await loadNpcSpriteSheet(this, texKey, url);

      // Đặt toạ độ giữa ô (tile 32x32), origin (0.5, 32/48) để chân NPC chạm đúng mép dưới ô
      const px = npc.x * TILE_SIZE + TILE_SIZE / 2;
      const py = npc.y * TILE_SIZE + TILE_SIZE / 2;

      const sprite = this.add.sprite(px, py, texKey, '0_0');
      sprite.setOrigin(0.5, 32 / 48);
      sprite.setDepth(PLAYER_DEPTH);
      sprite.setInteractive({ useHandCursor: true });

      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        // Chỉ nhận chuột trái
        if (pointer.button !== 0) return;
        pointer.event?.stopPropagation();
        this.interactWithNpc(npc);
      });

      this.npcSprites.push(sprite);
      this.registerWorldObject(sprite);
    }
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
    if (!this.cursors || !this.canMove || this.isBlockingUiOpen()) return;

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

      this.debugModal.updateInfo(mapInfo, playerInfo, {
        online: ColyseusManager.getInstance().world != null,
        players: this.remotePlayers.size + 1,
      });
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
      // Ping chưa có cơ chế đo thật → để null (hiện `—`), không bịa số.
      const online = ColyseusManager.getInstance().world != null;
      this.debugPerfWidget.updatePerfInfo(fps, cam.scrollX, cam.scrollY, cam.zoom, online ? 'Online' : 'Offline', null);
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
    this.toggleTopDialog('debug');
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

    // Overlay đánh dấu ô theo tile property trong Tiled (ví dụ `terrain_tag=2`).
    // Dùng để đối chiếu trực quan vùng cỏ THẬT với vùng `spawnZones` (mốc kiểm tra) đang
    // được inject trong `build-server-map.ts` (thường rộng hơn nhiều).
    this.propOverlay = this.add
      .graphics()
      .setDepth(DEBUG_PROP_DEPTH)
      .setVisible(false)
      .setScrollFactor(1);
    this.registerWorldObject(this.propOverlay);

    // Overlay đánh dấu 1 ô do lệnh `/tile` chọn — viền sáng + nhãn toạ độ.
    // Depth cao nhất trong nhóm debug để luôn thấy khi nhiều overlay cùng bật.
    this.tileMarker = this.add
      .graphics()
      .setDepth(DEBUG_MARKER_DEPTH)
      .setVisible(false)
      .setScrollFactor(1);
    this.registerWorldObject(this.tileMarker);

    this.tileMarkerLabel = this.add
      .text(0, 0, '', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEBUG_MARKER_DEPTH)
      .setScrollFactor(1)
      .setVisible(false);
    this.registerWorldObject(this.tileMarkerLabel);

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

  /**
   * Đánh dấu 1 ô trên bản đồ (viền sáng + nhãn toạ độ) — gọi từ lệnh `/tile`.
   * Ô ngoài bản đồ → bỏ qua, không đánh dấu.
   */
  private markTile(tx: number, ty: number): void {
    const mapW = Math.round(this.mapWidth / TILE_SIZE);
    const mapH = Math.round(this.mapHeight / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return;
    this.markedTile = { x: tx, y: ty };
    this.drawTileMarker();
  }

  /** Xoá mọi đánh dấu ô do `/tile` tạo ra. */
  private clearTileMarker(): void {
    this.markedTile = null;
    this.tileMarker?.clear();
    this.tileMarker?.setVisible(false);
    this.tileMarkerLabel?.setText('');
    this.tileMarkerLabel?.setVisible(false);
  }

  /** Vẽ viền + nhãn toạ độ cho ô đang được đánh dấu. */
  private drawTileMarker(): void {
    const g = this.tileMarker;
    const label = this.tileMarkerLabel;
    if (!g || !label || !this.markedTile) return;
    const { x, y } = this.markedTile;
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

    g.clear();
    // Nền tối nhẹ để viền nổi bật trên mọi loại nền.
    g.fillStyle(0x000000, 0.25);
    g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    // Viền trắng dày + viền trong màu cyan.
    g.lineStyle(3, 0xffffff, 1);
    g.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
    g.lineStyle(1.5, 0x00cec9, 1);
    g.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    g.setVisible(true);

    label.setText(`[${x}, ${y}]`);
    label.setPosition(px + TILE_SIZE / 2, py - 2);
    label.setVisible(true);
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

  /** Bật/tắt overlay đánh dấu ô theo tile property. */
  private setPropOverlay(on: boolean): void {
    if (!this.propOverlay) return;
    this.propOverlay.setVisible(on);
    if (on && this.propOverlayQuery) this.drawPropOverlay(this.propOverlayQuery);
  }

  /**
   * Đọc tile property của 1 GID từ tileset đầu tiên của map hiện tại.
   * Trả về `Map<name, value>` (rỗng nếu tile không khai báo property).
   */
  private getTileProps(gid: number): Map<string, unknown> {
    const tmj = TILED_MAPS[this.currentMapId];
    const ts = tmj?.tilesets?.[0];
    if (!ts) return new Map();
    const firstgid = ts.firstgid ?? 1;
    const tile = ts.tiles?.find((x) => firstgid + x.id === gid);
    const m = new Map<string, unknown>();
    for (const p of tile?.properties ?? []) m.set(p.name, p.value);
    return m;
  }

  /**
   * Tô đậm mọi ô có tile property khớp truy vấn.
   *
   * @param query `name=value` (vd `terrain_tag=2`), hoặc chỉ `name` để tô mọi ô
   *              có property đó (bất kể giá trị). Rỗng → tắt overlay.
   *
   * Quét **mọi** tilelayer (Ground/Decoration/Overhead) vì `ledge_dir` nằm ở
   * Decoration còn `terrain_tag` nằm ở Ground — chỉ nhìn 1 layer sẽ bỏ sót.
   */
  private drawPropOverlay(query: string): void {
    const g = this.propOverlay;
    if (!g) return;
    g.clear();

    const q = query.trim();
    if (!q) return;

    const eq = q.indexOf('=');
    const name = (eq >= 0 ? q.slice(0, eq) : q).trim();
    const value = eq >= 0 ? q.slice(eq + 1).trim() : undefined;

    const tmj = TILED_MAPS[this.currentMapId];
    if (!tmj) return;
    const width = tmj.width;

    // Cache props theo GID để không parse lặp lại (map 36×24 × 3 layer).
    const cache = new Map<number, Map<string, unknown>>();
    const propsOf = (gid: number) => {
      let p = cache.get(gid);
      if (!p) {
        p = this.getTileProps(gid);
        cache.set(gid, p);
      }
      return p;
    };

    let hits = 0;
    for (const layer of tmj.layers ?? []) {
      if (layer.type !== 'tilelayer' || !layer.data) continue;
      for (let i = 0; i < layer.data.length; i++) {
        const gid = layer.data[i] ?? 0;
        if (!gid) continue;
        const props = propsOf(gid);
        if (!props.has(name)) continue;
        if (value !== undefined && String(props.get(name)) !== value) continue;

        const px = (i % width) * TILE_SIZE;
        const py = Math.floor(i / width) * TILE_SIZE;
        g.fillStyle(0xff00ff, 0.35);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.lineStyle(1, 0xff00ff, 0.9);
        g.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        hits++;
      }
    }

    this.propOverlayHits = hits;
  }

  /** Truy vấn property hiện đang được tô overlay (`''` = đang tắt). */
  private propOverlayQuery = '';

  /**
   * Đọc `terrain_tag` của 1 ô (tile coords) từ layer **Ground** —
   * nguồn terrain thật (Decoration/Overhead không mang terrain_tag).
   * @returns terrain_tag (number) hoặc `undefined` nếu ô không có terrain.
   */
  private getTerrainAt(tx: number, ty: number): number | undefined {
    const tmj = TILED_MAPS[this.currentMapId];
    if (!tmj) return undefined;
    const idx = ty * tmj.width + tx;
    for (const layer of tmj.layers ?? []) {
      if (layer.type !== 'tilelayer' || !layer.data) continue;
      // Tên layer phân biệt hoa/thường ('Ground' trong .tmj) → so sánh lowercase.
      if (layer.name.toLowerCase() !== 'ground') continue;
      const gid = layer.data[idx] ?? 0;
      if (!gid) return undefined;
      const v = this.getTileProps(gid).get('terrain_tag');
      return v === undefined ? undefined : Number(v);
    }
    return undefined;
  }
  /** Số ô khớp truy vấn ở lần vẽ gần nhất. */
  private propOverlayHits = 0;

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

        // 🟣 Passage: ô đi được nhưng có hướng bị chặn (RMXP `passage`).
        // Vẽ dải dày ở CẠNH bị chặn (dành cho ô không BLOCKED đã xử lý ở trên).
        if (this.collision.isWalkable(c, r, { canSurf: true })) {
          const blocked: Dir[] = (['up', 'down', 'left', 'right'] as Dir[]).filter((d) =>
            this.collision.isDirBlocked(c, r, d),
          );
          if (blocked.length > 0) {
            g.lineStyle(4, 0xa29bfe, 0.95);
            if (blocked.includes('up')) g.lineBetween(px, py + 2, px + TILE_SIZE, py + 2);
            if (blocked.includes('down'))
              g.lineBetween(px, py + TILE_SIZE - 2, px + TILE_SIZE, py + TILE_SIZE - 2);
            if (blocked.includes('left')) g.lineBetween(px + 2, py, px + 2, py + TILE_SIZE);
            if (blocked.includes('right'))
              g.lineBetween(px + TILE_SIZE - 2, py, px + TILE_SIZE - 2, py + TILE_SIZE);
          }
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
      if (this.propOverlay?.visible && this.propOverlayQuery) this.drawPropOverlay(this.propOverlayQuery);
      // Đánh dấu `/tile` thuộc map cũ → bỏ vì tọa độ không còn đúng.
      this.clearTileMarker();
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

      // 7. Nạp NPC cho map mới
      await this.spawnNpcsForCurrentMap();

      this.debugConsole?.addLog(`Đã chuyển sang map "${meta?.name ?? mapId}"!`, '#55efc4');
    } catch (err: any) {
      console.error(`[debug] switchMap error:`, err);
      this.debugConsole?.addLog(`Lỗi tải map: ${err.message}`, '#ff7675');
    }
  }

  /**
   * Xử lý nội dung gõ trong ô chat.
   *
   * - Bắt đầu bằng `/` → **lệnh debug**, chỉ chạy khi tài khoản đủ quyền
   *   (moderator+). Không đủ quyền → báo lỗi, KHÔNG gửi lên server.
   * - Còn lại → chat thường qua WorldRoom.
   */
  private handleChatInput(msg: string): void {
    const text = msg.trim();
    if (!text) return;
    const net = ColyseusManager.getInstance();

    if (!text.startsWith('/')) {
      net.sendChat(text);
      return;
    }

    // `/battle <tên>` — lệnh PvP cho MỌI người chơi (server tự validate).
    // Gửi thẳng lên server; KHÔNG đi qua nhánh lệnh debug (chỉ mod mới có).
    if (/^\/battle(\s|$)/i.test(text)) {
      net.sendChat(text);
      return;
    }

    // Lệnh debug — yêu cầu moderator+.
    if (!net.hasDebugAccess()) {
      this.chatLog?.addSystemLine(`${t('CHAT_CMD_DENIED')}  ${text}`, '#ff7675');
      return;
    }

    const result = this.handleDebugCommand(text);
    if (result) {
      // `handleDebugCommand` trả về 1 chuỗi (có thể nhiều dòng) → hiện nguyên khối
      // trong chat (tự tạm mở rộng số dòng nếu output dài).
      this.chatLog?.addSystemBlock(String(result));
    }
  }

  private handleDebugCommand(cmd: string): string | void {
    const parts = cmd.trim().split(/\s+/);
    const action = parts[0]?.toLowerCase();

    if (action === '/help') {
      // `/help` hiển thị mọi lệnh (gồm cả các cửa sổ debug có sẵn).
      return [
        t('WS_HELP_HEADER'),
        t('WS_HELP_HELP'),
        '• /battle <tên> — Thách đấu PvP người chơi khác (chỉ ở map PvP)',
        '• /pokedex hoặc /dex — Mở Pokédex (Phím D)',
        '• /map hoặc /townmap — Mở Bản đồ vùng Essen (Phím M)',
        '• Phím tắt: [D] Pokédex | [M] Town Map | [B] Túi đồ | [P] Đội hình | [H] Trợ giúp',
        t('WS_HELP_MAP'),
        t('WS_HELP_POS'),
        t('WS_HELP_TILE'),
        t('WS_HELP_SERVER'),
        t('WS_HELP_TP'),
        t('WS_HELP_SPEED'),
        t('WS_HELP_NOCLIP'),
        t('WS_HELP_OVERLAY'),
        t('WS_HELP_LAYER'),
        t('WS_CMD_DEBUG_GRID'),
        t('WS_HELP_CLEAR'),
        t('WS_HELP_SPAWN'),
        t('WS_HELP_FORCEEVOLVE'),
        t('WS_HELP_REVERSEEVOLVE'),
        t('WS_HELP_LEVELDOWN'),
        t('WS_HELP_LEVELUP'),
        t('WS_HELP_FORCEFRIEND'),
        t('WS_HELP_TRADE'),
        t('WS_HELP_SWITCH'),
        '• /trainer <id> — Kích hoạt trận đấu trainer test',
        '• /resetnpc [id|all] — Reset trạng thái/cooldown NPC',
        '• /npclist — Liệt kê tất cả NPC trên map kèm toạ độ và trạng thái',
        '• /cooldown <seconds> — Điều chỉnh thời gian cooldown NPC',
      ].join('\n');
    }

    // `/trainer <id>` — Kích hoạt trận đấu trainer test (gửi message debug_trainer lên server)
    if (action === '/trainer') {
      const trainerId = parts[1];
      if (!trainerId) return 'Sử dụng: /trainer <id> (kích hoạt trận đấu trainer test)';
      this.currentBattleTrainerId = trainerId;
      const remote = ColyseusManager.getInstance().world;
      if (remote) {
        remote.send('debug_trainer', { trainerId });
      }
      return `[debug] Đã gửi yêu cầu đấu trainer test: ${trainerId}`;
    }

    // `/resetnpc [id|all]` — Xoá npcId khỏi this.defeatedTrainers và reset cooldown
    if (action === '/resetnpc') {
      const target = parts[1] || 'all';
      if (target === 'all') {
        const count = this.defeatedTrainers.size;
        this.defeatedTrainers.clear();
        this.npcCooldowns.clear();
        this.saveDefeatedTrainers();
        return `[debug] Đã reset toàn bộ NPC (${count} trainer đã đánh bại, toàn bộ cooldown đã xoá).`;
      } else {
        const removed = this.defeatedTrainers.delete(target);
        this.npcCooldowns.delete(target);
        this.saveDefeatedTrainers();
        return `[debug] Đã reset NPC '${target}' (trạng thái: ${removed ? 'đã xoá khỏi danh sách thắng' : 'chưa từng đánh bại'}, cooldown: đã xoá).`;
      }
    }

    // `/npclist` — Liệt kê tất cả NPC trên map kèm toạ độ và trạng thái (Đã đấu / Chưa đấu / Cooldown)
    if (action === '/npclist') {
      const npcs = this.collision.getNpcSpawns();
      if (!npcs || npcs.length === 0) {
        return `[debug] Bản đồ ${this.collision.mapId} không có NPC nào.`;
      }
      const now = Date.now();
      const lines = [`=== DANH SÁCH NPC TRÊN BẢN ĐỒ (${this.collision.mapId}) ===`];
      for (const npc of npcs) {
        const id = npc.npcId;
        const name = npc.name || id;
        const isTrainer = this.isTrainerNpc(npc);
        const defeatedStr = isTrainer ? (this.defeatedTrainers.has(id) ? 'Đã đấu' : 'Chưa đấu') : 'NPC thường';
        const cdUntil = this.npcCooldowns.get(id);
        const cdRemain = cdUntil && cdUntil > now ? `${Math.ceil((cdUntil - now) / 1000)}s` : 'Sẵn sàng';
        lines.push(`• [${id}] ${name} (${npc.x}, ${npc.y}) | Loại: ${isTrainer ? 'Trainer' : 'Dân làng'} | Trạng thái: ${defeatedStr} | Cooldown: ${cdRemain}`);
      }
      return lines.join('\n');
    }

    // `/cooldown <seconds>` — Điều chỉnh thời gian cooldown NPC
    if (action === '/cooldown') {
      const secStr = parts[1];
      const sec = parseFloat(secStr ?? '');
      if (isNaN(sec) || sec < 0) {
        return `Sử dụng: /cooldown <seconds> (Hiện tại: ${this.npcCooldownDuration / 1000}s)`;
      }
      this.npcCooldownDuration = Math.round(sec * 1000);
      return `[debug] Đã cập nhật thời gian cooldown tương tác NPC: ${sec}s`;
    }

    // ── Plan 45 §5.1: Công cụ moderator ──
    if (action === '/forceevolve') {
      const slot = parseInt(parts[1] ?? '', 10);
      if (!Number.isInteger(slot) || slot < 0 || slot > 5) return t('WS_HELP_FORCEEVOLVE');
      ColyseusManager.getInstance().sendModAction('forceevolve', [String(slot), parts[2] ?? '']);
      return `[debug] /forceevolve ${slot} ${parts[2] ?? ''}`;
    }
    if (action === '/reverseevolve') {
      const slot = parseInt(parts[1] ?? '', 10);
      if (!Number.isInteger(slot) || slot < 0 || slot > 5) return t('WS_HELP_REVERSEEVOLVE');
      ColyseusManager.getInstance().sendModAction('reverseevolve', [String(slot), parts[2] ?? '1', parts[3] ?? '']);
      return `[debug] /reverseevolve ${slot}`;
    }
    if (action === '/leveldown') {
      const slot = parseInt(parts[1] ?? '', 10);
      const delta = parseInt(parts[2] ?? '1', 10);
      if (!Number.isInteger(slot) || !Number.isInteger(delta)) return t('WS_HELP_LEVELDOWN');
      ColyseusManager.getInstance().sendModAction('leveldown', [String(slot), String(delta)]);
      return `[debug] /leveldown ${slot} ${delta}`;
    }
    if (action === '/levelup') {
      const slot = parseInt(parts[1] ?? '', 10);
      const delta = parseInt(parts[2] ?? '1', 10);
      if (!Number.isInteger(slot) || !Number.isInteger(delta)) return t('WS_HELP_LEVELUP');
      ColyseusManager.getInstance().sendModAction('levelup', [String(slot), String(delta)]);
      return `[debug] /levelup ${slot} ${delta}`;
    }
    if (action === '/forcefriend') {
      const slot = parseInt(parts[1] ?? '', 10);
      const value = parseInt(parts[2] ?? '160', 10);
      if (!Number.isInteger(slot) || !Number.isInteger(value)) return t('WS_HELP_FORCEFRIEND');
      ColyseusManager.getInstance().sendModAction('forcefriend', [String(slot), String(value)]);
      return `[debug] /forcefriend ${slot} ${value}`;
    }
    if (action === '/trade') {
      const slot = parseInt(parts[1] ?? '', 10);
      if (!Number.isInteger(slot) || slot < 0 || slot > 5) return t('WS_HELP_TRADE');
      // Lấy pokemonId từ party slot.
      const party = this.playerPokemonParty;
      const pkm = party[slot];
      if (!pkm) return `[debug] /trade — slot ${slot} trống.`;
      ColyseusManager.getInstance().sendTrade(pkm.id);
      return `[debug] /trade ${pkm.nickname || pkm.species_id}`;
    }
    // `/switch <slot>` — mở mini party box để chọn Pokémon hoán đổi vị trí.
    if (action === '/switch') {
      const slot = parseInt(parts[1] ?? '', 10);
      if (!Number.isInteger(slot) || slot < 0 || slot > 5) return t('WS_HELP_SWITCH');
      const src = this.playerPokemonParty[slot];
      if (!src) return `[debug] /switch — slot ${slot} trống.`;
      this.openPartySelect({
        title: t('PARTY_SELECT_SWITCH'),
        hint: t('PARTY_SELECT_HINT'),
        onSelect: async (target) => {
          if (target.id === src.id) return;
          const ok = await ColyseusManager.getInstance().swapPartySlots(src.id, target.id);
          this.chatLog?.addSystemLine(
            ok ? t('WS_SWITCH_DONE') : t('WS_SWITCH_FAIL'),
            ok ? '#7bed9f' : '#ff7675',
          );
          if (ok) void this.loadPlayerPokemon();
        },
      });
      return `[debug] /switch ${src.nickname || src.species_id} ↔ ?`;
    }

    // `/spawn` — gọi cửa sổ battle với Pokémon wild (hỗ trợ cả ngắn gọn lẫn chi tiết).
    if (action === '/spawn') {
      const args = parts.slice(1).join(' ').trim();
      const lower = args.toLowerCase();
      if (lower === 'help' || lower === '?' || lower === '-h' || lower === '--help') {
        return [
          '=== LỆNH /SPAWN (TRIỆU HỒI POKÉMON HOANG) ===',
          '• Ngắn gọn: /spawn <tên|dex> [level] [shiny]',
          '  VD: /spawn pikachu | /spawn 25 50 | /spawn mew 100 s',
          '• Chi tiết (Key=Value):',
          '  level=<1-100> | lv=<n>   (Cấp độ)',
          '  shiny=<true|false> | s   (Sắc khác / Shiny)',
          '  nature=<tên>             (adamant, timid, modest, jolly...)',
          '  gender=<m|f|none>        (Giới tính)',
          '  held=<item_id>           (Vật phẩm mang theo: light-ball, leftovers...)',
          '  iv=<0-31|max|min>        (Chỉ số IVs)',
          '  moves=<m1,m2...>         (Chiêu thức: vd moves=psychic,surf)',
          '  hp=<1..max>              (Máu ban đầu: vd hp=1 test bắt)',
          '• Ví dụ mẫu:',
          '  /spawn pikachu 50 shiny nature=timid held=light-ball',
          '  /spawn 150 lv=70 iv=31 moves=psychic,aurasphere hp=1',
        ].join('\n');
      }

      ColyseusManager.getInstance().sendDebugSpawn(args || undefined);
      return args
        ? `[debug] Đang triệu hồi: /spawn ${args}...`
        : `[debug] Đang triệu hồi Pokémon ngẫu nhiên theo bản đồ...`;
    }

    if (action === '/pokedex' || action === '/dex') {
      this.openPokedex();
      return '[UI] Đã mở Pokédex.';
    }

    if (action === '/townmap' || action === '/map') {
      if (parts[1] === 'info' || parts[1] === 'debug') {
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
      this.openTownMap();
      return '[UI] Đã mở Bản đồ vùng Essen (Town Map).';
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

    // `/tile [x] [y]` — soi 1 ô: gid 3 lớp, tile property (terrain_tag/passage),
    //   và collision flag từ server JSON. Bỏ trống → ô đang đứng (center → tile).
    //   Dùng để trả lời nhanh: "ô này có phải terrain (cỏ/nước/ledge) không?"
    if (action === '/tile') {
      const mapW = Math.round(this.mapWidth / TILE_SIZE);
      const mapH = Math.round(this.mapHeight / TILE_SIZE);

      // `/tile off` — xoá đánh dấu ô đang hiển thị trên bản đồ.
      if (parts[1]?.toLowerCase() === 'off') {
        this.clearTileMarker();
        return `${t('WS_TILE_CELL')}: ${t('WS_TILE_MARKER_CLEARED')}`;
      }

      let tx: number;
      let ty: number;
      if (parts.length >= 3) {
        tx = parseInt(parts[1], 10);
        ty = parseInt(parts[2], 10);
        if (!Number.isInteger(tx) || !Number.isInteger(ty)) return t('WS_CMD_TILE');
      } else {
        tx = Math.floor(this.player.x / TILE_SIZE);
        ty = Math.floor(this.player.y / TILE_SIZE);
      }
      if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) {
        return `${t('WS_TILE_OOB')} (${tx}, ${ty}) — ${mapW}×${mapH}`;
      }

      // Đánh dấu ô trên bản đồ (viền + nhãn toạ độ) trước khi in thông tin.
      this.markTile(tx, ty);

      const tmj = TILED_MAPS[this.currentMapId];
      const idx = ty * mapW + tx;
      const rows: string[] = [`${t('WS_TILE_CELL')}: (${tx}, ${ty}) [map ${this.currentMapId}]`];

      // 1) gid trên từng lớp + property của tile trong Tiled (nguồn terrain thật).
      const props = new Map<string, unknown>();
      const gidLines: string[] = [];
      let firstGid = 1;
      if (tmj?.tilesets?.[0]) {
        firstGid = tmj.tilesets[0].firstgid ?? 1;
        for (const layer of tmj.layers) {
          if (layer.type !== 'tilelayer' || !layer.data) continue;
          const gid = layer.data[idx] ?? 0;
          if (gid === 0) {
            gidLines.push(`    ${layer.name}: ${t('WS_TILE_EMPTY')}`);
            continue;
          }
          gidLines.push(`    ${layer.name}: gid=${gid} tile_id=${gid - firstGid}`);
          if (layer.name.toLowerCase() !== 'ground') continue; // terrain chỉ đọc ở Ground
          const tile = tmj.tilesets[0]?.tiles?.find((x) => x.id === gid - firstGid);
          for (const p of tile?.properties ?? []) props.set(p.name, p.value);
        }
      }
      rows.push(`${t('WS_TILE_LAYERS')}:`, ...(gidLines.length ? gidLines : [`    ${t('WS_TILE_EMPTY')}`]));

      const terrain = props.get('terrain_tag');
      const passage = props.get('passage');
      rows.push(
        `${t('WS_TILE_TERRAIN')}: ${
          terrain === undefined
            ? `${t('WS_TILE_TERRAIN_NONE')} (không có terrain_tag)`
            : `terrain_tag=${String(terrain)} (${describeTerrainTag(Number(terrain))})`
        }`,
        `${t('WS_TILE_PASSAGE')}: ${passage === undefined ? '—' : String(passage)}`,
      );

      // 2) Collision flag từ server JSON (client bundle — cùng logic với server).
      const flag = this.collision.getFlag(tx, ty);
      const bits: string[] = [];
      if (flag & 0x01) bits.push(t('WS_TILE_WALKABLE'));
      if (flag & 0x04) bits.push(t('WS_TILE_BLOCKED'));
      if (flag & 0x02) bits.push(t('WS_TILE_WATER'));
      if (flag & 0x08) bits.push(`** ${t('WS_TILE_GRASS')} **`);
      if (flag & 0x60) bits.push(`${t('WS_TILE_LEDGE')} 0x${(flag & 0x60).toString(16)}`);
      if (flag & 0x80) bits.push(t('WS_TILE_WARP'));
      // Bit 8-11: passage theo hướng (RMXP) — hướng bị chặn.
      const passBits: string[] = [];
      if (flag & 0x0100) passBits.push('down');
      if (flag & 0x0200) passBits.push('left');
      if (flag & 0x0400) passBits.push('right');
      if (flag & 0x0800) passBits.push('up');
      if (passBits.length) bits.push(`passage chặn: ${passBits.join(', ')}`);
      rows.push(`${t('WS_TILE_FLAG')}: 0x${flag.toString(16).padStart(4, '0')} → ${bits.join(' | ') || '—'}`);
      rows.push(`${t('WS_TILE_MARKER')}: (${tx}, ${ty})`);
      return rows.join('\n');
    }

    if (action === '/noclip') {
      const arg = parts[1]?.toLowerCase();
      const next = arg === 'on' ? true : arg === 'off' ? false : !this.noclip;
      this.setNoclip(next);
      return `${t('WS_NOCLIP_MODE')}${next ? t('WS_NOCLIP_ON') : t('WS_NOCLIP_OFF')}`;
    }

    if (action === '/clear') {
      this.debugConsole?.clearLogs();
      // Xoá luôn nội dung khung chat (không hiện dòng confirm).
      this.chatLog?.clear();
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

    // `/debug grid property <name[=value]>` — tô đậm ô theo tile property trong Tiled.
    //   /debug grid property terrain_tag=2   → tô mọi ô có terrain_tag = 2 (cỏ thật)
    //   /debug grid property ledge_dir       → tô mọi ô có ledge_dir (bất kể hướng)
    //   /debug grid property                 → tắt overlay
    // Dùng để đối chiếu vùng cỏ THẬT (spawn_zone/terrain_tag trong Tiled).
    // `spawnZones` trong constants/maps.ts chỉ là MỐC KIỂM TRA (không inject nữa).
    if (action === '/debug') {
      const sub = parts[1]?.toLowerCase();

      // `/debug terrain <num|all|none>` — tô mọi ô có `terrain_tag = num`
      //   (vd `/debug terrain 2` = cỏ thật). `all` = mọi ô có terrain_tag
      //   (bất kể giá trị). `none` hoặc bỏ trống → tắt overlay.
      if (sub === 'terrain') {
        const arg = parts[2]?.toLowerCase();
        if (arg === undefined || arg === 'none' || arg === '') {
          this.propOverlayQuery = '';
          this.setPropOverlay(false);
          return `${t('WS_TERRAIN_OVERLAY_STATE')}: ${t('WS_PROP_OVERLAY_OFF')}`;
        }
        if (arg === 'all') {
          this.propOverlayQuery = 'terrain_tag';
          this.setPropOverlay(true);
          return [
            `${t('WS_TERRAIN_OVERLAY_STATE')}: ${t('WS_PROP_OVERLAY_ON')}`,
            `${t('WS_PROP_OVERLAY_QUERY')}: terrain_tag (mọi giá trị)`,
            `${t('WS_PROP_OVERLAY_HITS')}: ${this.propOverlayHits}`,
          ].join('\n');
        }
        const num = parseInt(arg, 10);
        if (!Number.isInteger(num) || num < 0) return t('WS_CMD_TERRAIN');
        this.propOverlayQuery = `terrain_tag=${num}`;
        this.setPropOverlay(true);
        return [
          `${t('WS_TERRAIN_OVERLAY_STATE')}: ${t('WS_PROP_OVERLAY_ON')}`,
          `${t('WS_PROP_OVERLAY_QUERY')}: terrain_tag=${num} (${describeTerrainTag(num)})`,
          `${t('WS_PROP_OVERLAY_HITS')}: ${this.propOverlayHits}`,
        ].join('\n');
      }

      // `/debug is_terrain <x> <y>` — kiểm tra 1 ô có phải terrain không.
      //   Bỏ trống → ô nhân vật đang đứng. Trả về terrain_tag + tên đọc được.
      if (sub === 'is_terrain') {
        const mapW = Math.round(this.mapWidth / TILE_SIZE);
        const mapH = Math.round(this.mapHeight / TILE_SIZE);
        let tx: number;
        let ty: number;
        if (parts.length >= 4) {
          tx = parseInt(parts[2], 10);
          ty = parseInt(parts[3], 10);
          if (!Number.isInteger(tx) || !Number.isInteger(ty)) return t('WS_CMD_IS_TERRAIN');
        } else {
          tx = Math.floor(this.player.x / TILE_SIZE);
          ty = Math.floor(this.player.y / TILE_SIZE);
        }
        if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) {
          return `${t('WS_TILE_OOB')} (${tx}, ${ty}) — ${mapW}×${mapH}`;
        }
        const tag = this.getTerrainAt(tx, ty);
        const rows = [`${t('WS_TILE_CELL')}: (${tx}, ${ty}) [map ${this.currentMapId}]`];
        if (tag === undefined) {
          rows.push(`${t('WS_TILE_TERRAIN')}: ${t('WS_TILE_TERRAIN_NONE')}`);
        } else {
          rows.push(
            `${t('WS_TILE_TERRAIN')}: terrain_tag=${tag} (${describeTerrainTag(tag)})`,
          );
        }
        return rows.join('\n');
      }

      // `/debug passage <up|down|left|right|all|none>` — tô ô có `passage` chặn hướng.
      //   Dùng để kiểm hàng loạt sau khi vẽ `passage` trong Tiled.
      if (sub === 'passage') {
        const arg = parts[2]?.toLowerCase();
        if (arg === undefined || arg === 'none' || arg === '') {
          this.propOverlayQuery = '';
          this.setPropOverlay(false);
          return `${t('WS_PASSAGE_OVERLAY')}: ${t('WS_PROP_OVERLAY_OFF')}`;
        }
        const valid = ['up', 'down', 'left', 'right', 'all'];
        if (!valid.includes(arg)) return t('WS_CMD_PASSAGE');
        // Map hướng → bit passage của RMXP (bit 0-3).
        const bit: Record<string, number> = { down: 0x01, left: 0x02, right: 0x04, up: 0x08 };
        this.propOverlayQuery = arg === 'all' ? 'passage' : `passage=${bit[arg]}`;
        this.setPropOverlay(true);
        return [
          `${t('WS_PASSAGE_OVERLAY')}: ${t('WS_PROP_OVERLAY_ON')}`,
          `${t('WS_PROP_OVERLAY_QUERY')}: passage=${arg}`,
          `${t('WS_PROP_OVERLAY_HITS')}: ${this.propOverlayHits}`,
        ].join('\n');
      }

      return t('WS_CMD_DEBUG_GRID');
    }

    // `/debug off` — tắt toàn bộ overlay debug (grid/collision/warp/terrain/marker).
    if (action === '/debug' && !parts[1]) {
      this.setGridOverlay(false);
      this.setCollisionOverlay(false);
      this.setWarpOverlay(false);
      this.setPropOverlay(false);
      this.clearTileMarker();
      this.debugModal?.setToggleState('grid', false);
      this.debugModal?.setToggleState('collision', false);
      this.debugModal?.setToggleState('warp', false);
      return t('WS_DEBUG_OFF');
    }

    return `${t('WS_CMD_INVALID')}${cmd}${t('WS_CMD_HELP')}`;
  }
}
