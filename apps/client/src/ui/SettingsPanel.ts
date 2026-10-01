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
  onMoveButtonChange?: (button: 'left' | 'right') => void;

  // Audio & System
  onToggleBgm?: (enabled: boolean) => void;
  onToggleSfx?: (enabled: boolean) => void;
  onChangeLanguage?: (lang: 'vi' | 'en') => void;
  onLogout?: () => void;
  onClose?: () => void;
}

const MODAL_W = 540;
const MODAL_H = 420;

/**
 * SettingsPanel — Modal Cài đặt đa tab lớn, phân vùng rõ ràng:
 * 1. 🖥 Giao diện (Interface): Bật/tắt 5 thành phần UI độc lập, Chế độ Mini, UI Zoom, Game Zoom.
 * 2. 🎮 Lối chơi (Gameplay): Tên người chơi, Marker đích đến, Lưới toạ độ, Tự động chạy.
 * 3. 🔊 Âm thanh (Audio): Nhạc nền BGM, Âm thanh hiệu ứng SFX.
 * 4. ⚙ Hệ thống (System): Ngôn ngữ trực quan (VI/EN), Đăng xuất, Đóng.
 *
 * Tính năng nâng cao:
 * - Khung modal Draggable: Kéo thả di chuyển bằng thanh tiêu đề (Header Bar).
 * - Nút Căn giữa (Center / Dock ⚓) khôi phục vị trí giữa màn hình.
 * - Overlay khóa toàn bộ UI và gameplay bên dưới khi modal đang mở.
 */
export class SettingsPanel {
  private readonly scene: Phaser.Scene;
  private opts: SettingsPanelOptions;
  private _uiZoomManager?: UiZoomManager;

  private open = false;
  private activeTab: SettingsTab = 'interface';

