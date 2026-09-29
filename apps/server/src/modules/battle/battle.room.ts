import { Room } from 'colyseus';
import type { Client, AuthContext } from 'colyseus';
import { Schema, type } from '@colyseus/schema';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';

export interface BattleAuth {
  userId: number;
  username: string;
}

class BattleState extends Schema {
  @type('string') turn = '';
}

export class BattleRoom extends Room<BattleState> {
  static override async onAuth(
    token: string,
    _options: unknown,
    _context: AuthContext
  ): Promise<BattleAuth | boolean> {
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
    this.state = new BattleState();
    console.log('[BattleRoom] created');
  }

  override onJoin(_client: Client<BattleAuth>, _options?: unknown) {
    // TODO: gán pokemon cho 2 người chơi, bắt đầu theo lượt.
  }

  override onLeave(client: Client<BattleAuth>, consented: boolean) {
    if (consented) return;
    void this.allowReconnection(client, 60)
      .then(() => {
        console.log(`[BattleRoom] ${client.auth?.username} reconnected`);
      })
      .catch(() => {
        console.log(`[BattleRoom] ${client.auth?.username} left permanently`);
      });
  }

  override onDispose() {
    console.log('[BattleRoom] disposed');
  }
}
