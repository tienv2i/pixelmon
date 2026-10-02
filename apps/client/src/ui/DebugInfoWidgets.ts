import Phaser from 'phaser';
import { FONT } from './theme';
import { UiModal } from './UiModal';
import { t, type I18nKey } from '../i18n';

export interface BaseWidgetOptions {
  onClose?: () => void;
  onResetPosition?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

/**
 * Base class cho các panel thông tin debug neo cột phải (Stack Widget không titlebar).
 */
export abstract class DebugInfoWidgetBase extends UiModal {
  protected headerTitleText: Phaser.GameObjects.Text;
  protected bodyText: Phaser.GameObjects.Text;
  protected btnCloseText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    title: string,
    width: number,
    height: number,
    opts: BaseWidgetOptions = {},
  ) {
    super(scene, {
      title: '',
      width,
      height,
      showTitleBar: false,
      topDragPadding: 16,
      showDragGrip: true,
      draggable: true,
      lockUi: false,
      depth: 105,
      defaultAlign: 'top-right',
      defaultOffsetX: 12,
      defaultOffsetY: 100,
      padding: 0,
      onClose: () => {
        opts.onClose?.();
        opts.onVisibilityChange?.(false);
      },
      onResetPosition: () => {
        opts.onResetPosition?.();
      },
    });

    // Tiêu đề nhỏ nằm cạnh vạch drag grip
    this.headerTitleText = scene.add
      .text(10, 3, title, {
        fontSize: '9px',
        fontFamily: FONT.mono,
        fontStyle: 'bold',
        color: '#81ecec',
      })
      .setOrigin(0, 0);

    // Nút tắt ✕ nhỏ góc phải
    this.btnCloseText = scene.add
      .text(width - 12, 9, '✕', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: '#94a3b8',
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    this.btnCloseText.on('pointerover', () => this.btnCloseText.setColor('#ff7675'));
    this.btnCloseText.on('pointerout', () => this.btnCloseText.setColor('#94a3b8'));
    this.btnCloseText.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.close();
    });

    // Text nội dung thông tin
    this.bodyText = scene.add
      .text(10, 20, '', {
        fontSize: '10px',
        fontFamily: FONT.mono,
        color: '#e2e8f0',
        lineSpacing: 3,
      })
      .setOrigin(0, 0);

    this.contentContainer.add([this.headerTitleText, this.btnCloseText, this.bodyText]);
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
}

/**
 * 1. Widget Bản đồ (Map Widget)
 */
export class DebugMapWidget extends DebugInfoWidgetBase {
  constructor(scene: Phaser.Scene, opts: BaseWidgetOptions = {}) {
    super(scene, t('WIDGET_MAP'), 240, 88, opts);
  }

  public updateMapInfo(mapId: string, w: number, h: number, layersCount: number, tileset: string): void {
    if (!this.open || this.isMinimized) return;
    this.bodyText.setText(
      `Map: ${mapId}\n` +
      `Kích thước: ${w}×${h} (${w * 32}×${h * 32}px)\n` +
      `Layers: ${layersCount} | Tileset: ${tileset}`
    );
  }
}

/**
 * 2. Widget Nhân vật (Player Widget)
 */
export class DebugPlayerWidget extends DebugInfoWidgetBase {
  constructor(scene: Phaser.Scene, opts: BaseWidgetOptions = {}) {
    super(scene, t('WIDGET_PLAYER'), 240, 88, opts);
  }

  public updatePlayerInfo(
    col: number,
    row: number,
    x: number,
    y: number,
    dir: string,
    isMoving: boolean,
    isNoclip: boolean,
  ): void {
    if (!this.open || this.isMinimized) return;
    const stateStr = isNoclip ? 'NOCLIP' : isMoving ? 'WALK' : 'IDLE';
    this.bodyText.setText(
      `${t('WDG_COORD')}${col}, ${row}]\n` +
      `Pixel: (${Math.round(x)}, ${Math.round(y)})\n` +
      `${t('WDG_DIR')}${dir.toUpperCase()} | ${t('WDG_STATE')}${stateStr}`
    );
  }
}

/**
 * 3. Widget Toạ độ & Chuột (Coord / Mouse Widget)
 */
export class DebugCoordWidget extends DebugInfoWidgetBase {
  constructor(scene: Phaser.Scene, opts: BaseWidgetOptions = {}) {
    super(scene, t('WIDGET_COORD'), 240, 92, opts);
  }

  public updateCoordInfo(
    mouseCol: number,
    mouseRow: number,
    mouseX: number,
    mouseY: number,
    tileType?: string,
  ): void {
    if (!this.open || this.isMinimized) return;
    const typeStr = tileType ? `${t('WDG_TILE')}${tileType}` : '';
    this.bodyText.setText(
      `${t('WDG_MOUSE_TILE')}${mouseCol}, ${mouseRow}]\n` +
      `Chuột Pixel: (${Math.round(mouseX)}, ${Math.round(mouseY)})\n` +
      `${t('WDG_ACTIVE')}${typeStr}`
    );
  }
}

/**
 * 4. Widget Hiệu năng & Server (Perf / Network Widget)
 */
export class DebugPerfWidget extends DebugInfoWidgetBase {
  constructor(scene: Phaser.Scene, opts: BaseWidgetOptions = {}) {
    super(scene, t('WIDGET_PERF'), 240, 92, opts);
  }

  public updatePerfInfo(
    fps: number,
    camX: number,
    camY: number,
    zoom: number,
    serverStatus = 'Connected',
    ping = 15,
  ): void {
    if (!this.open || this.isMinimized) return;
    this.bodyText.setText(
      `FPS: ${fps} | Cam: (${Math.round(camX)}, ${Math.round(camY)})\n` +
      `Zoom: ${zoom.toFixed(1)}x\n` +
      `Server: ${serverStatus} | Ping: ${ping}ms`
    );
  }
}
