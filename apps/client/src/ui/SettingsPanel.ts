import type Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import type { UiZoomManager } from './UiZoomManager';

export interface SettingsPanelOptions {
  onToggleHud: (v: boolean) => void;
  onToggleMinimap: (v: boolean) => void;
  onToggleMiniMode?: (v: boolean) => void;
  onLogout: () => void;
  onClose: () => void;
  onUiZoomIn?: () => void;
  onUiZoomOut?: () => void;
  onUiZoomReset?: () => void;
}

const PANEL_W = 320;
const PANEL_H = 360;

/**
 * **SettingsPanel** — Bảng Cài đặt đa năng (thay thế Menu Pause cũ).
 *
 * Cho phép người chơi điều chỉnh:
 * - Hiển thị: Bật/tắt HUD, Minimap, Chế độ tối giản (Mini mode), UI Zoom.
 * - Âm thanh: Nhạc nền (BGM), Hiệu ứng (SFX).
 * - Hệ thống: Ngôn ngữ, Đăng xuất tài khoản.
 */
export class SettingsPanel {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private hintText: Phaser.GameObjects.Text;

  // Toggle checks
  private hudCheck: Phaser.GameObjects.Text;
  private mmCheck: Phaser.GameObjects.Text;
  private miniModeCheck: Phaser.GameObjects.Text;
  private bgmCheck: Phaser.GameObjects.Text;
  private sfxCheck: Phaser.GameObjects.Text;

  // UI Zoom controls
  private zoomLabel: Phaser.GameObjects.Text;
  private btnZoomIn: Phaser.GameObjects.Container;
  private btnZoomOut: Phaser.GameObjects.Container;
  private btnZoomReset: Phaser.GameObjects.Container;

  // Action buttons
  private btnLogout: Phaser.GameObjects.Container;
  private btnClose: Phaser.GameObjects.Container;
  private btnXClose: Phaser.GameObjects.Text;

  private opts: SettingsPanelOptions;
  private open = false;
  private hudVisible = true;
  private mmVisible = false;
  private isMiniMode = false;
  private bgmEnabled = true;
  private sfxEnabled = true;
  private _uiZoomManager?: UiZoomManager;
  private objects: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> = [];

