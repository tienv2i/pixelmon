import Phaser from 'phaser';
import { C, FONT } from './theme';
import { UiModal } from './UiModal';
import { t, tr, mkText, onLangChange, type I18nKey } from '../i18n';

export type MapLayerKey = 'ground' | 'decoration' | 'overhead';
export const MAP_LAYER_KEYS: readonly MapLayerKey[] = ['ground', 'decoration', 'overhead'];
/** Nhãn tầng tilemap — trả về theo ngôn ngữ hiện tại. */
export function mapLayerLabel(key: MapLayerKey): string {
  return t(key === 'ground' ? 'LAYER_GROUND' : key === 'decoration' ? 'LAYER_DECORATION' : 'LAYER_OVERHEAD');
}
export const MAP_LAYER_LABELS: Record<MapLayerKey, string> = {
  get ground() { return t('LAYER_GROUND'); },
  get decoration() { return t('LAYER_DECORATION'); },
  get overhead() { return t('LAYER_OVERHEAD'); },
};

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
  encounterRate?: number;
}

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
  isNoclip?: boolean;
}

export interface DebugModalOptions {
  onToggleGrid?: (enabled: boolean) => void;
  onToggleCollision?: (enabled: boolean) => void;
  onToggleWarp?: (enabled: boolean) => void;
  onToggleMapLayer?: (key: MapLayerKey, enabled: boolean) => void;
  onToggleConsole?: (enabled: boolean) => void;
  onToggleTrackerWidget?: (enabled: boolean) => void;
  onToggleMapWidget?: (enabled: boolean) => void;
  onTogglePlayerWidget?: (enabled: boolean) => void;
  onToggleCoordWidget?: (enabled: boolean) => void;
  onTogglePerfWidget?: (enabled: boolean) => void;
  onToggleNoclip?: (enabled: boolean) => void;
  onTeleport?: (x: number, y: number) => void;
  onSwitchMap?: (mapId: string, x?: number, y?: number) => void;
  onSetSpeed?: (mult: number) => void;
  onClose?: () => void;
}

export type DebugTabType = 'info' | 'features';

/**
 * **DebugModal** — Bảng điều khiển Debug chuyên biệt (tách riêng khỏi Settings)
 * - Tab 1: 📊 THÔNG TIN: Bản đồ, Toạ độ, Camera, Hiệu năng và Server.
 * - Tab 2: ⚙️ TÍNH NĂNG: Bật/tắt Overlay, Lớp bản đồ, Bật Console, Bật Tracker Widget, Noclip, Teleport nhanh, Đổi tốc độ.
 */
export class DebugModal extends UiModal {
  private unsubLang?: () => void;
  private unsubTabs: Array<() => void> = [];
  private activeTab: DebugTabType = 'info';
  private debugOpts: DebugModalOptions;

  // Tabs container objects
  private tabButtons: Map<
    DebugTabType,
    { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone; key: I18nKey }
  > = new Map();
  private tabObjects: Map<DebugTabType, Phaser.GameObjects.GameObject[]> = new Map();

  // State các checkbox
  private toggleStates: Record<string, boolean> = {
    grid: false,
    collision: false,
    warp: false,
    ground: true,
    decoration: true,
    overhead: true,
    console: false,
    trackerWidget: false,
    mapWidget: false,
    playerWidget: false,
    coordWidget: false,
    perfWidget: false,
    noclip: false,
  };
  private checkboxSetters: Map<string, (val: boolean) => void> = new Map();
  private pinButtons: Map<string, { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; x: number; y: number; w: number; h: number }> = new Map();

  // Dynamic text fields (Tab Thông tin)
  private txtMapMain!: Phaser.GameObjects.Text;
  private txtMapDetails!: Phaser.GameObjects.Text;
  private txtPlayerMain!: Phaser.GameObjects.Text;
  private txtPlayerDetails!: Phaser.GameObjects.Text;
  private txtPerf!: Phaser.GameObjects.Text;
  private txtServer!: Phaser.GameObjects.Text;

