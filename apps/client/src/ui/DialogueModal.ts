import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';

export interface DialogueOptions {
  speakerName?: string;
  avatarTexture?: string;
  avatarFrame?: string | number;
  dialogueLines: string[];
  onComplete?: () => void;
}

const MODAL_W = 480;
const MODAL_H = 150;

/**
 * DialogueModal — Hộp thoại hội thoại phong cách Pokémon Retro:
 * - Kế thừa từ UiModal, overlay mờ khóa gameplay bên dưới nhưng vẫn cho phép tương tác.
 * - Hiển thị Tên người nói, Avatar (nếu có) và chữ chạy từng ký tự (typewriter effect).
 * - Click chuột hoặc phím Space / Enter để chạy nhanh hết chữ hoặc chuyển sang câu tiếp theo.
 */
export class DialogueModal extends UiModal {
  private speakerText: Phaser.GameObjects.Text;
  private messageText: Phaser.GameObjects.Text;
  private avatarSprite?: Phaser.GameObjects.Image;
  private continuePrompt: Phaser.GameObjects.Text;
  private clickZone: Phaser.GameObjects.Zone;

  private lines: string[] = [];
  private currentLineIndex = 0;
  private fullText = '';
  private currentTyped = '';
  private typingTimer?: Phaser.Time.TimerEvent;
  private isTyping = false;
  private onCompleteCallback?: () => void;

  constructor(scene: Phaser.Scene) {
    super(scene, {
      title: 'HỘI THOẠI',
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 28,
      lockUi: true,
      lockGameOnly: true,
      depth: 220,
      showClose: true,
      showMinimize: false,
      showDock: false,
      defaultAlign: 'center',
      onClose: () => {
        if (this.typingTimer) {
          this.typingTimer.remove();
          this.typingTimer = undefined;
        }
        const cb = this.onCompleteCallback;
        this.onCompleteCallback = undefined;
        cb?.();
      },
    });

    // 1. Tên người nói
    this.speakerText = scene.add.text(16, 8, '', {
      fontFamily: FONT.ui,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#f1c40f',
    });
    this.contentContainer.add(this.speakerText);

    // 2. Nội dung hội thoại
    this.messageText = scene.add.text(16, 28, '', {
      fontFamily: FONT.ui,
      fontSize: '13px',
      color: '#ffffff',
      wordWrap: { width: MODAL_W - 32 },
      lineSpacing: 5,
    });
    this.contentContainer.add(this.messageText);

    // 3. Chỉ dẫn bấm phím để tiếp tục ▼
    this.continuePrompt = scene.add.text(MODAL_W - 24, MODAL_H - 46, '▼', {
      fontFamily: FONT.ui,
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#00cec9',
    }).setOrigin(1, 1);
    this.contentContainer.add(this.continuePrompt);

    // Hiệu ứng nhấp nháy chỉ dẫn
    scene.tweens.add({
      targets: this.continuePrompt,
      alpha: 0.2,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // 4. Click zone toàn modal để next thoại
    this.clickZone = scene.add
      .zone(MODAL_W / 2, (MODAL_H - 28) / 2, MODAL_W, MODAL_H - 28)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    this.contentContainer.add(this.clickZone);

    this.clickZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation();
      this.handleAdvance();
    });

    // Bắt phím Space / Enter khi đang mở
    scene.input.keyboard?.on('keydown-SPACE', () => {
      if (this.isOpen()) this.handleAdvance();
    });
    scene.input.keyboard?.on('keydown-ENTER', () => {
      if (this.isOpen()) this.handleAdvance();
    });

    this.close();
  }

  public startDialogue(opts: DialogueOptions): void {
    this.lines = opts.dialogueLines.length > 0 ? opts.dialogueLines : ['...'];
    this.currentLineIndex = 0;
    this.onCompleteCallback = opts.onComplete;

    this.speakerText.setText(opts.speakerName ?? 'NPC');
    this.setTitle(opts.speakerName ?? 'HỘI THOẠI');

    // Avatar nếu có
    if (opts.avatarTexture && this.scene.textures.exists(opts.avatarTexture)) {
      if (!this.avatarSprite) {
        this.avatarSprite = this.scene.add.image(MODAL_W - 48, 60, opts.avatarTexture, opts.avatarFrame);
        this.contentContainer.add(this.avatarSprite);
      } else {
        this.avatarSprite.setTexture(opts.avatarTexture, opts.avatarFrame);
        this.avatarSprite.setVisible(true);
      }
      this.messageText.setWordWrapWidth(MODAL_W - 100);
    } else {
      if (this.avatarSprite) this.avatarSprite.setVisible(false);
      this.messageText.setWordWrapWidth(MODAL_W - 32);
    }

    this.show();
    this.playLine(0);
  }

  private playLine(index: number): void {
    if (index >= this.lines.length) {
      this.finishDialogue();
      return;
    }

    this.currentLineIndex = index;
    this.fullText = this.lines[index];
    this.currentTyped = '';
    this.messageText.setText('');
    this.isTyping = true;
    this.continuePrompt.setVisible(false);

    if (this.typingTimer) {
      this.typingTimer.remove();
    }

    let charIdx = 0;
    this.typingTimer = this.scene.time.addEvent({
      delay: 24, // 24ms mỗi ký tự
      repeat: this.fullText.length - 1,
      callback: () => {
        charIdx++;
        this.currentTyped = this.fullText.substring(0, charIdx);
        this.messageText.setText(this.currentTyped);
        if (charIdx >= this.fullText.length) {
          this.isTyping = false;
          this.continuePrompt.setVisible(true);
        }
      },
    });
  }

  private handleAdvance(): void {
    if (this.isTyping) {
      // Bấm khi đang gõ chữ -> hiện toàn bộ câu ngay lập tức
      if (this.typingTimer) this.typingTimer.remove();
      this.isTyping = false;
      this.messageText.setText(this.fullText);
      this.continuePrompt.setVisible(true);
    } else {
      // Đã gõ xong -> chuyển câu tiếp theo
      this.playLine(this.currentLineIndex + 1);
    }
  }

  private finishDialogue(): void {
    if (this.typingTimer) {
      this.typingTimer.remove();
      this.typingTimer = undefined;
    }
    this.close();
    const cb = this.onCompleteCallback;
    this.onCompleteCallback = undefined;
    cb?.();
  }
}
