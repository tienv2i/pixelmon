import Phaser from 'phaser';
import { networkManager } from '../network/NetworkManager.js';

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  create() {
    this.add.text(100, 100, 'World', { color: '#ffffff', fontSize: '32px' });

    // Join world room with authentication token
    networkManager.loadToken();
    if (!localStorage.getItem('pixelmon_token')) {
      this.scene.start('LoginScene');
      return;
    }

    networkManager
      .joinWorld()
      .then((room) => {
        console.log('[World] joined room:', room.name);
        room.onLeave(() => {
          console.log('[World] left room');
        });
      })
      .catch((err) => {
        console.error('[World] join failed:', err);
        this.scene.start('LoginScene');
      });
  }
}
