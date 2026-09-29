import { Client } from 'colyseus.js';

class NetworkManager {
  private client: Client | null = null;
  private currentRoom: any = null;

  connect() {
    if (this.client) return this.client;
    this.client = new Client(`ws://${location.host}`);
    return this.client;
  }

  async joinWorld() {
    if (!this.client) this.connect();
    this.currentRoom = await this.client!.joinOrCreate('world');
    return this.currentRoom;
  }

  async joinBattle() {
    if (!this.client) this.connect();
    this.currentRoom = await this.client!.joinOrCreate('battle');
    return this.currentRoom;
  }

  leave() {
    this.currentRoom?.leave();
    this.currentRoom = null;
  }
}

export const networkManager = new NetworkManager();