  // Quick inputs (Tab Tính năng)
  private inputXEl: HTMLInputElement | null = null;
  private inputYEl: HTMLInputElement | null = null;

  constructor(scene: Phaser.Scene, opts: DebugModalOptions = {}) {
    super(scene, {
      title: t('DEBUG_TITLE'),
      width: 580,
      height: 480,
      headerHeight: 32,
      lockUi: false,
      depth: 130,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      onClose: () => {
        this.hideInputs();
        opts.onClose?.();
      },
      onMinimize: () => {
        this.hideInputs();
      },
    });

    this.debugOpts = opts;

    this.tabObjects.set('info', []);
    this.tabObjects.set('features', []);

    // 1. Tạo 2 nút Tab phía trên
    this.createTabButtons();

    // 2. Xây dựng nội dung Tab 1: Thông tin (4 ô card có 4 nút ghim riêng)
    this.buildInfoTab();

    // 3. Xây dựng nội dung Tab 2: Tính năng & Teleport (NOCLIP ở nhóm Bật/Tắt)
    this.buildFeaturesTab();

    // Mặc định mở Tab 1
    this.switchTab('info');

    // Mặc định ẩn modal (đồng bộ `open=false` với container đang ẩn) —
    // nếu không, lần đầu gọi toggle() sẽ chạy close() thay vì show().
    this.close();  
    // Cập nhật title khi đổi ngôn ngữ (chỉ 1 ngôn ngữ hiển thị)
    this.unsubLang = onLangChange(() => this.setTitle(t('DEBUG_TITLE')));
  }

