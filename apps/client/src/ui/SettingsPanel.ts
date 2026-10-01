import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';
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
const MODAL_H = 430;

/**
 * SettingsPanel — Modal Cài đặt đa tab lớn, phân vùng rõ ràng:
 * - Kế thừa từ `UiModal`, chuẩn hoá phong cách và hành vi với toàn hệ thống pop-up.
 * - Khóa hoàn toàn UI và gameplay bên dưới (`lockUi: true`, depth 200).
 * - Hỗ trợ đầy đủ: 2 nút tắt (✕ chính + ⮌ phụ), nút thu nhỏ (－), nút neo (⚓), kéo thả Header.
 * - Tự động hưởng theo UI Zoom và giới hạn an toàn trong màn hình.
 */
export class SettingsPanel extends UiModal {
  private panelOpts: SettingsPanelOptions;
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

  constructor(scene: Phaser.Scene, opts: SettingsPanelOptions) {
    super(scene, {
      title: '⚙ BẢNG CÀI ĐẶT HỆ THỐNG',
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 36,
      lockUi: true,
      depth: 200,
      showClose: true,
      showMinimize: true,
      showDock: true,
      showSecondaryClose: true,
      defaultAlign: 'center',
      onClose: () => {
        opts.onClose?.();
      },
    });

    this.panelOpts = opts;

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

    // Ban đầu ẩn modal
    this.modalContainer.setVisible(false);
    if (this.overlay) this.overlay.setVisible(false);
    if (this.overlayBlocker) this.overlayBlocker.setVisible(false);
    this.open = false;

    // 1. Xây dựng Tab buttons
    this.buildTabs();

    // 2. Xây dựng nội dung từng Tab
    this.buildInterfaceTab();
    this.buildGameplayTab();
    this.buildAudioTab();
    this.buildSystemTab();

    // Đưa tất cả nội dung tab vào contentContainer
    this.tabObjects.forEach((objs) => {
      this.contentContainer.add(objs);
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
      const bg = this.scene.add.graphics().setVisible(false);
      const text = this.scene.add
        .text(0, 0, t.label, ts(12, C.muted, FONT.ui))
        .setOrigin(0.5)
        .setVisible(false);
      const zone = this.scene.add
        .zone(0, 0, 10, 10)
        .setOrigin(0.5)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.switchTab(t.id);
      });

      this.tabButtons.set(t.id, { bg, text, zone });
      this.contentContainer.add([bg, text, zone]);
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
      this.panelOpts.onToggleProfile?.(v);
    });
    list.push(...chkProfile);

    const chkClock = this.createCheckbox('Đồng hồ & Thời tiết (Clock / Weather)', this.uiState.clock, (v) => {
      this.uiState.clock = v;
      this.panelOpts.onToggleClock?.(v);
    });
    list.push(...chkClock);

    // Party & Chat
    const chkParty = this.createCheckbox('Danh sách đội hình (Party Pokemon)', this.uiState.party, (v) => {
      this.uiState.party = v;
      this.panelOpts.onToggleParty?.(v);
    });
    list.push(...chkParty);

    const chkChat = this.createCheckbox('Khung trò chuyện (Chat Box)', this.uiState.chat, (v) => {
      this.uiState.chat = v;
      this.panelOpts.onToggleChat?.(v);
    });
    list.push(...chkChat);

    // Minimap & Mini
    const chkMinimap = this.createCheckbox('Bản đồ thu nhỏ (Minimap / GPS)', this.uiState.minimap, (v) => {
      this.uiState.minimap = v;
      this.panelOpts.onToggleMinimap?.(v);
    });
    list.push(...chkMinimap);

    const chkMini = this.createCheckbox('Giao diện tối giản (Chế độ Mini HUD)', this.uiState.miniMode, (v) => {
      this.uiState.miniMode = v;
      this.panelOpts.onToggleMiniMode?.(v);
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
      .text(0, 0, '100%', ts(12, '#00cec9', FONT.ui))
      .setOrigin(0.5)
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(this.uiZoomValText);

    const btnUiZOut = this.createSmallButton('－', () => {
      this.panelOpts.onUiZoomOut?.();
      this.updateZoomLabels();
    });
    const btnUiZIn = this.createSmallButton('＋', () => {
      this.panelOpts.onUiZoomIn?.();
      this.updateZoomLabels();
    });
    const btnUiZReset = this.createSmallButton('100%', () => {
      this.panelOpts.onUiZoomReset?.();
      this.updateZoomLabels();
    });
    list.push(...btnUiZOut, ...btnUiZIn, ...btnUiZReset);

    // Game Zoom
    const lblGameZoom = this.scene.add
      .text(0, 0, 'Thu phóng Thế giới game:', ts(12, C.text, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblGameZoom);

    this.gameZoomValText = this.scene.add
      .text(0, 0, '1.0x', ts(12, '#00cec9', FONT.ui))
      .setOrigin(0.5)
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(this.gameZoomValText);

    const btnGameZOut = this.createSmallButton('－', () => {
      this.panelOpts.onGameZoomOut?.();
      this.updateZoomLabels();
    });
    const btnGameZIn = this.createSmallButton('＋', () => {
      this.panelOpts.onGameZoomIn?.();
      this.updateZoomLabels();
    });
    const btnGameZReset = this.createSmallButton('1.0x', () => {
      this.panelOpts.onGameZoomReset?.();
      this.updateZoomLabels();
    });
    list.push(...btnGameZOut, ...btnGameZIn, ...btnGameZReset);
  }

  // ── Tab 2: Lối chơi ────────────────────────────────────────────────────────
  private buildGameplayTab(): void {
    const list = this.tabObjects.get('gameplay')!;

    const lblSec = this.scene.add
      .text(0, 0, 'THIẾT LẬP HIỂN THỊ THẾ GIỚI & ĐIỀU KHIỂN:', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec);

    const chkNames = this.createCheckbox('Hiện tên người chơi khác (Player Names)', this.gameplayState.showPlayerNames, (v) => {
      this.gameplayState.showPlayerNames = v;
      this.panelOpts.onTogglePlayerNames?.(v);
    });
    list.push(...chkNames);

    const chkTarget = this.createCheckbox('Hiệu ứng đích đến khi nhấp di chuyển (Target Marker)', this.gameplayState.targetMarker, (v) => {
      this.gameplayState.targetMarker = v;
      this.panelOpts.onToggleTargetMarker?.(v);
    });
    list.push(...chkTarget);

    const chkGrid = this.createCheckbox('Hiện lưới toạ độ thế giới (Grid Overlay)', this.gameplayState.showGrid, (v) => {
      this.gameplayState.showGrid = v;
      this.panelOpts.onToggleGrid?.(v);
    });
    list.push(...chkGrid);

    const chkRun = this.createCheckbox('Mặc định luôn chạy (Auto-run)', this.gameplayState.autoRun, (v) => {
      this.gameplayState.autoRun = v;
      this.panelOpts.onToggleAutoRun?.(v);
    });
    list.push(...chkRun);

    // Tuỳ chọn Cơ chế di chuyển
    const lblMove = this.scene.add
      .text(0, 0, 'CƠ CHẾ DI CHUYỂN BẰNG CHUỘT / CẢM ỨNG (CLICK TO MOVE):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblMove);

    // Nút chọn Chuột trái (LMB)
    const bgL = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtL = this.scene.add
      .text(0, 0, '👈 Chuột trái / Touch (LMB) [Mặc định]', ts(11, C.text, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    const zoneL = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205).setScrollFactor(0).setVisible(false)
      .setInteractive({ useHandCursor: true });

    zoneL.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setMoveButton('left');
    });
    this.moveBtnLeft = { bg: bgL, txt: txtL, zone: zoneL };
    list.push(bgL, txtL, zoneL);

    // Nút chọn Chuột phải (RMB)
    const bgR = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtR = this.scene.add
      .text(0, 0, '👉 Chuột phải (RMB)', ts(11, C.text, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    const zoneR = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205).setScrollFactor(0).setVisible(false)
      .setInteractive({ useHandCursor: true });

    zoneR.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setMoveButton('right');
    });
    this.moveBtnRight = { bg: bgR, txt: txtR, zone: zoneR };
    list.push(bgR, txtR, zoneR);

    const hint = this.scene.add
      .text(0, 0, '• Di chuyển bằng bàn phím: Dùng 4 phím mũi tên hoặc W, A, S, D.\n• Giữ chuột giữa (MMB) hoặc Shift + Chuột trái để kéo di chuyển camera.', ts(11, C.muted, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(hint);
  }

  // ── Tab 3: Âm thanh ────────────────────────────────────────────────────────
  private buildAudioTab(): void {
    const list = this.tabObjects.get('audio')!;

    const lbl = this.scene.add
      .text(0, 0, 'CÀI ĐẶT ÂM LƯỢNG & HIỆU ỨNG ÂM THANH:', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lbl);

    const chkBgm = this.createCheckbox('Bật nhạc nền thế giới & trận đấu (BGM)', this.audioState.bgm, (v) => {
      this.audioState.bgm = v;
      this.panelOpts.onToggleBgm?.(v);
    });
    list.push(...chkBgm);

    const chkSfx = this.createCheckbox('Bật âm thanh chiêu thức & tương tác (SFX)', this.audioState.sfx, (v) => {
      this.audioState.sfx = v;
      this.panelOpts.onToggleSfx?.(v);
    });
    list.push(...chkSfx);

    const note = this.scene.add
      .text(0, 0, 'ℹ Hệ thống âm thanh đang được đồng bộ với máy chủ âm nhạc Pokemon.', ts(11, C.muted, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(note);
  }

  // ── Tab 4: Hệ thống ────────────────────────────────────────────────────────
  private buildSystemTab(): void {
    const list = this.tabObjects.get('system')!;

    const lblLang = this.scene.add
      .text(0, 0, 'NGÔN NGỮ HIỂN THỊ (LANGUAGE):', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblLang);

    // Nút Tiếng Việt
    const bgVi = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtVi = this.scene.add
      .text(0, 0, '🇻🇳 Tiếng Việt', ts(12, C.text, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    const zoneVi = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205).setScrollFactor(0).setVisible(false)
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
      .text(0, 0, '🇺🇸 English', ts(12, C.text, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    const zoneEn = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205).setScrollFactor(0).setVisible(false)
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
  }

  private setLanguage(lang: 'vi' | 'en'): void {
    this.systemState.lang = lang;
    try {
      localStorage.setItem('pixelmon.lang', lang);
    } catch {
      // ignore
    }
    this.panelOpts.onChangeLanguage?.(lang);
    this.relayout();
  }

  private setMoveButton(btn: 'left' | 'right'): void {
    this.gameplayState.moveButton = btn;
    try {
      localStorage.setItem('pixelmon.moveButton', btn);
    } catch {
      // ignore
    }
    this.panelOpts.onMoveButtonChange?.(btn);
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
      .setDepth(204)
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

  private updateZoomLabels(): void {
    const uiZ = this._uiZoomManager?.userZoom ?? 1;
    if (this.uiZoomValText) {
      this.uiZoomValText.setText(`${Math.round(uiZ * 100)}%`);
    }

    const gameZ = this.panelOpts.getGameZoom ? this.panelOpts.getGameZoom() : 1;
    if (this.gameZoomValText) {
      this.gameZoomValText.setText(`${gameZ.toFixed(1)}x`);
    }
  }

  show(): void {
    super.show();
    this.updateZoomLabels();
    this.tabButtons.forEach(({ bg, text, zone }) => {
      bg.setVisible(true);
      text.setVisible(true);
      zone.setVisible(true);
    });
  }

  public relayout(): void {
    if (!this.open) return;
    super.relayout();

    // Tab buttons layout trong contentContainer
    const tabY = 10;
    const tabW = Math.floor((MODAL_W - 32) / 4);
    const tabH = 30;
    let curTabX = 16;

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
    const contentX = 20;
    const contentY = 52;
    const contentW = MODAL_W - 40;

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

    // Row UI Zoom
    const lblUiZ = list[26] as Phaser.GameObjects.Text;
    lblUiZ.setPosition(x, curY);

    this.positionButton(list[28], list[29], list[30], x + 240, curY + 6, 26, 20); // -
    const uiVal = list[27] as Phaser.GameObjects.Text;
    uiVal.setPosition(x + 285, curY + 6);
    this.positionButton(list[31], list[32], list[33], x + 330, curY + 6, 26, 20); // +
    this.positionButton(list[34], list[35], list[36], x + 380, curY + 6, 44, 20); // 100%

    curY += 32;

    // Row Game Zoom
    const lblGameZ = list[37] as Phaser.GameObjects.Text;
    lblGameZ.setPosition(x, curY);

    this.positionButton(list[39], list[40], list[41], x + 240, curY + 6, 26, 20); // -
    const gameVal = list[38] as Phaser.GameObjects.Text;
    gameVal.setPosition(x + 285, curY + 6);
    this.positionButton(list[42], list[43], list[44], x + 330, curY + 6, 26, 20); // +
    this.positionButton(list[45], list[46], list[47], x + 380, curY + 6, 44, 20); // 1.0x
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
}
