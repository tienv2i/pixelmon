import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';
import type { UiZoomManager } from './UiZoomManager';

export type SettingsTab = 'interface' | 'gameplay' | 'audio' | 'system' | 'debug';

/** Thông số bản đồ hiển thị trong tab Debug (lấy từ WorldScene). */
export interface DebugMapInfo {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
  layersCount: number;
  warpsCount: number;
  tilesetName: string;
}

/** Thông số nhân vật hiển thị trong tab Debug (lấy từ WorldScene). */
export interface DebugPlayerInfo {
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  direction: string;
  isMoving: boolean;
  speed: number;
  fps: number;
  camX: number;
  camY: number;
  zoom: number;
}

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
  onToggleScrollToZoom?: (enabled: boolean) => void;
  onMoveButtonChange?: (button: 'left' | 'right') => void;

  // Audio & System
  onToggleBgm?: (enabled: boolean) => void;
  onToggleSfx?: (enabled: boolean) => void;
  onChangeLanguage?: (lang: 'vi' | 'en') => void;
  onLogout?: () => void;
  onClose?: () => void;

  // ── Tab Debug (chỉ hiện khi role >= moderator) ──
  /** true nếu user đủ quyền xem tab Debug. */
  canAccessDebug?: boolean;
  /** Bật/tắt thanh công cụ Debug trên TopMenu. */
  onToggleDebugToolbar?: (visible: boolean) => void;
  /**
   * Bật/tắt lưới toạ độ — DÙNG CHUNG với `onToggleGrid` ở tab Gameplay,
   * vì cả hai chỉ là 2 lối vào của cùng một overlay. WorldScene sẽ đồng bộ
   * ngược lại checkbox của cả 2 tab qua `setCheckbox` / `setDebugCheckbox`.
   */
  onToggleCoordTracking?: (enabled: boolean) => void;
  /** Callback debug còn lại (teleport, đổi map, tốc độ, lệnh CLI). */
  onDebugTeleport?: (x: number, y: number) => void;
  onDebugSwitchMap?: (mapId: string, x?: number, y?: number) => void;
  onDebugSetSpeed?: (multiplier: number) => void;
  onDebugRunCommand?: (cmd: string) => string;
}

const MODAL_W = 540;
// 580 = đủ chứa tab Debug (nội dung dài nhất) + lề dưới cho ô gõ lệnh CLI.
// KHÔNG tăng thêm — modal đang scale theo UI Zoom (~143%), vượt 580 là tràn
// khỏi đáy màn hình.
const MODAL_H = 580;

