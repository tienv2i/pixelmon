import Phaser from 'phaser';
import { UiModal, type UiModalOptions } from './UiModal';
import { C, FONT, ts } from './theme';
import { ColyseusManager } from '../network/ColyseusManager';
import { t, mkText, onLangChange } from '../i18n';

/**
 * BattleModal — **Cửa sổ battle dạng popup** (Plan 44 Phase 3b, hoàn thiện layout).
 *
 * Layout 4 lớp rõ ràng, không chồng nhau:
 * - **Title**: thanh header (0–34)
 * - **Opponent**: foe plate góc trên trái (tên/level/HP)
 * - **Player**: ally plate góc dưới phải (tên/level/HP/EXP)
 * - **Bottom row**: khung text (trái) + khung chọn FIGHT/POKÉMON/BAG/RUN (phải) — cùng 1 dòng
 */

export interface BattleInitData {
  token?: string;
  foe?: BattleMemberView;
  ally?: BattleMemberView[];
}

interface BattleMemberView {
  id: string;
  speciesId: string;
  nickname: string;
  level: number;
  types?: string[];
  maxHp: number;
  currentHp: number;
  moves?: Array<{ id: string; name: string; type: string; maxPp: number }>;
}

interface MoveView {
  id: string;
  name: string;
  type: string;
  maxPp: number;
}

type MenuMode = 'command' | 'move' | 'switch' | 'none';

const M_W = 660;
const M_H = 440;

// ── Layout bands (4 lớp rõ ràng, không chồng nhau) ──
const FIELD_TOP = 40; // dưới title bar
const FIELD_BOTTOM = 284; // trên bottom row
const BOTTOM_Y = 288; // bottom row top
const BOTTOM_H = M_H - 34 - BOTTOM_Y; // 118
const MSG_X = 14;
const MSG_W = 360;
const ACT_X = 388;
const ACT_W = M_W - ACT_X - 14; // 258

// ── Pokémon info plate (mẫu) ──
// ┌──────────────────────────────────┐
// │ Name ♂ Lv.5            [item]   │
// │ [status]  HP ████████░░ 12/20   │
// │                                 │  ← chừa chỗ (reserved)
// └──────────────────────────────────┘
const PLATE_H = 78;
const PLATE_NAME_Y = 10; // dòng 1: name + gender + Lv
const PLATE_STATUS_Y = 34; // dòng 2: status + HP bar + số
const PLATE_RESERVED_Y = 56; // dòng 3: chừa chỗ status/effect
const PLATE_ITEM_W = 40; // ô item góc phải
const PLATE_ITEM_H = 24;
const PLATE_ITEM_GAP = 8;
/** Bề rộng thanh EXP (nằm ngoài plate, chỉ Pokémon của user). */
const EXP_BAR_W = 190;

const COL = {
  sky: 0x24314a,
  ground: 0x2f6b46,
  hpGreen: 0x2ecc71,
  hpYellow: 0xf1c40f,
  hpRed: 0xe74c3c,
  expBar: 0x3498db,
  plate: 0x0e1422,
  border: 0x3f5070,
  btn: '#2f3f5f',
  btnHover: '#4a608c',
  btnOff: '#1e2636',
  track: 0x1a2030,
};

const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  electric: '#F8D030',
  grass: '#78C850',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  steel: '#B8B8D0',
  fairy: '#EE99AC',
};

export class BattleModal extends UiModal {
  private net = ColyseusManager.getInstance();
  private init: BattleInitData;
  private mode: MenuMode = 'command';
  private ended = false;
  private unsubState?: () => void;
  private unsubLang?: () => void;
  private stateListener?: (state: unknown) => void;
  private built = false;

  private moveInfo = new Map<string, MoveView>();

