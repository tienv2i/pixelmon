import { Room } from 'colyseus';
import type { Client } from 'colyseus';
import type { BattleState } from '../../types/index.js';

export class BattleRoom extends Room<BattleState> {
  override autoDispose = true;

  override onCreate() {
    console.log('BattleRoom created');
  }

  override onJoin(client: Client) {
    console.log('Client joined battle', client.sessionId);
  }

  override onLeave(client: Client) {
    console.log('Client left battle', client.sessionId);
  }

  override onDispose() {
    console.log('BattleRoom disposed');
  }
}