/**
 * SettingsPanel — Modal Cài đặt đa tab lớn, phân vùng rõ ràng:
 * - Kế thừa từ `UiModal`, chuẩn hoá phong cách và hành vi với toàn hệ thống pop-up.
 * - Khóa hoàn toàn UI và gameplay bên dưới (`lockUi: true`, depth 200).
 * - Nút Reset Settings (↺) trên header bar giúp khôi phục toàn bộ cài đặt gốc.
 * - Hỗ trợ đầy đủ: nút thu nhỏ (－), nút neo (⚓), nút tắt (✕), kéo thả Header.
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
    scrollToZoom: false,
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

  // Trạng thái tab Debug (chỉ dùng khi có quyền)
  private debugState = {
    toolbar: true,
    grid: false,
    tracking: false,
  };

  /** true nếu tab Debug được phép hiển thị (role >= moderator). */
  private canAccessDebug = false;

  // Text fields hiển thị thông số động trong tab Debug
  private txtMapName?: Phaser.GameObjects.Text;
  private txtMapSize?: Phaser.GameObjects.Text;
  private txtMapDetails?: Phaser.GameObjects.Text;
  private txtPlayerPixel?: Phaser.GameObjects.Text;
  private txtPlayerTile?: Phaser.GameObjects.Text;
  private txtPlayerState?: Phaser.GameObjects.Text;
  private txtPerfState?: Phaser.GameObjects.Text;
  private txtLogOutput?: Phaser.GameObjects.Text;
  private currentSpeedMult = 1;
  private commandInputEl: HTMLInputElement | null = null;
  /** Vị trí khung log trong `contentContainer` — dùng để đặt ô gõ lệnh CLI. */
  private logBoxLayout?: { x: number; y: number; w: number; h: number };

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
  private checkboxSetters: Map<string, (val: boolean) => void> = new Map();

  constructor(scene: Phaser.Scene, opts: SettingsPanelOptions) {
    super(scene, {
      title: '⚙ BẢNG CÀI ĐẶT HỆ THỐNG',
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: 36,
      lockUi: true,
      depth: 200,
      showClose: true,
      showMinimize: false,
      showDock: true,
      showSecondaryClose: false,
      customHeaderButtons: [
        {
          id: 'reset',
          icon: '↺',
          tooltip: 'Khôi phục cài đặt gốc (Reset Settings)',
          color: '#ffeaa7',
          onClick: () => this.resetAllSettings(),
        },
      ],
      defaultAlign: 'center',
      onClose: () => {
        opts.onClose?.();
      },
    });

    this.panelOpts = opts;
    this.canAccessDebug = opts.canAccessDebug === true;

    // Load ngôn ngữ, cơ chế di chuyển, scroll to zoom và tuỳ chọn debug đã lưu
    try {
      const savedLang = localStorage.getItem('pixelmon.lang');
      if (savedLang === 'vi' || savedLang === 'en') {
        this.systemState.lang = savedLang;
      }
      const savedMoveBtn = localStorage.getItem('pixelmon.moveButton');
      if (savedMoveBtn === 'left' || savedMoveBtn === 'right') {
        this.gameplayState.moveButton = savedMoveBtn;
      }
      const savedScroll = localStorage.getItem('pixelmon.scrollToZoom');
      if (savedScroll === 'true') {
        this.gameplayState.scrollToZoom = true;
      }
      this.debugState.toolbar = localStorage.getItem('pixelmon.debugToolbar') !== 'false';
      this.debugState.grid = localStorage.getItem('pixelmon.debugGrid') === 'true';
      this.debugState.tracking = localStorage.getItem('pixelmon.debugTracking') === 'true';
      // Grid overlay là MỘT tính năng dùng chung cho Gameplay & Debug →
      // 2 tab phải khởi tạo từ cùng 1 nguồn để không lệch trạng thái.
      this.gameplayState.showGrid = this.debugState.grid;
    } catch {
      // ignore
    }

    this.tabObjects.set('interface', []);
    this.tabObjects.set('gameplay', []);
    this.tabObjects.set('audio', []);
    this.tabObjects.set('system', []);
    if (this.canAccessDebug) {
      this.tabObjects.set('debug', []);
    }

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
    if (this.canAccessDebug) {
      this.buildDebugTab();
    }

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
    // Tab Debug chỉ xuất hiện khi tài khoản có quyền moderator trở lên.
    if (this.canAccessDebug) {
      tabs.push({ id: 'debug', label: '🛠 Debug' });
    }

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
    }, 'profile');
    list.push(...chkProfile);

    const chkClock = this.createCheckbox('Đồng hồ & Thời tiết (Clock / Weather)', this.uiState.clock, (v) => {
      this.uiState.clock = v;
      this.panelOpts.onToggleClock?.(v);
    }, 'clock');
    list.push(...chkClock);

    // Party & Chat
    const chkParty = this.createCheckbox('Danh sách đội hình (Party Pokemon)', this.uiState.party, (v) => {
      this.uiState.party = v;
      this.panelOpts.onToggleParty?.(v);
    }, 'party');
    list.push(...chkParty);

    const chkChat = this.createCheckbox('Khung trò chuyện (Chat Box)', this.uiState.chat, (v) => {
      this.uiState.chat = v;
      this.panelOpts.onToggleChat?.(v);
    }, 'chat');
    list.push(...chkChat);

    // Minimap & Mini
    const chkMinimap = this.createCheckbox('Bản đồ thu nhỏ (Minimap / GPS)', this.uiState.minimap, (v) => {
      this.uiState.minimap = v;
      this.panelOpts.onToggleMinimap?.(v);
    }, 'minimap');
    list.push(...chkMinimap);

    const chkMini = this.createCheckbox('Giao diện tối giản (Chế độ Mini HUD)', this.uiState.miniMode, (v) => {
      this.uiState.miniMode = v;
      this.panelOpts.onToggleMiniMode?.(v);
    }, 'miniMode');
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
    }, 'showPlayerNames');
    list.push(...chkNames);

    const chkTarget = this.createCheckbox('Hiệu ứng đích đến khi nhấp di chuyển (Target Marker)', this.gameplayState.targetMarker, (v) => {
      this.gameplayState.targetMarker = v;
      this.panelOpts.onToggleTargetMarker?.(v);
    }, 'targetMarker');
    list.push(...chkTarget);

    const chkGrid = this.createCheckbox('Hiện lưới toạ độ thế giới (Grid Overlay)', this.gameplayState.showGrid, (v) => {
      this.setGridShared(v);
    }, 'showGrid');
    list.push(...chkGrid);

    const chkRun = this.createCheckbox('Mặc định luôn chạy (Auto-run)', this.gameplayState.autoRun, (v) => {
      this.gameplayState.autoRun = v;
      this.panelOpts.onToggleAutoRun?.(v);
    }, 'autoRun');
    list.push(...chkRun);

    const chkScrollZoom = this.createCheckbox('Cuộn chuột để thu phóng (Scroll to zoom)', this.gameplayState.scrollToZoom, (v) => {
      this.setScrollToZoom(v);
    }, 'scrollToZoom');
    list.push(...chkScrollZoom);

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
    }, 'bgm');
    list.push(...chkBgm);

    const chkSfx = this.createCheckbox('Bật âm thanh chiêu thức & tương tác (SFX)', this.audioState.sfx, (v) => {
      this.audioState.sfx = v;
      this.panelOpts.onToggleSfx?.(v);
    }, 'sfx');
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

  // ── Tab 5: Debug (chỉ hiển thị khi role >= moderator) ─────────────────────
  /**
   * Port toàn bộ nội dung của DebugModal cũ (Map Info, Toạ độ, Teleport,
   * Tốc độ, Console CLI) vào đây, cộng thêm 3 tuỳ chọn công cụ debug
   * — thanh công cụ, lưới toạ độ và bộ theo dõi toạ độ.
   */
  private buildDebugTab(): void {
    const list = this.tabObjects.get('debug')!;
    if (!list) return;

    // ── A. Tuỳ chọn công cụ debug ──
    const lblTools = this.scene.add
      .text(0, 0, 'CÔNG CỤ HIỂN THỊ CHO KIỂM THỬ HỆ THỐNG MAP & DI CHUYỂN:', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblTools);

    const chkToolbar = this.createCheckbox(
      'Hiện thanh công cụ Debug trên Menu (Debug Toolbar)',
      this.debugState.toolbar,
      (v) => {
        this.debugState.toolbar = v;
        this.saveDebugPref('pixelmon.debugToolbar', v);
        this.panelOpts.onToggleDebugToolbar?.(v);
      },
      'debugToolbar',
    );
    list.push(...chkToolbar);

    const chkGrid = this.createCheckbox(
      'Lưới toạ độ ô (Grid Overlay)',
      this.debugState.grid,
      (v) => this.setGridShared(v),
      'debugGrid',
    );
    list.push(...chkGrid);

    const chkTrack = this.createCheckbox(
      'Theo dõi toạ độ nhân vật (Coordinate Tracking)',
      this.debugState.tracking,
      (v) => {
        this.debugState.tracking = v;
        this.saveDebugPref('pixelmon.debugTracking', v);
        this.panelOpts.onToggleCoordTracking?.(v);
      },
      'debugTracking',
    );
    list.push(...chkTrack);

    // ── B. Khối Thông Tin Bản Đồ ──
    const gfxMapBox = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    gfxMapBox.fillStyle(0x13152c, 0.9);
    gfxMapBox.lineStyle(1, 0x2e3358, 0.8);
    list.push(gfxMapBox);

    const lblMapHeader = this.scene.add
      .text(0, 0, '🗺 THÔNG TIN BẢN ĐỒ (MAP INFO):', ts(11, '#00cec9', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblMapHeader);

    this.txtMapName = this.scene.add.text(0, 0, 'Map: --', ts(11, '#ffffff', FONT.mono)).setOrigin(0, 0)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    this.txtMapSize = this.scene.add.text(0, 0, 'Kích thước: --', ts(11, '#9aa0c3', FONT.mono)).setOrigin(0, 0)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    this.txtMapDetails = this.scene.add.text(0, 0, 'Chi tiết: --', ts(11, '#9aa0c3', FONT.mono)).setOrigin(0, 0)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    list.push(this.txtMapName, this.txtMapSize, this.txtMapDetails);

    // ── C. Khối Toạ Độ & Trạng Thái Nhân Vật ──
    const gfxPlayerBox = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    gfxPlayerBox.fillStyle(0x13152c, 0.9);
    gfxPlayerBox.lineStyle(1, 0x2e3358, 0.8);
    list.push(gfxPlayerBox);

    const lblPlayerHeader = this.scene.add
      .text(0, 0, '📍 TOẠ ĐỘ & NHÂN VẬT (COORDINATES):', ts(11, '#fdcb6e', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblPlayerHeader);

    this.txtPlayerPixel = this.scene.add.text(0, 0, 'Toạ độ Pixel: X=--, Y=--', ts(11, '#00cec9', FONT.mono))
      .setOrigin(0, 0).setDepth(204).setScrollFactor(0).setVisible(false);
    this.txtPlayerTile = this.scene.add.text(0, 0, 'Toạ độ Ô Tile: [X=--, Y=--]', ts(11, '#ffffff', FONT.mono))
      .setOrigin(0, 0).setDepth(204).setScrollFactor(0).setVisible(false);
    this.txtPlayerState = this.scene.add.text(0, 0, 'Hướng: -- | Trạng thái: --', ts(11, '#9aa0c3', FONT.mono))
      .setOrigin(0, 0).setDepth(204).setScrollFactor(0).setVisible(false);
    this.txtPerfState = this.scene.add
      .text(0, 0, 'FPS: -- | Camera: (0, 0) | Zoom: 1.0x', ts(10, '#636e72', FONT.mono))
      .setOrigin(0, 0).setDepth(204).setScrollFactor(0).setVisible(false);
    list.push(this.txtPlayerPixel, this.txtPlayerTile, this.txtPlayerState, this.txtPerfState);

    // ── D. Chuyển Nhanh Map (Teleport Presets) ──
    const lblTp = this.scene.add
      .text(0, 0, '🚀 CHUYỂN BẢN ĐỒ NHANH (QUICK TELEPORT):', ts(11, '#6c5ce7', FONT.ui))
      .setOrigin(0, 0).setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblTp);

    const maps = [
      { id: 'lappet-town', label: 'Lappet Town', x: 256, y: 256 },
      { id: 'players-house', label: 'Nhà Player', x: 96, y: 256 },
      { id: 'pokemon-lab', label: 'Pokémon Lab', x: 192, y: 384 },
      { id: 'route-1', label: 'Route 1', x: 416, y: 704 },
      { id: 'daisys-house', label: 'Nhà Daisy', x: 160, y: 224 },
    ];
    maps.forEach((m) => {
      list.push(
        ...this.createDebugButton(m.label, 0x2e3358, () => {
          this.logDebug(`Teleport tới ${m.label} (${m.x}, ${m.y})...`);
          this.panelOpts.onDebugSwitchMap?.(m.id, m.x, m.y);
        }),
      );
    });

    // ── E. Tốc độ di chuyển ──
    const lblSpeed = this.scene.add
      .text(0, 0, '⚡ TỐC ĐỘ DI CHUYỂN:', ts(11, '#00b894', FONT.ui))
      .setOrigin(0, 0).setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSpeed);

    [1, 2, 3, 5].forEach((mult) => {
      list.push(
        ...this.createDebugButton(
          `${mult}x`,
          mult === 1 ? 0x00cec9 : 0x2e3358,
          () => {
            this.currentSpeedMult = mult;
            this.panelOpts.onDebugSetSpeed?.(mult);
            this.logDebug(`Tốc độ di chuyển nhân vật: ${mult}x`);
          },
        ),
      );
    });

    // ── F. Console CLI ──
    const lblCli = this.scene.add
      .text(0, 0, '💻 LỆNH DEBUG CONSOLE (/tp, /speed, /pos, /help):', ts(11, '#e8eaf6', FONT.ui))
      .setOrigin(0, 0).setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblCli);

    list.push(
      ...this.createDebugButton('⌨ Nhập lệnh CLI...', 0x00cec9, () => this.openCommandInput(), 0x0f1020),
      ...this.createDebugButton('📋 Sao chép toạ độ', 0x2e3358, () => {
        const text = `${this.txtPlayerPixel?.text ?? ''} | ${this.txtPlayerTile?.text ?? ''}`;
        navigator.clipboard?.writeText(text).then(() => this.logDebug('Đã sao chép toạ độ vào Clipboard!'));
      }),
      ...this.createDebugButton('🗑 Xoá log', 0x2e3358, () => {
        this.txtLogOutput?.setText('[Sẵn sàng nhận lệnh debug]');
      }),
    );

    // Khung log output
    const gfxLogBox = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    gfxLogBox.fillStyle(0x0a0c16, 0.95);
    gfxLogBox.lineStyle(1, 0x1f233f, 1);
    list.push(gfxLogBox);

    this.txtLogOutput = this.scene.add
      .text(0, 0, '[Sẵn sàng nhận lệnh debug (/tp, /speed, /help)]', {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#a29bfe',
        wordWrap: { width: MODAL_W - 56 },
      })
      .setOrigin(0, 0)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    list.push(this.txtLogOutput);
  }

  /**
   * Bật/tắt lưới toạ độ — dùng chung cho tab Gameplay và tab Debug
   * (cả 2 chỉ là 2 lối vào của cùng một overlay trên WorldScene).
   */
  private setGridShared(v: boolean): void {
    this.gameplayState.showGrid = v;
    this.debugState.grid = v;
    this.saveDebugPref('pixelmon.debugGrid', v);
    this.panelOpts.onToggleGrid?.(v);
    // Đồng bộ checkbox của cả 2 tab.
    this.checkboxSetters.get('showGrid')?.(v);
    this.checkboxSetters.get('debugGrid')?.(v);
  }

  private saveDebugPref(key: string, val: boolean): void {
    try {
      localStorage.setItem(key, val ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  private logDebug(msg: string): void {
    const time = new Date().toLocaleTimeString('vi-VN');
    this.txtLogOutput?.setText(`[${time}] ${msg}`);
  }

  /** Nút bấm trong tab Debug — dùng chung style với nút của DebugModal cũ. */
  private createDebugButton(
    label: string,
    bgColor: number,
    onClick: () => void,
    textColor = 0xffffff,
  ): Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> {
    const w = Math.max(60, Math.ceil(label.length * 7) + 16);
    const h = 24;

    const bg = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txt = this.scene.add
      .text(0, 0, label, {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: textColor === 0xffffff ? '#ffffff' : '#0f1020',
      })
      .setOrigin(0.5)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    const zone = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205).setScrollFactor(0).setVisible(false)
      .setInteractive({ useHandCursor: true });

    let hover = false;
    let bx = 0;
    let by = 0;
    const draw = () => {
      bg.clear();
      bg.fillStyle(hover ? 0x6c5ce7 : bgColor, 0.95);
      bg.fillRoundedRect(bx, by, w, h, 4);
      bg.lineStyle(1, hover ? 0xa29bfe : 0x3d447a, 1);
      bg.strokeRoundedRect(bx, by, w, h, 4);
    };

    zone.on('pointerover', () => {
      hover = true;
      draw();
    });
    zone.on('pointerout', () => {
      hover = false;
      draw();
    });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      onClick();
    });

    // Layout callback — đặt lại toạ độ và vẽ lại (color/hover giữ nguyên).
    (zone as any)._dbgLayout = (nx: number, ny: number) => {
      bx = nx;
      by = ny;
      draw();
      txt.setPosition(nx + w / 2, ny + h / 2);
      zone.setPosition(nx + w / 2, ny + h / 2).setSize(w, h);
    };
    (zone as any)._dbgSize = { w, h };
    return [bg, txt, zone];
  }

  /** Đặt toạ độ 1 nút của tab Debug (do `createDebugButton` tạo). */
  private positionDebugButton(
    bgObj: unknown,
    txtObj: unknown,
    zoneObj: unknown,
    x: number,
    y: number,
  ): void {
    const zone = zoneObj as { _dbgLayout?: (x: number, y: number) => void };
    if (zone?._dbgLayout) {
      zone._dbgLayout(x, y);
      return;
    }
    // Fallback (không có layout fn) — chỉ đặt toạ độ.
    (bgObj as any)?.position?.(x, y);
    (txtObj as any)?.setPosition?.(x, y);
    (zoneObj as any)?.setPosition?.(x, y);
  }

  /** Chiều rộng của nút debug do `createDebugButton` tạo. */
  private debugButtonWidth(zoneObj: unknown): number {
    return (zoneObj as any)?._dbgSize?.w ?? 76;
  }

  /** Cập nhật thông số Debug thời gian thực (gọi từ WorldScene.update). */
  public updateDebugInfo(mapInfo: DebugMapInfo, playerInfo: DebugPlayerInfo): void {
    this.txtMapName?.setText(`Map: ${mapInfo.name} (${mapInfo.id})`);
    this.txtMapSize?.setText(
      `Kích thước: ${mapInfo.widthTiles}×${mapInfo.heightTiles} ô (${mapInfo.widthPx}×${mapInfo.heightPx} px)`,
    );
    this.txtMapDetails?.setText(
      `Tileset: ${mapInfo.tilesetName} | Layers: ${mapInfo.layersCount} | Warps: ${mapInfo.warpsCount}`,
    );

    this.txtPlayerPixel?.setText(
      `Toạ độ Pixel: X=${playerInfo.x.toFixed(1)} px, Y=${playerInfo.y.toFixed(1)} px`,
    );
    this.txtPlayerTile?.setText(`Toạ độ Ô Tile: [X: ${playerInfo.tileX}, Y: ${playerInfo.tileY}]`);
    this.txtPlayerState?.setText(
      `Hướng: ${playerInfo.direction.toUpperCase()} | Trạng thái: ${
        playerInfo.isMoving ? 'ĐANG DI CHUYỂN' : 'ĐỨNG YÊN'
      } | Speed: ${this.currentSpeedMult}x`,
    );
    this.txtPerfState?.setText(
      `FPS: ${playerInfo.fps} | Camera: (${playerInfo.camX}, ${playerInfo.camY}) | Zoom: ${playerInfo.zoom.toFixed(2)}x`,
    );
  }

  /** Ghi một dòng vào khung log của tab Debug. */
  public log(msg: string): void {
    this.logDebug(msg);
  }

  /** Mở Settings và nhảy thẳng sang tab Debug (dùng cho phím tắt F3/F2). */
  public openDebugTab(): void {
    if (!this.canAccessDebug) return;
    this.activeTab = 'debug';
    this.show();
  }

  /** Trạng thái các công cụ debug hiện tại — WorldScene đọc để đồng bộ UI. */
  public getDebugState(): { toolbar: boolean; grid: boolean; tracking: boolean } {
    return { ...this.debugState };
  }

  /** Tab đang hiển thị (dùng để biết có nên đẩy thông số realtime hay không). */
  public getActiveTab(): SettingsTab {
    return this.activeTab;
  }

  /** Đồng bộ checkbox debug từ bên ngoài. */
  public setDebugCheckbox(key: 'toolbar' | 'grid' | 'tracking', checked: boolean): void {
    this.debugState[key] = checked;
    const idKey = key === 'toolbar' ? 'debugToolbar' : key === 'grid' ? 'debugGrid' : 'debugTracking';
    this.checkboxSetters.get(idKey)?.(checked);
  }

  /** Mở ô gõ lệnh CLI (HTML input nổi phía dưới tab Debug). */
  private openCommandInput(): void {
    if (this.commandInputEl) {
      this.removeCommandInput();
      return;
    }
    if (!this.open) return;

    const { actualW, actualH } = this.getScaleAndBounds();
    const X = this.currentX;
    const Y = this.currentY;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Gõ lệnh debug: /tp 256 256 | /speed 2 | /pos | /help';
    input.style.cssText = `
      position:absolute; padding:6px 10px; font-size:12px; font-family:monospace;
      border:1px solid #00cec9; background:#0f1020; color:#55efc4;
      border-radius:4px; outline:none; z-index:1005; box-shadow: 0 4px 16px rgba(0,0,0,0.8);
    `;

    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;
    const inputH = 30;

    // Toạ độ tuyệt đối của khung log qua world-transform của modal container.
    // CHỈ dùng `contentContainer.x/y + lb.y` là sai vì modal đang được scale
    // theo UI Zoom (vd. 150%) → input nhảy ra giữa panel.
    let inputX = X;
    let inputW = actualW;
    let inputY = Y + actualH + 4;

    const lb = this.logBoxLayout;
    if (lb) {
      const m = this.modalContainer.getWorldTransformMatrix();
      const p = m.transformPoint(
        this.contentContainer.x + lb.x,
        this.contentContainer.y + lb.y + lb.h + 6,
      );
      inputX = p.x;
      inputY = p.y;
      inputW = lb.w * m.a;
    } else {
      // Không có khung log (chưa vào tab Debug) → đặt sát đáy panel.
      inputY = Y + actualH + 4;
    }

    // Tràn quá dưới đáy canvas → đưa lên TRÊN khung log (vẫn nằm trong modal)
    if (lb && inputY + inputH > this.scene.scale.height - 4) {
      const m = this.modalContainer.getWorldTransformMatrix();
      const p = m.transformPoint(
        this.contentContainer.x + lb.x,
        this.contentContainer.y + lb.y - 6,
      );
      inputY = p.y - inputH;
    } else if (inputY + inputH > this.scene.scale.height - 4) {
      inputY = Math.max(4, Y - inputH - 4);
    }
    if (inputY < 4) inputY = 4;
    if (inputX + inputW > this.scene.scale.width - 4) inputW = this.scene.scale.width - 4 - inputX;

    input.style.left = `${rect.left + inputX * scaleX}px`;
    input.style.top = `${rect.top + inputY * scaleY}px`;
    input.style.width = `${inputW * scaleX}px`;
    input.style.height = `${inputH * scaleY}px`;

    document.body.appendChild(input);
    input.focus();
    this.commandInputEl = input;

    const submit = () => {
      const cmd = input.value.trim();
      if (cmd) this.executeDebugCommand(cmd);
      this.removeCommandInput();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') this.removeCommandInput();
      e.stopPropagation();
    });
  }

  private executeDebugCommand(cmd: string): void {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();

    if (command === '/tp') {
      if (parts.length === 2) {
        this.logDebug(`Đang chuyển tới map: ${parts[1]}`);
        this.panelOpts.onDebugSwitchMap?.(parts[1]);
      } else if (parts.length >= 3) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        if (!isNaN(x) && !isNaN(y)) {
          this.logDebug(`Teleport tới: (${x}, ${y})`);
          this.panelOpts.onDebugTeleport?.(x, y);
        } else {
          this.logDebug(`Lỗi: Toạ độ không hợp lệ: ${parts[1]}, ${parts[2]}`);
        }
      } else {
        this.logDebug('Cú pháp: /tp <x> <y> hoặc /tp <mapId>');
      }
    } else if (command === '/speed') {
      const mult = parseFloat(parts[1]);
      if (!isNaN(mult) && mult > 0) {
        this.currentSpeedMult = mult;
        this.panelOpts.onDebugSetSpeed?.(mult);
        this.logDebug(`Đã đổi tốc độ sang: ${mult}x`);
      } else {
        this.logDebug('Cú pháp: /speed <hệ số> (ví dụ: /speed 2)');
      }
    } else if (command === '/pos') {
      this.logDebug(`${this.txtPlayerPixel?.text ?? ''} | ${this.txtPlayerTile?.text ?? ''}`);
    } else if (command === '/help') {
      this.logDebug('Lệnh có sẵn: /tp <x> <y>, /tp <mapId>, /speed <hệ_số>, /pos, /clear');
    } else if (command === '/clear') {
      this.txtLogOutput?.setText('[Sẵn sàng nhận lệnh debug]');
    } else if (this.panelOpts.onDebugRunCommand) {
      this.logDebug(this.panelOpts.onDebugRunCommand(cmd));
    } else {
      this.logDebug(`Lệnh không nhận diện: "${cmd}". Gõ /help để xem hướng dẫn.`);
    }
  }

  private removeCommandInput(): void {
    if (this.commandInputEl) {
      this.commandInputEl.remove();
      this.commandInputEl = null;
    }
  }

  override destroy(): void {
    this.removeCommandInput();
    super.destroy();
  }

  public setScrollToZoom(enabled: boolean): void {
    this.gameplayState.scrollToZoom = enabled;
    try {
      localStorage.setItem('pixelmon.scrollToZoom', enabled ? 'true' : 'false');
    } catch {
      // ignore
    }
    this.checkboxSetters.get('scrollToZoom')?.(enabled);
    this.panelOpts.onToggleScrollToZoom?.(enabled);
  }

  /** Cập nhật trạng thái checkbox HUD từ bên ngoài (khi đóng/mở panel qua nút tắt hoặc phím tắt). */
  public setHudCheckbox(key: 'profile' | 'clock' | 'party' | 'chat' | 'minimap' | 'miniMode', checked: boolean): void {
    this.uiState[key] = checked;
    this.checkboxSetters.get(key)?.(checked);
  }

  public resetAllSettings(): void {
    // 1. Reset UI Zoom & Game Zoom
    this.panelOpts.onUiZoomReset?.();
    this.panelOpts.onGameZoomReset?.();

    // 2. Reset Move button về mặc định 'left'
    this.setMoveButton('left');

    // 3. Reset Scroll to zoom về mặc định false
    this.setScrollToZoom(false);

    // 4. Reset Ngôn ngữ về 'vi'
    this.setLanguage('vi');

    // 5. Reset UI toggles
    this.uiState.profile = true;
    this.checkboxSetters.get('profile')?.(true);
    this.panelOpts.onToggleProfile?.(true);

    this.uiState.clock = true;
    this.checkboxSetters.get('clock')?.(true);
    this.panelOpts.onToggleClock?.(true);

    this.uiState.party = true;
    this.checkboxSetters.get('party')?.(true);
    this.panelOpts.onToggleParty?.(true);

    this.uiState.chat = true;
    this.checkboxSetters.get('chat')?.(true);
    this.panelOpts.onToggleChat?.(true);

    this.uiState.minimap = false;
    this.checkboxSetters.get('minimap')?.(false);
    this.panelOpts.onToggleMinimap?.(false);

    this.uiState.miniMode = false;
    this.checkboxSetters.get('miniMode')?.(false);
    this.panelOpts.onToggleMiniMode?.(false);

    // 6. Reset Gameplay toggles
    this.gameplayState.showPlayerNames = true;
    this.checkboxSetters.get('showPlayerNames')?.(true);
    this.panelOpts.onTogglePlayerNames?.(true);

    this.gameplayState.targetMarker = true;
    this.checkboxSetters.get('targetMarker')?.(true);
    this.panelOpts.onToggleTargetMarker?.(true);

    this.gameplayState.showGrid = false;
    this.checkboxSetters.get('showGrid')?.(false);
    this.panelOpts.onToggleGrid?.(false);

    this.gameplayState.autoRun = false;
    this.checkboxSetters.get('autoRun')?.(false);
    this.panelOpts.onToggleAutoRun?.(false);

    // 7. Reset Audio
    this.audioState.bgm = true;
    this.checkboxSetters.get('bgm')?.(true);
    this.panelOpts.onToggleBgm?.(true);

    this.audioState.sfx = true;
    this.checkboxSetters.get('sfx')?.(true);
    this.panelOpts.onToggleSfx?.(true);

    // 8. Reset công cụ Debug (chỉ khi tab Debug đang có quyền truy cập)
    if (this.canAccessDebug) {
      const dbgDefaults = { toolbar: true, grid: false, tracking: false };
      (['toolbar', 'grid', 'tracking'] as const).forEach((k) => {
        const v = dbgDefaults[k];
        this.debugState[k] = v;
        this.setDebugCheckbox(k, v);
        this.saveDebugPref(
          k === 'toolbar' ? 'pixelmon.debugToolbar' : k === 'grid' ? 'pixelmon.debugGrid' : 'pixelmon.debugTracking',
          v,
        );
      });
      this.panelOpts.onToggleDebugToolbar?.(true);
      this.panelOpts.onToggleGrid?.(false);
      this.panelOpts.onToggleCoordTracking?.(false);
    }

    this.updateZoomLabels();
    this.relayout();
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
    idKey?: string,
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
    const setVal = (v: boolean) => {
      checked = v;
      checkText.setText(v ? '✔' : '');
    };
    if (idKey) {
      this.checkboxSetters.set(idKey, setVal);
    }

    const toggle = () => {
      setVal(!checked);
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
    const tabW = Math.floor((MODAL_W - 32) / this.visibleTabKeys().length);
    const tabH = 30;
    let curTabX = 16;

    const tabKeys = this.visibleTabKeys();
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
      case 'debug':
        this.layoutDebugTab(contentX, contentY, contentW);
        break;
    }
  }

  /** Danh sách tab được hiển thị — tab Debug chỉ có khi user đủ quyền. */
  private visibleTabKeys(): SettingsTab[] {
    const base: SettingsTab[] = ['interface', 'gameplay', 'audio', 'system'];
    return this.canAccessDebug ? [...base, 'debug'] : base;
  }

  private layoutDebugTab(x: number, y: number, w: number): void {
    const list = this.tabObjects.get('debug')!;
    let curY = y;

    // ── A. 3 checkbox công cụ debug ──
    const lblTools = list[0] as Phaser.GameObjects.Text;
    lblTools.setPosition(x, curY);
    curY += 22;

    // Mỗi checkbox = 4 object (boxGfx, checkText, labelText, hitZone)
    this.positionCheckbox(list, 1, x, curY, w);
    curY += 24;
    this.positionCheckbox(list, 5, x, curY, w);
    curY += 24;
    this.positionCheckbox(list, 9, x, curY, w);
    curY += 26;

    // ── B. Map Info box ──
    const mapBox = list[13] as Phaser.GameObjects.Graphics;
    mapBox.clear();
    mapBox.fillStyle(0x13152c, 0.9);
    mapBox.fillRoundedRect(x, curY, w, 76, 6);
    mapBox.lineStyle(1, 0x2e3358, 0.8);
    mapBox.strokeRoundedRect(x, curY, w, 76, 6);

    (list[14] as Phaser.GameObjects.Text).setPosition(x + 8, curY + 6);
    (list[15] as Phaser.GameObjects.Text).setPosition(x + 12, curY + 24);
    (list[16] as Phaser.GameObjects.Text).setPosition(x + 12, curY + 40);
    (list[17] as Phaser.GameObjects.Text).setPosition(x + 12, curY + 56);
    curY += 86;

    // ── C. Player / Coordinates box ──
    const playerBox = list[18] as Phaser.GameObjects.Graphics;
    playerBox.clear();
    playerBox.fillStyle(0x13152c, 0.9);
    playerBox.fillRoundedRect(x, curY, w, 88, 6);
    playerBox.lineStyle(1, 0x2e3358, 0.8);
    playerBox.strokeRoundedRect(x, curY, w, 88, 6);

    (list[19] as Phaser.GameObjects.Text).setPosition(x + 8, curY + 6);
    (list[20] as Phaser.GameObjects.Text).setPosition(x + 12, curY + 24);
    (list[21] as Phaser.GameObjects.Text).setPosition(x + 12, curY + 40);
    (list[22] as Phaser.GameObjects.Text).setPosition(x + 12, curY + 56);
    (list[23] as Phaser.GameObjects.Text).setPosition(x + 12, curY + 72);
    curY += 98;

    // ── D. Teleport presets (1 hàng, xếp theo CHIỀU RỘT THẬT từng nút) ──
    (list[24] as Phaser.GameObjects.Text).setPosition(x, curY);
    curY += 18;

    let cx = x;
    for (let i = 0; i < 5; i++) {
      const idx = 25 + i * 3;
      this.positionDebugButton(list[idx], list[idx + 1], list[idx + 2], cx, curY);
      cx += this.debugButtonWidth(list[idx + 2]) + 6;
    }
    curY += 32;

    // ── E. Speed buttons (1 hàng, bắt đầu sau label "TỐC ĐỘ DI CHUYỂN:") ──
    (list[40] as Phaser.GameObjects.Text).setPosition(x, curY);
    curY += 18;

    let sx = x + 140;
    for (let i = 0; i < 4; i++) {
      const idx = 41 + i * 3;
      this.positionDebugButton(list[idx], list[idx + 1], list[idx + 2], sx, curY - 2);
      sx += this.debugButtonWidth(list[idx + 2]) + 5;
    }
    curY += 28;

    // ── F. CLI buttons (1 hàng, xếp theo chiều rộng thật) ──
    (list[53] as Phaser.GameObjects.Text).setPosition(x, curY);
    curY += 18;

    let kx = x;
    for (let i = 0; i < 3; i++) {
      const idx = 54 + i * 3;
      this.positionDebugButton(list[idx], list[idx + 1], list[idx + 2], kx, curY);
      kx += this.debugButtonWidth(list[idx + 2]) + 6;
    }
    curY += 34;

    // ── G. Log output box ──
    const logBox = list[63] as Phaser.GameObjects.Graphics;
    logBox.clear();
    logBox.fillStyle(0x0a0c16, 0.95);
    logBox.fillRoundedRect(x, curY, w, 48, 4);
    logBox.lineStyle(1, 0x1f233f, 1);
    logBox.strokeRoundedRect(x, curY, w, 48, 4);

    (list[64] as Phaser.GameObjects.Text).setPosition(x + 8, curY + 6);

    // Ghi lại vị trí khung log (toạ độ trong `contentContainer`) để
    // `openCommandInput` đặt ô gõ lệnh ngay dưới nó như prompt console.
    this.logBoxLayout = { x, y: curY, w, h: 48 };
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
    curY += 26;

    this.positionCheckbox(list, 17, x, curY, 400);
    curY += 30;

    // Cơ chế di chuyển
    const lblMove = list[21] as Phaser.GameObjects.Text;
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

    const hint = list[28] as Phaser.GameObjects.Text;
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
