import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import type { UiZoomManager } from './UiZoomManager';

export type SettingsTab = 'interface' | 'gameplay' | 'audio' | 'system';

export interface SettingsPanelOptions {
  // Bật/tắt từng thành phần UI riêng lẻ
  onToggleProfile?: (visible: boolean) => void;
  onToggleClock?: (visible: boolean) => void;
  onToggleParty?: (visible: boolean) => void;
  onToggleChat?: (visible: boolean) => void;
  onToggleMinimap?: (visible: boolean) => void;
  onToggleMiniMode?: (mini: boolean) => void;

  // UI Zoom
  onUiZoomIn?: () => void;
  onUiZoomOut?: () => void;
  onUiZoomReset?: () => void;

  // Game Zoom (Camera Zoom)
  onGameZoomIn?: () => void;
  onGameZoomOut?: () => void;
  onGameZoomReset?: () => void;
  getGameZoom?: () => number;

  // Gameplay
  onTogglePlayerNames?: (visible: boolean) => void;
  onToggleTargetMarker?: (enabled: boolean) => void;
  onToggleGrid?: (enabled: boolean) => void;
  onToggleAutoRun?: (enabled: boolean) => void;

  // Audio & System
  onToggleBgm?: (enabled: boolean) => void;
  onToggleSfx?: (enabled: boolean) => void;
  onChangeLanguage?: (lang: 'vi' | 'en') => void;
  onLogout?: () => void;
  onClose?: () => void;
}

const MODAL_W = 540;
const MODAL_H = 410;

/**
 * SettingsPanel — Modal Cài đặt đa tab lớn, phân vùng rõ ràng:
 * 1. 🖥 Giao diện (Interface): Bật/tắt 5 thành phần UI độc lập, Chế độ Mini, UI Zoom, Game Zoom.
 * 2. 🎮 Lối chơi (Gameplay): Tên người chơi, Marker đích đến, Lưới toạ độ, Tự động chạy.
 * 3. 🔊 Âm thanh (Audio): Nhạc nền BGM, Âm thanh hiệu ứng SFX, Âm lượng.
 * 4. ⚙ Hệ thống (System): Ngôn ngữ, Thông tin tài khoản/server, Đăng xuất, Đóng.
 */
export class SettingsPanel {
  private readonly scene: Phaser.Scene;
  private opts: SettingsPanelOptions;
  private _uiZoomManager?: UiZoomManager;

  private open = false;
  private activeTab: SettingsTab = 'interface';

  // Trạng thái các toggle UI
  private uiState = {
    profile: true,
    clock: true,
    party: true,
    chat: true,
    minimap: false,
    miniMode: false,
  };

  // Trạng thái gameplay
  private gameplayState = {
    showPlayerNames: true,
    targetMarker: true,
    showGrid: false,
    autoRun: false,
  };

  // Trạng thái âm thanh & hệ thống
  private audioState = {
    bgm: true,
    sfx: true,
    bgmVol: 80,
    sfxVol: 100,
  };

  private systemState = {
    lang: 'vi' as 'vi' | 'en',
  };

  // Containers & visual objects
  private overlay: Phaser.GameObjects.Graphics;
  private panel: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private btnCloseX: Phaser.GameObjects.Text;

  // Tabs
  private tabButtons: Map<SettingsTab, { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }> = new Map();

  // Tab content container objects
  private tabObjects: Map<SettingsTab, Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible>> = new Map();

  // References để cập nhật nhãn động
  private uiZoomValText?: Phaser.GameObjects.Text;
  private gameZoomValText?: Phaser.GameObjects.Text;

  private allObjects: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> = [];