  // ── Objects ──
  private bg?: Phaser.GameObjects.Graphics;
  private battlebackImg?: Phaser.GameObjects.TileSprite;
  private foeSprite?: Phaser.GameObjects.Image;
  private allySprite?: Phaser.GameObjects.Image;
  private foeShadow?: Phaser.GameObjects.Ellipse;
  private allyShadow?: Phaser.GameObjects.Ellipse;
  private foeHp?: Phaser.GameObjects.Rectangle;
  private allyHp?: Phaser.GameObjects.Rectangle;
  private allyExp?: Phaser.GameObjects.Rectangle;
  private foeHpTrack?: Phaser.GameObjects.Rectangle;
  private allyHpTrack?: Phaser.GameObjects.Rectangle;
  private foeName?: Phaser.GameObjects.Text;
  private allyName?: Phaser.GameObjects.Text;
  private foeHpText?: Phaser.GameObjects.Text;
  private allyHpText?: Phaser.GameObjects.Text;
  private foeStatus?: Phaser.GameObjects.Text;
  private allyStatus?: Phaser.GameObjects.Text;
  private foeItem?: Phaser.GameObjects.Rectangle;
  private allyItem?: Phaser.GameObjects.Rectangle;
  private allyExpLabel?: Phaser.GameObjects.Text;
  private msgText?: Phaser.GameObjects.Text;
  private msgText2?: Phaser.GameObjects.Text;
  private turnText?: Phaser.GameObjects.Text;
  private popText?: Phaser.GameObjects.Text;
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private endObjs: Phaser.GameObjects.GameObject[] = [];
  private lastFoeHp = -1;
  private lastAllyHp = -1;
  private lastLogLen = 0;
  private needSwitch = false;
  private keyboardHandler?: (e: KeyboardEvent) => void;

  static async loadTextures(scene: Phaser.Scene, data: BattleInitData): Promise<void> {
    const origin = (() => {
      const url: string = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567';
      return url.replace(/^ws/, 'http');
    })();
    const jobs: Promise<boolean>[] = [];
    const foe = data.foe;
    const ally = (data.ally ?? [])[0];
    if (foe?.speciesId) {
      jobs.push(BattleModal.loadTexture(scene, 'battle_foe_front', `${origin}/assets/battlers/front/${foe.speciesId}.png`));
    }
    if (ally?.speciesId) {
      jobs.push(BattleModal.loadTexture(scene, 'battle_ally_back', `${origin}/assets/battlers/back/${ally.speciesId}.png`));
    }
    jobs.push(BattleModal.loadTexture(scene, 'battleback_ground', `${origin}/assets/battlebacks/grass_base0.png`));
    await Promise.all(jobs);
  }

  private static loadTexture(scene: Phaser.Scene, key: string, url: string): Promise<boolean> {
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

  private static ensureFallback(scene: Phaser.Scene, key: string, color: number): void {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    g.fillCircle(80, 80, 70);
    g.generateTexture(key, 160, 160);
    g.destroy();
  }

  constructor(
    scene: Phaser.Scene,
    data: BattleInitData,
    private onFinished: (result: string) => void,
    private onRun?: () => void,
  ) {    const opts: UiModalOptions = {
      title: t('BATTLE_TITLE'),
      width: M_W,
      height: M_H,
      lockUi: true,
      showClose: false,
      showMinimize: false,
      showDock: false,
      draggable: false,
      defaultAlign: 'center',
      depth: 300,
    };
    super(scene, opts);
    this.init = data ?? {};
    this.collectMoveInfo();

    const room = this.net.battle;
    if (room) {
      this.stateListener = () => this.syncFromState();
      room.onStateChange(this.stateListener);
      this.unsubState = () => {
        if (this.stateListener) room.onStateChange.remove(this.stateListener);
      };
    }
    this.unsubLang = onLangChange(() => this.refreshLabels());
    this.buildContent();
    this.show();

    this.keyboardHandler = (e: KeyboardEvent) => this.handleKey(e);
    window.addEventListener('keydown', this.keyboardHandler);

    if (!room) {
      this.msgText?.setText(t('BATTLE_CONNECTION_FAILED'));
      scene.time.delayedCall(1500, () => this.finish('error'));
    }
  }

  private collectMoveInfo(): void {
    this.moveInfo.clear();
    for (const m of this.init.ally ?? []) {
      for (const mv of m.moves ?? []) {
        this.moveInfo.set(mv.id, {
          id: mv.id,
          name: mv.name ?? mv.id,
          type: mv.type ?? 'normal',
          maxPp: mv.maxPp ?? 10,
        });
      }
    }
  }

  // ── Build ───────────────────────────────────────────────────────────────

  private add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.contentContainer.add(obj);
    return obj;
  }

