import { Room } from 'colyseus';
import type { Client } from 'colyseus';
import type { BattleState } from '../../types/index.js';

export class BattleRoom extends Room<BattleState> {
  override onCreate(options?: any) {
    console.log('BattleRoom created', options);
  }

  override onJoin(client: Client, options?: any) {
    console.log('Client joined battle', client.sessionId, options);
  }

  override onLeave(client: Client, consented?: boolean) {
    console.log('Client left battle', client.sessionId);
  }

  override onDispose() {
    console.log('BattleRoom disposed');
  }
}
