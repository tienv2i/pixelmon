import { Room } from 'colyseus';
import type { Client } from 'colyseus';
import type { WorldState } from '../../types/index.js';

export class WorldRoom extends Room<WorldState> {
  override autoDispose = false;

  override onCreate() {
    console.log('WorldRoom created');
  }

  override onJoin(client: Client) {
    console.log('Client joined', client.sessionId);
  }

  override onLeave(client: Client) {
    console.log('Client left', client.sessionId);
  }

  override onDispose() {
    console.log('WorldRoom disposed');
  }
}
