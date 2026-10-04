import { Room, type Client } from '@colyseus/core';
import { WorldState, PlayerState } from '@pixelmon/shared/schema';
import {
  MAPS,
  MOVE_COOLDOWN_MS,
  resolveSpawnTile,
  isGrass,
  rollEncounter,
  generatePokemon,
} from '@pixelmon/shared';
import { mapLoader, gameData } from '@pixelmon/shared/data';
import { pool } from '../../config/index.js';
import { createPendingBattle } from '../battle/manager.js';
import {
  loadBattleParty,
  ownedToMember,
  type BattleTeamMember,
} from '../pokemon/battleParty.js';
import {
  CollideGrid,
  DEFAULT_WALK_OPTS,
  isDir,
  normalizeDir,
  pixelToTile,
  tileToPixel,
  validateStep,
} from './CollideGrid.js';

/** mapId mặc định khi không có metadata nào. */
const DEFAULT_MAP_ID = 'lappet-town';

/** Nhịp tối thiểu giữa 2 bước server-side (ms). Chặn speed-hack. */
const MIN_STEP_INTERVAL_MS = 100;

/** Lệch cho phép khi so sánh tốc độ (ms) — tránh jitter mạng nhầm lẫn. */
const STEP_TIME_SLACK_MS = 20;

interface MoveSession {
  /** Thời điểm server xử lý bước `move` gần nhất. */
  lastMoveAt: number;
  /** Bộ đếm chống spam (số message trong cửa sổ 1s). */
  windowStart: number;
  windowCount: number;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = 50;
  private dirtyPlayerSessions = new Set<string>();
  private locationSyncTimer?: NodeJS.Timeout;
  /** Grid va chạm của map mà room này phụ trách — nạp 1 lần lúc `onCreate`. */
  private grid!: CollideGrid;
  private moveSessions = new Map<string, MoveSession>();
  /** Session đang trong trận wild — chặn roll encounter trùng (Plan 44). */
  private inBattleSessions = new Set<string>();

  async onCreate(options: { mapId?: string } = {}) {
    const mapId = normalizeMapId(options.mapId);
    this.grid = await getGridFor(mapId);

    this.setState(new WorldState());
    this.state.mapId = mapId;
    // `filterBy(['mapId'])` — matchmaker sẽ tách mapId thành field riêng trên
    // room listing, nên joinOrCreate('world', { mapId }) chỉ vào đúng room map đó.
    await this.setMetadata({ mapId, name: this.grid.map.name });

    this.onMessage('move', (client, data: any) => {
      this.handleMove(client, data);
    });

    this.onMessage('teleport', (client, data: any) => {
      this.handleTeleport(client, data);
    });

    this.onMessage('change_map', (client, data: any) => {
      this.handleChangeMap(client, data);
    });

    this.onMessage('chat', (client, data: { message: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !data.message) return;
      this.broadcast('chat', {
        type: 'chat',
        from: player.displayName,
        message: String(data.message).slice(0, 200),
      });
    });

    // ── Debug: /spawn <dexNum> — gọi trận wild hoạts động (moderator+). ──
    this.onMessage('debug_spawn', (client, data: { dexNum?: number }) => {
      void this.handleDebugSpawn(client, data);
    });

    // BattleRoom xong trận → gỡ chặn encounter cho session này.
    this.presence.subscribe('battle_end', (msg: { sessionId?: string }) => {
      if (msg?.sessionId) this.inBattleSessions.delete(String(msg.sessionId));
    });

    this.setSimulationInterval((dt) => {
      // Mark players idle after timeout
      this.state.players.forEach((p: PlayerState) => {
        if (p.moving > 0) {
          p.moving -= dt / 1000;
          if (p.moving < 0) p.moving = 0;
        }
      });
    }, 500);

    // Lưu định vị người chơi định kỳ 5 giây/lần vào database
    this.locationSyncTimer = setInterval(() => {
      this.flushPlayerLocations();
    }, 5000);

    console.log(`[world] room created for map "${mapId}" (${this.grid.width}x${this.grid.height})`);
  }

  // ── 3b. move handler — validate từng ô + speed limit ────────────────────

