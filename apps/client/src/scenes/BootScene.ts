import Phaser from 'phaser';

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    this.load.setBaseURL('/assets');
  }

  create() {
    this.scene.start('LoginScene');
  }
}

export default BootScene;