  // Trạng thái kéo thả
  private customX?: number;
  private customY?: number;
  private currentX = 0;
  private currentY = 0;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };

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
    moveButton: 'left' as 'left' | 'right',
  };

  // Trạng thái âm thanh & hệ thống
  private audioState = {
    bgm: true,
    sfx: true,
  };

  private systemState = {
    lang: 'vi' as 'vi' | 'en',
  };

  // Containers & visual objects
  private overlay: Phaser.GameObjects.Graphics;
  private overlayBlocker: Phaser.GameObjects.Zone;
  private panel: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private headerZone: Phaser.GameObjects.Zone;
  private btnCenter: Phaser.GameObjects.Text;
  private btnCloseX: Phaser.GameObjects.Text;

  // Tabs
  private tabButtons: Map<
    SettingsTab,
    { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }
  > = new Map();

  // Tab content container objects
  private tabObjects: Map<
    SettingsTab,
    Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible>
  > = new Map();

  // References để cập nhật nhãn động
  private uiZoomValText?: Phaser.GameObjects.Text;
  private gameZoomValText?: Phaser.GameObjects.Text;
  private langBtnVi?: { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private langBtnEn?: { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private moveBtnLeft?: { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private moveBtnRight?: { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };

  private allObjects: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> = [];

  constructor(scene: Phaser.Scene, opts: SettingsPanelOptions) {
    this.scene = scene;
    this.opts = opts;

    // Load ngôn ngữ và cơ chế di chuyển đã lưu
    try {
      const savedLang = localStorage.getItem('pixelmon.lang');
      if (savedLang === 'vi' || savedLang === 'en') {
        this.systemState.lang = savedLang;
      }
      const savedMoveBtn = localStorage.getItem('pixelmon.moveButton');
      if (savedMoveBtn === 'left' || savedMoveBtn === 'right') {
        this.gameplayState.moveButton = savedMoveBtn;
      }
    } catch {
      // ignore
    }

    this.tabObjects.set('interface', []);
    this.tabObjects.set('gameplay', []);
    this.tabObjects.set('audio', []);
    this.tabObjects.set('system', []);

    // 1. Overlay tối phủ toàn màn hình khóa UI
    this.overlay = scene.add
      .graphics()
      .setDepth(200)
      .setScrollFactor(0)
      .setVisible(false);
    this.allObjects.push(this.overlay);

    // Blocker zone nuốt toàn bộ pointer events
    this.overlayBlocker = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0, 0)
      .setDepth(200)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ cursor: 'default' });

    this.overlayBlocker.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      // Bảng cài đặt chỉ đóng khi bấm nút ✕ theo yêu cầu
    });
    this.allObjects.push(this.overlayBlocker);

    // 2. Khung modal chính
    this.panel = scene.add.graphics().setDepth(201).setScrollFactor(0).setVisible(false);
    this.allObjects.push(this.panel);

    // 3. Header title
    this.titleText = scene.add
      .text(0, 0, '⚙ BẢNG CÀI ĐẶT HỆ THỐNG', ts(15, '#00cec9', FONT.ui))
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false);
    this.allObjects.push(this.titleText);

    // 4. Vùng kéo thả Header (Draggable Zone)
    this.headerZone = scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0, 0)
      .setDepth(202)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ cursor: 'grab' });
    this.allObjects.push(this.headerZone);
    this.setupDragEvents();

    // 5. Nút Căn giữa (Center / Dock ⚓)
    this.btnCenter = scene.add
      .text(0, 0, '⚓', ts(13, C.muted, FONT.ui))
      .setOrigin(0.5)
      .setDepth(203)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    this.btnCenter.on('pointerover', () => this.btnCenter.setColor('#00cec9'));
    this.btnCenter.on('pointerout', () => this.btnCenter.setColor(C.muted));
    this.btnCenter.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.customX = undefined;
      this.customY = undefined;
      this.relayout();
    });
    this.allObjects.push(this.btnCenter);

    // 6. Nút ✕ đóng
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

    // 7. Xây dựng Tab buttons
    this.buildTabs();

    // 8. Xây dựng nội dung từng Tab
    this.buildInterfaceTab();
    this.buildGameplayTab();
    this.buildAudioTab();
    this.buildSystemTab();

    // Resize listener
    scene.scale.on('resize', () => {
      if (this.open) this.relayout();
    });
  }

  private setupDragEvents(): void {
    this.headerZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return;
      pointer.event?.stopPropagation();
      this.isDragging = true;
      this.dragOffset = {
        x: pointer.x - this.currentX,
        y: pointer.y - this.currentY,
      };
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const modalW = this.getModalW();
      const modalH = this.getModalH();
      const maxX = Math.max(0, this.scene.scale.width - modalW);
      const maxY = Math.max(0, this.scene.scale.height - modalH);
      this.customX = Phaser.Math.Clamp(pointer.x - this.dragOffset.x, 0, maxX);
      this.customY = Phaser.Math.Clamp(pointer.y - this.dragOffset.y, 0, maxY);
      this.relayout();
    });

    const endDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
      }
    };
    this.scene.input.on('pointerup', endDrag);
    this.scene.input.on('pointerupoutside', endDrag);
  }

  private getModalW(): number {
    return Math.min(MODAL_W, this.scene.scale.width - 24);
  }

  private getModalH(): number {
    return Math.min(MODAL_H, this.scene.scale.height - 24);
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

    // Phân nhóm 1: Bật/tắt thành phần UI
    const lblSec1 = this.scene.add
      .text(0, 0, 'HIỂN THỊ CÁC THÀNH PHẦN GIAO DIỆN (HUD):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec1);

    // Profile & Clock
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

    // Party & Chat
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

    // Minimap & Mini
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

    // Phân nhóm 2: Zoom
    const lblSec2 = this.scene.add
      .text(0, 0, 'ĐIỀU CHỈNH THU PHÓNG (ZOOM):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec2);

    // UI Zoom
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

    // Game Zoom
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

    // Tuỳ chọn phím di chuyển
    const lblMove = this.scene.add
      .text(0, 0, 'CƠ CHẾ DI CHUYỂN (CLICK-TO-MOVE):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblMove);

    const bgLeft = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtLeft = this.scene.add
      .text(0, 0, '👈 Chuột trái / Touch (LMB)', ts(12, '#ffffff', FONT.ui))
      .setOrigin(0.5)
      .setDepth(204)
      .setScrollFactor(0)
      .setVisible(false);
    const zoneLeft = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    zoneLeft.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setMoveButton('left');
    });
    this.moveBtnLeft = { bg: bgLeft, txt: txtLeft, zone: zoneLeft };
    list.push(bgLeft, txtLeft, zoneLeft);

    const bgRight = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtRight = this.scene.add
      .text(0, 0, '👉 Chuột phải (RMB)', ts(12, C.muted, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204)
      .setScrollFactor(0)
      .setVisible(false);
    const zoneRight = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    zoneRight.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setMoveButton('right');
    });
    this.moveBtnRight = { bg: bgRight, txt: txtRight, zone: zoneRight };
    list.push(bgRight, txtRight, zoneRight);

    const hint = this.scene.add
      .text(
        0,
        0,
        '💡 Mẹo: Nhấp chuột vào bản đồ để tự động tìm đường đi tới ô đích.\nGiữ chuột giữa (MMB) hoặc Shift + Chuột trái để kéo camera di chuyển.',
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
        '🎵 Âm thanh web audio đang được tối ưu hoá theo từng bản đồ và tương tác.',
        ts(11, C.muted, FONT.ui),
      )
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(note);

    this.allObjects.push(...list);
  }

  // ── Tab 4: Hệ thống (System) ────────────────────────────────────────────────
  private buildSystemTab(): void {
    const list = this.tabObjects.get('system')!;

    // Phân vùng chọn ngôn ngữ
    const lblLang = this.scene.add
      .text(0, 0, 'NGÔN NGỮ HIỂN THỊ (LANGUAGE SETTINGS):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblLang);

    // Nút Tiếng Việt
    const bgVi = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtVi = this.scene.add
      .text(0, 0, '🇻🇳 Tiếng Việt', ts(12, '#ffffff', FONT.ui))
      .setOrigin(0.5)
      .setDepth(204)
      .setScrollFactor(0)
      .setVisible(false);
    const zoneVi = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    zoneVi.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setLanguage('vi');
    });
    this.langBtnVi = { bg: bgVi, txt: txtVi, zone: zoneVi };
    list.push(bgVi, txtVi, zoneVi);

    // Nút English
    const bgEn = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtEn = this.scene.add
      .text(0, 0, '🇺🇸 English', ts(12, C.muted, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204)
      .setScrollFactor(0)
      .setVisible(false);
    const zoneEn = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    zoneEn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setLanguage('en');
    });
    this.langBtnEn = { bg: bgEn, txt: txtEn, zone: zoneEn };
    list.push(bgEn, txtEn, zoneEn);

    const lblAcc = this.scene.add
      .text(0, 0, 'THÔNG TIN TÀI KHOẢN & PHÍM TẮT:', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblAcc);

    const infoAcc = this.scene.add
      .text(
        0,
        0,
        '• Để đăng xuất nhanh: Nhấp vào biểu tượng 🚪 Đăng xuất trên thanh công cụ trên cùng.\n• Phím tắt mở cài đặt: Bấm phím [Esc] hoặc biểu tượng ⚙ trên thanh công cụ.',
        ts(11, C.text, FONT.ui),
      )
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(infoAcc);

    // Nút đóng
    const btnClose = this.createActionButton('ĐÓNG BẢNG CÀI ĐẶT (ESC)', 0x2e3358, () => {
      this.close();
    });
    list.push(...btnClose);

    this.allObjects.push(...list);
  }

  private setLanguage(lang: 'vi' | 'en'): void {
    this.systemState.lang = lang;
    try {
      localStorage.setItem('pixelmon.lang', lang);
    } catch {
      // ignore
    }
    this.opts.onChangeLanguage?.(lang);
    this.relayout();
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

    (zone as any)._actMeta = { color };
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
    this.overlayBlocker.setVisible(true);
    this.panel.setVisible(true);
    this.titleText.setVisible(true);
    this.headerZone.setVisible(true);
    this.btnCenter.setVisible(true);
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
    this.isDragging = false;
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

    // Full screen overlay khóa UI
    this.overlay.clear();
    this.overlay.fillStyle(0x000000, 0.65);
    this.overlay.fillRect(0, 0, screenW, screenH);
    this.overlayBlocker.setPosition(0, 0).setSize(screenW, screenH);

    // Kích thước modal
    const modalW = this.getModalW();
    const modalH = this.getModalH();

    // Toạ độ modal: ưu tiên customX/Y nếu người dùng kéo thả
    let X: number;
    let Y: number;
    if (this.customX !== undefined && this.customY !== undefined) {
      const maxX = Math.max(0, screenW - modalW);
      const maxY = Math.max(0, screenH - modalH);
      X = Phaser.Math.Clamp(this.customX, 0, maxX);
      Y = Phaser.Math.Clamp(this.customY, 0, maxY);
    } else {
      X = Math.round((screenW - modalW) / 2);
      Y = Math.round((screenH - modalH) / 2);
    }
    this.currentX = X;
    this.currentY = Y;

    // Vẽ panel chính
    this.panel.clear();
    this.panel.fillStyle(0x000000, 0.45);
    this.panel.fillRoundedRect(X + 4, Y + 4, modalW, modalH, 8);
    this.panel.fillStyle(0x151833, 0.98);
    this.panel.fillRoundedRect(X, Y, modalW, modalH, 8);
    this.panel.lineStyle(2, 0x2e3358, 1);
    this.panel.strokeRoundedRect(X, Y, modalW, modalH, 8);

    // Header top bar background (vùng kéo thả)
    this.panel.fillStyle(0x0f1124, 0.95);
    this.panel.fillRoundedRect(X, Y, modalW, 40, { tl: 8, tr: 8, bl: 0, br: 0 });
    this.panel.lineStyle(1, 0x2e3358, 0.8);
    this.panel.lineBetween(X, Y + 40, X + modalW, Y + 40);

    // Header elements
    this.titleText.setPosition(X + 16, Y + 12);
    this.headerZone.setPosition(X, Y).setSize(modalW - 64, 40);
    this.btnCenter.setPosition(X + modalW - 40, Y + 20);
    this.btnCloseX.setPosition(X + modalW - 18, Y + 20);

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

    // Row UI Zoom: list[26..36]
    const lblUiZ = list[26] as Phaser.GameObjects.Text;
    lblUiZ.setPosition(x, curY);

    this.positionButton(list[28], list[29], list[30], x + 240, curY + 6, 26, 20); // -
    const uiVal = list[27] as Phaser.GameObjects.Text;
    uiVal.setPosition(x + 285, curY + 6);
    this.positionButton(list[31], list[32], list[33], x + 330, curY + 6, 26, 20); // +
    this.positionButton(list[34], list[35], list[36], x + 380, curY + 6, 44, 20); // 100%

    curY += 32;

    // Row Game Zoom: list[37..47]
    const lblGameZ = list[37] as Phaser.GameObjects.Text;
    lblGameZ.setPosition(x, curY);

    this.positionButton(list[39], list[40], list[41], x + 240, curY + 6, 26, 20); // -
    const gameVal = list[38] as Phaser.GameObjects.Text;
    gameVal.setPosition(x + 285, curY + 6);
    this.positionButton(list[42], list[43], list[44], x + 330, curY + 6, 26, 20); // +
    this.positionButton(list[45], list[46], list[47], x + 380, curY + 6, 44, 20); // 1.0x
  }

  private setMoveButton(btn: 'left' | 'right'): void {
    this.gameplayState.moveButton = btn;
    try {
      localStorage.setItem('pixelmon.moveButton', btn);
    } catch {
      // ignore
    }
    this.opts.onMoveButtonChange?.(btn);
    this.relayout();
  }

  private layoutGameplayTab(x: number, y: number, _w: number): void {
    const list = this.tabObjects.get('gameplay')!;
    let curY = y;

    const lbl = list[0] as Phaser.GameObjects.Text;
    lbl.setPosition(x, curY);
    curY += 24;

    this.positionCheckbox(list, 1, x, curY, 360);
    curY += 26;

    this.positionCheckbox(list, 5, x, curY, 440);
    curY += 26;

    this.positionCheckbox(list, 9, x, curY, 360);
    curY += 26;

    this.positionCheckbox(list, 13, x, curY, 360);
    curY += 30;

    // Cơ chế di chuyển
    const lblMove = list[17] as Phaser.GameObjects.Text;
    lblMove.setPosition(x, curY);
    curY += 20;

    const isLeft = this.gameplayState.moveButton === 'left';
    const isRight = this.gameplayState.moveButton === 'right';

    if (this.moveBtnLeft) {
      const cx = x + 110;
      const cy = curY + 12;
      this.moveBtnLeft.bg.clear();
      this.moveBtnLeft.bg.fillStyle(isLeft ? 0x24284d : 0x13152c, 0.95);
      this.moveBtnLeft.bg.fillRoundedRect(cx - 100, cy - 13, 200, 26, 4);
      this.moveBtnLeft.bg.lineStyle(isLeft ? 2 : 1, isLeft ? 0x00cec9 : 0x2e3358, 1);
      this.moveBtnLeft.bg.strokeRoundedRect(cx - 100, cy - 13, 200, 26, 4);

      this.moveBtnLeft.txt.setPosition(cx, cy);
      this.moveBtnLeft.txt.setColor(isLeft ? '#00cec9' : C.muted);
      this.moveBtnLeft.zone.setPosition(cx, cy).setSize(200, 26);
    }

    if (this.moveBtnRight) {
      const cx = x + 300;
      const cy = curY + 12;
      this.moveBtnRight.bg.clear();
      this.moveBtnRight.bg.fillStyle(isRight ? 0x24284d : 0x13152c, 0.95);
      this.moveBtnRight.bg.fillRoundedRect(cx - 75, cy - 13, 150, 26, 4);
      this.moveBtnRight.bg.lineStyle(isRight ? 2 : 1, isRight ? 0x00cec9 : 0x2e3358, 1);
      this.moveBtnRight.bg.strokeRoundedRect(cx - 75, cy - 13, 150, 26, 4);

      this.moveBtnRight.txt.setPosition(cx, cy);
      this.moveBtnRight.txt.setColor(isRight ? '#00cec9' : C.muted);
      this.moveBtnRight.zone.setPosition(cx, cy).setSize(150, 26);
    }

    curY += 34;

    const hint = list[24] as Phaser.GameObjects.Text;
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

  private layoutSystemTab(x: number, y: number, w: number): void {
    const list = this.tabObjects.get('system')!;
    let curY = y;

    const lblLang = list[0] as Phaser.GameObjects.Text;
    lblLang.setPosition(x, curY);
    curY += 24;

    // 2 nút chọn ngôn ngữ
    const isVi = this.systemState.lang === 'vi';
    const isEn = this.systemState.lang === 'en';

    if (this.langBtnVi) {
      const cx = x + 100;
      const cy = curY + 14;
      this.langBtnVi.bg.clear();
      this.langBtnVi.bg.fillStyle(isVi ? 0x24284d : 0x13152c, 0.95);
      this.langBtnVi.bg.fillRoundedRect(cx - 80, cy - 14, 160, 28, 4);
      this.langBtnVi.bg.lineStyle(isVi ? 2 : 1, isVi ? 0x00cec9 : 0x2e3358, 1);
      this.langBtnVi.bg.strokeRoundedRect(cx - 80, cy - 14, 160, 28, 4);

      this.langBtnVi.txt.setPosition(cx, cy);
      this.langBtnVi.txt.setColor(isVi ? '#00cec9' : C.muted);
      this.langBtnVi.zone.setPosition(cx, cy).setSize(160, 28);
    }

    if (this.langBtnEn) {
      const cx = x + 280;
      const cy = curY + 14;
      this.langBtnEn.bg.clear();
      this.langBtnEn.bg.fillStyle(isEn ? 0x24284d : 0x13152c, 0.95);
      this.langBtnEn.bg.fillRoundedRect(cx - 70, cy - 14, 140, 28, 4);
      this.langBtnEn.bg.lineStyle(isEn ? 2 : 1, isEn ? 0x00cec9 : 0x2e3358, 1);
      this.langBtnEn.bg.strokeRoundedRect(cx - 70, cy - 14, 140, 28, 4);

      this.langBtnEn.txt.setPosition(cx, cy);
      this.langBtnEn.txt.setColor(isEn ? '#00cec9' : C.muted);
      this.langBtnEn.zone.setPosition(cx, cy).setSize(140, 28);
    }

    curY += 46;

    const lblAcc = list[7] as Phaser.GameObjects.Text;
    lblAcc.setPosition(x, curY);
    curY += 26;

    const infoAcc = list[8] as Phaser.GameObjects.Text;
    infoAcc.setPosition(x, curY);
    curY += 56;

    // Nút đóng modal
    this.positionActionButton(list[9], list[10], list[11], x + w / 2, curY + 16, 220, 34);
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
