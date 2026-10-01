import { Room, type Client } from '@colyseus/core';
import { WorldState, PlayerState } from '@pixelmon/shared/schema';
import { MAPS } from '@pixelmon/shared';
import { pool } from '../../config/index.js';

export class WorldRoom extends Room<WorldState> {
  maxClients = 50;
  private dirtyPlayerSessions = new Set<string>();
  private locationSyncTimer?: NodeJS.Timeout;

  onCreate(options: { mapId?: string } = {}) {
    this.setState(new WorldState());
    this.state.mapId = options.mapId ?? 'pallet-town';

    this.onMessage('move', (client, data: { x: number; y: number; direction: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = data.x;
      player.y = data.y;
      player.direction = data.direction;
      player.moving = 1;
      this.dirtyPlayerSessions.add(client.sessionId);
    });

    this.onMessage('chat', (client, data: { message: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !data.message) return;
      this.broadcast('chat', {
        type: 'chat',
        from: player.displayName,
        message: data.message.slice(0, 200),
      });
    });

    this.onMessage('start_battle', (client) => {
      // Wild encounter: random chance based on map encounter rate
      const mapData = MAPS[this.state.mapId];
      if (!mapData || mapData.encounterRate <= 0) return;
      if (Math.random() * 100 > mapData.encounterRate) return;
      // Emit to matchmaker to create battle room
      this.presence.publish('battle_request', {
        requesterSessionId: client.sessionId,
        roomId: this.roomId,
        mapId: this.state.mapId,
      });
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
  }

  async onJoin(
    client: Client,
    options: { userId: string; displayName: string; x?: number; y?: number },
  ) {
    const mapData = MAPS[this.state.mapId];
    const defaultSpawn = mapData?.spawn ?? { x: 160, y: 144 };

    let posX = options.x ?? defaultSpawn.x;
    let posY = options.y ?? defaultSpawn.y;
    let mapId = this.state.mapId;
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
          if (r.map_id) mapId = String(r.map_id);
        }
      } catch (err) {
        console.warn('[world] failed to read player location from DB:', err);
      }
    }

    // Đảm bảo toạ độ không vượt quá biên map
    if (mapId === 'pallet-town' && (posX > 600 || posY > 540 || posX < 32 || posY < 32)) {
      posX = defaultSpawn.x;
      posY = defaultSpawn.y;
    }

    const player = new PlayerState();
    player.id = client.sessionId;
    player.username = options.userId;
    player.displayName = options.displayName ?? 'Player';
    player.x = posX;
    player.y = posY;
    player.mapId = mapId;
    player.direction = dir;
    player.moving = 0;

    // Sprite nhân vật được gán trong admin (rỗng → client dùng sheet mặc định).
    // Query lỗi (offline/DB down) không được làm hỏng lúc join.
    const sprite = await this.loadSprite(options.userId);
    player.spriteUrl = sprite.url;
    player.spriteFrame = sprite.frame;
    player.spriteFrameCount = sprite.frameCount;

    this.state.players.set(client.sessionId, player);
    console.log(
      `[world] ${player.displayName} joined (session=${client.sessionId}, pos=(${player.x}, ${player.y}, map=${player.mapId})` +
        (sprite.url ? `, sprite=${sprite.url}` : ')'),
    );
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
    this.state.players.delete(client.sessionId);
  }

  async onDispose() {
    if (this.locationSyncTimer) {
      clearInterval(this.locationSyncTimer);
    }
    await this.flushPlayerLocations();
  }
}