  private handleMove(
    client: Client,
    data: { x: number; y: number; direction: string; noclip?: boolean },
  ): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Chặn gửi junk data.
    if (
      !data ||
      typeof data.x !== 'number' ||
      typeof data.y !== 'number' ||
      !isFinite(data.x) ||
      !isFinite(data.y)
    ) {
      return;
    }

    const now = Date.now();
    const session = this.getMoveSession(client.sessionId);

    // 1. Rate limit: không quá 20 message/1s.
    if (now - session.windowStart >= 1000) {
      session.windowStart = now;
      session.windowCount = 0;
    }
    session.windowCount++;
    if (session.windowCount > 20) {
      this.rejectMove(client, player, 'rate_limit');
      return;
    }

    // 2. Speed limit: nhịp giữa 2 bước phải ≥ MIN_STEP_INTERVAL_MS (bỏ qua khi noclip).
    if (!data.noclip && now - session.lastMoveAt < MIN_STEP_INTERVAL_MS - STEP_TIME_SLACK_MS) {
      this.rejectMove(client, player, 'too_fast');
      return;
    }

    // 3. mapId phải khớp room.
    if (player.mapId !== this.state.mapId) {
      this.rejectMove(client, player, 'wrong_map');
      return;
    }

    const direction = normalizeDir(data.direction, player.direction as any);
    const from = pixelToTile(player.x, player.y);
    const to = pixelToTile(data.x, data.y);

    // 4. Nếu bật noclip (đi xuyên tường): cho phép đi trong phạm vi bản đồ
    if (data.noclip) {
      const col = Math.max(0, Math.min(this.grid.width - 1, to.x));
      const row = Math.max(0, Math.min(this.grid.height - 1, to.y));
      const landed = tileToPixel(col, row);
      player.x = landed.x;
      player.y = landed.y;
      player.direction = direction;
      player.moving = 1;
      session.lastMoveAt = now;
      this.dirtyPlayerSessions.add(client.sessionId);
      return;
    }

    // 5. Validate ô đích: bước 1 ô, hoặc nhảy ledge 2 ô (đúng hướng).
    const v = validateStep(this.grid, from, to, DEFAULT_WALK_OPTS);
    if (!v.ok || !v.to) {
      // Nếu ô đích hoàn toàn hợp lệ (walkable), không đẩy người chơi về quá khứ (ví dụ vừa tắt noclip hoặc tele)
      if (this.grid.walkable(to.x, to.y, DEFAULT_WALK_OPTS)) {
        const landed = tileToPixel(to.x, to.y);
        player.x = landed.x;
        player.y = landed.y;
        player.direction = direction;
        player.moving = 1;
        session.lastMoveAt = now;
        this.dirtyPlayerSessions.add(client.sessionId);
        return;
      }
      this.rejectMove(client, player, v.reason ?? 'blocked');
      return;
    }

    // 6. Nhận — cập nhật state (snap tâm ô để client/server luôn đồng nhất).
    const landed = tileToPixel(v.to.x, v.to.y);
    player.x = landed.x;
    player.y = landed.y;
    player.direction = direction;
    player.moving = 1;
    session.lastMoveAt = now;
    this.dirtyPlayerSessions.add(client.sessionId);

