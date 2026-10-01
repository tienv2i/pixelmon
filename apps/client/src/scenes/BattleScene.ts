import Phaser from 'phaser';
import { ColyseusManager } from '../network/ColyseusManager';

const MOVES = [
  { name: 'Tackle', type: 'Normal', power: 40 },
  { name: 'Ember', type: 'Fire', power: 40 },
  { name: 'Water Gun', type: 'Water', power: 40 },
  { name: 'Vine Whip', type: 'Grass', power: 45 },
];

export class BattleScene extends Phaser.Scene {
  private allyHp = 100;
  private foeHp = 100;
  private allyHpBar!: Phaser.GameObjects.Rectangle;
  private foeHpBar!: Phaser.GameObjects.Rectangle;
  private turnText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private skillButtons: Phaser.GameObjects.Text[] = [];
  private turn = 1;

  // Elements được track để relayout khi resize
  private bg?: Phaser.GameObjects.Rectangle;
  private foeSprite?: Phaser.GameObjects.Image;
  private foeLabel?: Phaser.GameObjects.Text;
  private allySprite?: Phaser.GameObjects.Image;
  private allyLabel?: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  create() {
    this.buildLayout();

    // Lắng nghe resize — rebuild layout
    this.scale.on('resize', () => this.relayout());
  }

  private buildLayout(): void {
    const { width, height } = this.scale;

    // Background
    this.bg = this.add.rectangle(0, 0, width, height, 0x2c3e50).setOrigin(0, 0);

    // Foe pokemon
    this.foeSprite = this.add.image(width * 0.7, height * 0.3, 'pokemon_foe').setScale(6);
    this.foeLabel = this.add
      .text(width * 0.7, height * 0.45, 'Wild Charmander Lv.5', {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#fff',
      })
      .setOrigin(0.5);

    // Ally pokemon
    this.allySprite = this.add.image(width * 0.3, height * 0.65, 'pokemon').setScale(6);
    this.allyLabel = this.add
      .text(width * 0.3, height * 0.8, 'Your Pikachu Lv.7', {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#fff',
      })
      .setOrigin(0.5);

    // HP bars
    this.foeHpBar = this.add
      .rectangle(width * 0.7, height * 0.2, 200, 14, 0x2ecc71)
      .setOrigin(0.5, 0.5);
    this.allyHpBar = this.add
      .rectangle(width * 0.3, height * 0.55, 200, 14, 0x2ecc71)
      .setOrigin(0.5, 0.5);

    // Turn indicator
    this.turnText = this.add
      .text(width / 2, 20, 'Turn 1 — Select a move', {
        fontSize: '18px',
        fontFamily: 'monospace',
        color: '#f1c40f',
      })
      .setOrigin(0.5);

    // Battle log
    this.logText = this.add.text(20, height - 100, 'Battle started!', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#eee',
      wordWrap: { width: width - 40 },
    });

    // Move buttons
    this.skillButtons = [];
    MOVES.forEach((move, i) => {
      const btn = this.add
        .text(
          40 + (i % 2) * (width / 2),
          height - 70 + Math.floor(i / 2) * 35,
          `${move.name} (${move.type})`,
          {
            fontSize: '14px',
            fontFamily: 'monospace',
            color: '#fff',
            backgroundColor: '#34495e',
            padding: { x: 14, y: 8 },
          },
        )
        .setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => this.useMove(i));
      this.skillButtons.push(btn);
    });

    this.updateBars();
  }

  private relayout(): void {
    // Xóa toàn bộ và build lại layout với kích thước mới
    const oldButtons = this.skillButtons;
    oldButtons.forEach((b) => b.destroy());
    this.skillButtons = [];

    // Destroy tất cả objects cũ
    [this.bg, this.foeSprite, this.foeLabel, this.allySprite, this.allyLabel, this.foeHpBar,
     this.allyHpBar, this.turnText, this.logText].forEach((o) => o?.destroy());

    this.buildLayout();

    // Khôi phục buttons state nếu đã kết thúc
    if (this.foeHp <= 0 || this.allyHp <= 0) {
      this.disableButtons();
    }
  }

  private useMove(index: number): void {
    const move = MOVES[index];
    const network = ColyseusManager.getInstance();
    network.sendBattleMove(index);

    // Apply damage locally (server will correct)
    const damage = Math.floor(move.power * (0.8 + Math.random() * 0.4));
    this.foeHp = Math.max(0, this.foeHp - damage);
    this.log(`You used ${move.name}! It dealt ${damage} damage.`);

    // Foe counterattack
    if (this.foeHp > 0) {
      const foeDmg = Math.floor(10 + Math.random() * 15);
      this.allyHp = Math.max(0, this.allyHp - foeDmg);
      this.log(`Wild Pokemon used Scratch! It dealt ${foeDmg} damage.`);
    }

    this.turn += 1;
    this.turnText.setText(`Turn ${this.turn} — Select a move`);
    this.updateBars();

    // Check end
    if (this.foeHp <= 0) {
      this.log('You won! Gained 50 EXP.');
      this.turnText.setText('Victory!');
      this.disableButtons();
      this.time.delayedCall(2000, () => this.endBattle());
    } else if (this.allyHp <= 0) {
      this.log('Your Pokemon fainted...');
      this.turnText.setText('Defeat');
      this.disableButtons();
      this.time.delayedCall(2000, () => this.endBattle());
    }
  }

  private updateBars(): void {
    const pctAlly = this.allyHp / 100;
    const pctFoe = this.foeHp / 100;
    this.allyHpBar.width = 200 * pctAlly;
    this.foeHpBar.width = 200 * pctFoe;
    this.allyHpBar.fillColor = pctAlly > 0.5 ? 0x2ecc71 : pctAlly > 0.2 ? 0xf39c12 : 0xe74c3c;
    this.foeHpBar.fillColor = pctFoe > 0.5 ? 0x2ecc71 : pctFoe > 0.2 ? 0xf39c12 : 0xe74c3c;
  }

  private log(msg: string): void {
    this.logText.setText(msg);
  }

  private disableButtons(): void {
    this.skillButtons.forEach((b) => b.disableInteractive());
  }

  private endBattle(): void {
    this.allyHp = 100;
    this.foeHp = 100;
    this.turn = 1;
    this.scene.switch('World');
    this.scene.wake();
  }
}
