import Phaser from 'phaser';
import TitleScene from './scenes/TitleScene.js';
import GameScene from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container',
  disableVisibilityChange: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.NO_CENTER
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }
    }
  },
  scene: [TitleScene, GameScene]
};

new Phaser.Game(config);
