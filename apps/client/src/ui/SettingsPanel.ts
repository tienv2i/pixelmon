import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';
import type { UiZoomManager } from './UiZoomManager';
import { loadSettings, saveSettings, resetSettings, type UserSettings, type GameViewAnchor } from './SettingsStorage';
import { t, tr, mkText, setLang, initLang, type I18nKey } from '../i18n';

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
  onToggleMouseTracking?: (enabled: boolean) => void;
  onToggleTargetMarker?: (enabled: boolean) => void;
  onToggleGrid?: (enabled: boolean) => void;
  onToggleAutoRun?: (enabled: boolean) => void;
  onToggleScrollToZoom?: (enabled: boolean) => void;
  onMoveButtonChange?: (button: 'left' | 'right') => void;
  onViewAnchorChange?: (anchor: GameViewAnchor) => void;

  // Audio & System
  onToggleBgm?: (enabled: boolean) => void;
  onToggleSfx?: (enabled: boolean) => void;
  onChangeLanguage?: (lang: 'vi' | 'en') => void;
  onToggleAntiAlias?: (enabled: boolean) => void;
  onLogout?: () => void;
  onClose?: () => void;
}

const MODAL_W = 540;
const MODAL_H = 500;

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
    mouseTracking: true,
    targetMarker: true,
    showGrid: false,
    autoRun: false,
    scrollToZoom: false,
    moveButton: 'left' as 'left' | 'right',
    viewAnchor: 'center' as GameViewAnchor,
  };

  // Trạng thái âm thanh & hệ thống
  private audioState = {
    bgm: true,
    sfx: true,
  };

  private systemState = {
    lang: 'vi' as 'vi' | 'en',
    antialias: true as boolean,
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
  private langBtn?: { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private moveBtnLeft?: { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private moveBtnRight?: { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone };
  private viewAnchorBtns: Map<
    GameViewAnchor,
    { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }
  > = new Map();
  private checkboxSetters: Map<string, (val: boolean) => void> = new Map();

  constructor(scene: Phaser.Scene, opts: SettingsPanelOptions) {
    super(scene, {
      title: t('SETTINGS_TITLE'),
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
          tooltip: t('BTN_RESET_SETTINGS'),
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

    // Load trọn bộ cài đặt đã lưu từ SettingsStorage
    const saved = loadSettings();
    this.uiState = { ...saved.hud };
    this.gameplayState = { ...saved.gameplay };
    this.audioState = { ...saved.audio };
    this.systemState = { ...saved.system };

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
    const tabs: Array<{ id: SettingsTab; key: I18nKey }> = [
      { id: 'interface', key: 'TAB_INTERFACE' },
      { id: 'gameplay', key: 'TAB_GAMEPLAY' },
      { id: 'audio', key: 'TAB_AUDIO' },
      { id: 'system', key: 'TAB_SYSTEM' },
    ];

    for (const def of tabs) {
      const bg = this.scene.add.graphics().setVisible(false);
      const text = mkText(this.scene, def.key, ts(12, C.muted, FONT.ui))
        .setOrigin(0.5)
        .setVisible(false);
      const zone = this.scene.add
        .zone(0, 0, 10, 10)
        .setOrigin(0.5)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.switchTab(def.id);
      });

      this.tabButtons.set(def.id, { bg, text, zone });
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
    const lblSec1 = mkText(this.scene, 'SEC_HUD', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec1);

    // Profile & Clock
    const chkProfile = this.createCheckbox('CHK_PROFILE', this.uiState.profile, (v) => {
      this.uiState.profile = v;
      saveSettings({ hud: { profile: v } });
      this.panelOpts.onToggleProfile?.(v);
    }, 'profile');
    list.push(...chkProfile);

    const chkClock = this.createCheckbox('CHK_CLOCK', this.uiState.clock, (v) => {
      this.uiState.clock = v;
      saveSettings({ hud: { clock: v } });
      this.panelOpts.onToggleClock?.(v);
    }, 'clock');
    list.push(...chkClock);

    // Party & Chat
    const chkParty = this.createCheckbox('CHK_PARTY', this.uiState.party, (v) => {
      this.uiState.party = v;
      saveSettings({ hud: { party: v } });
      this.panelOpts.onToggleParty?.(v);
    }, 'party');
    list.push(...chkParty);

    const chkChat = this.createCheckbox('CHK_CHAT', this.uiState.chat, (v) => {
      this.uiState.chat = v;
      saveSettings({ hud: { chat: v } });
      this.panelOpts.onToggleChat?.(v);
    }, 'chat');
    list.push(...chkChat);

    // Minimap & Mini
    const chkMinimap = this.createCheckbox('CHK_MINIMAP', this.uiState.minimap, (v) => {
      this.uiState.minimap = v;
      saveSettings({ hud: { minimap: v } });
      this.panelOpts.onToggleMinimap?.(v);
    }, 'minimap');
    list.push(...chkMinimap);

    const chkMini = this.createCheckbox('CHK_MINI', this.uiState.miniMode, (v) => {
      this.uiState.miniMode = v;
      saveSettings({ hud: { miniMode: v } });
      this.panelOpts.onToggleMiniMode?.(v);
    }, 'miniMode');
    list.push(...chkMini);

    // Phân nhóm 2: Zoom
    const lblSec2 = mkText(this.scene, 'SEC_ZOOM', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec2);

    // UI Zoom
    const lblUiZoom = mkText(this.scene, 'LBL_UI_ZOOM', ts(12, C.text, FONT.ui))
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
    const lblGameZoom = mkText(this.scene, 'LBL_GAME_ZOOM', ts(12, C.text, FONT.ui))
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

    const lblSec = mkText(this.scene, 'SEC_GAMEPLAY', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblSec);

    const chkNames = this.createCheckbox('CHK_PLAYER_NAMES', this.gameplayState.showPlayerNames, (v) => {
      this.gameplayState.showPlayerNames = v;
      saveSettings({ gameplay: { showPlayerNames: v } });
      this.panelOpts.onTogglePlayerNames?.(v);
    }, 'showPlayerNames');
    list.push(...chkNames);

    const chkMouse = this.createCheckbox('CHK_MOUSE_TRACKING', this.gameplayState.mouseTracking, (v) => {
      this.gameplayState.mouseTracking = v;
      saveSettings({ gameplay: { mouseTracking: v } });
      this.panelOpts.onToggleMouseTracking?.(v);
    }, 'mouseTracking');
    list.push(...chkMouse);

    const chkGrid = this.createCheckbox('CHK_SHOW_GRID', this.gameplayState.showGrid, (v) => {
      this.gameplayState.showGrid = v;
      saveSettings({ gameplay: { showGrid: v } });
      this.panelOpts.onToggleGrid?.(v);
    }, 'showGrid');
    list.push(...chkGrid);

    const chkTarget = this.createCheckbox('CHK_TARGET_MARKER', this.gameplayState.targetMarker, (v) => {
      this.gameplayState.targetMarker = v;
      saveSettings({ gameplay: { targetMarker: v } });
      this.panelOpts.onToggleTargetMarker?.(v);
    }, 'targetMarker');
    list.push(...chkTarget);

    const chkRun = this.createCheckbox('CHK_AUTO_RUN', this.gameplayState.autoRun, (v) => {
      this.gameplayState.autoRun = v;
      saveSettings({ gameplay: { autoRun: v } });
      this.panelOpts.onToggleAutoRun?.(v);
    }, 'autoRun');
    list.push(...chkRun);

    const chkScrollZoom = this.createCheckbox('CHK_SCROLL_TO_ZOOM', this.gameplayState.scrollToZoom, (v) => {
      this.setScrollToZoom(v);
    }, 'scrollToZoom');
    list.push(...chkScrollZoom);

    // Tuỳ chọn Cơ chế di chuyển
    const lblMove = mkText(this.scene, 'SEC_MOVE_MODE', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblMove);

    // Nút chọn Chuột trái (LMB)
    const bgL = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtL = mkText(this.scene, 'BTN_LMB_DEFAULT', ts(11, C.text, FONT.ui))
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
    const txtR = mkText(this.scene, 'BTN_RMB', ts(11, C.text, FONT.ui))
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

    // ── Mốc neo khung nhìn Game View ──
    const lblAnchor = mkText(this.scene, 'SEC_ANCHOR', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblAnchor);

    const ANCHOR_DEFS: Array<{ id: GameViewAnchor; key: I18nKey }> = [
      { id: 'top-left', key: 'ANCHOR_TOP_LEFT' },
      { id: 'top', key: 'ANCHOR_TOP' },
      { id: 'top-right', key: 'ANCHOR_TOP_RIGHT' },
      { id: 'left', key: 'ANCHOR_LEFT' },
      { id: 'center', key: 'ANCHOR_CENTER' },
      { id: 'right', key: 'ANCHOR_RIGHT' },
      { id: 'bottom-left', key: 'ANCHOR_BOTTOM_LEFT' },
      { id: 'bottom', key: 'ANCHOR_BOTTOM' },
      { id: 'bottom-right', key: 'ANCHOR_BOTTOM_RIGHT' },
    ];

    for (const def of ANCHOR_DEFS) {
      const bg = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
      const txt = mkText(this.scene, def.key, ts(10, C.text, FONT.ui))
        .setOrigin(0.5)
        .setDepth(204).setScrollFactor(0).setVisible(false);
      const zone = this.scene.add
        .zone(0, 0, 10, 10)
        .setOrigin(0.5)
        .setDepth(205).setScrollFactor(0).setVisible(false)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.setViewAnchor(def.id);
      });

      this.viewAnchorBtns.set(def.id, { bg, txt, zone });
      list.push(bg, txt, zone);
    }

    const hint = mkText(this.scene, 'HINT_MOVE', ts(11, C.muted, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(hint);
  }

  // ── Tab 3: Âm thanh ────────────────────────────────────────────────────────
  private buildAudioTab(): void {
    const list = this.tabObjects.get('audio')!;

    const lbl = mkText(this.scene, 'SEC_AUDIO', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lbl);

    const chkBgm = this.createCheckbox('CHK_BGM', this.audioState.bgm, (v) => {
      this.audioState.bgm = v;
      saveSettings({ audio: { bgm: v } });
      this.panelOpts.onToggleBgm?.(v);
    }, 'bgm');
    list.push(...chkBgm);

    const chkSfx = this.createCheckbox('CHK_SFX', this.audioState.sfx, (v) => {
      this.audioState.sfx = v;
      saveSettings({ audio: { sfx: v } });
      this.panelOpts.onToggleSfx?.(v);
    }, 'sfx');
    list.push(...chkSfx);

    const note = mkText(this.scene, 'AUDIO_NOTE', ts(11, C.muted, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(note);
  }

  // ── Tab 4: Hệ thống ────────────────────────────────────────────────────────
  private buildSystemTab(): void {
    const list = this.tabObjects.get('system')!;

    const lblLang = mkText(this.scene, 'LBL_LANGUAGE', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblLang);

    // Nút chọn ngôn ngữ — chỉ hiển thị 1 trong 2 ngôn ngữ (toggle)
    const bgLang = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txtLang = mkText(this.scene, 'LANG_VI', ts(12, C.text, FONT.ui))
      .setOrigin(0.5)
      .setDepth(204).setScrollFactor(0).setVisible(false);
    const zoneLang = this.scene.add
      .zone(0, 0, 10, 10)
      .setOrigin(0.5)
      .setDepth(205).setScrollFactor(0).setVisible(false)
      .setInteractive({ useHandCursor: true });

    zoneLang.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.setLanguage(this.systemState.lang === 'vi' ? 'en' : 'vi');
    });
    this.langBtn = { bg: bgLang, txt: txtLang, zone: zoneLang };
    list.push(bgLang, txtLang, zoneLang);

    // ── Chất lượng hiển thị ──
    const lblRender = mkText(this.scene, 'SEC_RENDER', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblRender);

    const chkAntiAlias = this.createCheckbox('CHK_ANTIALIAS', this.systemState.antialias, (v) => {
      this.setAntiAlias(v);
    }, 'antialias');
    list.push(...chkAntiAlias);

    const noteRender = mkText(this.scene, 'RENDER_NOTE', ts(10, C.muted, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(noteRender);

    const lblAcc = mkText(this.scene, 'LBL_ACCOUNT', ts(11, '#6c5ce7', FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(lblAcc);

    const infoAcc = mkText(this.scene, 'ACC_INFO', ts(11, C.text, FONT.ui))
      .setDepth(203).setScrollFactor(0).setVisible(false);
    list.push(infoAcc);

    // Nút đóng
    const btnClose = this.createActionButton('BTN_CLOSE_SETTINGS', 0x2e3358, () => {
      this.close();
    });
    list.push(...btnClose);
  }

  private setAntiAlias(enabled: boolean): void {
    this.systemState.antialias = enabled;
    saveSettings({ system: { antialias: enabled } });
    this.panelOpts.onToggleAntiAlias?.(enabled);
  }

  public setScrollToZoom(enabled: boolean): void {
    this.gameplayState.scrollToZoom = enabled;
    saveSettings({ gameplay: { scrollToZoom: enabled } });
    this.checkboxSetters.get('scrollToZoom')?.(enabled);
    this.panelOpts.onToggleScrollToZoom?.(enabled);
  }

  /** Cập nhật trạng thái checkbox HUD từ bên ngoài (khi đóng/mở panel qua nút tắt hoặc phím tắt). */
  public setHudCheckbox(key: 'profile' | 'clock' | 'party' | 'chat' | 'minimap' | 'miniMode', checked: boolean): void {
    this.uiState[key] = checked;
    saveSettings({ hud: { [key]: checked } });
    this.checkboxSetters.get(key)?.(checked);
  }

  public resetAllSettings(): void {
    const s = resetSettings();

    // 1. Reset UI Zoom & Game Zoom
    this.panelOpts.onUiZoomReset?.();
    this.panelOpts.onGameZoomReset?.();

    // 2. Reset Move button về mặc định 'left'
    this.setMoveButton(s.gameplay.moveButton);

    // 3. Reset Scroll to zoom về mặc định false
    this.setScrollToZoom(s.gameplay.scrollToZoom);

    // 4. Reset Ngôn ngữ về 'vi'
    this.setLanguage(s.system.lang);

    // 4b. Reset Anti-aliasing về mặc định
    this.setAntiAlias(s.system.antialias);

    // 5. Reset UI toggles
    for (const key of ['profile', 'clock', 'party', 'chat', 'minimap', 'miniMode'] as const) {
      this.uiState[key] = s.hud[key];
      this.checkboxSetters.get(key)?.(s.hud[key]);
    }
    this.panelOpts.onToggleProfile?.(s.hud.profile);
    this.panelOpts.onToggleClock?.(s.hud.clock);
    this.panelOpts.onToggleParty?.(s.hud.party);
    this.panelOpts.onToggleChat?.(s.hud.chat);
    this.panelOpts.onToggleMinimap?.(s.hud.minimap);
    this.panelOpts.onToggleMiniMode?.(s.hud.miniMode);

    // 6. Reset Gameplay toggles
    this.gameplayState.showPlayerNames = s.gameplay.showPlayerNames;
    this.checkboxSetters.get('showPlayerNames')?.(s.gameplay.showPlayerNames);
    this.panelOpts.onTogglePlayerNames?.(s.gameplay.showPlayerNames);

    this.gameplayState.mouseTracking = s.gameplay.mouseTracking;
    this.checkboxSetters.get('mouseTracking')?.(s.gameplay.mouseTracking);
    this.panelOpts.onToggleMouseTracking?.(s.gameplay.mouseTracking);

    this.gameplayState.targetMarker = s.gameplay.targetMarker;
    this.checkboxSetters.get('targetMarker')?.(s.gameplay.targetMarker);
    this.panelOpts.onToggleTargetMarker?.(s.gameplay.targetMarker);

    this.gameplayState.showGrid = s.gameplay.showGrid;
    this.checkboxSetters.get('showGrid')?.(s.gameplay.showGrid);
    this.panelOpts.onToggleGrid?.(s.gameplay.showGrid);

    this.gameplayState.autoRun = s.gameplay.autoRun;
    this.checkboxSetters.get('autoRun')?.(s.gameplay.autoRun);
    this.panelOpts.onToggleAutoRun?.(s.gameplay.autoRun);

    // 7. Reset View Anchor
    this.setViewAnchor(s.gameplay.viewAnchor);

    // 8. Reset Audio
    this.audioState.bgm = s.audio.bgm;
    this.checkboxSetters.get('bgm')?.(s.audio.bgm);
    this.panelOpts.onToggleBgm?.(s.audio.bgm);

    this.audioState.sfx = s.audio.sfx;
    this.checkboxSetters.get('sfx')?.(s.audio.sfx);
    this.panelOpts.onToggleSfx?.(s.audio.sfx);

    this.updateZoomLabels();
    this.relayout();
  }

  public setViewAnchor(anchor: GameViewAnchor): void {
    this.gameplayState.viewAnchor = anchor;
    saveSettings({ gameplay: { viewAnchor: anchor } });
    this.panelOpts.onViewAnchorChange?.(anchor);
    this.relayout();
  }

  public getSettings(): UserSettings {
    return {
      hud: { ...this.uiState },
      gameplay: { ...this.gameplayState },
      audio: { ...this.audioState },
      system: { ...this.systemState },
      zoom: {
        gameZoom: this.panelOpts.getGameZoom?.() ?? 1.0,
        uiZoom: this._uiZoomManager?.userZoom ?? 1.0,
      },
    };
  }

  private setLanguage(lang: 'vi' | 'en'): void {
    this.systemState.lang = lang;
    saveSettings({ system: { lang } });
    // Cập nhật ngôn ngữ toàn bộ UI client (chỉ hiển thị 1 trong 2 ngôn ngữ)
    setLang(lang);
    this.panelOpts.onChangeLanguage?.(lang);
    this.relayout();
  }

  private setMoveButton(btn: 'left' | 'right'): void {
    this.gameplayState.moveButton = btn;
    saveSettings({ gameplay: { moveButton: btn } });
    this.panelOpts.onMoveButtonChange?.(btn);
    this.relayout();
  }

  // ── Component Helpers ──────────────────────────────────────────────────────
  private createCheckbox(
    label: I18nKey | string,
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
    const labelText = mkText(this.scene, label, ts(12, C.text, FONT.ui))
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
    label: I18nKey | string,
    color: number,
    onClick: () => void,
  ): Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible> {
    const bg = this.scene.add.graphics().setDepth(203).setScrollFactor(0).setVisible(false);
    const txt = mkText(this.scene, label, ts(12, '#ffffff', FONT.ui))
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

  private layoutGameplayTab(x: number, y: number, w: number): void {
    const list = this.tabObjects.get('gameplay')!;
    let curY = y;

    const lbl = list[0] as Phaser.GameObjects.Text;
    lbl.setPosition(x, curY);
    curY += 22;

    // Checkboxes 2 cột (3 hàng x 2 cột cân đối)
    const colW = Math.floor(w / 2);
    // Hàng 1: Names (1) & Mouse Tracking (5)
    this.positionCheckbox(list, 1, x, curY, colW);
    this.positionCheckbox(list, 5, x + colW, curY, colW);
    curY += 24;

    // Hàng 2: Grid (9) & Destination Marker (13)
    this.positionCheckbox(list, 9, x, curY, colW);
    this.positionCheckbox(list, 13, x + colW, curY, colW);
    curY += 24;

    // Hàng 3: AutoRun (17) & Scroll to zoom (21)
    this.positionCheckbox(list, 17, x, curY, colW);
    this.positionCheckbox(list, 21, x + colW, curY, colW);
    curY += 26;

    // Cơ chế di chuyển
    const lblMove = list[25] as Phaser.GameObjects.Text;
    lblMove.setPosition(x, curY);
    curY += 18;

    const isLeft = this.gameplayState.moveButton === 'left';
    const isRight = this.gameplayState.moveButton === 'right';

    if (this.moveBtnLeft) {
      const cx = x + 115;
      const cy = curY + 11;
      this.moveBtnLeft.bg.clear();
      this.moveBtnLeft.bg.fillStyle(isLeft ? 0x24284d : 0x13152c, 0.95);
      this.moveBtnLeft.bg.fillRoundedRect(cx - 105, cy - 11, 210, 23, 4);
      this.moveBtnLeft.bg.lineStyle(isLeft ? 2 : 1, isLeft ? 0x00cec9 : 0x2e3358, 1);
      this.moveBtnLeft.bg.strokeRoundedRect(cx - 105, cy - 11, 210, 23, 4);

      this.moveBtnLeft.txt.setPosition(cx, cy);
      this.moveBtnLeft.txt.setColor(isLeft ? '#00cec9' : C.muted);
      this.moveBtnLeft.zone.setPosition(cx, cy).setSize(210, 23);
    }

    if (this.moveBtnRight) {
      const cx = x + 305;
      const cy = curY + 11;
      this.moveBtnRight.bg.clear();
      this.moveBtnRight.bg.fillStyle(isRight ? 0x24284d : 0x13152c, 0.95);
      this.moveBtnRight.bg.fillRoundedRect(cx - 75, cy - 11, 150, 23, 4);
      this.moveBtnRight.bg.lineStyle(isRight ? 2 : 1, isRight ? 0x00cec9 : 0x2e3358, 1);
      this.moveBtnRight.bg.strokeRoundedRect(cx - 75, cy - 11, 150, 23, 4);

      this.moveBtnRight.txt.setPosition(cx, cy);
      this.moveBtnRight.txt.setColor(isRight ? '#00cec9' : C.muted);
      this.moveBtnRight.zone.setPosition(cx, cy).setSize(150, 23);
    }

    curY += 28;

    // ── Mốc neo khung nhìn Game View ──
    const lblAnchor = list[32] as Phaser.GameObjects.Text;
    lblAnchor.setPosition(x, curY);
    curY += 18;

    const ANCHOR_GRID: GameViewAnchor[][] = [
      ['top-left', 'top', 'top-right'],
      ['left', 'center', 'right'],
      ['bottom-left', 'bottom', 'bottom-right'],
    ];

    const btnW = 125;
    const btnH = 22;
    const gapX = 10;
    const gapY = 5;
    const startX = x + Math.floor((w - (btnW * 3 + gapX * 2)) / 2);

    ANCHOR_GRID.forEach((row, rIdx) => {
      row.forEach((anchor, cIdx) => {
        const btn = this.viewAnchorBtns.get(anchor);
        if (!btn) return;
        const isSelected = this.gameplayState.viewAnchor === anchor;
        const bx = startX + cIdx * (btnW + gapX);
        const by = curY + rIdx * (btnH + gapY);
        const cx = bx + btnW / 2;
        const cy = by + btnH / 2;

        btn.bg.clear();
        btn.bg.fillStyle(isSelected ? 0x24284d : 0x13152c, 0.95);
        btn.bg.fillRoundedRect(bx, by, btnW, btnH, 4);
        btn.bg.lineStyle(isSelected ? 2 : 1, isSelected ? 0x00cec9 : 0x2e3358, 1);
        btn.bg.strokeRoundedRect(bx, by, btnW, btnH, 4);

        btn.txt.setPosition(cx, cy);
        btn.txt.setColor(isSelected ? '#00cec9' : C.muted);
        if (isSelected) {
          btn.txt.setFontStyle('bold');
        } else {
          btn.txt.setFontStyle('normal');
        }

        btn.zone.setPosition(cx, cy).setSize(btnW, btnH);
      });
    });

    curY += (btnH + gapY) * 3 + 8;

    const hint = list[list.length - 1] as Phaser.GameObjects.Text;
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

    // 1 nút chọn ngôn ngữ — chỉ hiện ngôn ngữ đang dùng (bấm để đổi)
    if (this.langBtn) {
      const isVi = this.systemState.lang === 'vi';
      const cx = x + 100;
      const cy = curY + 14;
      this.langBtn.bg.clear();
      this.langBtn.bg.fillStyle(0x24284d, 0.95);
      this.langBtn.bg.fillRoundedRect(cx - 80, cy - 14, 160, 28, 4);
      this.langBtn.bg.lineStyle(2, 0x00cec9, 1);
      this.langBtn.bg.strokeRoundedRect(cx - 80, cy - 14, 160, 28, 4);

      this.langBtn.txt.setPosition(cx, cy);
      this.langBtn.txt.setText(isVi ? t('LANG_VI') : t('LANG_EN'));
      this.langBtn.txt.setColor('#00cec9');
      this.langBtn.zone.setPosition(cx, cy).setSize(160, 28);
    }

    curY += 46;

    // ── Chất lượng hiển thị (Anti-aliasing) ──
    const lblRender = list[4] as Phaser.GameObjects.Text;
    lblRender.setPosition(x, curY);
    curY += 24;

    this.positionCheckbox(list, 5, x, curY, w - 24);
    curY += 26;

    const noteRender = list[9] as Phaser.GameObjects.Text;
    noteRender.setPosition(x, curY);
    curY += 34;

    const lblAcc = list[10] as Phaser.GameObjects.Text;
    lblAcc.setPosition(x, curY);
    curY += 26;

    const infoAcc = list[11] as Phaser.GameObjects.Text;
    infoAcc.setPosition(x, curY);
    curY += 56;

    // Nút đóng modal
    this.positionActionButton(list[12], list[13], list[14], x + w / 2, curY + 16, 220, 34);
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
