import Phaser from 'phaser';

export default class LoginScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoginScene' });
  }

  create() {
    this.add.text(100, 100, 'Login', { color: '#ffffff', fontSize: '32px' });
  }
}
