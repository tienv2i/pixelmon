import Phaser from 'phaser';
import { C, FONT, ts } from './theme';
import { UiModal } from './UiModal';
import { t, mkText, onLangChange, getLang } from '../i18n';
import { SoundManager } from '../audio/SoundManager';
import townMapData from '@pixelmon/shared/data/town_map.json';
import encountersData from '@pixelmon/shared/data/encounters.json';
import { getTownMapCoords, MAPS } from '@pixelmon/shared';

const MODAL_W = 600;
const MODAL_H = 480;
const HEADER_H = 34;
const MAP_W = 480;
const MAP_H = 320;
const MAP_X = 60;
const MAP_Y = 10;
const TILE_SIZE = 16;

interface TownPointDef {
  x: number;
  y: number;
  name: string;
  poi?: string;
  mapId?: string;
  flyMap?: number;
  flyX?: number;
  flyY?: number;
  description?: string;
  descriptionEn?: string;
  facilities?: string[];
}

function loadTextureImage(scene: Phaser.Scene, key: string, url: string): Promise<boolean> {
  if (scene.textures.exists(key)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * **TownMapModal** — Bản đồ vùng (Town Map / Region Map):
 * - Hiển thị bản đồ lớn toàn vùng Essen (`mapRegion0.png`, 480x320 px).
 * - Marker vị trí người chơi nhấp nháy tại toạ độ tương ứng từ `currentMapId`.
 * - Hiển thị các điểm POI (thị trấn, tuyến đường, cơ sở).
 * - Tương tác hover / click điểm để xem thông tin chi tiết, cơ sở và Pokémon hoang dã từ `encounters.json`.
 * - Thanh trạng thái retro bo góc neon sang trọng.
 */
export class TownMapModal extends UiModal {
  private currentMapId = 'lappet-town';
  private selectedPoint: TownPointDef | null = null;
  private hoveredPoint: TownPointDef | null = null;

  // Render elements
  private mapImage?: Phaser.GameObjects.Image;
  private cursorFrame?: Phaser.GameObjects.Graphics;
  private playerMarker?: Phaser.GameObjects.Container;
  private playerTween?: Phaser.Tweens.Tween;
  private radarGraphics?: Phaser.GameObjects.Graphics;
  private poiContainer?: Phaser.GameObjects.Container;

  // Bottom info panel elements
  private infoPanelBg?: Phaser.GameObjects.Graphics;
  private locTitleText?: Phaser.GameObjects.Text;
  private locCoordsText?: Phaser.GameObjects.Text;
  private locDescText?: Phaser.GameObjects.Text;
  private locFacilitiesText?: Phaser.GameObjects.Text;
  private locEncountersText?: Phaser.GameObjects.Text;
  private locEncountersHeader?: Phaser.GameObjects.Text;

  private unsubLang?: () => void;
  private escKeyHandler?: (e: KeyboardEvent) => void;

  // Cached encounter lookup by mapId or name
  private encountersMap = new Map<string, string[]>();

  constructor(scene: Phaser.Scene, onClose?: () => void) {
    super(scene, {
      title: t('TOWN_MAP_TITLE'),
      width: MODAL_W,
      height: MODAL_H,
      headerHeight: HEADER_H,
      draggable: true,
      docked: true,
      dockOnOpen: true,
      lockUi: true,
      lockGameOnly: true,
      overlay: true,
      depth: 210,
      showClose: true,
      showMinimize: true,
      showDock: true,
      defaultAlign: 'center',
      onClose: () => {
        SoundManager.getInstance(this.scene).playSe('gui_menu_close');
        onClose?.();
      },
    });

    this.buildEncountersMap();
    this.preloadAssets().then(() => {
      this.buildContent();
      this.updatePlayerPosition();
    });

    this.close();

    // Lắng nghe đổi ngôn ngữ
    this.unsubLang = onLangChange(() => {
      this.setTitle(t('TOWN_MAP_TITLE'));
      this.refreshInfoPanel();
    });

    // Lắng nghe phím ESC để đóng khi modal đang mở
    this.escKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    };
    window.addEventListener('keydown', this.escKeyHandler);
  }

  private buildEncountersMap(): void {
    const rawList = encountersData as Array<{
      mapId: string;
      mapName: string;
      spawns: Array<{ species: string }>;
    }>;

    for (const entry of rawList) {
      const speciesSet = new Set<string>();
      for (const sp of entry.spawns) {
        speciesSet.add(capitalize(sp.species));
      }
      const list = Array.from(speciesSet);

      if (entry.mapId) {
        this.encountersMap.set(entry.mapId.toLowerCase(), list);
      }
      if (entry.mapName) {
        this.encountersMap.set(entry.mapName.toLowerCase(), list);
      }
    }

    // Map alias cho Route 2 (trong encounters.json có mapId "map-8")
    if (this.encountersMap.has('map-8')) {
      this.encountersMap.set('route-2', this.encountersMap.get('map-8')!);
    }
  }

  private async preloadAssets(): Promise<void> {
    await Promise.all([
      loadTextureImage(this.scene, 'town_map_region0', townMapData.image),
      loadTextureImage(this.scene, 'town_map_player_red', '/assets/ui/town_map/player_POKEMONTRAINER_Red.png'),
      loadTextureImage(this.scene, 'town_map_cursor', '/assets/ui/town_map/cursor.png'),
    ]);
  }

  private buildContent(): void {
    // ── 1. Khung viền ngoài neon bao quanh bản đồ ──
    const mapBorder = this.scene.add.graphics();
    // Nền tối phía sau ảnh
    mapBorder.fillStyle(0x0c0e1e, 1);
    mapBorder.fillRoundedRect(MAP_X - 4, MAP_Y - 4, MAP_W + 8, MAP_H + 8, 6);
    // Viền neon kép
    mapBorder.lineStyle(2, 0x00cec9, 0.85);
    mapBorder.strokeRoundedRect(MAP_X - 4, MAP_Y - 4, MAP_W + 8, MAP_H + 8, 6);
    mapBorder.lineStyle(1, 0x2e3358, 0.7);
    mapBorder.strokeRoundedRect(MAP_X - 2, MAP_Y - 2, MAP_W + 4, MAP_H + 4, 4);
    this.contentContainer.add(mapBorder);

    // ── 2. Ảnh bản đồ vùng Essen 480x320 ──
    if (this.scene.textures.exists('town_map_region0')) {
      this.mapImage = this.scene.add
        .image(MAP_X, MAP_Y, 'town_map_region0')
        .setOrigin(0, 0)
        .setDisplaySize(MAP_W, MAP_H);
      this.contentContainer.add(this.mapImage);
    }

    // ── 3. Container cho các điểm POI trên bản đồ ──
    this.poiContainer = this.scene.add.container(0, 0);
    this.contentContainer.add(this.poiContainer);

    // Con trỏ nhắm neon (Cursor Frame)
    this.cursorFrame = this.scene.add.graphics().setVisible(false);
    this.contentContainer.add(this.cursorFrame);

    this.renderPoiPoints();

    // ── 4. Marker người chơi (Player Marker) ──
    this.buildPlayerMarker();

    // ── 5. Thanh thông tin trạng thái bên dưới (Status Panel) ──
    this.buildBottomPanel();
  }

  private renderPoiPoints(): void {
    if (!this.poiContainer) return;
    this.poiContainer.removeAll(true);

    const points = townMapData.points as TownPointDef[];

    for (const pt of points) {
      const cx = MAP_X + pt.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = MAP_Y + pt.y * TILE_SIZE + TILE_SIZE / 2;

      const isMajor =
        (pt.facilities && pt.facilities.length > 0) ||
        pt.name.includes('Town') ||
        pt.name.includes('City') ||
        pt.name.includes('Plateau') ||
        pt.name.includes('Frontier') ||
        pt.name.includes('Safari');

      // Điểm chấm trên bản đồ
      const dotGfx = this.scene.add.graphics();
      if (isMajor) {
        // Đô thị / Địa danh lớn: chấm vàng/đỏ viền trắng
        dotGfx.fillStyle(0xf1c40f, 0.95);
        dotGfx.fillCircle(cx, cy, 4.5);
        dotGfx.lineStyle(1.5, 0xffffff, 1);
        dotGfx.strokeCircle(cx, cy, 4.5);
      } else {
        // Tuyến đường / Hang động: chấm nhỏ màu cyan
        dotGfx.fillStyle(0x00cec9, 0.9);
        dotGfx.fillCircle(cx, cy, 3);
        dotGfx.lineStyle(1, 0x13152c, 0.8);
        dotGfx.strokeCircle(cx, cy, 3);
      }
      this.poiContainer.add(dotGfx);

      // Interactive hit zone cho ô 16x16
      const hitZone = this.scene.add
        .zone(MAP_X + pt.x * TILE_SIZE, MAP_Y + pt.y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      hitZone.on('pointerover', () => {
        this.hoveredPoint = pt;
        SoundManager.getInstance(this.scene).playSe('gui_sel_cursor', 0.5);
        this.drawCursorAt(pt.x, pt.y);
        this.refreshInfoPanel();
      });

      hitZone.on('pointerout', () => {
        this.hoveredPoint = null;
        if (this.selectedPoint) {
          this.drawCursorAt(this.selectedPoint.x, this.selectedPoint.y);
        } else {
          this.cursorFrame?.setVisible(false);
        }
        this.refreshInfoPanel();
      });

      hitZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.selectedPoint = pt;
        SoundManager.getInstance(this.scene).playSe('gui_sel_decision', 0.6);
        this.drawCursorAt(pt.x, pt.y);
        this.refreshInfoPanel();
      });

      this.poiContainer.add(hitZone);
    }
  }

  private drawCursorAt(gx: number, gy: number): void {
    if (!this.cursorFrame) return;
    this.cursorFrame.clear();
    this.cursorFrame.setVisible(true);

    const x = MAP_X + gx * TILE_SIZE;
    const y = MAP_Y + gy * TILE_SIZE;

    // Vẽ khung ngắm retro 16x16 viền neon vàng/cyan
    this.cursorFrame.lineStyle(2, 0xf1c40f, 1);
    this.cursorFrame.strokeRect(x - 1, y - 1, TILE_SIZE + 2, TILE_SIZE + 2);

    // 4 góc ngắm nhấp nháy
    this.cursorFrame.fillStyle(0x00cec9, 1);
    this.cursorFrame.fillRect(x - 2, y - 2, 4, 2);
    this.cursorFrame.fillRect(x - 2, y - 2, 2, 4);

    this.cursorFrame.fillRect(x + TILE_SIZE - 2, y - 2, 4, 2);
    this.cursorFrame.fillRect(x + TILE_SIZE, y - 2, 2, 4);

    this.cursorFrame.fillRect(x - 2, y + TILE_SIZE, 4, 2);
    this.cursorFrame.fillRect(x - 2, y + TILE_SIZE - 2, 2, 4);

    this.cursorFrame.fillRect(x + TILE_SIZE - 2, y + TILE_SIZE, 4, 2);
    this.cursorFrame.fillRect(x + TILE_SIZE, y + TILE_SIZE - 2, 2, 4);
  }

  private buildPlayerMarker(): void {
    this.playerMarker = this.scene.add.container(0, 0);
    this.contentContainer.add(this.playerMarker);

    // Vòng phát sóng radar
    this.radarGraphics = this.scene.add.graphics();
    this.playerMarker.add(this.radarGraphics);

    // Sprite nhân vật Red
    if (this.scene.textures.exists('town_map_player_red')) {
      const sprite = this.scene.add
        .image(0, 0, 'town_map_player_red')
        .setOrigin(0.5, 0.5)
        .setDisplaySize(22, 22);
      this.playerMarker.add(sprite);
    } else {
      // Fallback nếu ảnh chưa tải xong
      const fallbackDot = this.scene.add.graphics();
      fallbackDot.fillStyle(0xe74c3c, 1);
      fallbackDot.fillCircle(0, 0, 8);
      fallbackDot.lineStyle(2, 0xffffff, 1);
      fallbackDot.strokeCircle(0, 0, 8);
      this.playerMarker.add(fallbackDot);
    }

    // Badge "YOU" nhỏ phía trên đầu
    const badgeBg = this.scene.add.graphics();
    badgeBg.fillStyle(0xe74c3c, 0.95);
    badgeBg.fillRoundedRect(-14, -22, 28, 12, 3);
    badgeBg.lineStyle(1, 0xffffff, 0.9);
    badgeBg.strokeRoundedRect(-14, -22, 28, 12, 3);
    this.playerMarker.add(badgeBg);

    const badgeTxt = this.scene.add
      .text(0, -16, 'YOU', ts(8, '#ffffff', FONT.mono))
      .setOrigin(0.5, 0.5)
      .setStyle({ fontStyle: 'bold' });
    this.playerMarker.add(badgeTxt);

    // Animation nhấp nháy liên tục cho Marker người chơi
    this.playerTween = this.scene.tweens.add({
      targets: this.playerMarker,
      alpha: { from: 1, to: 0.35 },
      scaleX: { from: 1, to: 1.1 },
      scaleY: { from: 1, to: 1.1 },
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private updatePlayerPosition(): void {
    if (!this.playerMarker) return;

    const coords = getTownMapCoords(this.currentMapId);
    const px = MAP_X + coords.x * TILE_SIZE + TILE_SIZE / 2;
    const py = MAP_Y + coords.y * TILE_SIZE + TILE_SIZE / 2;

    this.playerMarker.setPosition(px, py);

    // Mặc định chọn điểm hiện tại của player nếu chưa chọn điểm nào
    if (!this.selectedPoint) {
      const points = townMapData.points as TownPointDef[];
      const match = points.find((p) => p.x === coords.x && p.y === coords.y);
      if (match) {
        this.selectedPoint = match;
        this.drawCursorAt(match.x, match.y);
      }
    }

    this.refreshInfoPanel();
  }

  private buildBottomPanel(): void {
    const panX = 20;
    const panY = 340;
    const panW = MODAL_W - 40; // 560
    const panH = 96;

    // Nền panel thông tin
    this.infoPanelBg = this.scene.add.graphics();
    this.infoPanelBg.fillStyle(0x13152c, 0.95);
    this.infoPanelBg.fillRoundedRect(panX, panY, panW, panH, 6);
    this.infoPanelBg.lineStyle(1.5, 0x2e3358, 0.9);
    this.infoPanelBg.strokeRoundedRect(panX, panY, panW, panH, 6);

    // Vạch ngăn chia 2 cột giữa panel
    this.infoPanelBg.lineStyle(1, 0x24284d, 0.8);
    this.infoPanelBg.lineBetween(panX + 280, panY + 8, panX + 280, panY + panH - 8);
    this.contentContainer.add(this.infoPanelBg);

    // ── Cột trái: Tên địa danh, toạ độ, mô tả, cơ sở ──
    const colLeftX = panX + 12;
    let curY = panY + 8;

    this.locTitleText = this.scene.add
      .text(colLeftX, curY, '', ts(12, '#ffeaa7', FONT.ui))
      .setOrigin(0, 0)
      .setStyle({ fontStyle: 'bold' });
    this.contentContainer.add(this.locTitleText);

    this.locCoordsText = this.scene.add
      .text(colLeftX + 256, curY + 2, '', ts(9, '#00cec9', FONT.mono))
      .setOrigin(1, 0);
    this.contentContainer.add(this.locCoordsText);

    curY += 18;

    this.locDescText = this.scene.add
      .text(colLeftX, curY, '', ts(9, '#b2bec3', FONT.ui))
      .setOrigin(0, 0)
      .setWordWrapWidth(260);
    this.contentContainer.add(this.locDescText);

    curY += 28;

    this.locFacilitiesText = this.scene.add
      .text(colLeftX, curY, '', ts(9, '#fab1a0', FONT.ui))
      .setOrigin(0, 0)
      .setWordWrapWidth(260);
    this.contentContainer.add(this.locFacilitiesText);

    // ── Cột phải: Danh sách Pokémon hoang dã ──
    const colRightX = panX + 292;
    curY = panY + 8;

    this.locEncountersHeader = this.scene.add
      .text(colRightX, curY, `🌿 ${t('TOWN_MAP_WILD_PKMN')}`, ts(11, '#55efc4', FONT.ui))
      .setOrigin(0, 0)
      .setStyle({ fontStyle: 'bold' });
    this.contentContainer.add(this.locEncountersHeader);

    curY += 20;

    this.locEncountersText = this.scene.add
      .text(colRightX, curY, '', ts(9, '#dfe6e9', FONT.ui))
      .setOrigin(0, 0)
      .setWordWrapWidth(256);
    this.contentContainer.add(this.locEncountersText);

    // Nút đóng ESC nhỏ ở góc dưới phải
    const closeBtnBg = this.scene.add.graphics();
    const btnW = 92;
    const btnH = 20;
    const btnX = panX + panW - btnW - 8;
    const btnY = panY + panH - btnH - 6;

    closeBtnBg.fillStyle(0x24284d, 0.9);
    closeBtnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 3);
    closeBtnBg.lineStyle(1, 0x00cec9, 0.7);
    closeBtnBg.strokeRoundedRect(btnX, btnY, btnW, btnH, 3);
    this.contentContainer.add(closeBtnBg);

    const closeBtnTxt = this.scene.add
      .text(btnX + btnW / 2, btnY + btnH / 2, t('TOWN_MAP_CLOSE'), ts(9, '#00cec9', FONT.mono))
      .setOrigin(0.5, 0.5);
    this.contentContainer.add(closeBtnTxt);

    const closeZone = this.scene.add
      .zone(btnX, btnY, btnW, btnH)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    closeZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.close();
    });
    this.contentContainer.add(closeZone);

    this.refreshInfoPanel();
  }

  private refreshInfoPanel(): void {
    const target = this.hoveredPoint ?? this.selectedPoint;
    const isEn = getLang() === 'en';

    if (!target) {
      this.locTitleText?.setText(`🗺️ ${t('TOWN_MAP_HOVER_HINT')}`);
      this.locCoordsText?.setText('');
      this.locDescText?.setText('');
      this.locFacilitiesText?.setText('');
      this.locEncountersText?.setText('');
      return;
    }

    // Tên địa danh
    let titleStr = `📍 ${target.name}`;
    if (target.poi) {
      titleStr += ` (${target.poi})`;
    }
    this.locTitleText?.setText(titleStr);

    // Toạ độ
    this.locCoordsText?.setText(`Grid: [${target.x}, ${target.y}]`);

    // Mô tả
    const desc = isEn ? target.descriptionEn ?? target.description : target.description;
    this.locDescText?.setText(desc || (isEn ? 'No description available.' : 'Chưa có thông tin mô tả chi tiết.'));

    // Cơ sở
    if (target.facilities && target.facilities.length > 0) {
      this.locFacilitiesText?.setText(`🏢 ${t('TOWN_MAP_FACILITIES')} ${target.facilities.join(', ')}`);
    } else {
      this.locFacilitiesText?.setText(`🏢 ${t('TOWN_MAP_FACILITIES')} ${t('TOWN_MAP_NONE')}`);
    }

    // Encounters
    if (this.locEncountersHeader) {
      this.locEncountersHeader.setText(`🌿 ${t('TOWN_MAP_WILD_PKMN')}`);
    }

    let wildList: string[] = [];
    if (target.mapId && this.encountersMap.has(target.mapId.toLowerCase())) {
      wildList = this.encountersMap.get(target.mapId.toLowerCase())!;
    } else if (this.encountersMap.has(target.name.toLowerCase())) {
      wildList = this.encountersMap.get(target.name.toLowerCase())!;
    }

    if (wildList.length > 0) {
      this.locEncountersText?.setText(wildList.join(' • '));
    } else {
      this.locEncountersText?.setText(t('TOWN_MAP_NO_WILD'));
    }
  }

  /**
   * Cập nhật vị trí hiện tại của người chơi theo mapId và mở modal.
   */
  public showForMap(mapId: string): void {
    this.currentMapId = mapId;
    this.updatePlayerPosition();
    this.show();
    SoundManager.getInstance(this.scene).playSe('gui_menu_open');
  }

  /**
   * Thiết lập mapId hiện tại của người chơi.
   */
  public setCurrentMapId(mapId: string): void {
    if (this.currentMapId !== mapId) {
      this.currentMapId = mapId;
      this.updatePlayerPosition();
    }
  }

  destroy(): void {
    if (this.escKeyHandler) {
      window.removeEventListener('keydown', this.escKeyHandler);
    }
    this.unsubLang?.();
    this.playerTween?.stop();
    super.destroy?.();
  }
}
