import { Room } from 'colyseus';
import type { Client } from 'colyseus';
import type { WorldState } from '../../types/index.js';

export class WorldRoom extends Room<WorldState> {
  override onCreate(options?: any) {
    console.log('WorldRoom created', options);
  }

  override onJoin(client: Client, options?: any) {
    console.log('Client joined', client.sessionId, options);
  }

  override onLeave(client: Client, consented?: boolean) {
    console.log('Client left', client.sessionId);
  }

  override onDispose() {
    console.log('WorldRoom disposed');
  }
}