  private buildContent(): void {
    if (this.built) return;
    this.built = true;

    BattleModal.ensureFallback(this.scene, 'battle_foe_front', 0xe67e22);
    BattleModal.ensureFallback(this.scene, 'battle_ally_back', 0x2980b9);

    const w = M_W;
    const h = M_H - 34; // 406

    // Background battleback: chỉ phủ vùng 2 Pokémon (FIELD 40–284), KHÔNG phủ
    // khung text/hành động ở bottom row (288–406).
    this.bg = this.add(this.scene.add.graphics());
    this.bg.fillStyle(COL.sky, 1);
    this.bg.fillRect(0, FIELD_TOP, w, (FIELD_BOTTOM - FIELD_TOP) * 0.6);
    this.bg.fillStyle(COL.ground, 1);
    this.bg.fillRect(0, FIELD_TOP + (FIELD_BOTTOM - FIELD_TOP) * 0.6, w, (FIELD_BOTTOM - FIELD_TOP) * 0.4);
    this.bg.lineStyle(1, COL.border, 0.5);
    this.bg.strokeRect(0.5, FIELD_TOP + 0.5, w - 1, FIELD_BOTTOM - FIELD_TOP - 1);

    // Battleback overlay: dùng TileSprite giữ nguyên tỉ lệ pixel (không stretch
    // toàn khung → tránh hiệu ứng cỏ bị nhòe như bản cũ).
    if (this.scene.textures.exists('battleback_ground')) {
      const tex = this.scene.textures.get('battleback_ground').getSourceImage();
      const groundH = (FIELD_BOTTOM - FIELD_TOP) * 0.4;
      this.battlebackImg = this.add(
        this.scene.add
          .tileSprite(0, FIELD_TOP + (FIELD_BOTTOM - FIELD_TOP) * 0.6, w, groundH, 'battleback_ground')
          .setOrigin(0, 0)
          .setAlpha(0.35),
      );
      // Căn giữa 1 lần tile theo trục X để không có mép cắt rõ.
      if (tex && tex.width > 0) {
        (this.battlebackImg as Phaser.GameObjects.TileSprite).tilePositionX = -(w % tex.width) / 2;
      }
    }

    // ── LỚP 2: SÀN TRẬN ĐẤU (FIELD) — y 40…284 ──
    // Platform shadows.
    this.foeShadow = this.add(this.scene.add.ellipse(w * 0.7, 150, 120, 24, 0x000000, 0.35));
    this.allyShadow = this.add(this.scene.add.ellipse(w * 0.25, 220, 120, 24, 0x000000, 0.35));

    // Sprites.
    this.foeSprite = this.add(this.scene.add.image(w * 0.7, 140, 'battle_foe_front'));
    this.allySprite = this.add(this.scene.add.image(w * 0.25, 210, 'battle_ally_back'));
    this.fitSprite(this.foeSprite, 140);
    this.fitSprite(this.allySprite, 140);

    // ── OPPONENT PLATE (góc trên trái, trong field) ──
    const foePlate = this.buildInfoPlate({ x: 14, y: FIELD_TOP + 6, w: 240 });
    this.foeName = foePlate.name;
    this.foeHp = foePlate.hp;
    this.foeHpTrack = foePlate.hpTrack;
    this.foeHpText = foePlate.hpText;
    this.foeStatus = foePlate.status;
    this.foeItem = foePlate.item;

    // ── PLAYER PLATE (góc dưới phải, trong field) + dòng EXP bên dưới ──
    const allyPlateW = 240;
    const allyPlateH = PLATE_H;
    const allyPlateX = w - allyPlateW - 14;
    const allyPlateY = FIELD_BOTTOM - allyPlateH - 16;
    const allyPlate = this.buildInfoPlate({ x: allyPlateX, y: allyPlateY, w: allyPlateW });
    this.allyName = allyPlate.name;
    this.allyHp = allyPlate.hp;
    this.allyHpTrack = allyPlate.hpTrack;
    this.allyHpText = allyPlate.hpText;
    this.allyStatus = allyPlate.status;
    this.allyItem = allyPlate.item;
    // Dòng EXP (chỉ Pokémon của user) — nằm dưới plate.
    const expLabel = this.scene.add.text(allyPlateX + 10, allyPlateY + allyPlateH + 8, 'EXP', ts(11, '#9aa0c3', FONT.ui)).setOrigin(0, 0);
    this.add(expLabel);
    this.allyExpLabel = expLabel;
    this.allyExp = this.mkBar(allyPlateX + 40, allyPlateY + allyPlateH + 10, allyPlateW - 50, COL.expBar);
    // ── LỚP 4: BOTTOM ROW — khung text (trái) + khung hành động (phải), cùng 1 dòng ──
    // Khung text (trái).
    const msgBg = this.scene.add.rectangle(MSG_X, BOTTOM_Y, MSG_W, BOTTOM_H, 0x0b101c).setOrigin(0, 0);
    msgBg.setStrokeStyle(1, COL.border);
    this.add(msgBg);

    // Turn text (dòng trên cùng của khung text).
    this.turnText = mkText(this.scene, 'BATTLE_CHOOSE_MOVE', ts(12, '#ffd76a', FONT.ui));
    this.turnText.setPosition(MSG_X + 10, BOTTOM_Y + 10);
    this.add(this.turnText);

    // 2 dòng log.
    this.msgText = mkText(this.scene, '', ts(14, '#f4f6fb', FONT.ui));
    this.msgText.setPosition(MSG_X + 10, BOTTOM_Y + 36);
    this.add(this.msgText);
    this.msgText2 = mkText(this.scene, '', ts(12, '#9aa0c3', FONT.ui));
    this.msgText2.setPosition(MSG_X + 10, BOTTOM_Y + 64);
    this.add(this.msgText2);

    // Khung hành động (phải) — nền vẽ trong buildMenu().
    this.drawMenuPlate(ACT_X, BOTTOM_Y, ACT_W, BOTTOM_H);

    // Pop text (effectiveness/crit) — giữa field.
    this.popText = this.scene.add
      .text(w / 2, FIELD_TOP + 60, '', ts(20, '#ffd76a', FONT.ui))
      .setOrigin(0.5)
      .setAlpha(0);
    this.add(this.popText);

    this.buildMenu();
    this.syncFromState();
  }