  private createTabButtons(): void {
    const tabs: Array<{ id: DebugTabType; key: I18nKey }> = [
      { id: 'info', key: 'DEBUG_TAB_INFO' },
      { id: 'features', key: 'DEBUG_TAB_FEATURES' },
    ];

    const tabW = 270;
    const tabH = 28;
    const startX = 14;
    const startY = 8;

    tabs.forEach((def, i) => {
      const x = startX + i * (tabW + 12);
      const bg = this.scene.add.graphics();
      const text = this.scene.add
        .text(x + tabW / 2, startY + tabH / 2, '', {
          fontSize: '11px',
          fontFamily: FONT.mono,
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0.5);
      // Icon đã nằm sẵn trong chuỗi i18n → chỉ cần t() là đủ, tránh double icon
      const applyLabel = () => text.setText(t(def.key));
      applyLabel();
      this.unsubTabs = this.unsubTabs.concat(onLangChange(applyLabel));

      const zone = this.scene.add
        .zone(x + tabW / 2, startY + tabH / 2, tabW, tabH)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', () => this.switchTab(def.id));

      this.tabButtons.set(def.id, { bg, text, zone, key: def.key });
      this.contentContainer.add([bg, text, zone]);
    });

    this.renderTabButtons();
  }

  private renderTabButtons(): void {
    const tabW = 270;
    const tabH = 28;
    const startX = 14;
    const startY = 8;

    this.tabButtons.forEach((btn, id) => {
      const active = id === this.activeTab;
      btn.bg.clear();
      const i = id === 'info' ? 0 : 1;
      const x = startX + i * (tabW + 12);
      const cx = x + tabW / 2;
      const cy = startY + tabH / 2;

      // Đồng bộ vị trí text + hit-zone (quan trọng khi relayout/resize)
      btn.text.setPosition(cx, cy);
      btn.zone.setPosition(cx, cy).setSize(tabW, tabH);

      if (active) {
        btn.bg.fillStyle(0x00cec9, 0.25);
        btn.bg.fillRoundedRect(x, startY, tabW, tabH, 5);
        btn.bg.lineStyle(1.5, 0x00cec9, 1);
        btn.bg.strokeRoundedRect(x, startY, tabW, tabH, 5);
        btn.text.setColor('#81ecec');
      } else {
        btn.bg.fillStyle(0x1e293b, 0.7);
        btn.bg.fillRoundedRect(x, startY, tabW, tabH, 5);
        btn.bg.lineStyle(1, 0x334155, 0.8);
        btn.bg.strokeRoundedRect(x, startY, tabW, tabH, 5);
        btn.text.setColor('#94a3b8');
      }
    });
  }

  /**
   * Đồng bộ lại toàn bộ layout sau khi:
   * - UI zoom / game zoom đổi
   * - cửa sổ resize
   * - minimize / dock / dock trở lại
   *
   * UiModal.relayout() chỉ vẽ khung + header; nội dung tab do buildInfoTab /
   * buildFeaturesTab đặt toạ độ cứng nên phải render lại ở đây, nếu không
   * các nhãn/checkbox sẽ lệch chỗ và chồng lên nhau.
   */
  public override relayout(): void {
    super.relayout();
    this.renderTabButtons();
  }

  public switchTab(tab: DebugTabType): void {
    this.activeTab = tab;
    this.renderTabButtons();

    this.tabObjects.forEach((objs, id) => {
      const visible = id === tab;
      objs.forEach((o) => (o as any).setVisible?.(visible));
    });

    if (tab === 'features' && this.open && !this.isMinimized) {
      this.showInputs();
    } else {
      this.hideInputs();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // TAB 1: THÔNG TIN HỆ THỐNG (4 Ô Card có 4 Nút Ghim Neo Cạnh Phải Riêng)
  // ──────────────────────────────────────────────────────────────────────────
  private buildInfoTab(): void {
    const objs: Phaser.GameObjects.GameObject[] = [];

    // ── 4 Khung Card Thông tin chia 2 cột đều ──
    const baseY = 46;
    const cardH = 188;

    // Card 1: Bản đồ (Map Information)
    this.createCard(14, baseY, 270, cardH, 'DEBUG_CARD_MAP', objs, 'mapWidget', () => {
      this.togglePin('mapWidget');
    });
    this.txtMapMain = mkText(
      this.scene,
      'DEBUG_LOADING_MAP',
      {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#f1c40f',
        lineSpacing: 4,
      },
      24,
      baseY + 32,
    );
    this.txtMapDetails = this.scene.add.text(24, baseY + 86, '', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      color: '#dfe6e9',
      lineSpacing: 4,
    });
    objs.push(this.txtMapMain, this.txtMapDetails);

    // Card 2: Nhân vật (Player Information)
    this.createCard(296, baseY, 270, cardH, 'DEBUG_CARD_PLAYER', objs, 'playerWidget', () => {
      this.togglePin('playerWidget');
    });
    this.txtPlayerMain = mkText(
      this.scene,
      'DEBUG_LOADING_PLAYER',
      {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#00cec9',
        lineSpacing: 4,
      },
      306,
      baseY + 32,
    );
    this.txtPlayerDetails = this.scene.add.text(306, baseY + 86, '', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      color: '#dfe6e9',
      lineSpacing: 4,
    });
    objs.push(this.txtPlayerMain, this.txtPlayerDetails);

    // Card 3: Camera & Toạ độ chuột (Coord & Camera)
    const cardRow2Y = baseY + cardH + 12;
    this.createCard(14, cardRow2Y, 270, cardH, 'DEBUG_CARD_COORD', objs, 'coordWidget', () => {
      this.togglePin('coordWidget');
    });
    this.txtPerf = mkText(
      this.scene,
      'DEBUG_PERF_INIT',
      {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#a29bfe',
        lineSpacing: 6,
      },
      24,
      cardRow2Y + 34,
    );
    objs.push(this.txtPerf);

    // Card 4: Server & Kết nối (Network)
    this.createCard(296, cardRow2Y, 270, cardH, 'DEBUG_CARD_PERF', objs, 'perfWidget', () => {
      this.togglePin('perfWidget');
    });
    this.txtServer = this.scene.add.text(
      306,
      cardRow2Y + 34,
      t('DEBUG_SERVER_INIT'),
      {
        fontSize: '11px',
        fontFamily: FONT.mono,
        color: '#55efc4',
        lineSpacing: 6,
      },
    );
    objs.push(this.txtServer);

    this.tabObjects.set('info', objs);
    this.contentContainer.add(objs);
  }

  private togglePin(key: 'mapWidget' | 'playerWidget' | 'coordWidget' | 'perfWidget'): void {
    const next = !this.toggleStates[key];
    this.setToggleState(key, next);
    switch (key) {
      case 'mapWidget':
        this.debugOpts.onToggleMapWidget?.(next);
        break;
      case 'playerWidget':
        this.debugOpts.onTogglePlayerWidget?.(next);
        break;
      case 'coordWidget':
        this.debugOpts.onToggleCoordWidget?.(next);
        break;
      case 'perfWidget':
        this.debugOpts.onTogglePerfWidget?.(next);
        break;
    }
  }

  private createCard(
    x: number,
    y: number,
    w: number,
    h: number,
    title: I18nKey,
    objs: Phaser.GameObjects.GameObject[],
    pinKey?: string,
    onPin?: () => void,
  ): Phaser.GameObjects.Graphics {
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0x0f172a, 0.75);
    gfx.fillRoundedRect(x, y, w, h, 6);
    gfx.lineStyle(1, 0x334155, 0.8);
    gfx.strokeRoundedRect(x, y, w, h, 6);

    const titleTxt = mkText(this.scene, title, {
      fontSize: '11px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#e2e8f0',
    }, x + 10, y + 8);

    objs.push(gfx, titleTxt);

    // Nếu card có nút ghim -> vẽ nút nhỏ góc trên-phải và lưu để cập nhật trạng thái
    if (pinKey && onPin) {
      const pinBtnW = 66;
      const pinBtnH = 20;
      const pinBtnX = x + w - pinBtnW - 8;
      const pinBtnY = y + 5;

      const pinBg = this.scene.add.graphics();
      const pinTxt = mkText(this.scene, 'DEBUG_PIN', {
        fontSize: '9px',
        fontFamily: FONT.mono,
        color: '#38bdf8',
      }, pinBtnX + pinBtnW / 2, pinBtnY + pinBtnH / 2).setOrigin(0.5, 0.5);

      const pinZone = this.scene.add
        .zone(pinBtnX + pinBtnW / 2, pinBtnY + pinBtnH / 2, pinBtnW, pinBtnH)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      this.pinButtons.set(pinKey, {
        bg: pinBg,
        txt: pinTxt,
        x: pinBtnX,
        y: pinBtnY,
        w: pinBtnW,
        h: pinBtnH,
      });

      this.renderPinButton(pinKey);

      pinZone.on('pointerover', () => {
        pinBg.clear();
        pinBg.fillStyle(0x0284c7, 0.4);
        pinBg.fillRoundedRect(pinBtnX, pinBtnY, pinBtnW, pinBtnH, 3);
        pinBg.lineStyle(1, 0x38bdf8, 1);
        pinBg.strokeRoundedRect(pinBtnX, pinBtnY, pinBtnW, pinBtnH, 3);
        pinTxt.setColor('#ffffff');
      });
      pinZone.on('pointerout', () => {
        this.renderPinButton(pinKey);
      });
      pinZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        onPin();
      });

