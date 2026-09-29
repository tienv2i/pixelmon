import Phaser from 'phaser';

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    this.add.text(100, 100, 'World', { color: '#ffffff', fontSize: '32px' });
  }
}