  constructor(scene: Phaser.Scene, opts: SettingsPanelOptions) {
    this.scene = scene;
    this.opts = opts;

    // Overlay mờ che gameplay
    this.overlay = scene.add
      .rectangle(0, 0, 1, 1, C.overlay, 0.75)
      .setOrigin(0, 0)
      .setDepth(200)
      .setScrollFactor(0)
      .setInteractive()
      .setVisible(false);
    this.overlay.on('pointerdown', () => this.close());
    this.objects.push(this.overlay);

    // Khung graphics
    this.panel = scene.add.graphics().setDepth(201).setScrollFactor(0).setVisible(false);
    this.objects.push(this.panel);

    // Header
    this.titleText = scene.add
      .text(0, 0, '⚙ CÀI ĐẶT', ts(16, '#00cec9', FONT.ui))
      .setOrigin(0, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
    this.objects.push(this.titleText);

    this.btnXClose = scene.add
      .text(0, 0, '✕', ts(15, C.muted, FONT.ui))
      .setOrigin(0.5, 0.5)
      .setDepth(202)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.btnXClose.on('pointerdown', () => this.close());
    this.objects.push(this.btnXClose);

    this.hintText = scene.add
      .text(0, 0, 'Esc hoặc bấm ra ngoài để đóng', ts(10, C.muted))
      .setOrigin(0, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
    this.objects.push(this.hintText);

    // Checks
    this.hudCheck = this.makeCheckText('[x] Hiển thị thanh HUD', () => this.toggleHud());
    this.mmCheck = this.makeCheckText('[ ] Hiển thị Minimap (GPS)', () => this.toggleMinimap());
    this.miniModeCheck = this.makeCheckText('[ ] Giao diện tối giản (Mini Mode)', () => this.toggleMiniMode());
    this.bgmCheck = this.makeCheckText('[x] Nhạc nền (BGM)', () => {
      this.bgmEnabled = !this.bgmEnabled;
      this.bgmCheck.setText(`[${this.bgmEnabled ? 'x' : ' '}] Nhạc nền (BGM)`);
    });
    this.sfxCheck = this.makeCheckText('[x] Âm thanh hiệu ứng (SFX)', () => {
      this.sfxEnabled = !this.sfxEnabled;
      this.sfxCheck.setText(`[${this.sfxEnabled ? 'x' : ' '}] Âm thanh hiệu ứng (SFX)`);
    });

    // Zoom
    this.zoomLabel = scene.add
      .text(0, 0, 'Cỡ giao diện: 1.0x', ts(12, C.text, FONT.ui))
      .setOrigin(0, 0.5)
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
    this.objects.push(this.zoomLabel);

    this.btnZoomOut = this.makeButton('-', C.panel, 26, 22, () => this.opts.onUiZoomOut?.());
    this.btnZoomIn = this.makeButton('+', C.panel, 26, 22, () => this.opts.onUiZoomIn?.());
    this.btnZoomReset = this.makeButton('Đặt lại', C.panel, 48, 22, () => this.opts.onUiZoomReset?.());

    // Footer actions
    this.btnLogout = this.makeButton('Đăng xuất tài khoản', C.err, 130, 28, () => this.opts.onLogout());
    this.btnClose = this.makeButton('Đóng', C.accent, 90, 28, () => this.close());

    this.relayout();
    scene.scale.on('resize', () => this.relayout());
  }

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.updateZoomLabel();
    this.scene.scale.on('ui-zoom-change', () => this.updateZoomLabel());
  }

  private makeCheckText(label: string, onClick: () => void): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(0, 0, label, ts(12, C.text, FONT.ui))
      .setOrigin(0, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    t.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      onClick();
    });
    t.on('pointerover', () => t.setColor('#00cec9'));
    t.on('pointerout', () => t.setColor(C.text));
    this.objects.push(t);
    return t;
  }

  private makeButton(
    label: string,
    color: number,
    w: number,
    h: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    g.fillStyle(color, color === C.err ? 0.35 : 0.85);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    g.lineStyle(1, color === C.err ? C.err : C.border, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 4);

    const t = this.scene.add
      .text(0, 0, label, ts(11, color === C.err ? '#ff7675' : C.text, FONT.ui))
      .setOrigin(0.5, 0.5);

    const zone = this.scene.add
      .zone(0, 0, w, h)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      onClick();
    });
    zone.on('pointerover', () => g.setAlpha(0.8));
    zone.on('pointerout', () => g.setAlpha(1));

    const cont = this.scene.add
      .container(0, 0, [g, t, zone])
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
    this.objects.push(cont);
    return cont;
  }

  private toggleHud(): void {
    this.hudVisible = !this.hudVisible;
    this.hudCheck.setText(`[${this.hudVisible ? 'x' : ' '}] Hiển thị thanh HUD`);
    this.opts.onToggleHud(this.hudVisible);
  }

  private toggleMinimap(): void {
    this.mmVisible = !this.mmVisible;
    this.mmCheck.setText(`[${this.mmVisible ? 'x' : ' '}] Hiển thị Minimap (GPS)`);
    this.opts.onToggleMinimap(this.mmVisible);
  }

  private toggleMiniMode(): void {
    this.isMiniMode = !this.isMiniMode;
    this.miniModeCheck.setText(`[${this.isMiniMode ? 'x' : ' '}] Giao diện tối giản (Mini Mode)`);
    this.opts.onToggleMiniMode?.(this.isMiniMode);
  }

  private updateZoomLabel(): void {
    const z = this._uiZoomManager?.uiZoom ?? 1;
    this.zoomLabel.setText(`Cỡ giao diện: ${z.toFixed(1)}x`);
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
    this.objects.forEach((o) => o.setVisible(true));
  }

  close(): void {
    this.open = false;
    this.objects.forEach((o) => o.setVisible(false));
    this.opts.onClose();
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return this.objects;
  }

  destroy(): void {
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
  }

  private relayout(): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;

    const w = Math.min(PANEL_W, W - 24);
    const h = Math.min(PANEL_H, H - 24);

    const px = Math.floor((W - w) / 2);
    const py = Math.floor((H - h) / 2);

    this.overlay.setSize(W, H);

    this.panel.clear();
    // Shadow
    this.panel.fillStyle(0x000000, 0.5);
    this.panel.fillRoundedRect(px + 4, py + 4, w, h, 8);
    // Panel bg
    this.panel.fillStyle(C.panel, 0.98);
    this.panel.fillRoundedRect(px, py, w, h, 8);
    // Border
    this.panel.lineStyle(1, C.accent, 0.9);
    this.panel.strokeRoundedRect(px, py, w, h, 8);

    // Section line
    this.panel.lineStyle(1, C.border, 0.6);
    this.panel.lineBetween(px + 16, py + 46, px + w - 16, py + 46);
    this.panel.lineBetween(px + 16, py + 230, px + w - 16, py + 230);
    this.panel.lineBetween(px + 16, py + 300, px + w - 16, py + 300);

    // Header
    this.titleText.setPosition(px + 18, py + 16);
    this.btnXClose.setPosition(px + w - 20, py + 24);
    this.hintText.setPosition(px + 18, py + 32);

    // ── Group 1: Hiển thị ──
    this.hudCheck.setPosition(px + 18, py + 56);
    this.mmCheck.setPosition(px + 18, py + 80);
    this.miniModeCheck.setPosition(px + 18, py + 104);

    // UI Zoom
    this.zoomLabel.setPosition(px + 18, py + 138);
    this.btnZoomOut.setPosition(px + w - 110, py + 138);
    this.btnZoomIn.setPosition(px + w - 78, py + 138);
    this.btnZoomReset.setPosition(px + w - 34, py + 138);

    // ── Group 2: Âm thanh ──
    this.bgmCheck.setPosition(px + 18, py + 168);
    this.sfxCheck.setPosition(px + 18, py + 194);

    // ── Group 3: Tài khoản & Hệ thống ──
    this.btnLogout.setPosition(px + 80, py + 265);
    this.btnClose.setPosition(px + w - 60, py + 265);
  }
}
