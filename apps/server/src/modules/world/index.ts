import { Room, type Client } from '@colyseus/core';
import { WorldState, PlayerState } from '@pixelmon/shared/schema';
import {
  MAPS,
  MOVE_COOLDOWN_MS,
  resolveSpawnTile,
  isGrass,
  rollEncounter,
  generatePokemon,
  parseSpawnCommand,
  formatSpawnHelp,
  NATURES,
  computeOwnedPokemonStats,
  type MoveSlot,
} from '@pixelmon/shared';
import { mapLoader, gameData, type TrainerTemplate } from '@pixelmon/shared/data';
import { pool } from '../../config/index.js';
import { createPendingBattle, createPendingPvpBattle } from '../battle/manager.js';
import {
  aliveCount,
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
import * as inventory from '../items/inventory.service.js';
import * as evolution from '../evolution/evolution.service.js';
import * as store from '../store/store.service.js';
import { logItemUsed } from '../events/eventLog.js';
import {
  resolveItemEffect,
  speciesAcceptsStone,
  canChallengePvp,
  pvpRejectMessage,
  selectPvpTeam,
  PVP_CHALLENGE_TTL_MS,
  PVP_ROOM_CREATE_TIMEOUT_MS,
  PVP_WIN_MONEY,
  type PvpRejectReason,
} from '@pixelmon/shared';

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

export interface CustomSpawnOverrides {
  shiny?: boolean;
  gender?: 'male' | 'female' | 'genderless';
  nature?: string;
  heldItem?: string;
  ivs?: number;
  moves?: string[];
  currentHp?: number;
}

/** Lời thách PvP đang chờ (Plan 47). */
interface PvpChallenge {
  /** sessionId bên thách. */
  fromSessionId: string;
  /** Tên hiển thị bên thách. */
  fromName: string;
  /** sessionId bên bị thách. */
  toSessionId: string;
  /** Tên hiển thị bên bị thách. */
  toName: string;
  /** Thời điểm hết hạn (ms) — quá hạn thì auto huỷ. */
  expiresAt: number;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = 50;
  private dirtyPlayerSessions = new Set<string>();
  private locationSyncTimer?: NodeJS.Timeout;
  /** Grid va chạm của map mà room này phụ trách — nạp 1 lần lúc `onCreate`. */
  private grid!: CollideGrid;
  private moveSessions = new Map<string, MoveSession>();
  /** Session đang trong trận wild hoặc trainer battle — chặn roll encounter trùng. */
  private inBattleSessions = new Set<string>();
  /** Lưu danh sách npcId / trainerId đã đánh bại theo session / user. */
  private defeatedTrainers = new Map<string, Set<string>>();
  /**
   * Lời thách PvP đang chờ — key = sessionId của BÊN THÁCH.
   * Giá trị lưu bên bị thách + thời điểm hết hạn (Plan 47).
   */
  private pvpChallenges = new Map<string, PvpChallenge>();
  /** Thời điểm gần nhất mỗi session gửi challenge — chống spam (PVP_CHALLENGE_COOLDOWN_MS). */
  private lastPvpChallengeAt = new Map<string, number>();
  /**
   * Payload `battle_init` chờ gửi cho BÊN FOE khi BattleRoom tạo xong (có roomId).
   * Key = sessionId của bên foe.
   */
  private pvpFoeInit = new Map<string, Record<string, unknown>>();

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
      const msg = String(data.message).trim();
      if (msg.startsWith('/trainer')) {
        const trainerId = msg.slice(8).trim();
        void this.handleDebugTrainer(client, trainerId);
        return;
      }
      if (msg.startsWith('/battle')) {
        // `/battle <tên hoặc id người chơi>` → thách đấu PvP.
        const target = msg.slice(7).trim();
        void this.handlePvpChallenge(client, { target });
        return;
      }
      this.broadcast('chat', {
        type: 'chat',
        from: player.displayName,
        message: String(data.message).slice(0, 200),
      });
    });

    // ── Debug: /spawn — gọi trận wild ngắn gọn và chi tiết (moderator+). ──
    this.onMessage('debug_spawn', (client, data: any) => {
      void this.handleDebugSpawn(client, data);
    });

    // ── Debug / NPC: Trainer battle ──
    this.onMessage('debug_trainer', (client, data: any) => {
      const trainerId = typeof data === 'string' ? data : data?.trainerId ?? data?.id ?? '';
      const npcId = typeof data === 'object' ? data?.npcId : undefined;
      void this.handleDebugTrainer(client, trainerId, npcId);
    });
    const handleTrainerBattleMsg = (client: Client, data: any) => {
      const trainerId = data?.trainerId || data?.npcId || data?.trainerName || '';
      if (trainerId) {
        void this.initiateTrainerBattle(client, String(trainerId), data?.npcId ? String(data.npcId) : undefined);
      }
    };
    this.onMessage('trainer_battle', handleTrainerBattleMsg);
    this.onMessage('start_trainer_battle', handleTrainerBattleMsg);
    this.onMessage('check_trainer_status', (client) => {
      this.sendTrainerStatus(client);
    });

    // ── Plan 45: Items / Store / Evolution / Trade / Mod ──
    this.onMessage('use_item', (client, data: { itemId?: string; pokemonId?: string }) => {
      void this.handleUseItem(client, data);
    });
    this.onMessage('hold_item', (client, data: { pokemonId?: string; itemId?: string | null }) => {
      void this.handleHoldItem(client, data);
    });
    this.onMessage('store_action', (client, data: { action?: string; itemId?: string; qty?: number }) => {
      void this.handleStoreAction(client, data);
    });
    this.onMessage('trade', (client, data: { pokemonId?: string }) => {
      void this.handleTradeNpc(client, data);
    });
    this.onMessage('mod_action', (client, data: { action?: string; args?: string[] }) => {
      void this.handleModAction(client, data);
    });

    // ── Plan 47: PvP challenge flow ──
    this.onMessage('pvp_challenge', (client, data: { target?: string; targetSessionId?: string }) => {
      void this.handlePvpChallenge(client, data);
    });
    this.onMessage('pvp_response', (client, data: { accept?: boolean }) => {
      void this.handlePvpResponse(client, Boolean(data?.accept));
    });

    // BattleRoom xong trận → gỡ chặn encounter cho session này.
    this.presence.subscribe('battle_end', (msg: { sessionId?: string }) => {
      if (msg?.sessionId) this.inBattleSessions.delete(String(msg.sessionId));
    });

    // PvP: BattleRoom đã tạo xong phòng → gửi `battle_init` (kèm roomId + foeToken)
    // cho client foe để họ join vào đúng phòng đó.
    this.presence.subscribe(
      'pvp_room_ready',
      (msg: { sessionId?: string; roomId?: string; foeToken?: string; opponentName?: string }) => {
        if (!msg?.sessionId || !msg.roomId || !msg.foeToken) return;
        const client = this.clients.find((c) => c.sessionId === msg.sessionId);
        if (!client) return;
        const payload = this.pvpFoeInit.get(msg.sessionId) ?? {};
        this.pvpFoeInit.delete(msg.sessionId);
        client.send('battle_init', {
          ...payload,
          type: 'battle_init',
          token: msg.foeToken,
          roomId: msg.roomId,
          seat: 'foe',
        });
        console.log(
          `[world] pvp battle_init → foe session=${msg.sessionId} (roomId=${msg.roomId}, token=${msg.foeToken.slice(0, 8)}…)`,
        );
      },
    );

    // BattleRoom đánh bại Trainer NPC → ghi nhận defeated và đồng bộ cho client
    this.presence.subscribe(
      'trainer_defeated',
      (msg: { sessionId?: string; npcId?: string; trainerId?: string }) => {
        if (!msg?.sessionId) return;
        const set = this.defeatedTrainers.get(msg.sessionId) ?? new Set<string>();
        if (msg.npcId) set.add(msg.npcId);
        if (msg.trainerId) set.add(msg.trainerId);
        this.defeatedTrainers.set(msg.sessionId, set);

        const player = this.state.players.get(msg.sessionId);
        if (player && player.userId) {
          const userSet = this.defeatedTrainers.get(player.userId) ?? new Set<string>();
          if (msg.npcId) userSet.add(msg.npcId);
          if (msg.trainerId) userSet.add(msg.trainerId);
          this.defeatedTrainers.set(player.userId, userSet);

          void store.getMoney(player.userId).then((m) => {
            player.money = m;
          });
        }

        const client = this.clients.find((c) => c.sessionId === msg.sessionId);
        if (client) {
          client.send('trainer_status', {
            type: 'trainer_status',
            defeated: Array.from(set),
            lastDefeated: { npcId: msg.npcId, trainerId: msg.trainerId },
          });
        }
      },
    );

    // BattleRoom tiến hoá → gửi `evolved` cho client (EvolveModal).
    this.presence.subscribe('evolved', (msg: { sessionId?: string; pokemonId?: string; from?: string; to?: string }) => {
      if (msg?.sessionId && msg.pokemonId && msg.from && msg.to) {
        const client = this.clients.find((c) => c.sessionId === msg.sessionId);
        client?.send('evolved', { type: 'evolved', pokemonId: msg.pokemonId, from: msg.from, to: msg.to });
      }
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
   * Debug `/spawn` — mở trận wild với Pokémon tuỳ biến (moderator+).
   * Hỗ trợ cú pháp ngắn gọn và chi tiết:
   *  /spawn [tên|dex] [level] [shiny] [key=value...]
   */
  private async handleDebugSpawn(
    client: Client,
    data: any,
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

    // ── Parse input ──
    const rawInput = typeof data === 'string'
      ? data
      : typeof data?.raw === 'string'
      ? data.raw
      : typeof data?.text === 'string'
      ? data.text
      : undefined;

    const parsed = parseSpawnCommand(rawInput);

    // Tương thích ngược: { dexNum: 25 }, { species: 'pikachu' }, { level: 50 }
    if (!parsed.speciesQuery && data?.dexNum) {
      parsed.dexNum = Number(data.dexNum);
      parsed.speciesQuery = String(data.dexNum);
    }
    if (!parsed.speciesQuery && data?.species) {
      parsed.speciesQuery = String(data.species);
    }
    if (parsed.level === undefined && data?.level) {
      parsed.level = Number(data.level);
    }

    // Yêu cầu trợ giúp
    if (parsed.isHelp) {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'info',
        message: formatSpawnHelp(),
      });
      return;
    }

    await gameData.load();
    let species = undefined as ReturnType<typeof gameData.getSpecies>;
    let chosenLabel = '';

    const query = parsed.speciesQuery?.trim() ?? '';
    if (query && query.toLowerCase() !== 'random') {
      species = gameData.findSpecies(parsed.dexNum ?? query);
      if (species) {
        chosenLabel = `#${species.dexNum} ${species.name}`;
      } else {
        const suggestions = gameData.suggestSpecies(query, 5);
        const suggStr = suggestions.length > 0
          ? ` Gợi ý: ${suggestions.map((s) => s.name).join(', ')}`
          : '';
        client.send('debug_msg', {
          type: 'debug_msg',
          level: 'error',
          message: `Không tìm thấy Pokémon "${query}".${suggStr}`,
        });
        return;
      }
    } else {
      // Bỏ trống / random → ưu tiên bảng encounter của map, fallback random toàn bộ.
      const table = this.grid.map.encounters ?? [];
      const entries = Array.isArray(table) ? table : [];
      if (entries.length > 0) {
        const pick = entries[Math.floor(Math.random() * entries.length)] as { species?: string };
        const id = pick?.species ?? '';
        species = gameData.getSpecies(id);
        chosenLabel = species ? `random (encounter): #${species.dexNum} ${species.name}` : 'random (encounter): bảng rỗng';
      } else {
        const r = gameData.getRandomSpecies();
        species = r;
        chosenLabel = r ? `random (global): #${r.dexNum} ${r.name}` : 'random: không có species';
      }
    }

    if (!species) {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: 'Không tìm thấy Pokémon hợp lệ để spawn.',
      });
      return;
    }

    // ── Level: nếu người dùng chỉ định thì lấy, không thì lấy từ DB player (hoặc 5) ──
    let level = parsed.level;
    if (level === undefined) {
      level = 5;
      if (player.userId) {
        try {
          const { rows } = await pool.query(`SELECT level FROM players WHERE id = $1`, [player.userId]);
          if (rows.length > 0) {
            const lv = Number(rows[0].level);
            if (Number.isInteger(lv) && lv >= 1 && lv <= 100) level = lv;
          }
        } catch {
          /* fallback level */
        }
      }
    }
    level = Math.max(1, Math.min(100, level));

    // Ô nhân vật đang đứng — dùng làm toạ độ xuất hiện của Pokémon.
    const spawnTile = pixelToTile(player.x, player.y);
    const overrides: CustomSpawnOverrides = {
      shiny: parsed.shiny,
      gender: parsed.gender,
      nature: parsed.nature,
      heldItem: parsed.heldItem,
      ivs: parsed.ivs,
      moves: parsed.moves,
      currentHp: parsed.currentHp,
    };

    await this.initiateWildBattle(client, species.id, level, spawnTile, overrides);

    const details: string[] = [`${chosenLabel} Lv.${level}`];
    if (parsed.shiny) details.push('⭐ Shiny');
    if (parsed.nature) details.push(`Nature: ${parsed.nature}`);
    if (parsed.gender) details.push(`Gender: ${parsed.gender}`);
    if (parsed.heldItem) details.push(`Held: ${parsed.heldItem}`);
    if (parsed.ivs !== undefined) details.push(`IVs: ${parsed.ivs}`);
    if (parsed.currentHp !== undefined) details.push(`HP: ${parsed.currentHp}`);
    if (parsed.moves && parsed.moves.length > 0) details.push(`Moves: [${parsed.moves.join(', ')}]`);

    client.send('debug_msg', {
      type: 'debug_msg',
      level: 'info',
      message: `[debug] /spawn → ${details.join(' | ')}`,
    });
  }

  // ── Plan 45: broadcast túi đồ cho session này ─────────────────────────────

  private broadcastBag(client: Client): void {
    const userId = this.userIdOf(client);
    if (!userId) return;
    void inventory
      // BẮT BUỘC dùng getEnrichedBag (có `name`/`pocket`) — slot thô sẽ làm
      // client crash trong BagModal.filteredItems() khi đang tìm kiếm.
      .getEnrichedBag(userId)
      .then((slots) => {
        client.send('bag_update', { type: 'bag_update', items: slots });
      })
      .catch(() => undefined);
  }

  private userIdOf(client: Client): string {
    return this.state.players.get(client.sessionId)?.userId ?? '';
  }

  // ── Plan 45 §1.5: dùng item ngoài battle ─────────────────────────────────

  private async handleUseItem(
    client: Client,
    data: { itemId?: string; pokemonId?: string } | undefined,
  ): Promise<void> {
    try {
      await this.useItem(client, data);
    } catch (err) {
      console.error('[world] use_item failed:', err);
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: 'Dùng vật phẩm thất bại (lỗi máy chủ). Vui lòng thử lại.',
      });
    }
  }

  private async useItem(
    client: Client,
    data: { itemId?: string; pokemonId?: string } | undefined,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.userId) return;
    const itemId = String(data?.itemId ?? '');
    const pokemonId = String(data?.pokemonId ?? '');
    if (!itemId) return;

    const effect = resolveItemEffect(itemId);
    if (!effect) {
      client.send('debug_msg', { type: 'debug_msg', level: 'error', message: 'Item này không thể sử dụng.' });
      return;
    }
    // Ball/buff chỉ dùng trong battle.
    if (effect.kind === 'catch_ball' || effect.kind === 'buff') {
      client.send('debug_msg', { type: 'debug_msg', level: 'error', message: 'Chỉ có thể dùng trong trận đấu.' });
      return;
    }

    // Kiểm tra sở hữu.
    if (!(await inventory.hasItem(player.userId, itemId, 1))) {
      client.send('debug_msg', { type: 'debug_msg', level: 'error', message: 'Không có item này trong túi.' });
      return;
    }

    // Pokémon mục tiêu (nếu có).
    interface TargetRow {
      id: string;
      species_id: string;
      level: number;
      current_hp: number;
      stats: Record<string, number>;
      moves: unknown;
      status: string | null;
      nickname: string | null;
      ivs: Record<string, number>;
      evs: Record<string, number>;
      nature: string | null;
      held_item: string | null;
      friendship: number;
    }
    let target: TargetRow | null = null;
    if (pokemonId) {
      const { rows } = await pool.query(
        `SELECT id, species_id, level, current_hp, stats, moves, status, nickname, ivs, evs, nature, held_item, friendship
           FROM pokemon WHERE id = $1 AND owner_id = $2`,
        [pokemonId, player.userId],
      );
      if (rows.length === 0) {
        client.send('debug_msg', { type: 'debug_msg', level: 'error', message: 'Không tìm thấy Pokémon.' });
        return;
      }
      target = rows[0] as TargetRow;
    }

    // Áp dụng effect.
    switch (effect.kind) {
      case 'heal': {
        if (!target) return this.useItemError(client, 'Cần chọn Pokémon để hồi máu.');
        const maxHp = target.stats.hp ?? 10;
        if (target.current_hp >= maxHp) return this.useItemError(client, 'HP đã đầy.');
        const healed = Math.min(maxHp, target.current_hp + effect.hp);
        await pool.query(`UPDATE pokemon SET current_hp = $2 WHERE id = $1`, [target.id, healed]);
        this.useItemSuccess(client, itemId, `Đã hồi ${healed - target.current_hp} HP cho ${target.nickname ?? target.species_id}.`);
        break;
      }
      case 'revive': {
        if (!target) return this.useItemError(client, 'Cần chọn Pokémon để hồi sinh.');
        if (target.current_hp > 0) return this.useItemError(client, 'Pokémon vẫn còn sống.');
        const maxHp = target.stats.hp ?? 10;
        const healed = Math.max(1, Math.round(maxHp * effect.pct));
        await pool.query(`UPDATE pokemon SET current_hp = $2, status = NULL WHERE id = $1`, [target.id, healed]);
        this.useItemSuccess(client, itemId, `Đã hồi sinh ${target.nickname ?? target.species_id} với ${healed} HP.`);
        break;
      }
      case 'revive_all': {
        // Sacred Ash — hồi sinh toàn bộ Pokémon ngất trong đội, đầy HP.
        const { rows } = await pool.query(
          `SELECT id, nickname, species_id FROM pokemon
             WHERE owner_id = $1 AND party_slot IS NOT NULL AND current_hp = 0`,
          [player.userId],
        );
        if (rows.length === 0) return this.useItemError(client, 'Không có Pokémon nào trong đội bị ngất.');
        // `(stats->>'hp')::int` — phải cast vì json ->> trả về text.
        await pool.query(
          `UPDATE pokemon SET current_hp = (stats->>'hp')::int, status = NULL
             WHERE owner_id = $1 AND party_slot IS NOT NULL AND current_hp = 0`,
          [player.userId],
        );
        const names = rows.map((r) => String(r.nickname ?? r.species_id)).join(', ');
        this.useItemSuccess(client, itemId, `Sacred Ash đã hồi sinh ${rows.length} Pokémon: ${names}.`);
        break;
      }
      case 'cure_status': {
        if (!target) return this.useItemError(client, 'Cần chọn Pokémon để chữa trạng thái.');
        if (!target.status) return this.useItemError(client, 'Pokémon không bị trạng thái bất thường.');
        if (!effect.status.includes(target.status)) return this.useItemError(client, 'Item này không chữa được trạng thái này.');
        await pool.query(`UPDATE pokemon SET status = NULL WHERE id = $1`, [target.id]);
        this.useItemSuccess(client, itemId, `Đã chữa ${target.status} cho ${target.nickname ?? target.species_id}.`);
        break;
      }
      case 'restore_pp': {
        if (!target) return this.useItemError(client, 'Cần chọn Pokémon để khôi phục PP.');
        const moves = Array.isArray(target.moves) ? target.moves as Array<{ id: string; currentPp?: number; maxPp?: number }> : [];
        if (moves.length === 0) return this.useItemError(client, 'Pokémon không có move nào.');
        // v1: áp vào move đầu tiên (UI sẽ mở rộng chọn move sau).
        const m = moves[0]!;
        const maxPp = m.maxPp ?? 10;
        if ((m.currentPp ?? maxPp) >= maxPp) return this.useItemError(client, 'PP đã đầy.');
        m.currentPp = Math.min(maxPp, (m.currentPp ?? 0) + effect.pp);
        await pool.query(`UPDATE pokemon SET moves = $2 WHERE id = $1`, [target.id, JSON.stringify(moves)]);
        this.useItemSuccess(client, itemId, `Đã khôi phục PP cho ${target.nickname ?? target.species_id}.`);
        break;
      }
      case 'level_up': {
        if (!target) return this.useItemError(client, 'Cần chọn Pokémon để tăng level.');
        const r = await evolution.changeLevel(player.userId, target.id, effect.levels);
        if (!r.evolved) return this.useItemError(client, 'Không thể tăng level.');
        this.useItemSuccess(client, itemId, `${target.nickname ?? target.species_id} lên Lv.${target.level + effect.levels}!`);
        // Auto-evolve sau level-up (Phase 3.2).
        await this.maybeAutoEvolve(client, target.id);
        break;
      }
      case 'exp_boost': {
        // v1: buff passive — chưa áp dụng trong battle; báo rõ.
        this.useItemSuccess(client, itemId, 'Lucky Egg: +50% EXP khi thắng trận (tự động).');
        break;
      }
      case 'evo_stone': {
        if (!target) return this.useItemError(client, 'Cần chọn Pokémon để tiến hoá.');
        const sp = gameData.getSpecies(target.species_id);
        if (!sp || !speciesAcceptsStone(sp.evolutions, effect.stoneId)) {
          return this.useItemError(client, 'Không thể dùng đá tiến hoá này ở đây.');
        }
        const r = await evolution.useStone(player.userId, target.id, effect.stoneId);
        if (!r.evolved) return this.useItemError(client, 'Không thể tiến hoá.');
        this.useItemSuccess(client, itemId, `${target.nickname ?? target.species_id} đã tiến hoá thành ${r.to}!`);
        client.send('evolved', { type: 'evolved', pokemonId: target.id, from: r.from, to: r.to });
        break;
      }
      default:
        return this.useItemError(client, 'Chưa hỗ trợ.');
    }
  }

  private useItemError(client: Client, message: string): void {
    client.send('debug_msg', { type: 'debug_msg', level: 'error', message });
  }

  private async useItemSuccess(client: Client, itemId: string, message: string): Promise<void> {
    const userId = this.userIdOf(client);
    await inventory.removeItem(userId, itemId, 1);
    void logItemUsed(userId, null, itemId, { source: 'world' });
    client.send('debug_msg', { type: 'debug_msg', level: 'info', message });
    this.broadcastBag(client);
  }

  // ── Plan 45 §1.3: cầm đồ ──────────────────────────────────────────────────

  private async handleHoldItem(
    client: Client,
    data: { pokemonId?: string; itemId?: string | null } | undefined,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.userId) return;
    const pokemonId = String(data?.pokemonId ?? '');
    const itemId = data?.itemId === undefined || data.itemId === null ? null : String(data.itemId);
    if (!pokemonId) return;

    const result = await evolution.holdItem(player.userId, pokemonId, itemId);
    if (!result.ok) {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: itemId ? 'Không thể trang bị item (không đủ số lượng hoặc lỗi dữ liệu).' : 'Không tìm thấy Pokémon.',
      });
      return;
    }

    client.send('debug_msg', {
      type: 'debug_msg',
      level: 'info',
      message: itemId
        ? (result.oldItemId ? `Đã đổi trang bị ${result.oldItemId} thành ${itemId}.` : `Đã trang bị ${itemId}.`)
        : 'Đã tháo item.',
    });
    this.broadcastBag(client);
  }

  // ── Plan 45 §2.1: Store (mua/bán) ─────────────────────────────────────────

  private async handleStoreAction(
    client: Client,
    data: { action?: string; itemId?: string; qty?: number } | undefined,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.userId) return;
    const action = String(data?.action ?? '');
    const itemId = String(data?.itemId ?? '');
    const qty = Math.max(1, Math.min(99, Number(data?.qty ?? 1) || 1));
    if (!itemId) return;

    const result =
      action === 'buy'
        ? await store.buyItem(player.userId, itemId, qty)
        : action === 'sell'
          ? await store.sellItem(player.userId, itemId, qty)
          : { ok: false as const, error: 'bad_action' };

    if (!result.ok) {
      const msg =
        result.error === 'insufficient_funds' ? 'Không đủ tiền.'
        : result.error === 'not_enough_items' ? 'Không đủ item để bán.'
        : result.error === 'not_for_sale' ? 'Item này không bán được.'
        : 'Thao tác thất bại.';
      client.send('debug_msg', { type: 'debug_msg', level: 'error', message: msg });
      return;
    }
    player.money = result.money;
    client.send('debug_msg', {
      type: 'debug_msg',
      level: 'info',
      message: action === 'buy' ? `Đã mua ${itemId} x${qty}.` : `Đã bán ${itemId} x${qty}.`,
    });
    this.broadcastBag(client);
  }

  // ── Plan 45 §4.1: Trade giả lập (NPC) ─────────────────────────────────────

  private async handleTradeNpc(
    client: Client,
    data: { pokemonId?: string } | undefined,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.userId) return;
    const pokemonId = String(data?.pokemonId ?? '');
    if (!pokemonId) return;

    // Server quyết định flag tradeWithNpc — client không gửi cờ.
    const r = await evolution.tryEvolve(player.userId, pokemonId, {
      level: 0,
      tradeWithNpc: true,
    });
    if (!r.evolved) {
      client.send('debug_msg', { type: 'debug_msg', level: 'info', message: 'Giao dịch hoàn tất — không có tiến hoá.' });
      return;
    }
    client.send('debug_msg', { type: 'debug_msg', level: 'info', message: `${r.from} đã tiến hoá thành ${r.to}!` });
    client.send('evolved', { type: 'evolved', pokemonId, from: r.from, to: r.to });
  }

  // ── Plan 45 §5.1: Moderator tools ──────────────────────────────────────────

  private async handleModAction(
    client: Client,
    data: { action?: string; args?: string[] } | undefined,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.userId) return;

    // Role check (server luôn re-check từ DB).
    let role = 'player';
    try {
      const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [player.userId]);
      if (rows.length > 0) role = String(rows[0].role ?? 'player');
    } catch { /* giữ player */ }
    if (role !== 'admin' && role !== 'moderator') {
      client.send('debug_msg', { type: 'debug_msg', level: 'error', message: 'Permission denied.' });
      return;
    }

    const action = String(data?.action ?? '');
    const args = data?.args ?? [];
    const slot = Number(args[0]);
    const pokemonId = await this.pokemonIdBySlot(player.userId, slot);
    if (!pokemonId) {
      client.send('debug_msg', { type: 'debug_msg', level: 'error', message: 'Không tìm thấy Pokémon ở slot đó.' });
      return;
    }

    let r: evolution.EvolveResult;
    switch (action) {
      case 'forceevolve':
        r = await evolution.forceEvolve(player.userId, pokemonId, args[1], player.userId);
        break;
      case 'reverseevolve':
        r = await evolution.reverseEvolve(player.userId, pokemonId, Number(args[1] ?? 1), args[2], player.userId);
        break;
      case 'leveldown':
        r = await evolution.changeLevel(player.userId, pokemonId, -Math.abs(Number(args[1] ?? 1)));
        break;
      case 'levelup':
        r = await evolution.changeLevel(player.userId, pokemonId, Math.abs(Number(args[1] ?? 1)));
        break;
      case 'forcefriend':
        await evolution.setFriendship(player.userId, pokemonId, Number(args[1] ?? 160));
        client.send('debug_msg', { type: 'debug_msg', level: 'info', message: `Đã set friendship = ${args[1] ?? 160}.` });
        return;
      default:
        client.send('debug_msg', { type: 'debug_msg', level: 'error', message: 'Lệnh không hợp lệ.' });
        return;
    }

    if (!r.evolved) {
      client.send('debug_msg', { type: 'debug_msg', level: 'error', message: `Thất bại: ${r.error}` });
      return;
    }
    client.send('debug_msg', { type: 'debug_msg', level: 'info', message: `Đã ${action} thành công.` });
    if (r.to) client.send('evolved', { type: 'evolved', pokemonId, from: r.from, to: r.to });
  }

  private async pokemonIdBySlot(userId: string, slot: number): Promise<string | null> {
    if (!Number.isInteger(slot) || slot < 0 || slot > 5) return null;
    const { rows } = await pool.query(
      `SELECT id FROM pokemon WHERE owner_id = $1 AND party_slot = $2`,
      [userId, slot],
    );
    return rows.length > 0 ? String(rows[0].id) : null;
  }

  /** Auto-evolve sau level-up (Phase 3.2) — gọi từ battle & use_item. */
  private async maybeAutoEvolve(client: Client, pokemonId: string): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.userId) return;
    const { rows } = await pool.query(
      `SELECT level, friendship, moves, held_item FROM pokemon WHERE id = $1 AND owner_id = $2`,
      [pokemonId, player.userId],
    );
    if (rows.length === 0) return;
    const row = rows[0] as { level: number; friendship: number; moves: unknown; held_item: string | null };
    const moves = Array.isArray(row.moves) ? (row.moves as Array<{ id: string }>).map((m) => m.id) : [];
    const r = await evolution.tryEvolve(player.userId, pokemonId, {
      level: Number(row.level),
      friendship: Number(row.friendship),
      knownMoves: moves,
    });
    if (r.evolved) {
      client.send('evolved', { type: 'evolved', pokemonId, from: r.from, to: r.to });
    }
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
    overrides?: CustomSpawnOverrides,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.inBattleSessions.has(client.sessionId)) return;

    const species = gameData.getSpecies(speciesId);
    if (!species) return;

    const allyTeam = await loadBattleParty(player.userId);
    if (allyTeam.length === 0 || aliveCount(allyTeam) === 0) {
      console.warn(`[world] battle skipped — user ${player.userId} has no alive pokemon`);
      return;
    }

    // Pokémon hoang: server sinh (IV/nature/moveset/level đều từ server).
    const wild = generatePokemon(species, level, gameData.getMovesForLevel.bind(gameData));

    if (overrides) {
      if (overrides.shiny !== undefined) {
        wild.shiny = overrides.shiny;
      }
      if (overrides.gender !== undefined) {
        wild.gender = overrides.gender;
      }
      if (overrides.nature) {
        const nat = NATURES.find((n) => n.name.toLowerCase() === overrides.nature?.toLowerCase());
        if (nat) wild.nature = nat;
      }
      if (typeof overrides.ivs === 'number') {
        const ivVal = Math.max(0, Math.min(31, Math.floor(overrides.ivs)));
        wild.ivs = { hp: ivVal, attack: ivVal, defense: ivVal, spAttack: ivVal, spDefense: ivVal, speed: ivVal };
      }
      if (overrides.nature !== undefined || overrides.ivs !== undefined) {
        const { maxHp, stats } = computeOwnedPokemonStats(
          species.baseStats,
          wild.ivs,
          wild.evs,
          wild.level,
          wild.nature,
        );
        wild.maxHp = maxHp;
        wild.currentHp = maxHp;
        wild.stats = stats;
      }
      if (overrides.heldItem) {
        (wild as any).heldItem = overrides.heldItem;
      }
      if (overrides.moves && overrides.moves.length > 0) {
        const customMoves: MoveSlot[] = [];
        for (const mQuery of overrides.moves) {
          const normM = mQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
          const move = gameData.getMove(mQuery) ?? gameData.getAllMoves().find((m) => m.id.toLowerCase().replace(/[^a-z0-9]/g, '') === normM || m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normM);
          if (move) {
            customMoves.push({
              id: move.id,
              name: move.name,
              type: move.type,
              category: move.category,
              power: move.power,
              accuracy: move.accuracy,
              maxPp: move.pp,
              currentPp: move.pp,
              priority: move.priority,
            });
          }
        }
        if (customMoves.length > 0) {
          wild.moves = customMoves.slice(0, 4);
        }
      }
      if (typeof overrides.currentHp === 'number') {
        wild.currentHp = Math.max(1, Math.min(wild.maxHp, Math.floor(overrides.currentHp)));
      }
    }

    const foeMember = ownedToMember(wild);
    if ((wild as any).heldItem) {
      foeMember.heldItem = (wild as any).heldItem;
    }
    const foeTeam: BattleTeamMember[] = [foeMember];

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

  /**
   * Chuẩn bị 1 trận Trainer battle: load trainer template + load allyTeam + sinh Pokémon foe + tạo token.
   * Client nhận `battle_init { token, foe, ally, isTrainer, trainerName, npcId, trainerId }`.
   */
  async initiateTrainerBattle(
    client: Client,
    trainerId: string,
    npcId?: string,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || this.inBattleSessions.has(client.sessionId)) return;

    await gameData.load();
    const trainer = gameData.getTrainer(trainerId);
    if (!trainer) {
      console.warn(`[world] initiateTrainerBattle: trainer "${trainerId}" not found`);
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: `Trainer "${trainerId}" không tồn tại.`,
      });
      return;
    }

    const allyTeam = await loadBattleParty(player.userId);
    if (allyTeam.length === 0 || aliveCount(allyTeam) === 0) {
      console.warn(`[world] trainer battle skipped — user ${player.userId} has no alive pokemon`);
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: 'Bạn không có Pokémon nào còn khả năng chiến đấu!',
      });
      return;
    }

    const foeTeam: BattleTeamMember[] = [];
    for (const p of trainer.party) {
      const species = gameData.getSpecies(p.species);
      if (!species) {
        console.warn(`[world] initiateTrainerBattle: species "${p.species}" not found`);
        continue;
      }
      const mon = generatePokemon(
        species,
        p.level,
        gameData.getMovesForLevel.bind(gameData),
        Math.random,
        trainer.name,
      );

      if (p.moves && p.moves.length > 0) {
        const customMoves: MoveSlot[] = [];
        for (const mQuery of p.moves) {
          const normM = mQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
          const move =
            gameData.getMove(mQuery) ??
            gameData
              .getAllMoves()
              .find(
                (m) =>
                  m.id.toLowerCase().replace(/[^a-z0-9]/g, '') === normM ||
                  m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normM,
              );
          if (move) {
            customMoves.push({
              id: move.id,
              name: move.name,
              type: move.type,
              category: move.category,
              power: move.power,
              accuracy: move.accuracy,
              maxPp: move.pp,
              currentPp: move.pp,
              priority: move.priority,
            });
          }
        }
        if (customMoves.length > 0) {
          mon.moves = customMoves.slice(0, 4);
        }
      }

      const member = ownedToMember(mon);
      if (p.nickname) {
        member.nickname = p.nickname;
      }
      if (p.heldItem) {
        member.heldItem = p.heldItem;
      }
      foeTeam.push(member);
    }

    if (foeTeam.length === 0) {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: `Không thể tạo đội hình cho Trainer "${trainer.name}".`,
      });
      return;
    }

    const rewardMoney = trainer.party.reduce((sum, p) => sum + p.level * 80, 200);

    const { token } = createPendingBattle({
      userId: player.userId,
      worldSessionId: client.sessionId,
      mapId: this.state.mapId,
      allyTeam: allyTeam as unknown as Record<string, unknown>[],
      foeTeam: foeTeam as unknown as Record<string, unknown>[],
      isTrainer: true,
      trainerName: trainer.name,
      rewardMoney,
      loseText: trainer.loseText,
      npcId,
      trainerId: trainer.id ?? trainerId,
    });

    this.inBattleSessions.add(client.sessionId);
    client.send('battle_init', {
      type: 'battle_init',
      token,
      foe: foeTeam[0],
      ally: allyTeam,
      mapId: this.state.mapId,
      isTrainer: true,
      trainerName: trainer.name,
      npcId,
      trainerId: trainer.id ?? trainerId,
    });
    console.log(
      `[world] battle_init (trainer) → ${player.displayName}: ${trainer.name} (${foeTeam.length} pokemon, token=${token.slice(0, 8)}…)`,
    );
  }

  private async handleDebugTrainer(
    client: Client,
    trainerId: string,
    npcId?: string,
  ): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.userId) return;

    let role = 'player';
    try {
      const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [player.userId]);
      if (rows.length > 0) role = String(rows[0].role ?? 'player');
    } catch {
      role = 'player';
    }
    if (role !== 'admin' && role !== 'moderator') {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'error',
        message: 'Permission denied: /trainer requires moderator access.',
      });
      return;
    }

    const cleanId = String(trainerId ?? '').trim();
    if (!cleanId) {
      await gameData.load();
      const samples = gameData
        .getTrainers()
        .map((t) => t.id ?? t.name)
        .slice(0, 10)
        .join(', ');
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'info',
        message: `Cách dùng: /trainer <id>. Gợi ý: ${samples}`,
      });
      return;
    }

    await this.initiateTrainerBattle(client, cleanId, npcId);
  }

  private sendTrainerStatus(client: Client): void {
    const set = this.defeatedTrainers.get(client.sessionId) ?? new Set<string>();
    client.send('trainer_status', {
      type: 'trainer_status',
      defeated: Array.from(set),
    });
  }

  // ── Plan 47: PvP challenge ───────────────────────────────────────────────

  /** Lấy level cao nhất trong party (0 nếu chưa có Pokémon). */
  private maxPartyLevel(team: { level: number }[]): number {
    return team.reduce((max, m) => Math.max(max, Number(m.level) || 0), 0);
  }

  /**
   * Xử lý `/battle <tên>` hoặc `pvp_challenge`.
   *
   * Validate bằng `canChallengePvp` (SSOT luật PvP) rồi gửi lời mời tới đối thủ
   * (`pvp_challenge_incoming`) và xác nhận cho người thách (`pvp_challenge_sent`).
   */
  private async handlePvpChallenge(
    client: Client,
    data: { target?: string; targetSessionId?: string },
  ): Promise<void> {
    const me = this.state.players.get(client.sessionId);
    if (!me || !me.userId) return;

    const targetKey = (data?.target ?? '').trim();
    const targetSessionId = data?.targetSessionId;
    if (!targetKey && !targetSessionId) {
      client.send('debug_msg', {
        type: 'debug_msg',
        level: 'info',
        message: 'Cách dùng: /battle <tên người chơi>.',
      });
      return;
    }

    // Tìm đối thủ trong CÙNG room (cùng map) — PvP chỉ trong 1 map room.
    let targetEntry: { sessionId: string; player: PlayerState } | undefined;
    this.state.players.forEach((p: PlayerState, sid: string) => {
      if (targetEntry) return;
      if (targetSessionId) {
        if (sid === targetSessionId) targetEntry = { sessionId: sid, player: p };
      } else if (
        p.displayName?.toLowerCase() === targetKey.toLowerCase() ||
        p.userId === targetKey
      ) {
        targetEntry = { sessionId: sid, player: p };
      }
    });

    if (!targetEntry) {
      client.send('pvp_result', {
        type: 'pvp_result',
        ok: false,
        reason: 'not_found',
        message: pvpRejectMessage('not_found'),
      });
      return;
    }
    const { sessionId: toSessionId, player: opponent } = targetEntry;

    // Nạp party 2 bên để validate level + số Pokémon sống.
    const [myTeam, oppTeam] = await Promise.all([
      loadBattleParty(me.userId),
      loadBattleParty(opponent.userId),
    ]);

    const mapPvpEnabled = Boolean(MAPS[this.state.mapId]?.pvp);
    const verdict = canChallengePvp(
      mapPvpEnabled,
      {
        userId: me.userId,
        level: this.maxPartyLevel(myTeam),
        inBattle: this.inBattleSessions.has(client.sessionId),
        aliveCount: aliveCount(myTeam),
        lastChallengeAt: this.lastPvpChallengeAt.get(client.sessionId) ?? 0,
      },
      {
        userId: opponent.userId,
        level: this.maxPartyLevel(oppTeam),
        inBattle: this.inBattleSessions.has(toSessionId),
        aliveCount: aliveCount(oppTeam),
      },
    );

    if (!verdict.ok) {
      this.sendPvpReject(client, verdict.reason ?? 'not_found');
      return;
    }

    // Chống nhiều lời mời chồng nhau (theo cả 2 chiều).
    if (this.pvpChallenges.has(client.sessionId) || this.findChallengeTo(toSessionId)) {
      this.sendPvpReject(client, 'already_pending');
      return;
    }

    this.lastPvpChallengeAt.set(client.sessionId, Date.now());
    const expiresAt = Date.now() + PVP_CHALLENGE_TTL_MS;
    this.pvpChallenges.set(client.sessionId, {
      fromSessionId: client.sessionId,
      fromName: me.displayName,
      toSessionId,
      toName: opponent.displayName,
      expiresAt,
    });

    // Hết hạn → auto huỷ + thông báo cả 2.
    this.clock.setTimeout(() => {
      const c = this.pvpChallenges.get(client.sessionId);
      if (!c || c.expiresAt !== expiresAt) return;
      this.pvpChallenges.delete(client.sessionId);
      this.notifyPvpCancelled(client.sessionId, toSessionId, 'expired');
    }, PVP_CHALLENGE_TTL_MS);

    const targetClient = this.clients.find((c) => c.sessionId === toSessionId);
    targetClient?.send('pvp_challenge_incoming', {
      type: 'pvp_challenge_incoming',
      fromSessionId: client.sessionId,
      fromName: me.displayName,
      expiresAt,
    });
    client.send('pvp_challenge_sent', {
      type: 'pvp_challenge_sent',
      toSessionId,
      toName: opponent.displayName,
    });
    console.log(`[world] pvp challenge: ${me.displayName} → ${opponent.displayName} (map=${this.state.mapId})`);
  }

  /** Tìm lời mời đang chờ gửi TỚI `toSessionId` (nếu có). */
  private findChallengeTo(toSessionId: string): PvpChallenge | undefined {
    for (const c of this.pvpChallenges.values()) {
      if (c.toSessionId === toSessionId) return c;
    }
    return undefined;
  }

  /** Gửi lý do từ chối thách đấu cho client. */
  private sendPvpReject(client: Client, reason: PvpRejectReason): void {
    client.send('pvp_result', {
      type: 'pvp_result',
      ok: false,
      reason,
      message: pvpRejectMessage(reason),
    });
  }

  /** Huỷ lời mời + báo cả 2 bên (hết hạn / từ chối / đối thủ rời). */
  private notifyPvpCancelled(fromSessionId: string, toSessionId: string, reason: string): void {
    const fromClient = this.clients.find((c) => c.sessionId === fromSessionId);
    const toClient = this.clients.find((c) => c.sessionId === toSessionId);
    fromClient?.send('pvp_cancelled', { type: 'pvp_cancelled', reason });
    toClient?.send('pvp_cancelled', { type: 'pvp_cancelled', reason });
  }

  /**
   * Xử lý phản hồi lời mời (`pvp_response`).
   *
   * Đồng ý → tạo pending PvP battle (2 token) + gửi `battle_init` cho bên thách.
   * Bên foe sẽ nhận `pvp_battle_ready` (kèm roomId) khi phòng được tạo để join.
   */
  private async handlePvpResponse(client: Client, accept: boolean): Promise<void> {
    const me = this.state.players.get(client.sessionId);
    if (!me) return;
    const challenge = this.findChallengeTo(client.sessionId);
    if (!challenge || challenge.expiresAt < Date.now()) {
      if (challenge) this.pvpChallenges.delete(challenge.fromSessionId);
      return;
    }
    this.pvpChallenges.delete(challenge.fromSessionId);

    if (!accept) {
      this.notifyPvpCancelled(challenge.fromSessionId, challenge.toSessionId, 'declined');
      return;
    }

    const fromClient = this.clients.find((c) => c.sessionId === challenge.fromSessionId);
    const fromPlayer = this.state.players.get(challenge.fromSessionId);
    if (!fromClient || !fromPlayer) {
      client.send('pvp_cancelled', { type: 'pvp_cancelled', reason: 'offline' });
      return;
    }

    await this.initiatePvpBattle(fromClient, fromPlayer, challenge);
  }

  /**
   * Chuẩn bị trận PvP: load 2 party → tạo 2 token → gửi `battle_init` cho bên
   * thách (tạo phòng). Bên foe được join sau qua `pvp_battle_ready`.
   */
  private async initiatePvpBattle(
    challenger: Client,
    challengerPlayer: PlayerState,
    challenge: PvpChallenge,
  ): Promise<void> {
    const opponent = this.state.players.get(challenge.toSessionId);
    const opponentClient = this.clients.find((c) => c.sessionId === challenge.toSessionId);
    if (!opponent || !opponentClient) {
      challenger.send('pvp_cancelled', { type: 'pvp_cancelled', reason: 'offline' });
      return;
    }
    if (
      this.inBattleSessions.has(challenger.sessionId) ||
      this.inBattleSessions.has(opponentClient.sessionId)
    ) {
      this.notifyPvpCancelled(challenger.sessionId, opponentClient.sessionId, 'in_battle');
      return;
    }

    const [allyTeam, foeTeam] = await Promise.all([
      loadBattleParty(challengerPlayer.userId),
      loadBattleParty(opponent.userId),
    ]);
    if (aliveCount(allyTeam) === 0 || aliveCount(foeTeam) === 0) {
      this.notifyPvpCancelled(challenger.sessionId, opponentClient.sessionId, 'no_team');
      return;
    }

    // Mỗi bên dùng tối đa PVP_TEAM_SIZE Pokémon (giữ công bằng 3v3).
    const allyPick = selectPvpTeam(allyTeam);
    const foePick = selectPvpTeam(foeTeam);

    const { allyToken, foeToken } = createPendingPvpBattle({
      mapId: this.state.mapId,
      allyTeam: allyPick as unknown as Record<string, unknown>[],
      foeTeam: foePick as unknown as Record<string, unknown>[],
      challengerUserId: challengerPlayer.userId,
      challengerWorldSessionId: challenger.sessionId,
      challengerName: challengerPlayer.displayName,
      opponentUserId: opponent.userId,
      opponentWorldSessionId: opponentClient.sessionId,
      opponentName: opponent.displayName,
    });

    this.inBattleSessions.add(challenger.sessionId);
    this.inBattleSessions.add(opponentClient.sessionId);

    // Bên thách tạo phòng BattleRoom (create) → server publish `pvp_room_ready`
    // cho foe → foe nhận `battle_init` kèm roomId rồi joinById vào cùng phòng.
    this.pvpFoeInit.set(opponentClient.sessionId, {
      isPvp: true,
      foe: allyPick[0],
      ally: foePick,
      foeName: challengerPlayer.displayName,
      allyName: opponent.displayName,
      rewardMoney: PVP_WIN_MONEY,
      mapId: this.state.mapId,
    });

    challenger.send('battle_init', {
      type: 'battle_init',
      token: allyToken,
      isPvp: true,
      foe: foePick[0],
      ally: allyPick,
      foeName: opponent.displayName,
      allyName: challengerPlayer.displayName,
      rewardMoney: PVP_WIN_MONEY,
      mapId: this.state.mapId,
    });
    console.log(
      `[world] pvp battle_init → ${challengerPlayer.displayName} vs ${opponent.displayName} (allyToken=${allyToken.slice(0, 8)}…)`,
    );

    // ── Chốt chặn an toàn ────────────────────────────────────────────────
    // Nếu challenger KHÔNG tạo được phòng (client crash / join fail) thì
    // `pvp_room_ready` không bao giờ fire → `pvpFoeInit` vẫn còn. Sau timeout
    // ta gỡ `inBattleSessions` cho cả 2, nếu không họ bị khoá vĩnh viễn khỏi
    // mọi trận đấu (chỉ gỡ khi phòng thật sự chưa được tạo).
    this.clock.setTimeout(() => {
      if (!this.pvpFoeInit.has(opponentClient.sessionId)) return;
      this.pvpFoeInit.delete(opponentClient.sessionId);
      this.inBattleSessions.delete(challenger.sessionId);
      this.inBattleSessions.delete(opponentClient.sessionId);
      this.notifyPvpCancelled(challenger.sessionId, opponentClient.sessionId, 'failed');
      console.warn(
        `[world] pvp room not created (${challenger.sessionId} vs ${opponentClient.sessionId}) — battle locks released`,
      );
    }, PVP_ROOM_CREATE_TIMEOUT_MS);
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

    // Sync số tiền hiện tại → PlayerState (Plan 45 §2.1) để HUD hiển thị realtime.
    player.money = await store.getMoney(options.userId).catch(() => 0);

    // Sync danh sách defeated trainers cho session này
    if (player.userId) {
      const userSet = this.defeatedTrainers.get(player.userId);
      if (userSet) {
        const sessionSet = this.defeatedTrainers.get(client.sessionId) ?? new Set<string>();
        for (const tid of userSet) sessionSet.add(tid);
        this.defeatedTrainers.set(client.sessionId, sessionSet);
      }
    }
    this.sendTrainerStatus(client);

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
    this.defeatedTrainers.delete(client.sessionId);
    this.lastPvpChallengeAt.delete(client.sessionId);
    this.pvpFoeInit.delete(client.sessionId);
    // Huỷ lời mời PvP liên quan tới session này (cả gửi lẫn nhận).
    const outgoing = this.pvpChallenges.get(client.sessionId);
    if (outgoing) {
      this.pvpChallenges.delete(client.sessionId);
      this.notifyPvpCancelled(client.sessionId, outgoing.toSessionId, 'offline');
    }
    const incoming = this.findChallengeTo(client.sessionId);
    if (incoming) {
      this.pvpChallenges.delete(incoming.fromSessionId);
      this.notifyPvpCancelled(incoming.fromSessionId, client.sessionId, 'offline');
    }
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
