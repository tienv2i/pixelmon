import Phaser from 'phaser';

export interface PokemonSpriteConfig {
  species: string;
  level: number;
  isFoe: boolean;
}

export class PokemonSprite extends Phaser.GameObjects.Sprite {
  private hpBar: Phaser.GameObjects.Rectangle;
  private hpValue = 100;
  private levelText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, config: PokemonSpriteConfig) {
    super(scene, x, y, config.isFoe ? 'pokemon_foe' : 'pokemon');
    scene.add.existing(this);
    this.setScale(5);

    this.levelText = scene.add
      .text(x, y + 40, `${config.species} Lv.${config.level}`, {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#fff',
      })
      .setOrigin(0.5);

    this.hpBar = scene.add.rectangle(x, y + 60, 160, 10, 0x2ecc71);
  }

  setHp(hp: number): void {
    this.hpValue = Phaser.Math.Clamp(hp, 0, 100);
    this.hpBar.width = 160 * (this.hpValue / 100);
    this.hpBar.fillColor = this.hpValue > 50 ? 0x2ecc71 : this.hpValue > 20 ? 0xf39c12 : 0xe74c3c;
  }

  playAttackAnimation(): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scaleX: this.scaleX * 1.3,
        scaleY: this.scaleY * 1.3,
        duration: 100,
        yoyo: true,
        onComplete: () => resolve(),
      });
    });
  }

  playHitAnimation(): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0.3,
        duration: 80,
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          this.setAlpha(1);
          resolve();
        },
      });
    });
  }

  setPosition(x: number, y: number): this {
    super.setPosition(x, y);
    this.levelText.setPosition(x, y + 40);
    this.hpBar.setPosition(x, y + 60);
    return this;
  }

  destroy(fromScene?: boolean): void {
    this.levelText.destroy();
    this.hpBar.destroy();
    super.destroy(fromScene);
  }
}
