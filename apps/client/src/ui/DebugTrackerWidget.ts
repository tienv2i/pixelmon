import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, onLangChange} from '../i18n';

export interface DebugTrackerWidgetOptions {
  onToggleNoclip?: (enabled: boolean) => void;
  onClose?: () => void;
  onResetPosition?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

/**
 * **DebugTrackerWidget** — Bảng nhỏ gọn tracking toạ độ chuột, nhân vật và nút xuyên tường (Noclip)
 * - Dạng modal KHÔNG titlebar (`showTitleBar: false`).
 * - Neo mặc định ở cạnh phải màn hình game (`defaultAlign: 'top-right'`), có thể kéo thả di chuyển tự do.
 * - Cập nhật liên tục toạ độ chuột, bản đồ, toạ độ nhân vật và camera theo thời gian thực.
 * - Có nút toggle [ 👻 Xuyên tường: TẮT / BẬT ] tiện lợi.
 */
export class DebugTrackerWidget extends UiModal {
  private unsubLang?: () => void;
  private mapText: Phaser.GameObjects.Text;
  private mouseText: Phaser.GameObjects.Text;
  private playerText: Phaser.GameObjects.Text;
  private perfText: Phaser.GameObjects.Text;
  private noclipBtnBg: Phaser.GameObjects.Graphics;
  private noclipBtnText: Phaser.GameObjects.Text;
  private noclipBtnZone: Phaser.GameObjects.Zone;

  private isNoclip = false;
  private onToggleNoclip?: (enabled: boolean) => void;

  constructor(scene: Phaser.Scene, opts: DebugTrackerWidgetOptions = {}) {
    super(scene, {
      title: t('TRACKER_TITLE'),
      width: 250,
      height: 156,
      showTitleBar: false, // Modal không titlebar theo yêu cầu
      topDragPadding: 22,
      showDragGrip: false, // Sử dụng header background riêng
      lockUi: false,
      depth: 110,
      draggable: true,
      defaultAlign: 'top-right',
      defaultOffsetX: 12,
      defaultOffsetY: 110,
      padding: 0,
      onClose: () => {
        opts.onClose?.();
      },
      onResetPosition: () => {
        opts.onResetPosition?.();
      },
    });

    this.onToggleNoclip = opts.onToggleNoclip;

    // 0. Mini Header Bar nội bộ (để kéo thả và có nút tắt)
    const headerBg = scene.add.graphics();
    headerBg.fillStyle(0x0a0c1a, 0.95);
    headerBg.fillRoundedRect(0, 0, 250, 22, { tl: 6, tr: 6, bl: 0, br: 0 });
    headerBg.lineStyle(1, 0x2e3358, 0.8);
    headerBg.lineBetween(0, 22, 250, 22);

    const headerTitle = scene.add
      .text(8, 4, '📍 TRACKING & DEBUG', {
        fontSize: '10px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: '#81ecec',
      })
      .setOrigin(0, 0);

    // Nút đóng ✕ nhỏ gọn
    const btnClose = scene.add
      .text(238, 11, '✕', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: '#9aa0c3',
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    btnClose.on('pointerover', () => btnClose.setColor('#ff7675'));
    btnClose.on('pointerout', () => btnClose.setColor('#9aa0c3'));
    btnClose.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.close();    });

