import { Client, type Room } from 'colyseus.js';
import { type WorldState, type BattleState } from '@pixelmon/shared/schema';
import { t } from '../i18n';

const SERVER_URL: string = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567';
const HTTP_URL: string = SERVER_URL.replace(/^ws/, 'http');

const LS_TOKEN = 'pixelmon.token';
const LS_USER_ID = 'pixelmon.userId';
const LS_NAME = 'pixelmon.displayName';
const LS_ROLE = 'pixelmon.role';
const LS_LOCATION = 'pixelmon.location';

/** Thứ tự quyền — số càng lớn càng cao. `banned` nằm ngoài thang này. */
const ROLE_RANK: Record<string, number> = {
  player: 0,
  moderator: 1,
  admin: 2,
};

/** Quyền tối thiểu được phép mở tab Debug trong Settings. */
const DEBUG_MIN_ROLE = 'moderator';

/** Vị trí lưu của người chơi (toạ độ và bản đồ). */
export interface PlayerSavedLocation {
  mapId: string;
  x: number;
  y: number;
  direction?: string;
}

/** Sprite user được gán trong admin (từ `GET /api/auth/me`). */
export interface UserSprite {
  id: string;
  name: string;
  sheetUrl: string;
  frameW: number;
  frameH: number;
  frameCount: number;
  previewUrl128?: string;
}

export class ColyseusManager {
  private static instance: ColyseusManager;
  private client: Client;
  private worldRoom: Room<WorldState> | null = null;
  private battleRoom: Room<BattleState> | null = null;
  private authToken: string = '';
  private userId: string = '';
  private displayName: string = '';
  /** Vai trò tài khoản (`player` | `moderator` | `admin`) — quyết định quyền mở tab Debug. */
  private userRole: string = 'player';
  /** Sprite nhân vật user được gán (null = dùng sheet mặc định). */
  private sprite: UserSprite | null = null;
  /** Toạ độ và map đã lưu của người chơi. */
  public savedLocation: PlayerSavedLocation | null = null;

  private constructor() {
    this.client = new Client(SERVER_URL);
    this.restoreSession();
  }

  static getInstance(): ColyseusManager {
    if (!ColyseusManager.instance) {
      ColyseusManager.instance = new ColyseusManager();
    }
    return ColyseusManager.instance;
  }

  get world(): Room<WorldState> | null {
    return this.worldRoom;
  }

  get battle(): Room<BattleState> | null {
    return this.battleRoom;
  }

  get id(): string {
    return this.userId;
  }

  get name(): string {
    return this.displayName;
  }

  get userSprite(): UserSprite | null {
    return this.sprite;
  }

  /** Vai trò hiện tại (mặc định `player` nếu chưa xác thực). */
  get role(): string {
    return this.userRole;
  }

  /**
   * true nếu tài khoản đủ quyền dùng công cụ Debug (moderator trở lên).
   * Tài khoản `banned` không bao giờ được phép.
   */
  hasDebugAccess(): boolean {
    const rank = ROLE_RANK[this.userRole];
    const min = ROLE_RANK[DEBUG_MIN_ROLE];
    if (rank === undefined || min === undefined) return false;
    return rank >= min;
  }

  /** Đọc role + sprite từ response `/api/auth/me`. */
  setProfileFromMe(user: Record<string, unknown> | null | undefined): void {
    const role = user?.role;
    if (typeof role === 'string' && role in ROLE_RANK) {
      this.userRole = role;
      this.saveSession();
    }
    const s = user?.sprite as UserSprite | undefined;
    this.sprite = s && typeof s.sheetUrl === 'string' && s.sheetUrl ? s : null;
  }

  /** Cập nhật sprite user (gọi từ `/api/auth/me`). */
  setSpriteFromMe(user: Record<string, unknown> | null | undefined): void {
    const s = user?.sprite as UserSprite | undefined;
    this.sprite = s && typeof s.sheetUrl === 'string' && s.sheetUrl ? s : null;
  }