    // 7. Wild encounter — ROLL Ở SERVER sau khi đã chấp nhận bước đi.
    //    (Trước đây client roll ở onTileEntered → race với move throttled.)
    void this.maybeTriggerEncounter(client, v.to.x, v.to.y);
  }

  /**
   * Roll wild encounter sau mỗi bước vào ô GRASS (Plan 44 Phase 0).
   *
   * - Server là nơi duy nhất roll → client không thể ép encounter.
   * - Xác suất = encounterRate% × 0.25 mỗi ô cỏ (≈5%/bước với rate 20,
   *   nhịp Essentials: encounter step mỗi 4 ô).
   * - Trúng → `initiateWildBattle` (chuẩn bị token + team) rồi gửi `battle_init`.
   */
  private async maybeTriggerEncounter(client: Client, col: number, row: number): Promise<void> {
    if (this.inBattleSessions.has(client.sessionId)) return; // đang trong trận

    const mapData = MAPS[this.state.mapId];
    if (!mapData || mapData.encounterRate <= 0) return;
    if (!isGrass(this.grid.map, col, row)) return;

    const chance = (mapData.encounterRate / 100) * 0.25;
    if (Math.random() >= chance) return;

    await gameData.load();
    const table = this.grid.map.encounters ?? [];
    if (table.length === 0) return; // map không có bảng spawn → không encounter

    // encounterRate đã roll ở trên → truyền 1 (luôn trúng) cho rollEncounter.
    const rolled = rollEncounter(table, {}, 1);
    if (!rolled) return;

    await this.initiateWildBattle(client, rolled.species, rolled.level, { x: col, y: row });
  }

  /**
   * Debug `/spawn <dexNum>` — mở trận wild với 1 loài Pokémon cụ thể.
   *
   * - Chỉ moderator+ (kiểm tra role từ DB mỗi lần gọi → không cache để tránh lạm dụng).
   * - `dexNum` bỏ trống / không hợp lệ → chọn ngẫu nhiên trong bảng encounter của map.
   * - Level lấy từ `players.level` (nếu có), fallback 5.
   */
  private async handleDebugSpawn(
    client: Client,
    data: { dexNum?: number } | undefined,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // ── Kiểm tra quyền (moderator trở lên) ──
    let role = 'player';
    if (player.userId) {
      try {
        const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [player.userId]);
        if (rows.length > 0) role = String(rows[0].role ?? 'player');
      } catch {
        role = 'player';
      }
    }
    if (role !== 'admin' && role !== 'moderator') {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: 'Permission denied: /spawn requires moderator access.',
      });
      return;
    }

    // ── Chọn loài Pokémon ──
    await gameData.load();
    let species = undefined as ReturnType<typeof gameData.getSpecies>;
    let chosenLabel = '';
    const dexNum = Number(data?.dexNum);

    if (Number.isInteger(dexNum) && dexNum >= 1 && dexNum <= 1025) {
      species = gameData.getSpeciesByDexNum(dexNum);
      chosenLabel = species ? `#${species.dexNum} ${species.name}` : `dex#${dexNum} (không tìm thấy)`;
    } else {
      // Bỏ trống / sai → random trong bảng encounter của map (nếu có), ngược lại random toàn bộ.
      const table = this.grid.map.encounters ?? [];
      const entries = Array.isArray(table) ? table : [];
      if (entries.length > 0) {
        const pick = entries[Math.floor(Math.random() * entries.length)] as { species?: string };
        const id = pick?.species ?? '';
        species = gameData.getSpecies(id);
        chosenLabel = species ? `random (encounter): ${species.name}` : 'random (encounter): bảng rỗng';
      } else {
        const r = gameData.getRandomSpecies();
        species = r;
        chosenLabel = r ? `random (global): ${r.name}` : 'random: không có species';
      }
    }

    if (!species) {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: `Không tìm thấy Pokémon cho dexNum=${data?.dexNum ?? '(random)'}.`,
      });
      return;
    }

    // ── Level: lấy từ DB player (nếu có), fallback 5 ──
    let level = 5;
    if (player.userId) {
      try {
        const { rows } = await pool.query(`SELECT level FROM players WHERE id = $1`, [player.userId]);
        if (rows.length > 0) {
          const lv = Number(rows[0].level);
          if (Number.isInteger(lv) && lv >= 1 && lv <= 100) level = lv;
        }
      } catch {
        /* giữ level mặc định */
      }
    }

    // Ô nhân vật đang đứng — dùng làm toạ độ xuất hiện của Pokémon.
    const spawnTile = pixelToTile(player.x, player.y);
    await this.initiateWildBattle(client, species.id, level, spawnTile);

    client.send('debug_msg', {
      type: 'debug_msg',
      level: 'info',
      message: `[debug] /spawn → ${chosenLabel} Lv.${level}`,
    });
  }

  /**
   * Chuẩn bị 1 trận wild: load party từ DB + sinh Pokémon hoang + tạo token.
   * Client nhận `battle_init { token, foe, ally }` rồi mới `create('battle', {token})`.
   */
  private async initiateWildBattle(
    client: Client,
    speciesId: string,
    level: number,
    /**
     * Ô (tile) đã kích hoạt encounter — ô cỏ khi gặp tự nhiên, ô nhân vật
     * đứng khi `/spawn`. Client dùng để hiện toạ độ Pokémon trong khung chat.
     */
    tile?: { x: number; y: number },
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.inBattleSessions.has(client.sessionId)) return;

    const species = gameData.getSpecies(speciesId);
    if (!species) return;

    const allyTeam = await loadBattleParty(player.userId);
    if (allyTeam.length === 0) {
      console.warn(`[world] battle skipped — user ${player.userId} has no party`);
      return;
    }

    // Pokémon hoang: server sinh (IV/nature/moveset/level đều từ server).
    const wild = generatePokemon(species, level, gameData.getMovesForLevel.bind(gameData));
    const foeTeam: BattleTeamMember[] = [ownedToMember(wild)];

    const { token } = createPendingBattle({
      userId: player.userId,
      worldSessionId: client.sessionId,
      mapId: this.state.mapId,
      allyTeam: allyTeam as unknown as Record<string, unknown>[],
      foeTeam: foeTeam as unknown as Record<string, unknown>[],
    });

    this.inBattleSessions.add(client.sessionId);
    client.send('battle_init', {
      type: 'battle_init',
      token,
      foe: foeTeam[0],
      ally: allyTeam,
      mapId: this.state.mapId,
      tile,
    });
    console.log(
      `[world] battle_init → ${player.displayName}: wild ${speciesId} Lv.${level} (token=${token.slice(0, 8)}…)`,
    );
  }

  /** Dịch chuyển tức thời vị trí người chơi và lưu database. */
  private async handleTeleport(
    client: Client,
    data: { x: number; y: number; direction?: string },
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (
      !data ||
      typeof data.x !== 'number' ||
      typeof data.y !== 'number' ||
      !isFinite(data.x) ||
      !isFinite(data.y)
    ) {
      return;
    }

    const tile = pixelToTile(data.x, data.y);
    // Snap về ô walkable gần nhất — client có thể gửi toạ độ lệch.
    const safe = this.grid.nearestWalkable(tile.x, tile.y, DEFAULT_WALK_OPTS);
    const col = safe?.x ?? tile.x;
    const row = safe?.y ?? tile.y;
    const landed = tileToPixel(col, row);

    player.x = landed.x;
    player.y = landed.y;
    if (data.direction) {
      player.direction = normalizeDir(data.direction, player.direction as any);
    }
    player.moving = 0;
    this.dirtyPlayerSessions.add(client.sessionId);

    if (player.username) {
      await this.savePlayerLocation(
        player.username,
        player.x,
        player.y,
        player.mapId,
        player.direction,
      );
    }
  }

  private rejectMove(client: Client, player: PlayerState, reason: string): void {
    // Trả về vị trí authoritative của server để client snap về.
    client.send('move_rejected', {
      reason,
      x: player.x,
      y: player.y,
      direction: player.direction,
    });
  }

  private getMoveSession(sessionId: string): MoveSession {
    let s = this.moveSessions.get(sessionId);
    if (!s) {
      s = { lastMoveAt: 0, windowStart: 0, windowCount: 0 };
      this.moveSessions.set(sessionId, s);
    }
    return s;
  }

  // ── 3c. change_map handler — validate warp tại ô hiện tại ───────────────

  private handleChangeMap(
    client: Client,
    data: { toMap: string; toX: number; toY: number },
  ): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!data || typeof data.toMap !== 'string') return;

    // Warp phải tồn tại tại ô player đang đứng.
    const tile = pixelToTile(player.x, player.y);
    const warp = this.grid.warpAt(tile.x, tile.y);
    if (!warp) {
      console.warn(
        `[world] change_map rejected (${player.displayName}) — no warp at (${tile.x},${tile.y})`,
      );
      return;
    }

    // Client phải báo đúng đích mà warp khai báo (chống teleport tự do).
    const targetMap = normalizeMapId(warp.toMap);
    if (data.toMap !== targetMap || data.toX !== warp.toX || data.toY !== warp.toY) {
      console.warn(
        `[world] change_map mismatch (${player.displayName}) — ` +
          `client asked ${data.toMap}(${data.toX},${data.toY}) vs warp ${targetMap}(${warp.toX},${warp.toY})`,
      );
      return;
    }

    // Nếu target map chưa load được → từ chối (không đổi map).
    void targetMap;
    this.doChangeMap(client, player, targetMap, warp.toX, warp.toY, warp.direction);
  }

  private async doChangeMap(
    client: Client,
    player: PlayerState,
    toMap: string,
    toX: number,
    toY: number,
    direction?: 'up' | 'down' | 'left' | 'right',
  ): Promise<void> {
    try {
      const target = await mapLoader.load(toMap);
      const grid = new CollideGrid(target);

      // toX/toY đã là TILE coords (từ warp object) — KHÔNG pixelToTile lần nữa.
      // resolveSpawnTile: warp override (cùng map) → MAPS spawn chung → tâm map.
      const spawnTile = resolveSpawnTile(toMap, { toX, toY });
      const safe = grid.nearestWalkable(spawnTile.x, spawnTile.y, DEFAULT_WALK_OPTS);
      const landing = safe ?? spawnTile;
      const px = tileToPixel(landing.x, landing.y);

      // Cập nhật player → mapId đổi sang map đích. Room này không còn chứa
      // player này nữa về mặt logic (client sẽ rejoin room map mới).
      player.mapId = toMap;
      player.x = px.x;
      player.y = px.y;
      if (direction) player.direction = direction;
      player.moving = 0;
      this.dirtyPlayerSessions.add(client.sessionId);

      // Lưu DB ngay (không chờ 5s flush) — tránh mất chỗ khi client rejoin.
      if (player.username) {
        await this.savePlayerLocation(
          player.username,
          player.x,
          player.y,
          player.mapId,
          player.direction,
        );
      }

      // Thông báo client để rejoin room map đích.
      client.send('player_moved_map', {
        mapId: toMap,
        x: player.x,
        y: player.y,
        direction: player.direction,
      });
      console.log(
        `[world] ${player.displayName} warp ${this.state.mapId} -> ${toMap} ` +
          `(${player.x},${player.y})`,
      );
    } catch (err) {
      console.warn('[world] change_map failed:', err);
    }
  }

  // ── 3d. onJoin — spawn từ ServerMap ─────────────────────────────────────

  async onJoin(
    client: Client,
    options: { userId: string; displayName: string; x?: number; y?: number },
  ) {
    const defaultSpawn = this.getDefaultSpawn();
    let posX = options.x ?? defaultSpawn.x;
    let posY = options.y ?? defaultSpawn.y;
    let dir = 'down';

    // Đọc toạ độ và hướng nhìn đã lưu trong database nếu có
    if (options.userId) {
      try {
        const { rows } = await pool.query(
          `SELECT x, y, map_id, direction FROM players WHERE id = $1`,
          [options.userId],
        );
        if (rows.length > 0) {
          const r = rows[0];
          if (typeof r.x === 'number' && typeof r.y === 'number' && (r.x > 0 || r.y > 0)) {
            posX = Number(r.x);
            posY = Number(r.y);
          }
          if (r.direction) dir = String(r.direction);
          // Chỉ nhận map_id trong DB nếu nó khớp room hiện tại (khác → dùng spawn).
          if (r.map_id && String(r.map_id) === this.state.mapId) {
            // giữ nguyên posX/posY
          } else if (r.map_id && String(r.map_id) !== this.state.mapId) {
            posX = defaultSpawn.x;
            posY = defaultSpawn.y;
          }
        }
      } catch (err) {
        console.warn('[world] failed to read player location from DB:', err);
      }
    }

    // Snap về tâm ô + tìm ô walkable gần nhất (không spawn trong tường).
    const startTile = pixelToTile(posX, posY);
    const safe = this.grid.nearestWalkable(startTile.x, startTile.y, DEFAULT_WALK_OPTS);
    const landed = safe ?? startTile;
    const p = tileToPixel(landed.x, landed.y);
    posX = p.x;
    posY = p.y;

    const player = new PlayerState();
    player.id = client.sessionId;
    player.userId = options.userId ?? '';
    player.username = options.userId;
    player.displayName = options.displayName ?? 'Player';
    player.x = posX;
    player.y = posY;
    player.mapId = this.state.mapId;
    player.direction = normalizeDir(dir, 'down');
    player.moving = 0;

    // Sprite nhân vật được gán trong admin (rỗng → client dùng sheet mặc định).
    // Query lỗi (offline/DB down) không được làm hỏng lúc join.
    const sprite = await this.loadSprite(options.userId);
    player.spriteUrl = sprite.url;
    player.spriteFrame = sprite.frame;
    player.spriteFrameCount = sprite.frameCount;

    this.state.players.set(client.sessionId, player);
    this.getMoveSession(client.sessionId);
    console.log(
      `[world] ${player.displayName} joined (session=${client.sessionId}, pos=(${player.x}, ${player.y}, map=${player.mapId})` +
        (sprite.url ? `, sprite=${sprite.url}` : ')'),
    );
  }

  private getDefaultSpawn(): { x: number; y: number } {
    const meta = MAPS[this.state.mapId];
    // MAPS.spawn là TILE coords → convert sang pixel (tâm ô)
    if (meta?.spawn) {
      return {
        x: meta.spawn.x * 32 + 16,
        y: meta.spawn.y * 32 + 16,
      };
    }
    // Fallback: giữa map.
    return { x: Math.floor(this.grid.width / 2) * 32 + 16, y: Math.floor(this.grid.height / 2) * 32 + 16 };
  }

  /** Tra `sheet_url` + layout của sprite user (null → dùng mặc định). */
  private async loadSprite(
    userId: string,
  ): Promise<{ url: string; frame: number; frameCount: number }> {
    const fallback = { url: '', frame: 64, frameCount: 16 };
    if (!userId) return fallback;
    try {
      const { rows } = await pool.query(
        `SELECT sc.sheet_url, sc.frame_w, sc.frame_h, sc.frame_count
           FROM users u
           JOIN sprite_catalog sc ON sc.id = u.sprite_id
          WHERE u.id = $1`,
        [userId],
      );
      const r = rows[0];
      if (!r?.sheet_url) return fallback;
      return {
        url: String(r.sheet_url),
        frame: Number(r.frame_w) || 64,
        frameCount: Number(r.frame_count) === 12 ? 12 : 16,
      };
    } catch (err) {
      console.warn('[world] sprite lookup failed:', err);
      return fallback;
    }
  }

  /** Lưu toạ độ & hướng nhìn của người chơi vào database. */
  private async savePlayerLocation(
    userId: string,
    x: number,
    y: number,
    mapId: string,
    direction: string,
  ): Promise<void> {
    if (!userId) return;
    try {
      await pool.query(
        `UPDATE players
            SET x = $1, y = $2, map_id = $3, direction = $4, updated_at = NOW()
          WHERE id = $5`,
        [x, y, mapId, direction, userId],
      );
    } catch (err) {
      console.warn('[world] failed to save player location:', err);
    }
  }

  /** Đồng bộ tất cả người chơi có thay đổi vị trí vào database. */
  private async flushPlayerLocations(): Promise<void> {
    if (this.dirtyPlayerSessions.size === 0) return;
    const sessionIds = Array.from(this.dirtyPlayerSessions);
    this.dirtyPlayerSessions.clear();

    for (const sid of sessionIds) {
      const player = this.state.players.get(sid);
      if (player && player.username) {
        await this.savePlayerLocation(
          player.username,
          player.x,
          player.y,
          player.mapId,
          player.direction,
        );
      }
    }
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      console.log(`[world] ${player.displayName} left`);
      if (player.username) {
        await this.savePlayerLocation(
          player.username,
          player.x,
          player.y,
          player.mapId,
          player.direction,
        );
      }
    }
    this.dirtyPlayerSessions.delete(client.sessionId);
    this.moveSessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  async onDispose() {
    if (this.locationSyncTimer) {
      clearInterval(this.locationSyncTimer);
    }
    await this.flushPlayerLocations();
  }
}

/** Chuẩn hoá mapId (map alias → id chính). */
function normalizeMapId(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return DEFAULT_MAP_ID;
  const meta = (MAPS as Record<string, { id?: string } | undefined>)[raw];
  return meta?.id ?? raw;
}

/** Nạp grid cho mapId (đã cache qua mapLoader). */
async function getGridFor(mapId: string): Promise<CollideGrid> {
  try {
    const map = await mapLoader.load(mapId);
    return new CollideGrid(map);
  } catch (err) {
    console.warn(`[world] failed to load map "${mapId}", falling back to default:`, err);
    const map = await mapLoader.load(DEFAULT_MAP_ID);
    return new CollideGrid(map);
  }
}