    // Vùng kéo thả ở mini header
    const dragZone = scene.add
      .zone(115, 11, 210, 22)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    dragZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.isDragging = true;
      const { scale } = this.getScaleAndBounds();
      this.dragOffset = {
        x: p.x - this.currentX,
        y: p.y - this.currentY,
      };
      p.event?.stopPropagation();
    });

    // 1. Text Bản đồ
    this.mapText = scene.add
      .text(10, 28, '🗺 Map: --', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#f1c40f',
      })
      .setOrigin(0, 0);

    // 2. Text toạ độ chuột
    this.mouseText = scene.add
      .text(10, 47, t('TRK_MOUSE_INIT'), {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#81ecec',
      })
      .setOrigin(0, 0);

    // 3. Text toạ độ nhân vật
    this.playerText = scene.add
      .text(10, 66, '🚶 Player: [--, --] (0, 0)', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#ffeaa7',
      })
      .setOrigin(0, 0);

    // 4. Text Camera & FPS
    this.perfText = scene.add
      .text(10, 85, '⚡ Cam: (0, 0) | FPS: 60', {
        fontSize: '10px',
        fontFamily: FONT.mono,
        color: '#a29bfe',
      })
      .setOrigin(0, 0);

    // 5. Nút bật/tắt Xuyên tường (Noclip)
    this.noclipBtnBg = scene.add.graphics();
    this.noclipBtnText = scene.add
      .text(125, 126, t('TRK_NOCLIP_OFF'), {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#dfe6e9',
      })
      .setOrigin(0.5, 0.5);

    this.noclipBtnZone = scene.add
      .zone(125, 126, 230, 28)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    this.noclipBtnZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setNoclipState(!this.isNoclip);
      this.onToggleNoclip?.(this.isNoclip);
    });

    this.contentContainer.add([
      headerBg,
      headerTitle,
      btnClose,
      dragZone,
      this.mapText,
      this.mouseText,
      this.playerText,
      this.perfText,
      this.noclipBtnBg,
      this.noclipBtnText,
      this.noclipBtnZone,
    ]);

    this.drawNoclipBtn();
  
    // Cập nhật title khi đổi ngôn ngữ (chỉ 1 ngôn ngữ hiển thị)
    this.unsubLang = onLangChange(() => this.setTitle(t('TRACKER_TITLE')));
  }

  public setNoclipState(enabled: boolean): void {
    this.isNoclip = enabled;
    this.drawNoclipBtn();
  }

  public getNoclipState(): boolean {
    return this.isNoclip;
  }

  private drawNoclipBtn(): void {
    this.noclipBtnBg.clear();
    const w = 230;
    const h = 28;
    const x = 10;
    const y = 112;

    if (this.isNoclip) {
      // Đang bật noclip: đỏ/cam neon nổi bật cảnh báo
      this.noclipBtnBg.fillStyle(0xd63031, 0.4);
      this.noclipBtnBg.fillRoundedRect(x, y, w, h, 4);
      this.noclipBtnBg.lineStyle(1.5, 0xff7675, 1);
      this.noclipBtnBg.strokeRoundedRect(x, y, w, h, 4);
      this.noclipBtnText.setText(t('TRK_NOCLIP_ON')).setColor('#ff7675');
    } else {
      // Đang tắt: xám đậm viền nhẹ
      this.noclipBtnBg.fillStyle(0x2d3436, 0.65);
      this.noclipBtnBg.fillRoundedRect(x, y, w, h, 4);
      this.noclipBtnBg.lineStyle(1, 0x636e72, 0.8);
      this.noclipBtnBg.strokeRoundedRect(x, y, w, h, 4);
      this.noclipBtnText.setText(t('TRK_NOCLIP_OFF')).setColor('#b2bec3');
    }
  }

  /**
   * Cập nhật thông tin toạ độ chuột và nhân vật thời gian thực mỗi frame
   */
  public updateCoords(
    mouseCol: number,
    mouseRow: number,
    mouseX: number,
    mouseY: number,
    playerCol: number,
    playerRow: number,
    playerX: number,
    playerY: number,
    playerDir: string,
    isMoving: boolean,
    mapId?: string,
    fps?: number,
    camX?: number,
    camY?: number,
  ): void {
    if (!this.open || this.isMinimized) return;

    if (mapId) {
      this.mapText.setText(`🗺 Map: ${mapId}`);
    }

    this.mouseText.setText(
      `🐭 Chuột: [${mouseCol}, ${mouseRow}]  (${Math.round(mouseX)}, ${Math.round(mouseY)})`,
    );

    const stateStr = this.isNoclip ? 'NOCLIP' : isMoving ? 'WALK' : 'IDLE';
    this.playerText.setText(
      `🚶 Player: [${playerCol}, ${playerRow}]  (${Math.round(playerX)}, ${Math.round(playerY)}) ${playerDir.toUpperCase()} ${stateStr}`,
    );

    if (fps !== undefined && camX !== undefined && camY !== undefined) {
      this.perfText.setText(`⚡ Cam: (${Math.round(camX)}, ${Math.round(camY)}) | FPS: ${fps}`);
    }
  }

  public override show(): void {
    super.show();
    (this.opts as any).onVisibilityChange?.(true);
  }

  public override close(): void {
    super.close();
    (this.opts as any).onVisibilityChange?.(false);
  }

  public setStackOffsetY(y: number): void {
    this.setDefaultOffsetY(y);
  }

  destroy(): void {
    this.unsubLang?.();
    super.destroy?.();
  }
}
