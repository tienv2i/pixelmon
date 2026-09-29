import Phaser from 'phaser';

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  create() {
    this.add.text(100, 100, 'Battle', { color: '#ffffff', fontSize: '32px' });
  }
}