  /** Fetch `/api/auth/me` và lưu role + sprite + location (best-effort, không ném lỗi). */
  private async loadSprite(): Promise<void> {
    try {
      const res = await fetch(`${HTTP_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${this.authToken}` },
      });
      if (!res.ok) return;
      const me = await res.json();
      this.setProfileFromMe(me?.user);
      if (me?.player && me.player.mapId) {
        this.savedLocation = {
          mapId: me.player.mapId,
          x: Number(me.player.x),
          y: Number(me.player.y),
          direction: me.player.direction || 'down',
        };
        this.saveSession();
      }
    } catch {
      this.sprite = null;
    }
  }

  async connect(username: string, password?: string): Promise<void> {
    this.displayName = username;
    const pass = password ?? 'guest';

    try {
      // 1. Login via HTTP → lấy token + userId
      const loginRes = await fetch(`${HTTP_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass }),
      });
      if (loginRes.ok) {
        const data = await loginRes.json();
        this.authToken = data.token;
        this.userId = data.userId;
        if (data.displayName) this.displayName = data.displayName;
        // Login response đã kèm `role` → set ngay để không chờ round-trip /me.
        if (typeof data.role === 'string' && data.role in ROLE_RANK) {
          this.userRole = data.role;
        }
        if (data.player && data.player.mapId) {
          this.savedLocation = {
            mapId: data.player.mapId,
            x: Number(data.player.x),
            y: Number(data.player.y),
            direction: data.player.direction || 'down',
          };
        }
        this.saveSession();
        // Lấy sprite user được gán (best-effort — lỗi thì dùng sheet mặc định).
        // Await để WorldScene đọc được ngay sau khi connect() resolve.
        await this.loadSprite();
      } else {
        // 401 = sai thông tin → báo lỗi rõ ràng cho UI
        const err = await loginRes.json().catch(() => ({}));
        const msg =
          loginRes.status === 401
            ? t('AUTH_BAD_CREDENTIALS')
            : err.message || `${t('AUTH_SERVER_ERR')} (${loginRes.status})`;
        throw new Error(msg);
      }
    } catch (err: any) {
      // Network error (không có server) → offline guest mode
      if (
        err?.message &&
        !err.message.includes('Failed to fetch') &&
        err.message !== 'NetworkError when attempting to fetch resource.'
      ) {
        throw err; // login bị reject thật sự
      }
      console.warn('[network] offline mode — guest login failed:', err);
      this.userId = `guest_${Date.now()}`;
      this.authToken = '';
      this.clearSession();
    }

    // 2. Join world room theo map đã lưu
    await this.joinWorld(this.savedLocation?.mapId);
  }

  /**
   * Khôi phục phiên đăng nhập đã lưu trong localStorage (sau khi refresh trang).
   * Trả về `true` nếu token còn hợp lệ và đã kết nối được vào world room.
   * Trả về `false` nếu không có token, token hết hạn, hoặc server từ chối.
   */
  async resume(): Promise<boolean> {
    if (!this.authToken || !this.userId) return false;
    try {
      // Xác thực token còn hiệu lực qua /api/auth/me
      const res = await fetch(`${HTTP_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${this.authToken}` },
      });
      if (!res.ok) {
        // Token hết hạn / không hợp lệ → xoá phiên, buộc đăng nhập lại
        this.clearSession();
        return false;
      }
      // Đọc role + sprite + location ngay từ response này (không fetch thêm)
      try {
        const me = await res.json();
        this.setProfileFromMe(me?.user);
        if (me?.player && me.player.mapId) {
          this.savedLocation = {
            mapId: me.player.mapId,
            x: Number(me.player.x),
            y: Number(me.player.y),
            direction: me.player.direction || 'down',
          };
          this.saveSession();
        }
      } catch {
        /* ignore */
      }
    } catch {
      // Không gọi được server → coi như offline, vẫn cho vào game
      console.warn('[network] cannot verify token, continuing offline');
    }
    await this.joinWorld(this.savedLocation?.mapId);
    return true;
  }

  /** Cập nhật vị trí hiện tại của người chơi vào session để giữ khi logout / refresh. */
  updateLocation(mapId: string, x: number, y: number, direction?: string): void {
    this.savedLocation = {
      mapId,
      x,
      y,
      direction: direction ?? this.savedLocation?.direction ?? 'down',
    };
    this.saveSession();
  }

  /** true nếu có phiên đã lưu (chưa chắc token còn hạn). */
  hasSession(): boolean {
    return this.authToken.length > 0 && this.userId.length > 0;
  }

  private saveSession(): void {
    try {
      localStorage.setItem(LS_TOKEN, this.authToken);
      localStorage.setItem(LS_USER_ID, this.userId);
      localStorage.setItem(LS_NAME, this.displayName);
      localStorage.setItem(LS_ROLE, this.userRole);
      if (this.savedLocation) {
        localStorage.setItem(LS_LOCATION, JSON.stringify(this.savedLocation));
      }
    } catch {
      // localStorage bị chặn (private mode) — phiên không tồn tại sau refresh
    }
  }

  private restoreSession(): void {
    try {
      this.authToken = localStorage.getItem(LS_TOKEN) ?? '';
      this.userId = localStorage.getItem(LS_USER_ID) ?? '';
      this.displayName = localStorage.getItem(LS_NAME) ?? '';
      this.userRole = localStorage.getItem(LS_ROLE) ?? 'player';
      const locStr = localStorage.getItem(LS_LOCATION);
      if (locStr) {
        this.savedLocation = JSON.parse(locStr);
      }
    } catch {
      this.authToken = '';
      this.userId = '';
      this.displayName = '';
      this.userRole = 'player';
      this.savedLocation = null;
    }
  }

  private clearSession(): void {
    this.authToken = '';
    this.userId = '';
    this.displayName = '';
    this.userRole = 'player';
    this.savedLocation = null;
    try {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_USER_ID);
      localStorage.removeItem(LS_NAME);
      localStorage.removeItem(LS_ROLE);
      localStorage.removeItem(LS_LOCATION);
    } catch {
      // ignore
    }
  }

  async joinWorld(mapId?: string): Promise<void> {
    const targetMapId = mapId ?? this.savedLocation?.mapId ?? 'lappet-town';
    if (this.worldRoom) {
      this.worldRoom.leave();
    }
    try {
      this.worldRoom = await this.client.joinOrCreate<WorldState>('world', {
        userId: this.userId,
        displayName: this.displayName,
        mapId: targetMapId,
      });
      console.log('[network] joined world room', this.worldRoom.roomId, 'for map', targetMapId);
    } catch (err) {
      console.warn('[network] falling back to offline mode:', err);
      // Create a local state for offline play
      this.worldRoom = null;
    }
  }

  async joinBattle(): Promise<void> {
    if (!this.worldRoom) return;
    try {
      this.battleRoom = await this.client.create<BattleState>('battle', {
        allyPlayerId: this.userId,
        allyDisplayName: this.displayName,
        foePlayerId: 'wild',
        foeDisplayName: 'Wild Pokemon',
        isPvp: false,
        allyTeam: [],
        foeTeam: [],
      });
      console.log('[network] joined battle room');
    } catch (err) {
      console.warn('[network] battle join failed:', err);
    }
  }

  sendMove(x: number, y: number, direction: string, noclip?: boolean): void {
    this.worldRoom?.send('move', { x, y, direction, noclip });
  }

  sendTeleport(x: number, y: number, direction?: string): void {
    this.worldRoom?.send('teleport', { x, y, direction });
  }

  /**
   * Yêu cầu server chuyển map (warp). Server validate warp tại ô hiện tại rồi
   * broadcast `player_moved_map`; client rejoin room của map mới.
   */
  sendChangeMap(toMap: string, toX: number, toY: number): void {
    this.worldRoom?.send('change_map', { toMap, toX, toY });
  }

  /**
   * Đăng ký handler cho các message server→client của world room.
   * Trả về hàm huỷ đăng ký.
   */
  onWorldMessage(type: string, handler: (data: any) => void): () => void {
    if (!this.worldRoom) return () => undefined;
    this.worldRoom.onMessage(type, handler);
    return () => this.worldRoom?.onMessage(type, handler); // best-effort
  }

  /** Xoá toàn bộ handler của một message type (dùng trước khi rejoin). */
  offWorldMessage(type: string): void {
    this.worldRoom?.onMessage(type, () => undefined);
  }

  sendChat(message: string): void {
    this.worldRoom?.send('chat', { message });
  }

  sendBattleMove(moveIndex: number): void {
    this.battleRoom?.send('battle_move', { moveIndex });
  }

  disconnect(): void {
    this.worldRoom?.leave();
    this.battleRoom?.leave();
    this.worldRoom = null;
    this.battleRoom = null;
    this.clearSession();
  }
}