      objs.push(pinBg, pinTxt, pinZone);
    }

    return gfx;
  }

  private renderPinButton(pinKey: string): void {
    const btn = this.pinButtons.get(pinKey);
    if (!btn) return;
    const isPinned = this.toggleStates[pinKey] ?? false;
    btn.bg.clear();
    if (isPinned) {
      btn.bg.fillStyle(0x00cec9, 0.3);
      btn.bg.fillRoundedRect(btn.x, btn.y, btn.w, btn.h, 3);
      btn.bg.lineStyle(1.5, 0x00cec9, 1);
      btn.bg.strokeRoundedRect(btn.x, btn.y, btn.w, btn.h, 3);
      btn.txt.setText(t('DEBUG_PINNED')).setColor('#00cec9');
    } else {
      btn.bg.fillStyle(0x1e293b, 0.9);
      btn.bg.fillRoundedRect(btn.x, btn.y, btn.w, btn.h, 3);
      btn.bg.lineStyle(1, 0x38bdf8, 0.6);
      btn.bg.strokeRoundedRect(btn.x, btn.y, btn.w, btn.h, 3);
      btn.txt.setText(t('DEBUG_PIN')).setColor('#38bdf8');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 2: BẬT / TẮT TÍNH NĂNG & TELEPORT
  // ──────────────────────────────────────────────────────────────────────────
  private buildFeaturesTab(): void {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const baseY = 46;

    // Header nhóm 1: Bật / Tắt Overlays & Công cụ
    const lbl1 = mkText(this.scene, 'DEBUG_SEC_TOOLS', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#00cec9',
    }, 14, baseY);
    objs.push(lbl1);

    // 6 Checkboxes chia 2 cột:
    // Cột 1 (x = 14): Grid, Collision, Warp, Noclip
    // Cột 2 (x = 296): Tilemap Layers (Ground, Decor, Overhead), Console, Tracker
    const chkDefsCol1: Array<{ key: string; label: I18nKey; desc: string; onToggle: (v: boolean) => void }> = [
      {
        key: 'grid',
        label: 'DBG_CHK_GRID',
        desc: t('DBG_DESC_GRID'),
        onToggle: (v) => this.debugOpts.onToggleGrid?.(v),
      },
      {
        key: 'collision',
        label: 'DBG_CHK_COLLISION',
        desc: t('DBG_DESC_COLLISION'),
        onToggle: (v) => this.debugOpts.onToggleCollision?.(v),
      },
      {
        key: 'warp',
        label: 'DBG_CHK_WARP',
        desc: t('DBG_DESC_WARP'),
        onToggle: (v) => this.debugOpts.onToggleWarp?.(v),
      },
      {
        key: 'noclip',
        label: 'DBG_CHK_NOCLIP',
        desc: t('DBG_DESC_NOCLIP'),
        onToggle: (v) => {
          this.toggleStates.noclip = v;
          this.debugOpts.onToggleNoclip?.(v);
        },
      },
    ];

    const chkDefsCol2: Array<{ key: string; label: I18nKey; desc: string; onToggle: (v: boolean) => void }> = [
      {
        key: 'console',
        label: 'DBG_CHK_CONSOLE',
        desc: t('DBG_DESC_CONSOLE'),
        onToggle: (v) => this.debugOpts.onToggleConsole?.(v),
      },
      {
        key: 'trackerWidget',
        label: 'DBG_CHK_TRACKER',
        desc: t('DBG_DESC_TRACKER'),
        onToggle: (v) => this.debugOpts.onToggleTrackerWidget?.(v),
      },
      {
        key: 'ground',
        label: 'DBG_CHK_GROUND',
        desc: t('DBG_DESC_GROUND'),
        onToggle: (v) => this.debugOpts.onToggleMapLayer?.('ground', v),
      },
      {
        key: 'decoration',
        label: 'DBG_CHK_DECORATION',
        desc: t('DBG_DESC_DECORATION'),
        onToggle: (v) => this.debugOpts.onToggleMapLayer?.('decoration', v),
      },
      {
        key: 'overhead',
        label: 'DBG_CHK_OVERHEAD',
        desc: t('DBG_DESC_OVERHEAD'),
        onToggle: (v) => this.debugOpts.onToggleMapLayer?.('overhead', v),
      },
    ];

    let rowY = baseY + 20;
    chkDefsCol1.forEach((chk) => {
      this.createCheckbox(14, rowY, 260, chk.key, chk.label, chk.onToggle, objs);
      rowY += 34;
    });

    let row2Y = baseY + 20;
    chkDefsCol2.forEach((chk) => {
      this.createCheckbox(296, row2Y, 260, chk.key, chk.label, chk.onToggle, objs);
      row2Y += 34;
    });

    // Header nhóm 2: Teleport Nhanh
    const tpY = Math.max(rowY, row2Y) + 6;
    const lbl2 = mkText(this.scene, 'DEBUG_SEC_TELEPORT', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#f1c40f',
    }, 14, tpY);
    objs.push(lbl2);

    // 5 Nút Map nhanh
    const maps = [
      { id: 'lappet-town', name: 'Lappet Town' },
      { id: 'route-1', name: 'Route 1' },
      { id: 'player-house-1f', name: t('MAP_PLAYER_HOUSE') },
      { id: 'pokemon-lab', name: t('MAP_LAB') },
      { id: 'daisy-house', name: t('MAP_DAISY') },
    ];

    const btnW = 104;
    const btnH = 26;
    let bX = 14;
    let bY = tpY + 18;

    maps.forEach((m) => {
      this.createSimpleButton(bX, bY, btnW, btnH, m.name, () => this.debugOpts.onSwitchMap?.(m.id), objs);
      bX += btnW + 8;
    });

    // Nhóm 3: Tốc độ di chuyển (Speed Multipliers)
    const speedY = bY + btnH + 12;
    const lbl3 = mkText(this.scene, 'DEBUG_SEC_SPEED', {
      fontSize: '11px',
      fontFamily: FONT.mono,
      fontStyle: 'bold',
      color: '#a29bfe',
    }, 14, speedY);
    objs.push(lbl3);

    const speeds = [1, 1.5, 2, 3, 5];
    let spX = 14;
    const spY = speedY + 18;
    speeds.forEach((s) => {
      this.createSimpleButton(spX, spY, 52, 24, `${s}x`, () => this.debugOpts.onSetSpeed?.(s), objs);
      spX += 60;
    });

    this.tabObjects.set('features', objs);
    this.contentContainer.add(objs);
  }

  private createCheckbox(
    x: number,
    y: number,
    w: number,
    key: string,
    label: I18nKey,
    onChange: (checked: boolean) => void,
    objs: Phaser.GameObjects.GameObject[],
  ): void {
    const boxSize = 16;
    const boxGfx = this.scene.add.graphics();
    const txt = mkText(this.scene, label, {
      fontSize: '11px',
      fontFamily: FONT.mono,
      color: '#e2e8f0',
    }, x + boxSize + 8, y + 2);

    const zone = this.scene.add
      .zone(x + w / 2, y + boxSize / 2, w, boxSize + 4)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    const draw = (checked: boolean) => {
      boxGfx.clear();
      if (checked) {
        boxGfx.fillStyle(0x00cec9, 1);
        boxGfx.fillRoundedRect(x, y, boxSize, boxSize, 3);
        boxGfx.lineStyle(1.5, 0x81ecec, 1);
        boxGfx.strokeRoundedRect(x, y, boxSize, boxSize, 3);
        boxGfx.lineStyle(2, 0x0f172a, 1);
        boxGfx.beginPath();
        boxGfx.moveTo(x + 3, y + 8);
        boxGfx.lineTo(x + 7, y + 12);
        boxGfx.lineTo(x + 13, y + 4);
        boxGfx.strokePath();
        txt.setColor('#81ecec');
      } else {
        boxGfx.fillStyle(0x1e293b, 0.8);
        boxGfx.fillRoundedRect(x, y, boxSize, boxSize, 3);
        boxGfx.lineStyle(1, 0x475569, 1);
        boxGfx.strokeRoundedRect(x, y, boxSize, boxSize, 3);
        txt.setColor('#94a3b8');
      }
    };

    const initial = this.toggleStates[key] ?? false;
    draw(initial);

    zone.on('pointerdown', () => {
      const next = !this.toggleStates[key];
      this.toggleStates[key] = next;
      draw(next);
      onChange(next);
    });

    this.checkboxSetters.set(key, (val: boolean) => {
      this.toggleStates[key] = val;
      draw(val);
    });

    objs.push(boxGfx, txt, zone);
  }

  private createSimpleButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: I18nKey | string,
    onClick: () => void,
    objs: Phaser.GameObjects.GameObject[],
  ): void {
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0x1e293b, 0.85);
    gfx.fillRoundedRect(x, y, w, h, 4);
    gfx.lineStyle(1, 0x00cec9, 0.7);
    gfx.strokeRoundedRect(x, y, w, h, 4);

    const txt = mkText(this.scene, label, {
      fontSize: '11px',
      fontFamily: FONT.mono,
      color: '#e2e8f0',
    }, x + w / 2, y + h / 2).setOrigin(0.5, 0.5);

    const zone = this.scene.add
      .zone(x + w / 2, y + h / 2, w, h)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerdown', onClick);
    zone.on('pointerover', () => {
      gfx.clear();
      gfx.fillStyle(0x00cec9, 0.25);
      gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1.5, 0x00cec9, 1);
      gfx.strokeRoundedRect(x, y, w, h, 4);
      txt.setColor('#81ecec');
    });
    zone.on('pointerout', () => {
      gfx.clear();
      gfx.fillStyle(0x1e293b, 0.85);
      gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1, 0x00cec9, 0.7);
      gfx.strokeRoundedRect(x, y, w, h, 4);
      txt.setColor('#e2e8f0');
    });

    objs.push(gfx, txt, zone);
  }

  private showInputs(): void {
    // Không dùng input DOM nổi nếu không cần thiết
  }

  private hideInputs(): void {
    if (this.inputXEl) this.inputXEl.style.display = 'none';
    if (this.inputYEl) this.inputYEl.style.display = 'none';
  }

  public setToggleState(key: string, val: boolean): void {
    const setter = this.checkboxSetters.get(key);
    if (setter) setter(val);
    else this.toggleStates[key] = val;

    if (this.pinButtons.has(key)) {
      this.renderPinButton(key);
    }
  }

  public getToggleState(key: string): boolean {
    return this.toggleStates[key] ?? false;
  }

  /**
   * Cập nhật số liệu động thời gian thực mỗi frame
   */
  public updateInfo(map: DebugMapInfo, p: DebugPlayerInfo): void {
    if (p.isNoclip !== undefined && p.isNoclip !== this.toggleStates.noclip) {
      this.toggleStates.noclip = p.isNoclip;
      const setter = this.checkboxSetters.get('noclip');
      if (setter) setter(p.isNoclip);
    }

    if (!this.open || this.isMinimized || this.activeTab !== 'info') return;

    // Map
    this.txtMapMain.setText(`${t('DBG_MAP_MAIN')}${map.name} (${map.id})\nTiles: ${map.widthTiles}×${map.heightTiles} (${map.widthPx}×${map.heightPx}px)`);
    this.txtMapDetails.setText(`${t('DBG_MAP_TILESET')}${map.tilesetName}\nLayers: ${map.layersCount}${t('DBG_MAP_LAYERS')}\nWarps: ${map.warpsCount}${t('DBG_MAP_WARPS')}\n${t('DBG_MAP_ENCOUNTER')}${map.encounterRate ?? 0}%`);

    // Player
    const noclipStr = p.isNoclip ? t('DBG_PLAYER_NOCLIP') : '';
    this.txtPlayerMain.setText(`Pixel: (${Math.round(p.x)}, ${Math.round(p.y)})\nTile: [${p.tileX}, ${p.tileY}]  ${p.direction.toUpperCase()}`);
    this.txtPlayerDetails.setText(`${t('DBG_PLAYER_STATE')}${p.isMoving ? 'MOVING' : 'IDLE'}${noclipStr}\n${t('DBG_PLAYER_SPEED')}${p.speed}px/s\nFPS: ${p.fps}`);

    // Camera
    this.txtPerf.setText(`${t('DBG_FPS_NOW')}${p.fps}\n${t('DBG_CAM_POS')}(${Math.round(p.camX)}, ${Math.round(p.camY)})\n${t('DBG_ZOOM')}${p.zoom.toFixed(2)}x`);

    // Server
    this.txtServer.setText(`Status: Connected\nPing: < 20ms\n${t('DBG_ACTIVE_PLAYERS')}1\nMap: ${map.id}`);
  }

  destroy(): void {
    this.unsubLang?.();
    this.unsubTabs.forEach((f) => f());
    this.unsubTabs = [];
    super.destroy?.();
  }
}
