import { Room } from 'colyseus';
import type { Client, AuthContext } from 'colyseus';
import { Schema, type, MapSchema } from '@colyseus/schema';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';

export interface WorldAuth {
  userId: number;
  username: string;
}

class PlayerEntity extends Schema {
  @type('string') userId = '';
  @type('string') username = '';
  @type('number') x = 0;
  @type('number') y = 0;
}

class WorldState extends Schema {
  @type({ map: PlayerEntity }) players = new MapSchema<PlayerEntity>();
}

export class WorldRoom extends Room<WorldState> {
  static override async onAuth(
    token: string,
    _options: unknown,
    _context: AuthContext
  ): Promise<WorldAuth | boolean> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as unknown as {
        sub: number;
        username: string;
      };
      return { userId: payload.sub, username: payload.username };
    } catch {
      return false;
    }
  }

  override onCreate(_options: unknown) {
    this.autoDispose = false;
    this.state = new WorldState();
    console.log('[WorldRoom] created');
  }

  override onJoin(client: Client<WorldAuth>, _options?: unknown) {
    const player = new PlayerEntity();
    player.userId = String(client.auth?.userId ?? '');
    player.username = client.auth?.username ?? '';
    this.state.players.set(client.sessionId, player);
    console.log(`[WorldRoom] ${player.username} joined`);
  }

  override onLeave(client: Client<WorldAuth>, consented: boolean) {
    const entity = this.state.players.get(client.sessionId);
    if (!entity) return;
    if (consented) {
      this.state.players.delete(client.sessionId);
      return;
    }
    void this.allowReconnection(client, 30)
      .then(() => {
        console.log(`[WorldRoom] ${client.auth?.username} reconnected`);
      })
      .catch(() => {
        this.state.players.delete(client.sessionId);
        console.log(`[WorldRoom] ${client.auth?.username} gone for good`);
      });
  }

  override onDispose() {
    console.log('[WorldRoom] disposed');
  }
}
