import Phaser from 'phaser';
import { FONT } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange } from '../i18n';

const MODAL_W = 380;
const MODAL_H = 260;

/**
 * **EvolveModal** — Cảnh báo tiến hóa (Plan 45 §6.2).
 * - Hiện khi nhận message `evolved` từ server.
 * - Animation: fade + scale sprite gốc → sprite mới.
 */
export class EvolveModal extends UiModal {
  private evolved: { pokemonId: string; from: string; to: string } | null = null;
  private unsubLang?: () => void;

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    super(scene, {
      title: t('EVOLVE_TITLE'),
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 34,
      showTitleBar: true,
      draggable: true,
      docked: false,
      lockUi: true,
      depth: 320,
      showClose: false,
      showMinimize: false,
      showDock: false,
      defaultAlign: 'center',
      padding: { top: 6, right: 10, bottom: 10, left: 10 },
      onClose: () => onClose?.(),
    });

    this.close();
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('EVOLVE_TITLE'));
      if (this.evolved) this.render();
    });
  }

  public override destroy(): void {
    this.unsubLang?.();
    super.destroy();
  }

  /** Hiện tiến hoá của Pokémon (from → to). */
  showEvolved(pokemonId: string, from: string, to: string): void {
    this.evolved = { pokemonId, from, to };
    this.render();
    this.show();
  }

  private render(): void {
    this.contentContainer.removeAll(true);
    if (!this.evolved) return;

    const centerX = MODAL_W / 2;

    const titleTxt = mkText(this.scene, 'EVOLVE_TITLE', {
      fontSize: '16px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#fdcb6e',
    }, centerX, 20).setOrigin(0.5);
    this.contentContainer.add(titleTxt);

    // Sprite cũ → mới
    const fromKey = `pkm_front_${this.evolved.from}`;
    const toKey = `pkm_front_${this.evolved.to}`;
    const fromImg = this.scene.add.image(centerX - 60, 100, fromKey);
    fromImg.setDisplaySize(64, 64);
    fromImg.setAlpha(0);
    this.contentContainer.add(fromImg);

    const toImg = this.scene.add.image(centerX + 60, 100, toKey);
    toImg.setDisplaySize(64, 64);
    toImg.setAlpha(0);
    this.contentContainer.add(toImg);

    // Tải ảnh nếu chưa có
    const load = (key: string, url: string, img: Phaser.GameObjects.Image) => {
      if (this.scene.textures.exists(key)) {
        img.setTexture(key);
        return;
      }
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => {
        if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, el);
        if (img.active) {
          img.setTexture(key);
          img.setDisplaySize(64, 64);
        }
      };
      el.src = url;
    };
    load(fromKey, `/assets/battlers/front/${this.evolved.from}.png`, fromImg);
    load(toKey, `/assets/battlers/front/${this.evolved.to}.png`, toImg);

    // Animation: fade in + scale
    this.scene.tweens.add({
      targets: [fromImg, toImg],
      alpha: 1,
      scale: { from: 0.5, to: 1 },
      duration: 500,
      ease: 'Back.easeOut',
    });

    const msg = t('EVOLVE_MESSAGE').replace('{from}', this.evolved.from).replace('{to}', this.evolved.to);
    const msgTxt = this.scene.add.text(centerX, 170, msg, {
      fontSize: '12px',
      fontFamily: FONT.sans,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: MODAL_W - 40 },
    }).setOrigin(0.5);
    this.contentContainer.add(msgTxt);

    const g = this.scene.add.graphics();
    g.fillStyle(0x272b49, 1);
    g.fillRoundedRect(centerX - 70, 210, 140, 28, 4);
    g.lineStyle(1, 0x00cec9, 0.9);
    g.strokeRoundedRect(centerX - 70, 210, 140, 28, 4);
    this.contentContainer.add(g);

    const okTxt = mkText(this.scene, 'EVOLVE_OK', {
      fontSize: '12px',
      fontFamily: FONT.sans,
      fontStyle: 'bold',
      color: '#00cec9',
    }, centerX, 224).setOrigin(0.5);
    okTxt.setInteractive({ useHandCursor: true });
    okTxt.on('pointerdown', () => this.close());
    this.contentContainer.add(okTxt);
  }
}