  constructor(scene: Phaser.Scene, opts: SettingsPanelOptions) {
    this.scene = scene;
    this.opts = opts;

    this.tabObjects.set('interface', []);
    this.tabObjects.set('gameplay', []);
    this.tabObjects.set('audio', []);
    this.tabObjects.set('system', []);

    // 1. Overlay tối
    this.overlay = scene.add
      .graphics()
      .setDepth(200)
      .setScrollFactor(0)
      .setVisible(false);
    this.overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 10000, 10000),
      Phaser.Geom.Rectangle.Contains,
    );
    this.overlay.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.close();
    });
    this.allObjects.push(this.overlay);

    // 2. Khung modal chính
    this.panel = scene.add.graphics().setDepth(201).setScrollFactor(0).setVisible(false);
    this.panel.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, MODAL_W, MODAL_H),
      Phaser.Geom.Rectangle.Contains,
    );
    this.panel.on('pointerdown', (p: Phaser.Input.Pointer) => p.event?.stopPropagation());
    this.allObjects.push(this.panel);

    // 3. Header title
    this.titleText = scene.add
      .text(0, 0, '⚙ BẢNG CÀI ĐẶT HỆ THỐNG', ts(15, '#00cec9', FONT.ui))
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
    this.allObjects.push(this.titleText);

    // 4. Nút ✕ đóng
    this.btnCloseX = scene.add
      .text(0, 0, '✕', ts(15, C.muted, FONT.ui))
      .setOrigin(0.5)
      .setDepth(203)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.btnCloseX.on('pointerover', () => this.btnCloseX.setColor('#ff7675'));
    this.btnCloseX.on('pointerout', () => this.btnCloseX.setColor(C.muted));
    this.btnCloseX.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.close();
    });
    this.allObjects.push(this.btnCloseX);

    // 5. Xây dựng Tab buttons
    this.buildTabs();

    // 6. Xây dựng nội dung từng Tab
    this.buildInterfaceTab();
    this.buildGameplayTab();
    this.buildAudioTab();
    this.buildSystemTab();

    // Resize listener
    scene.scale.on('resize', () => {
      if (this.open) this.relayout();
    });
  }

  setUiZoomManager(m: UiZoomManager): void {
    this._uiZoomManager = m;
    this.scene.scale.on('ui-zoom-change', () => {
      this.updateZoomLabels();
      if (this.open) this.relayout();
    });
  }

  private buildTabs(): void {
    const tabs: Array<{ id: SettingsTab; label: string }> = [
      { id: 'interface', label: '🖥 Giao diện' },
      { id: 'gameplay', label: '🎮 Lối chơi' },
      { id: 'audio', label: '🔊 Âm thanh' },
      { id: 'system', label: '⚙ Hệ thống' },
    ];

    for (const t of tabs) {
      const bg = this.scene.add.graphics().setDepth(202).setScrollFactor(0).setVisible(false);
      const text = this.scene.add
        .text(0, 0, t.label, ts(12, C.muted, FONT.ui))
        .setOrigin(0.5)
        .setDepth(203)
        .setScrollFactor(0)
        .setVisible(false);
      const zone = this.scene.add
        .zone(0, 0, 10, 10)
        .setOrigin(0.5)
        .setDepth(204)
        .setScrollFactor(0)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.switchTab(t.id);
      });

      this.tabButtons.set(t.id, { bg, text, zone });
      this.allObjects.push(bg, text, zone);
    }
  }

  private switchTab(tab: SettingsTab): void {
    this.activeTab = tab;
    this.relayout();
  }

  // ── Tab 1: Giao diện ────────────────────────────────────────────────────────
  private buildInterfaceTab(): void {
    const list = this.tabObjects.get('interface')!;

    // Tiêu đề phân nhóm 1: Bật/tắt thành phần UI
    const lblSec1 = this.scene.add
      .text(0, 0, 'HIỂN THỊ CÁC THÀNH PHẦN GIAO DIỆN (HUD):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec1);

    // Row 1: Profile & Clock
    const chkProfile = this.createCheckbox('Thông tin nhân vật (Profile Info)', this.uiState.profile, (v) => {
      this.uiState.profile = v;
      this.opts.onToggleProfile?.(v);
    });
    list.push(...chkProfile);

    const chkClock = this.createCheckbox('Đồng hồ & Thời tiết (Clock / Weather)', this.uiState.clock, (v) => {
      this.uiState.clock = v;
      this.opts.onToggleClock?.(v);
    });
    list.push(...chkClock);

    // Row 2: Party & Chat
    const chkParty = this.createCheckbox('Danh sách đội hình (Party Pokemon)', this.uiState.party, (v) => {
      this.uiState.party = v;
      this.opts.onToggleParty?.(v);
    });
    list.push(...chkParty);

    const chkChat = this.createCheckbox('Khung trò chuyện (Chat Box)', this.uiState.chat, (v) => {
      this.uiState.chat = v;
      this.opts.onToggleChat?.(v);
    });
    list.push(...chkChat);

    // Row 3: Minimap & Chế độ tối giản
    const chkMinimap = this.createCheckbox('Bản đồ thu nhỏ (Minimap / GPS)', this.uiState.minimap, (v) => {
      this.uiState.minimap = v;
      this.opts.onToggleMinimap?.(v);
    });
    list.push(...chkMinimap);

    const chkMini = this.createCheckbox('Giao diện tối giản (Chế độ Mini HUD)', this.uiState.miniMode, (v) => {
      this.uiState.miniMode = v;
      this.opts.onToggleMiniMode?.(v);
    });
    list.push(...chkMini);

    // Tiêu đề phân nhóm 2: Độ thu phóng (Zoom controls)
    const lblSec2 = this.scene.add
      .text(0, 0, 'ĐIỀU CHỈNH THU PHÓNG (ZOOM):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec2);

    // UI Zoom Row
    const lblUiZoom = this.scene.add
      .text(0, 0, 'Tỉ lệ Giao diện (UI Zoom):', ts(12, C.text, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblUiZoom);

    this.uiZoomValText = this.scene.add
      .text(0, 0, '100%', ts(12, '#00cec9', FONT.mono))
      .setOrigin(0.5)
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(this.uiZoomValText);

    const btnUiZoomOut = this.createSmallButton('－', () => {
      this.opts.onUiZoomOut?.();
      this.updateZoomLabels();
    });
    list.push(...btnUiZoomOut);

    const btnUiZoomIn = this.createSmallButton('＋', () => {
      this.opts.onUiZoomIn?.();
      this.updateZoomLabels();
    });
    list.push(...btnUiZoomIn);

    const btnUiZoomReset = this.createSmallButton('100%', () => {
      this.opts.onUiZoomReset?.();
      this.updateZoomLabels();
    });
    list.push(...btnUiZoomReset);

    // Game Zoom Row (World Camera Zoom)
    const lblGameZoom = this.scene.add
      .text(0, 0, 'Thu phóng Thế giới (Game Zoom):', ts(12, C.text, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblGameZoom);

    this.gameZoomValText = this.scene.add
      .text(0, 0, '1.0x', ts(12, '#fdcb6e', FONT.mono))
      .setOrigin(0.5)
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(this.gameZoomValText);

    const btnGameZoomOut = this.createSmallButton('－', () => {
      this.opts.onGameZoomOut?.();
      this.updateZoomLabels();
    });
    list.push(...btnGameZoomOut);

    const btnGameZoomIn = this.createSmallButton('＋', () => {
      this.opts.onGameZoomIn?.();
      this.updateZoomLabels();
    });
    list.push(...btnGameZoomIn);

    const btnGameZoomReset = this.createSmallButton('1.0x', () => {
      this.opts.onGameZoomReset?.();
      this.updateZoomLabels();
    });
    list.push(...btnGameZoomReset);

    this.allObjects.push(...list);
  }

  // ── Tab 2: Lối chơi (Gameplay) ──────────────────────────────────────────────
  private buildGameplayTab(): void {
    const list = this.tabObjects.get('gameplay')!;

    const lbl = this.scene.add
      .text(0, 0, 'TUỲ CHỌN TƯƠNG TÁC & HIỂN THỊ THẾ GIỚI:', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lbl);

    const chkNames = this.createCheckbox('Hiển thị tên người chơi khác', this.gameplayState.showPlayerNames, (v) => {
      this.gameplayState.showPlayerNames = v;
      this.opts.onTogglePlayerNames?.(v);
    });
    list.push(...chkNames);

    const chkMarker = this.createCheckbox('Hiệu ứng đánh dấu ô đích khi di chuyển (RMB marker)', this.gameplayState.targetMarker, (v) => {
      this.gameplayState.targetMarker = v;
      this.opts.onToggleTargetMarker?.(v);
    });
    list.push(...chkMarker);

    const chkGrid = this.createCheckbox('Hiển thị lưới toạ độ ô gạch (Grid overlay)', this.gameplayState.showGrid, (v) => {
      this.gameplayState.showGrid = v;
      this.opts.onToggleGrid?.(v);
    });
    list.push(...chkGrid);

    const chkAutoRun = this.createCheckbox('Mặc định luôn chạy nhanh (Auto-Run)', this.gameplayState.autoRun, (v) => {
      this.gameplayState.autoRun = v;
      this.opts.onToggleAutoRun?.(v);
    });
    list.push(...chkAutoRun);

    const hint = this.scene.add
      .text(
        0,
        0,
        '💡 Mẹo: Nhấp chuột phải (RMB) vào bản đồ để tự động tìm đường đi tới ô đích.\nGiữ chuột giữa (MMB) hoặc Shift + Chuột trái để kéo camera di chuyển.',
        ts(11, C.muted, FONT.ui),
      )
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(hint);

    this.allObjects.push(...list);
  }

  // ── Tab 3: Âm thanh (Audio) ────────────────────────────────────────────────
  private buildAudioTab(): void {
    const list = this.tabObjects.get('audio')!;

    const lbl = this.scene.add
      .text(0, 0, 'CÀI ĐẶT ÂM THANH TRONG GAME:', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lbl);

    const chkBgm = this.createCheckbox('Nhạc nền thế giới (BGM World Music)', this.audioState.bgm, (v) => {
      this.audioState.bgm = v;
      this.opts.onToggleBgm?.(v);
    });
    list.push(...chkBgm);

    const chkSfx = this.createCheckbox('Hiệu ứng âm thanh (SFX Sound Effects)', this.audioState.sfx, (v) => {
      this.audioState.sfx = v;
      this.opts.onToggleSfx?.(v);
    });
    list.push(...chkSfx);

    const note = this.scene.add
      .text(
        0,
        0,
        '🎵 Hệ thống âm thanh web audio đang được tối ưu hoá theo từng bản đồ và tương tác.',
        ts(11, C.muted, FONT.ui),
      )
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(note);

    this.allObjects.push(...list);
  }

  // ── Tab 4: Hệ thống (System) ────────────────────────────────────────────────
  private buildSystemTab(): void {
    const list = this.tabObjects.get('system')!;

    const lblLang = this.scene.add
      .text(0, 0, 'NGÔN NGỮ HIỂN THỊ (LANGUAGE):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblLang);

    const btnVi = this.createSmallButton('🇻🇳 Tiếng Việt (Mặc định)', () => {
      this.systemState.lang = 'vi';
      this.opts.onChangeLanguage?.('vi');
    });
    list.push(...btnVi);

    const btnEn = this.createSmallButton('🇺🇸 English', () => {
      this.systemState.lang = 'en';
      this.opts.onChangeLanguage?.('en');
    });
    list.push(...btnEn);

    const lblAcc = this.scene.add
      .text(0, 0, 'TÀI KHOẢN VÀ KẾT NỐI:', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblAcc);

    // Nút đăng xuất
    const btnLogout = this.createActionButton('🚪 ĐĂNG XUẤT TÀI KHOẢN', 0xc0392b, () => {
      this.close();
      this.opts.onLogout?.();
    });
    list.push(...btnLogout);

    // Nút đóng
    const btnClose = this.createActionButton('ĐÓNG BẢNG (ESC)', 0x2e3358, () => {
      this.close();
    });
    list.push(...btnClose);

    this.allObjects.push(...list);
  }

  // ── Component Helpers ──────────────────────────────────────────────────────
  private createCheckbox(
    label: string,
    initial: boolean,
    onChange: (checked: boolean) => void,
  ): Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> {
    const boxGfx = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const checkText = this.scene.add
      .text(0, 0, initial ? '✔' : '', ts(12, '#00cec9', FONT.ui))
      .setOrigin(0.5)
      .setDepth(204)
      .setScrollFactor(0)
      .setVisible(false);

    const labelText = this.scene.add
      .text(0, 0, label, ts(12, C.text, FONT.ui))
      .setOrigin(0, 0.5)
      .setDepth(203)
      .setScrollFactor(0)
      .setVisible(false);

    const hitZone = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0, 0.5)
      .setDepth(205)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    let checked = initial;
    const toggle = () => {
      checked = !checked;
      checkText.setText(checked ? '✔' : '');
      onChange(checked);
    };

    hitZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      toggle();
    });

    // Gắn metadata vị trí layout
    (hitZone as any)._chkMeta = { boxGfx, checkText, labelText };

    return [boxGfx, checkText, labelText, hitZone];
  }

  private createSmallButton(
    label: string,
    onClick: () => void,
  ): Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> {
    const bg = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txt = this.scene.add
      .text(0, 0, label, ts(11, C.text, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204)
      .setScrollFactor(0)
      .setVisible(false);
    const zone = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover', () => txt.setColor('#00cec9'));
    zone.on('pointerout', () => txt.setColor(C.text));
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      onClick();
    });

    (zone as any)._btnMeta = { bg, txt, label };
    return [bg, txt, zone];
  }

  private createActionButton(
    label: string,
    color: number,
    onClick: () => void,
  ): Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> {
    const bg = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txt = this.scene.add
      .text(0, 0, label, ts(12, '#ffffff', FONT.ui))
      .setOrigin(0.5)
      .setDepth(204)
      .setScrollFactor(0)
      .setVisible(false);
    const zone = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      onClick();
    });

    (zone as any)._actMeta = { bg, txt, color };
    return [bg, txt, zone];
  }

  // ── Show / Close / Toggle ──────────────────────────────────────────────────
  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.updateZoomLabels();
    this.overlay.setVisible(true);
    this.panel.setVisible(true);
    this.titleText.setVisible(true);
    this.btnCloseX.setVisible(true);

    this.tabButtons.forEach(({ bg, text, zone }) => {
      bg.setVisible(true);
      text.setVisible(true);
      zone.setVisible(true);
    });

    this.relayout();
  }

  close(): void {
    this.open = false;
    this.allObjects.forEach((o) => o.setVisible(false));
    this.opts.onClose?.();
  }

  private updateZoomLabels(): void {
    const uiZ = this._uiZoomManager?.userZoom ?? 1;
    if (this.uiZoomValText) {
      this.uiZoomValText.setText(`${Math.round(uiZ * 100)}%`);
    }

    const gameZ = this.opts.getGameZoom ? this.opts.getGameZoom() : 1;
    if (this.gameZoomValText) {
      this.gameZoomValText.setText(`${gameZ.toFixed(1)}x`);
    }
  }

  // ── Layout & Render ────────────────────────────────────────────────────────
  private relayout(): void {
    if (!this.open) return;

    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;

    // Full screen overlay
    this.overlay.clear();
    this.overlay.fillStyle(0x000000, 0.65);
    this.overlay.fillRect(0, 0, screenW, screenH);

    // Kích thước modal: co giãn an toàn nếu màn hình bé
    const modalW = Math.min(MODAL_W, screenW - 24);
    const modalH = Math.min(MODAL_H, screenH - 24);
    const X = Math.round((screenW - modalW) / 2);
    const Y = Math.round((screenH - modalH) / 2);

    // Vẽ panel chính
    this.panel.clear();
    this.panel.fillStyle(0x000000, 0.45);
    this.panel.fillRoundedRect(X + 4, Y + 4, modalW, modalH, 8);
    this.panel.fillStyle(0x151833, 0.98);
    this.panel.fillRoundedRect(X, Y, modalW, modalH, 8);
    this.panel.lineStyle(2, 0x2e3358, 1);
    this.panel.strokeRoundedRect(X, Y, modalW, modalH, 8);

    // Header top bar background
    this.panel.fillStyle(0x0f1124, 0.9);
    this.panel.fillRoundedRect(X, Y, modalW, 40, { tl: 8, tr: 8, bl: 0, br: 0 });
    this.panel.lineStyle(1, 0x2e3358, 0.8);
    this.panel.lineBetween(X, Y + 40, X + modalW, Y + 40);

    // Title & Close Button
    this.titleText.setPosition(X + 16, Y + 12);
    this.btnCloseX.setPosition(X + modalW - 20, Y + 20);

    // Tab buttons layout
    const tabY = Y + 50;
    const tabW = Math.floor((modalW - 32) / 4);
    const tabH = 30;
    let curTabX = X + 16;

    const tabKeys: SettingsTab[] = ['interface', 'gameplay', 'audio', 'system'];
    for (const key of tabKeys) {
      const btn = this.tabButtons.get(key);
      if (!btn) continue;
      const isActive = this.activeTab === key;

      btn.bg.clear();
      if (isActive) {
        btn.bg.fillStyle(0x24284d, 1);
        btn.bg.fillRoundedRect(curTabX, tabY, tabW - 4, tabH, 4);
        btn.bg.lineStyle(2, 0x00cec9, 1);
        btn.bg.strokeRoundedRect(curTabX, tabY, tabW - 4, tabH, 4);
      } else {
        btn.bg.fillStyle(0x13152c, 0.8);
        btn.bg.fillRoundedRect(curTabX, tabY, tabW - 4, tabH, 4);
        btn.bg.lineStyle(1, 0x2e3358, 0.6);
        btn.bg.strokeRoundedRect(curTabX, tabY, tabW - 4, tabH, 4);
      }

      btn.text.setPosition(curTabX + (tabW - 4) / 2, tabY + tabH / 2);
      btn.text.setColor(isActive ? '#00cec9' : C.muted);

      btn.zone.setPosition(curTabX + (tabW - 4) / 2, tabY + tabH / 2);
      btn.zone.setSize(tabW - 4, tabH);

      curTabX += tabW;
    }

    // Ẩn tất cả các object của các tab không kích hoạt
    this.tabObjects.forEach((objs, tabKey) => {
      const isCur = tabKey === this.activeTab;
      objs.forEach((o) => o.setVisible(isCur));
    });

    // Layout nội dung tab đang chọn
    const contentX = X + 20;
    const contentY = Y + 94;
    const contentW = modalW - 40;

    switch (this.activeTab) {
      case 'interface':
        this.layoutInterfaceTab(contentX, contentY, contentW);
        break;
      case 'gameplay':
        this.layoutGameplayTab(contentX, contentY, contentW);
        break;
      case 'audio':
        this.layoutAudioTab(contentX, contentY, contentW);
        break;
      case 'system':
        this.layoutSystemTab(contentX, contentY, contentW);
        break;
    }
  }

  private layoutInterfaceTab(x: number, y: number, w: number): void {
    const list = this.tabObjects.get('interface')!;
    let curY = y;

    // Phân nhóm 1
    const lbl1 = list[0] as Phaser.GameObjects.Text;
    lbl1.setPosition(x, curY);
    curY += 24;

    // Checkboxes (2 cột)
    const colW = Math.floor(w / 2);
    const chkPairs = [
      { c1: 1, c2: 5 }, // Profile & Clock
      { c1: 9, c2: 13 }, // Party & Chat
      { c1: 17, c2: 21 }, // Minimap & Mini
    ];

    for (const pair of chkPairs) {
      this.positionCheckbox(list, pair.c1, x, curY, colW);
      this.positionCheckbox(list, pair.c2, x + colW, curY, colW);
      curY += 26;
    }

    curY += 12;

    // Phân nhóm 2: Zoom
    const lbl2 = list[25] as Phaser.GameObjects.Text;
    lbl2.setPosition(x, curY);
    curY += 24;

    // Row UI Zoom: list[26..33]
    const lblUiZ = list[26] as Phaser.GameObjects.Text;
    lblUiZ.setPosition(x, curY);

    const uiVal = list[27] as Phaser.GameObjects.Text;
    uiVal.setPosition(x + 220, curY + 6);

    this.positionButton(list[28], list[29], list[30], x + 160, curY + 6, 26, 20); // -
    this.positionButton(list[31], list[32], list[33], x + 270, curY + 6, 26, 20); // +
    this.positionButton(list[34], list[35], list[36], x + 310, curY + 6, 44, 20); // 100%

    curY += 32;

    // Row Game Zoom: list[37..44]
    const lblGameZ = list[37] as Phaser.GameObjects.Text;
    lblGameZ.setPosition(x, curY);

    const gameVal = list[38] as Phaser.GameObjects.Text;
    gameVal.setPosition(x + 220, curY + 6);

    this.positionButton(list[39], list[40], list[41], x + 160, curY + 6, 26, 20); // -
    this.positionButton(list[42], list[43], list[44], x + 270, curY + 6, 26, 20); // +
    this.positionButton(list[45], list[46], list[47], x + 310, curY + 6, 44, 20); // 1.0x
  }

  private layoutGameplayTab(x: number, y: number, _w: number): void {
    const list = this.tabObjects.get('gameplay')!;
    let curY = y;

    const lbl = list[0] as Phaser.GameObjects.Text;
    lbl.setPosition(x, curY);
    curY += 24;

    this.positionCheckbox(list, 1, x, curY, 360);
    curY += 28;

    this.positionCheckbox(list, 5, x, curY, 440);
    curY += 28;

    this.positionCheckbox(list, 9, x, curY, 360);
    curY += 28;

    this.positionCheckbox(list, 13, x, curY, 360);
    curY += 36;

    const hint = list[17] as Phaser.GameObjects.Text;
    hint.setPosition(x, curY);
  }

  private layoutAudioTab(x: number, y: number, _w: number): void {
    const list = this.tabObjects.get('audio')!;
    let curY = y;

    const lbl = list[0] as Phaser.GameObjects.Text;
    lbl.setPosition(x, curY);
    curY += 26;

    this.positionCheckbox(list, 1, x, curY, 380);
    curY += 32;

    this.positionCheckbox(list, 5, x, curY, 380);
    curY += 36;

    const note = list[9] as Phaser.GameObjects.Text;
    note.setPosition(x, curY);
  }

  private layoutSystemTab(x: number, y: number, _w: number): void {
    const list = this.tabObjects.get('system')!;
    let curY = y;

    const lblLang = list[0] as Phaser.GameObjects.Text;
    lblLang.setPosition(x, curY);
    curY += 24;

    this.positionButton(list[1], list[2], list[3], x + 80, curY + 12, 150, 26);
    this.positionButton(list[4], list[5], list[6], x + 240, curY + 12, 120, 26);
    curY += 44;

    const lblAcc = list[7] as Phaser.GameObjects.Text;
    lblAcc.setPosition(x, curY);
    curY += 30;

    // Action buttons: Logout & Close
    this.positionActionButton(list[8], list[9], list[10], x + 110, curY + 16, 210, 32);
    this.positionActionButton(list[11], list[12], list[13], x + 310, curY + 16, 150, 32);
  }

  private positionCheckbox(
    list: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible>,
    startIdx: number,
    x: number,
    y: number,
    w: number,
  ): void {
    const boxGfx = list[startIdx] as Phaser.GameObjects.Graphics;
    const checkText = list[startIdx + 1] as Phaser.GameObjects.Text;
    const labelText = list[startIdx + 2] as Phaser.GameObjects.Text;
    const hitZone = list[startIdx + 3] as Phaser.GameObjects.Zone;

    boxGfx.clear();
    boxGfx.fillStyle(0x0f1020, 0.9);
    boxGfx.fillRoundedRect(x, y - 8, 16, 16, 3);
    boxGfx.lineStyle(1, 0x2e3358, 1);
    boxGfx.strokeRoundedRect(x, y - 8, 16, 16, 3);

    checkText.setPosition(x + 8, y);
    labelText.setPosition(x + 24, y);
    hitZone.setPosition(x, y).setSize(w, 20);
  }

  private positionButton(
    bgObj: any,
    txtObj: any,
    zoneObj: any,
    cx: number,
    cy: number,
    w: number,
    h: number,
  ): void {
    const bg = bgObj as Phaser.GameObjects.Graphics;
    const txt = txtObj as Phaser.GameObjects.Text;
    const zone = zoneObj as Phaser.GameObjects.Zone;

    bg.clear();
    bg.fillStyle(0x222646, 0.9);
    bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 4);
    bg.lineStyle(1, 0x2e3358, 1);
    bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 4);

    txt.setPosition(cx, cy);
    zone.setPosition(cx, cy).setSize(w, h);
  }

  private positionActionButton(
    bgObj: any,
    txtObj: any,
    zoneObj: any,
    cx: number,
    cy: number,
    w: number,
    h: number,
  ): void {
    const bg = bgObj as Phaser.GameObjects.Graphics;
    const txt = txtObj as Phaser.GameObjects.Text;
    const zone = zoneObj as Phaser.GameObjects.Zone;
    const color = (zone as any)._actMeta?.color ?? 0x2e3358;

    bg.clear();
    bg.fillStyle(color, 0.95);
    bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    bg.lineStyle(1, 0xffffff, 0.2);
    bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);

    txt.setPosition(cx, cy);
    zone.setPosition(cx, cy).setSize(w, h);
  }

  /** Lấy danh sách toàn bộ GameObjects để camera UI render. */
  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return this.allObjects;
  }

  destroy(): void {
    this.allObjects.forEach((o) => o.destroy());
    this.allObjects = [];
  }
}
