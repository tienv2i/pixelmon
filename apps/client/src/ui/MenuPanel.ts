import type Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { drawPanel } from './PanelFrame';
import type { UiZoomManager } from './UiZoomManager';

export interface MenuToggles {
  hud: boolean;
  minimap: boolean;
}

export interface MenuPanelOptions {
  onToggleHud: (v: boolean) => void;
  onToggleMinimap: (v: boolean) => void;
  onLogout: () => void;
  onClose: () => void;
  onUiZoomIn?: () => void;
  onUiZoomOut?: () => void;
}

const BASE_W = 280;
const BASE_H = 260;

/**
 * Pause menu (Esc) — overlay + panel.
 *
 * Thêm: nút UI Zoom +/-, chế độ hiển thị HUD indicator.
 */
export class MenuPanel {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private btnLogout: Phaser.GameObjects.Container;
  private btnClose: Phaser.GameObjects.Container;
  private hudCheck: Phaser.GameObjects.Text;
  private mmCheck: Phaser.GameObjects.Text;
  private uiZoomLabel: Phaser.GameObjects.Text;
  private btnZoomIn: Phaser.GameObjects.Container;
  private btnZoomOut: Phaser.GameObjects.Container;
  private opts: MenuPanelOptions;
  private toggles: MenuToggles = { hud: true, minimap: true };
  private open = false;
  private _uiZoomManager?: UiZoomManager;

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.updateZoomLabel();
    this.scene.scale.on('ui-zoom-change', () => this.updateZoomLabel());
  }

  constructor(scene: Phaser.Scene, opts: MenuPanelOptions) {
    this.scene = scene;
    this.opts = opts;

    this.overlay = scene.add
      .rectangle(0, 0, 1, 1, C.overlay, 0.75)
      .setOrigin(0, 0)
      .setDepth(200)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);

    this.panel = drawPanel(scene, 0, 0, 0, 0, 201);
    this.panel.setVisible(false);

    this.title = scene.add
      .text(0, 0, 'PAUSE MENU', ts(18, C.text, FONT.ui))
      .setOrigin(0.5, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);

    this.hint = scene.add
      .text(0, 0, 'Esc / click outside to close', ts(11, C.muted))
      .setOrigin(0.5, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);

    this.hudCheck = scene.add
      .text(0, 0, '[x] HUD', ts(13, C.text, FONT.ui))
      .setOrigin(0, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.hudCheck.on('pointerdown', () => this.toggleHud());

    this.mmCheck = scene.add
      .text(0, 0, '[x] Minimap', ts(13, C.text, FONT.ui))
      .setOrigin(0, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.mmCheck.on('pointerdown', () => this.toggleMinimap());

    this.uiZoomLabel = scene.add
      .text(0, 0, 'UI Zoom: 1.0', ts(12, C.muted))
      .setOrigin(0, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);

    this.btnZoomIn = this.makeButton(0, 0, '+', C.accent, () => this.opts.onUiZoomIn?.());
    this.btnZoomOut = this.makeButton(0, 0, '-', C.accent, () => this.opts.onUiZoomOut?.());

    this.btnLogout = this.makeButton(0, 0, 'Logout', C.err, () => this.opts.onLogout());
    this.btnClose = this.makeButton(0, 0, 'Close', C.accent, () => this.close());

    this.relayout();
    scene.scale.on('resize', () => this.relayout());
  }

  private relayout(): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    const cx = W / 2;
    const cy = H / 2;
    const px = cx - BASE_W / 2;
    const py = cy - BASE_H / 2;

    this.overlay.setSize(W, H);
    this.title.setPosition(cx, py + 24);
    this.hint.setPosition(cx, py + 46);
    this.hudCheck.setPosition(px + 30, py + 76);
    this.mmCheck.setPosition(px + 30, py + 100);
    this.uiZoomLabel.setPosition(px + 30, py + 124);
    this.btnZoomIn.setPosition(px + BASE_W - 80, py + 122);
    this.btnZoomOut.setPosition(px + BASE_W - 48, py + 122);
    this.btnLogout.setPosition(cx, py + 170);
    this.btnClose.setPosition(cx, py + 204);
  }

  private updateZoomLabel(): void {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    this.uiZoomLabel.setText(`UI Zoom: ${z.toFixed(1)}`);
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const w = label.length <= 2 ? 28 : 160;
    const h = 26;
    const g = this.scene.add.graphics();
    g.fillStyle(color, 0.2);
    g.fillRoundedRect(-w / 2, 0, w, h, 4);
    g.lineStyle(1, color, 0.9);
    g.strokeRoundedRect(-w / 2, 0, w, h, 4);

    const t = this.scene.add.text(0, h / 2, label, ts(12, C.text, FONT.ui)).setOrigin(0.5);

    const zone = this.scene.add
      .zone(-w / 2, 0, w, h)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', onClick);
    zone.on('pointerover', () => g.setAlpha(0.8));
    zone.on('pointerout', () => g.setAlpha(1));

    return this.scene.add
      .container(x, y, [g, t, zone])
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
  }

  private toggleHud(): void {
    this.toggles.hud = !this.toggles.hud;
    this.hudCheck.setText(`[${this.toggles.hud ? 'x' : ' '}] HUD`);
    this.opts.onToggleHud(this.toggles.hud);
  }

  private toggleMinimap(): void {
    this.toggles.minimap = !this.toggles.minimap;
    this.mmCheck.setText(`[${this.toggles.minimap ? 'x' : ' '}] Minimap`);
    this.opts.onToggleMinimap(this.toggles.minimap);
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.updateZoomLabel();
    [this.overlay, this.panel, this.title, this.hint, this.hudCheck, this.mmCheck,
      this.uiZoomLabel].forEach((o) => o.setVisible(true));
    [this.btnLogout, this.btnClose, this.btnZoomIn, this.btnZoomOut].forEach((c) => c.setVisible(true));
  }

  close(): void {
    this.open = false;
    [this.overlay, this.panel, this.title, this.hint, this.hudCheck, this.mmCheck,
      this.uiZoomLabel].forEach((o) => o.setVisible(false));
    [this.btnLogout, this.btnClose, this.btnZoomIn, this.btnZoomOut].forEach((c) => c.setVisible(false));
    this.opts.onClose();
  }

  /** Danh sách object để WorldScene gán vào camera UI. */
  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return [
      this.overlay, this.panel, this.title, this.hint, this.hudCheck,
      this.mmCheck, this.uiZoomLabel, this.btnLogout, this.btnClose,
      this.btnZoomIn, this.btnZoomOut,
    ];
  }

  destroy(): void {
    [
      this.overlay, this.panel, this.title, this.hint, this.hudCheck,
      this.mmCheck, this.uiZoomLabel, this.btnLogout, this.btnClose,
      this.btnZoomIn, this.btnZoomOut,
    ].forEach((o) => o.destroy());
  }
}