  private drawPlate(x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(COL.plate, 0.85);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, COL.border, 0.8);
    g.strokeRoundedRect(x, y, w, h, 6);
    this.add(g);
    return g;
  }

  /**
   * Dựng 1 **Pokémon info plate** theo mẫu:
   * ```
   * ┌──────────────────────────────────┐
   * │ Name ♂ Lv.5            [item]   │  ← tên + giới tính + level (1 dòng)
   * │ [status]  HP ████████░░ 12/20   │  ← status + thanh HP + số HP
   * │                                 │  ← chừa chỗ (reserved)
   * └──────────────────────────────────┘
   * ```
   * Ô góc phải dành cho **item** (Plan 45) — hiện vẽ khung trống.
   */
  private buildInfoPlate(o: {
    x: number;
    y: number;
    w: number;
  }): {
    name: Phaser.GameObjects.Text;
    hp: Phaser.GameObjects.Rectangle;
    hpTrack: Phaser.GameObjects.Rectangle;
    hpText: Phaser.GameObjects.Text;
    status: Phaser.GameObjects.Text;
    item: Phaser.GameObjects.Rectangle;
  } {
    const { x, y, w } = o;
    this.drawPlate(x, y, w, PLATE_H);

    // Dòng 1: name + gender + Lv (trái) — chừa chỗ ô item bên phải.
    const nameW = w - 20 - PLATE_ITEM_W - PLATE_ITEM_GAP;
    const name = mkText(this.scene, '', {
      fontSize: '14px',
      fontFamily: FONT.ui,
      color: '#f4f6fb',
      fixedWidth: nameW,
    });
    name.setPosition(x + 10, y + PLATE_NAME_Y).setOrigin(0, 0);
    this.add(name);

    // Ô item góc phải — reserved cho Plan 45.
    const item = this.scene.add
      .rectangle(x + w - 10 - PLATE_ITEM_W, y + PLATE_NAME_Y, PLATE_ITEM_W, PLATE_ITEM_H, COL.track)
      .setOrigin(0, 0);
    item.setStrokeStyle(1, COL.border, 0.6);
    this.add(item);

    // Dòng 2: status badge + HP bar + số HP.
    const statusW = 62;
    const status = mkText(this.scene, '', {
      fontSize: '11px',
      fontFamily: FONT.ui,
      color: '#ff9f9f',
      fixedWidth: statusW - 6,
      align: 'center',
    });
    status.setPosition(x + 10 + statusW / 2, y + PLATE_STATUS_Y + 6).setOrigin(0.5, 0);
    this.add(status);

    const barX = x + 10 + statusW;
    const barW = w - 20 - statusW - 54; // chừa 54px cho "12/20"
    const hpTrack = this.mkBarTrack(barX, y + PLATE_STATUS_Y + 2, barW);
    const hp = this.mkBar(barX, y + PLATE_STATUS_Y + 2, barW, COL.hpGreen);

    const hpText = mkText(this.scene, '', {
      fontSize: '11px',
      fontFamily: FONT.ui,
      color: '#f4f6fb',
    });
    hpText.setPosition(x + w - 10, y + PLATE_STATUS_Y).setOrigin(1, 0);
    this.add(hpText);

    // Dòng 3: chừa chỗ (reserved) — không vẽ gì để dành chỗ cho status/effect sau này.
    return { name, hp, hpTrack, hpText, status, item };
  }

  /** Vẽ nền plate cho menu switch (tự xoá bản cũ, luôn nằm dưới buttons). */
  private menuPlateGfx?: Phaser.GameObjects.Graphics;

  private drawMenuPlate(x: number, y: number, w: number, h: number): void {
    this.menuPlateGfx?.destroy();
    this.menuPlateGfx = this.drawPlate(x, y, w, h);
    // Đưa xuống đáy container (index 0) để không che các button.
    this.contentContainer.moveTo(this.menuPlateGfx, 0);
  }

  private fitSprite(sprite: Phaser.GameObjects.Image, maxSize: number): void {
    const tex = sprite.texture.getSourceImage();
    if (!tex) return;
    const scale = Math.min(maxSize / tex.width, maxSize / tex.height, 1);
    sprite.setScale(scale);
  }

  private mkPlateLabel(x: number, y: number, text: string, originX = 0): Phaser.GameObjects.Text {
    const txt = this.scene.add
      .text(x, y, text, ts(14, '#f4f6fb', FONT.ui))
      .setOrigin(originX, 0);
    this.add(txt);
    return txt;
  }

  private mkBarTrack(x: number, y: number, w: number): Phaser.GameObjects.Rectangle {
    const track = this.scene.add.rectangle(x, y, w, 9, COL.track).setOrigin(0, 0);
    track.setStrokeStyle(1, COL.border, 0.5);
    this.add(track);
    return track;
  }

  private mkBar(x: number, y: number, w: number, color: number): Phaser.GameObjects.Rectangle {
    const bar = this.scene.add.rectangle(x, y, w, 9, color).setOrigin(0, 0);
    bar.setData('full', w);
    this.add(bar);
    return bar;
  }

  /** Dòng tên: `Name ♂ Lv.5` — gộp tên + giới tính + level trong 1 dòng. */
  private nameLine(p: any): string {
    const nick = p.nickname || p.speciesId;
    const sym = p.gender === 'male' ? '♂' : p.gender === 'female' ? '♀' : '';
    return `${nick} ${sym} Lv.${p.level}`.trim();
  }

  /** Nhãn trạng thái (BRN/PAR/PSN…) — chuẩn hoá từ schema. */
  private statusText(raw: string): string {
    const s = (raw ?? '').trim();
    if (!s || s === 'none') return '';
    return s.toUpperCase();
  }

  // ── State sync ──────────────────────────────────────────────────────────

  private syncFromState(): void {
    const state = this.net.battle?.state as any;
    if (!state || !this.built) return;

    const foe = state.foe?.team?.[state.foe.activeIndex ?? 0];
    const ally = state.ally?.team?.[state.ally.activeIndex ?? 0];

    if (foe && this.foeHp) {
      this.foeName?.setText(this.nameLine(foe));
      this.foeHpText?.setText(`${foe.currentHp}/${foe.maxHp}`);
      this.foeStatus?.setText(this.statusText(foe.status));
      this.tweenBar(this.foeHp, foe.currentHp, foe.maxHp);
      if (this.lastFoeHp >= 0 && foe.currentHp < this.lastFoeHp) this.flashHit(this.foeSprite);
      this.lastFoeHp = foe.currentHp;
    }
    if (ally && this.allyHp) {
      this.allyName?.setText(this.nameLine(ally));
      this.allyHpText?.setText(`${ally.currentHp}/${ally.maxHp}`);
      this.allyStatus?.setText(this.statusText(ally.status));
      this.tweenBar(this.allyHp, ally.currentHp, ally.maxHp);
      const expPct =
        ally.expToNext > 0 ? Math.min(1, Math.max(0, (ally.exp ?? 0) / ally.expToNext)) : 1;
      if (this.allyExp) this.allyExp.width = Math.max(0, EXP_BAR_W * expPct);
      if (this.lastAllyHp >= 0 && ally.currentHp < this.lastAllyHp) this.flashHit(this.allySprite);
      this.lastAllyHp = ally.currentHp;
    }

    if (this.turnText && !this.ended) {
      if (state.phase === 'switch' || this.needSwitch) this.turnText.setText(t('BATTLE_CHOOSE_POKÉMON'));
      else if (state.phase === 'select') this.turnText.setText(`${t('BATTLE_CHOOSE_MOVE')} · ${t('BATTLE_TURN')} ${state.turn}`);
      else this.turnText.setText('');
    }

    const logArr: any[] = state.log ? Array.from(state.log) : [];
    if (logArr.length > this.lastLogLen) {
      const last = logArr[logArr.length - 1];
      const prev = logArr.length > 1 ? logArr[logArr.length - 2] : null;
      if (last && this.msgText) this.msgText.setText(String(last.text ?? ''));
      if (prev && this.msgText2) this.msgText2.setText(String(prev.text ?? ''));
      else if (this.msgText2) this.msgText2.setText('');
      this.lastLogLen = logArr.length;

      const text = String(last?.text ?? '');
      if (text.includes('super effective') || text.includes('Super effective')) {
        this.showPop(t('BATTLE_SUPER_EFFECTIVE'));
      } else if (text.includes('critical') || text.includes('Critical')) {
        this.showPop(t('BATTLE_CRITICAL_HIT'));
      } else if (text.includes('missed') || text.includes('Missed')) {
        this.showPop(t('BATTLE_MISSED'));
      }
    }

    if (state.phase === 'switch' && !this.needSwitch) {
      this.needSwitch = true;
      this.setMode('switch');
    } else if (state.phase === 'select' && this.needSwitch) {
      this.needSwitch = false;
      this.setMode('command');
    } else if (state.phase === 'select' && this.mode === 'none') {
      this.setMode('command');
    }

    if (state.winner && state.winner !== '' && !this.ended) {
      this.ended = true;
      this.showEnd(state);
    }
  }

  private tweenBar(bar: Phaser.GameObjects.Rectangle, hp: number, max: number): void {
    const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    const wFull = (bar.getData('full') as number) ?? 220;
    const targetW = Math.max(0, wFull * pct);
    bar.setData('full', wFull);
    this.scene.tweens.add({
      targets: bar,
      width: targetW,
      duration: 300,
      ease: 'Power2',
    });
    bar.fillColor = pct > 0.5 ? COL.hpGreen : pct > 0.2 ? COL.hpYellow : COL.hpRed;
  }

  private flashHit(sprite?: Phaser.GameObjects.Image): void {
    if (!sprite) return;
    sprite.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: sprite,
      x: sprite.x + 6,
      duration: 60,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        sprite.clearTint();
        sprite.setX(sprite.x - 6);
      },
    });
    this.scene.time.delayedCall(240, () => sprite.clearTint());
    this.spawnParticles(sprite.x, sprite.y);
  }

  private spawnParticles(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this.scene.add.circle(x, y, 3, 0xffd76a, 0.8);
      this.add(p);
      const angle = (Math.PI * 2 * i) / 8;
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * 30,
        y: y + Math.sin(angle) * 30,
        alpha: 0,
        scale: 0,
        duration: 400,
        ease: 'Power2',
        onComplete: () => p.destroy(),
      });
    }
  }

  private showPop(text: string): void {
    if (!this.popText) return;
    this.popText.setText(text);
    this.popText.setAlpha(0);
    this.popText.setScale(0.5);
    this.scene.tweens.add({
      targets: this.popText,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
      yoyo: true,
      hold: 600,
    });
  }

  // ── Menu ────────────────────────────────────────────────────────────────

  private setMode(mode: MenuMode): void {
    if (this.mode === mode && mode !== 'switch') return;
    this.mode = mode;
    this.buildMenu();
  }

  private clearMenu(): void {
    for (const o of this.menuObjs) o.destroy();
    this.menuObjs = [];
    this.menuPlateGfx?.destroy();
    this.menuPlateGfx = undefined;
  }

  private btn(
    label: string,
    x: number,
    y: number,
    onClick?: () => void,
    disabled = false,
    bgColor?: string,
    width?: number,
  ): Phaser.GameObjects.Text {
    const txt = mkText(this.scene, label, {
      fontSize: '14px',
      fontFamily: FONT.ui,
      color: disabled ? '#6b7a94' : '#f4f6fb',
      backgroundColor: disabled ? COL.btnOff : (bgColor ?? COL.btn),
      padding: { x: 10, y: 8 },
      align: 'center',
      fixedWidth: width ?? undefined,
    });
    // Neo về mép phải khi width được cấp (originX=1) để không tràn khỏi modal.
    txt.setPosition(x, y).setOrigin(width ? 1 : 0, 0);
    if (onClick && !disabled) {
      txt.setInteractive({ useHandCursor: true });
      txt.on('pointerover', () => txt.setStyle({ backgroundColor: COL.btnHover }));
      txt.on('pointerout', () => txt.setStyle({ backgroundColor: bgColor ?? COL.btn }));
      txt.on('pointerdown', onClick);
    }
    this.contentContainer.add(txt);
    this.menuObjs.push(txt);
    return txt;
  }

  private buildMenu(): void {
    this.clearMenu();
    if (this.ended) return;
    const state = this.net.battle?.state as any;

    // Mọi mode đều render TRONG khung hành động (ACT_X, BOTTOM_Y, ACT_W, BOTTOM_H).
    const pad = 10;
    const colW = (ACT_W - pad * 2 - 8) / 2; // 111
    const rowY = (r: number, bh: number, gap: number) => BOTTOM_Y + pad + r * (bh + gap);

    if (this.mode === 'command') {
      const btnH = 44;
      const gap = 8;
      // Khung hành động: 2×2 FIGHT / POKEMON / BALL / RUN.
      this.drawMenuPlate(ACT_X, BOTTOM_Y, ACT_W, BOTTOM_H);

      const xL = ACT_X + ACT_W - pad - colW;
      const xR = ACT_X + ACT_W - pad;
      this.btn(t('BATTLE_FIGHT'), xL, rowY(0, btnH, gap), () => this.setMode('move'), false, undefined, colW);
      this.btn(t('BATTLE_POKÉMON'), xR, rowY(0, btnH, gap), () => this.setMode('switch'), false, undefined, colW);
      this.btn(t('BATTLE_BALL'), xL, rowY(1, btnH, gap), () => this.net.sendBattleCatch('poke_ball'), false, undefined, colW);
      this.btn(t('BATTLE_RUN'), xR, rowY(1, btnH, gap), () => this.runNow(), false, undefined, colW);
      return;
    }

    if (this.mode === 'move') {
      const ally = state?.ally?.team?.[state.ally.activeIndex ?? 0];
      const moves: string[] = ally?.moves ? Array.from(ally.moves) : [];
      const pp: number[] = ally?.pp ? Array.from(ally.pp) : [];
      const btnH = 30;
      const gap = 6;
      const rows = Math.max(2, Math.ceil(Math.max(moves.length, 3) / 2));
      const plateH = rows * (btnH + gap) + gap * 2 + 8;
      this.drawMenuPlate(ACT_X, BOTTOM_Y, ACT_W, Math.min(plateH, BOTTOM_H));

      const xL = ACT_X + ACT_W - pad - colW;
      const xR = ACT_X + ACT_W - pad;
      moves.forEach((id, i) => {
        const cx = i % 2 === 0 ? xL : xR;
        const cy = BOTTOM_Y + gap + Math.floor(i / 2) * (btnH + gap);
        const left = pp[i] ?? 0;
        const info = this.moveInfo.get(id);
        const typeColor = info ? (TYPE_COLORS[info.type] ?? COL.btn) : COL.btn;
        const label = info ? `${info.name} ${left}/${info.maxPp}` : `${id} ${left}`;
        this.btn(
          label,
          cx,
          cy,
          () => {
            this.net.sendBattleMove(i);
            this.setMode('command');
          },
          left <= 0,
          typeColor,
          colW,
        );
      });

      // Back button — neo phải, hàng cuối trong khung.
      this.btn(
        t('BATTLE_BACK'),
        ACT_X + ACT_W - pad,
        BOTTOM_Y + gap + rows * (btnH + gap),
        () => this.setMode('command'),
        false,
        undefined,
        colW,
      );
      return;
    }

    if (this.mode === 'switch') {
      const team: any[] = state?.ally?.team ? Array.from(state.ally.team) : [];
      const activeIdx = state?.ally?.activeIndex ?? 0;
      const btnH = 26;
      const gap = 4;
      const fullW = ACT_W - pad * 2;
      // Danh sách team + Back — luôn nằm trong khung hành động.
      const maxRows = Math.max(2, Math.floor((BOTTOM_H - gap * 2) / (btnH + gap)) - 1);
      const shown = team.slice(0, maxRows);
      this.drawMenuPlate(ACT_X, BOTTOM_Y, ACT_W, BOTTOM_H);

      shown.forEach((p, i) => {
        const disabled = i === activeIdx || p.currentHp <= 0;
        const cy = BOTTOM_Y + gap + i * (btnH + gap);
        this.btn(
          `${p.nickname || p.speciesId} Lv.${p.level}  ${p.currentHp}/${p.maxHp}`,
          ACT_X + ACT_W - pad,
          cy,
          () => {
            this.net.sendBattleSwitch(i);
            this.setMode('command');
          },
          disabled,
          undefined,
          fullW,
        );
      });

      // Back button — neo phải, hàng cuối.
      const backY = BOTTOM_Y + gap + shown.length * (btnH + gap);
      this.btn(
        t('BATTLE_BACK'),
        ACT_X + ACT_W - pad,
        backY,
        () => this.setMode('command'),
        false,
        undefined,
        fullW,
      );
    }
  }

  // ── Keyboard ────────────────────────────────────────────────────────────

  private handleKey(e: KeyboardEvent): void {
    if (this.ended) return;
    if (this.mode === 'command') {
      if (e.key === '1') this.setMode('move');
      else if (e.key === '2') this.setMode('switch');
      else if (e.key === '3') this.net.sendBattleCatch('poke_ball');
      else if (e.key === '4') {
        this.runNow();
      }
    } else if (this.mode === 'move') {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < 4) {
        this.net.sendBattleMove(idx);
        this.setMode('command');
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        this.setMode('command');
      }
    } else if (this.mode === 'switch') {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        this.setMode('command');
      }
    }
  }

  // ── Kết thúc ────────────────────────────────────────────────────────────

  private showEnd(state: any): void {
    this.clearMenu();
    this.turnText?.setText('');
    const h = M_H - 34;

    let title = t('BATTLE_VICTORY');
    if (state.result === 'caught') title = t('BATTLE_CAUGHT');
    else if (state.result === 'run') title = t('BATTLE_FLED');
    else if (state.winner === 'foe') title = t('BATTLE_DEFEAT');

    const dim = this.scene.add.rectangle(0, 0, M_W, h, 0x000000, 0.62).setOrigin(0, 0);
    this.add(dim);
    this.endObjs.push(dim);

    const titleTxt = this.scene.add
      .text(M_W / 2, FIELD_TOP + 50, title, ts(30, '#ffd76a', FONT.ui))
      .setOrigin(0.5);
    this.add(titleTxt);
    this.endObjs.push(titleTxt);

    let sub = '';
    if (state.expGained > 0) sub = t('BATTLE_EXP_GAINED').replace('{exp}', String(state.expGained));
    else if (state.caughtSpeciesId) sub = state.caughtSpeciesId;
    if (sub) {
      const subTxt = this.scene.add.text(M_W / 2, FIELD_TOP + 105, sub, ts(17, '#eaf0ff', FONT.ui)).setOrigin(0.5);
      this.add(subTxt);
      this.endObjs.push(subTxt);
    }

    const ok = mkText(this.scene, t('BATTLE_OK'), {
      fontSize: '17px',
      fontFamily: FONT.ui,
      color: '#fff',
      backgroundColor: COL.btn,
      padding: { x: 30, y: 10 },
    });
    ok.setPosition(M_W / 2, FIELD_TOP + 160).setOrigin(0.5);
    ok.setInteractive({ useHandCursor: true });
    ok.on('pointerdown', () => this.finish(state.result ?? 'done'));
    this.add(ok);
    this.endObjs.push(ok);
  }

  private finish(result: string): void {
    this.net.leaveBattle();
    this.close();
    this.onFinished(result);
  }

  /**
   * Chạy khỏi trận: gửi `battle_run` cho server, ĐÓNG modal NGAY,
   * và báo chat `Game run safety` thay vì hiện overlay "Đã chạy thoát."
   *
   * Flow cũ: bấm Run → server set `result='run'` → `syncFromState()` phát hiện
   * `winner` → `showEnd()` hiện overlay "Đã chạy thoát." → bấm OK → `finish()`.
   * Flow mới: đóng tức thì → overlay không còn dịp xuất hiện.
   */
  private runNow(): void {
    if (this.ended) return;
    this.ended = true; // chặn syncFromState() gọi showEnd()
    this.net.sendBattleRun();
    this.onRun?.();
    this.finish('run');
  }

  private refreshLabels(): void {
    this.setTitle(t('BATTLE_TITLE'));
    if (this.turnText) this.turnText.setText(t('BATTLE_CHOOSE_MOVE'));
    this.buildMenu();
  }

  override close(): void {
    super.close();
    this.unsubState?.();
    this.unsubLang?.();
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
    }
    for (const o of this.endObjs) o.destroy();
    this.endObjs = [];
    this.destroy();
  }
}
