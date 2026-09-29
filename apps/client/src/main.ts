import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import LoginScene from './scenes/LoginScene.js';
import WorldScene from './scenes/WorldScene.js';
import BattleScene from './scenes/BattleScene.js';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'app',
  pixelArt: true,
  backgroundColor: '#000000',
  scene: [BootScene, LoginScene, WorldScene, BattleScene],
};

new Phaser.Game(config);
