import { Room, type Client } from '@colyseus/core';
import { WorldState, PlayerState } from '@pixelmon/shared/schema';
import { MAPS } from '@pixelmon/shared';
import { pool } from '../../config/index.js';

export class WorldRoom extends Room<WorldState> {
  maxClients = 50;

  onCreate(options: { mapId?: string } = {}) {
    this.setState(new WorldState());
    this.state.mapId = options.mapId ?? 'route_1';

    this.onMessage('move', (client, data: { x: number; y: number; direction: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = data.x;
      player.y = data.y;
      player.direction = data.direction;
      player.moving = 1;
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
  }

  async onJoin(
    client: Client,
    options: { userId: string; displayName: string; x: number; y: number },
  ) {
    const mapData = MAPS[this.state.mapId];
    const spawn = mapData?.spawn ?? { x: 0, y: 0 };

    const player = new PlayerState();
    player.id = client.sessionId;
    player.username = options.userId;
    player.displayName = options.displayName ?? 'Player';
    player.x = options.x ?? spawn.x;
    player.y = options.y ?? spawn.y;
    player.mapId = this.state.mapId;
    player.direction = 'down';
    player.moving = 0;

    // Sprite nhân vật được gán trong admin (rỗng → client dùng sheet mặc định).
    // Query lỗi (offline/DB down) không được làm hỏng lúc join.
    const sprite = await this.loadSprite(options.userId);
    player.spriteUrl = sprite.url;
    player.spriteFrame = sprite.frame;
    player.spriteFrameCount = sprite.frameCount;

    this.state.players.set(client.sessionId, player);
    console.log(
      `[world] ${player.displayName} joined (session=${client.sessionId}` +
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

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      console.log(`[world] ${player.displayName} left`);
    }
    this.state.players.delete(client.sessionId);
  }
}
