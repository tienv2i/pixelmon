import Phaser from 'phaser';
import { UiModal, type UiModalOptions } from './UiModal';
import { C, FONT, ts } from './theme';
import { ColyseusManager } from '../network/ColyseusManager';
import { t, mkText, onLangChange } from '../i18n';

/**
 * BattleModal — **Cửa sổ battle dạng popup** (Plan 44 Phase 3b, hoàn thiện layout).
 *
 * Layout chuẩn Pokémon:
 * - Foe plate: góc trên trái (tên/level/HP)
 * - Ally plate: góc dưới phải trên menu (tên/level/HP/EXP)
 * - Sprite foe: bên phải, ally: bên trái
 * - Menu: góc dưới phải (FIGHT/POKEMON/BALL/RUN)
 * - Message box: đáy modal (2 dòng log)
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
  private foeLvl?: Phaser.GameObjects.Text;
  private allyLvl?: Phaser.GameObjects.Text;
  private foeHpText?: Phaser.GameObjects.Text;
  private allyHpText?: Phaser.GameObjects.Text;
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

    // Background: sky (0-60%) + ground (60-100%).
    this.bg = this.add(this.scene.add.graphics());
    this.bg.fillStyle(COL.sky, 1);
    this.bg.fillRect(0, 0, w, h * 0.6);
    this.bg.fillStyle(COL.ground, 1);
    this.bg.fillRect(0, h * 0.6, w, h * 0.4);
    this.bg.lineStyle(1, COL.border, 0.5);
    this.bg.strokeRect(0.5, 0.5, w - 1, h - 1);

    // Battleback overlay: dùng TileSprite giữ nguyên tỉ lệ pixel (không stretch
// toàn khung → tránh hiệu ứng cỏ bị nhòe như bản cũ).
    if (this.scene.textures.exists('battleback_ground')) {
      const tex = this.scene.textures.get('battleback_ground').getSourceImage();
      const groundH = h * 0.4;
      this.battlebackImg = this.add(
        this.scene.add
          .tileSprite(0, h * 0.6, w, groundH, 'battleback_ground')
          .setOrigin(0, 0)
          .setAlpha(0.35),
      );
      // Căn giữa 1 lần tile theo trục X để không có mép cắt rõ.
      if (tex && tex.width > 0) {
        (this.battlebackImg as Phaser.GameObjects.TileSprite).tilePositionX = -(w % tex.width) / 2;
      }
    }

    // Platform shadows.
    this.foeShadow = this.add(this.scene.add.ellipse(w * 0.7, h * 0.38 + 55, 120, 24, 0x000000, 0.35));
    this.allyShadow = this.add(this.scene.add.ellipse(w * 0.25, h * 0.62 + 55, 120, 24, 0x000000, 0.35));

    // Sprites.
    this.foeSprite = this.add(this.scene.add.image(w * 0.7, h * 0.38, 'battle_foe_front'));
    this.allySprite = this.add(this.scene.add.image(w * 0.25, h * 0.62, 'battle_ally_back'));
    this.fitSprite(this.foeSprite, 140);
    this.fitSprite(this.allySprite, 140);

    // ── FOE PLATE (góc trên trái) ──
    const foePlateX = 14;
    const foePlateY = 14;
    const foePlateW = 240;
    const foePlateH = 78;
    this.drawPlate(foePlateX, foePlateY, foePlateW, foePlateH);
    this.foeName = this.mkPlateLabel(foePlateX + 10, foePlateY + 8, '');
    this.foeLvl = this.mkPlateLabel(foePlateX + 10, foePlateY + 28, '', 0.62);
    this.foeHpTrack = this.mkBarTrack(foePlateX + 10, foePlateY + 50, foePlateW - 20);
    this.foeHp = this.mkBar(foePlateX + 10, foePlateY + 50, foePlateW - 20, COL.hpGreen);
    this.foeHpText = this.mkPlateLabel(foePlateX + foePlateW - 10, foePlateY + 62, '', 1);

    // ── ALLY PLATE (góc dưới phải, TRÊN menu) ──
    const allyPlateW = 240;
    const allyPlateH = 95;
    const allyPlateX = w - allyPlateW - 14;
    const allyPlateY = h - 160 - allyPlateH; // h-160 = 246 → y = 246-95 = 151
    this.drawPlate(allyPlateX, allyPlateY, allyPlateW, allyPlateH);
    this.allyName = this.mkPlateLabel(allyPlateX + 10, allyPlateY + 8, '');
    this.allyLvl = this.mkPlateLabel(allyPlateX + 10, allyPlateY + 28, '', 0.62);
    this.allyHpTrack = this.mkBarTrack(allyPlateX + 10, allyPlateY + 50, allyPlateW - 20);
    this.allyHp = this.mkBar(allyPlateX + 10, allyPlateY + 50, allyPlateW - 20, COL.hpGreen);
    this.allyHpText = this.mkPlateLabel(allyPlateX + allyPlateW - 10, allyPlateY + 62, '', 1);
    this.allyExp = this.mkBar(allyPlateX + 10, allyPlateY + 78, allyPlateW - 20, COL.expBar);

    // ── MENU (góc dưới phải, DƯỚI ally plate) ──
    // Menu Y starts at h - 140 = 266, 2 rows × 44px = 88 → ends at 354
    // Message box: h - 50 = 356 → 406 (50px)
    // Turn text: h - 66 = 340 → 354 (above message box)

    // ── MESSAGE BOX (đáy) ──
    const msgBg = this.scene.add.rectangle(0, h - 50, w, 50, 0x0b101c).setOrigin(0, 0);
    msgBg.setStrokeStyle(1, COL.border);
    this.add(msgBg);
    this.msgText = mkText(this.scene, '', ts(14, '#f4f6fb', FONT.ui));
    this.msgText.setPosition(14, h - 44);
    this.add(this.msgText);
    this.msgText2 = mkText(this.scene, '', ts(12, '#9aa0c3', FONT.ui));
    this.msgText2.setPosition(14, h - 22);
    this.add(this.msgText2);

    // Turn text (trên message box).
    this.turnText = mkText(this.scene, 'BATTLE_CHOOSE_MOVE', ts(13, '#ffd76a', FONT.ui));
    this.turnText.setPosition(14, h - 66);
    this.add(this.turnText);

    // Pop text (effectiveness/crit).
    this.popText = this.scene.add
      .text(w / 2, h * 0.25, '', ts(20, '#ffd76a', FONT.ui))
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

  // ── State sync ──────────────────────────────────────────────────────────

  private syncFromState(): void {
    const state = this.net.battle?.state as any;
    if (!state || !this.built) return;

    const foe = state.foe?.team?.[state.foe.activeIndex ?? 0];
    const ally = state.ally?.team?.[state.ally.activeIndex ?? 0];

    if (foe && this.foeHp) {
      this.foeName?.setText(foe.nickname || foe.speciesId);
      this.foeLvl?.setText(`Lv.${foe.level}`);
      this.foeHpText?.setText(`${foe.currentHp}/${foe.maxHp}`);
      this.tweenBar(this.foeHp, foe.currentHp, foe.maxHp);
      if (this.lastFoeHp >= 0 && foe.currentHp < this.lastFoeHp) this.flashHit(this.foeSprite);
      this.lastFoeHp = foe.currentHp;
    }
    if (ally && this.allyHp) {
      this.allyName?.setText(ally.nickname || ally.speciesId);
      this.allyLvl?.setText(`Lv.${ally.level}`);
      this.allyHpText?.setText(`${ally.currentHp}/${ally.maxHp}`);
      this.tweenBar(this.allyHp, ally.currentHp, ally.maxHp);
      const expPct =
        ally.expToNext > 0 ? Math.min(1, Math.max(0, (ally.exp ?? 0) / ally.expToNext)) : 1;
      if (this.allyExp) this.allyExp.width = Math.max(0, 220 * expPct);
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
    const h = M_H - 34; // 406

    // Menu area: bottom-right, above message box (h-50=356) and below ally plate.
    // Ally plate ends at y = 151 + 95 = 246
    // Menu starts at y = 266, 2 rows × 44 = 88 → ends at 354 (2px gap to msg box)
    const menuBaseY = h - 140; // 266
    const state = this.net.battle?.state as any;

    if (this.mode === 'command') {
      const btnH = 36;
      const gap = 10;
      const rightEdge = M_W - 14;
      const colW = 120;
      // Nền menu: 2 cột × 2 hàng + padding — neo phải.
      this.drawMenuPlate(rightEdge - colW * 2 - gap - 12, menuBaseY - 8, colW * 2 + gap + 24, btnH * 2 + gap + 16);

      this.btn(t('BATTLE_FIGHT'), rightEdge - colW, menuBaseY, () => this.setMode('move'), false, undefined, colW);
      this.btn(t('BATTLE_POKÉMON'), rightEdge, menuBaseY, () => this.setMode('switch'), false, undefined, colW);
      this.btn(t('BATTLE_BALL'), rightEdge - colW, menuBaseY + btnH + gap, () => this.net.sendBattleCatch('poke_ball'), false, undefined, colW);
      this.btn(t('BATTLE_RUN'), rightEdge, menuBaseY + btnH + gap, () => {
        this.net.sendBattleRun();
        this.setMode('command');
      }, false, undefined, colW);
      return;
    }

    if (this.mode === 'move') {
      const ally = state?.ally?.team?.[state.ally.activeIndex ?? 0];
      const moves: string[] = ally?.moves ? Array.from(ally.moves) : [];
      const pp: number[] = ally?.pp ? Array.from(ally.pp) : [];
      const btnH = 36;
      const gap = 6;
      const rightEdge = M_W - 14;
      const colW = 150;
      const rows = Math.max(2, Math.ceil(Math.max(moves.length, 3) / 2));
      // Nền menu: rows hàng moves + 1 hàng Back.
      const plateH = (rows + 1) * (btnH + gap) + gap + 4;
      this.drawMenuPlate(rightEdge - colW * 2 - gap - 12, menuBaseY - 8, colW * 2 + gap + 24, plateH);

      moves.forEach((id, i) => {
        const cx = i % 2 === 0 ? rightEdge - colW - gap : rightEdge;
        const cy = menuBaseY + Math.floor(i / 2) * (btnH + gap);
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

      // Back button ở hàng cuối — neo phải.
      this.btn(t('BATTLE_BACK'), rightEdge, menuBaseY + rows * (btnH + gap), () => this.setMode('command'), false, undefined, colW);
      return;
    }

    if (this.mode === 'switch') {
      const team: any[] = state?.ally?.team ? Array.from(state.ally.team) : [];
      const activeIdx = state?.ally?.activeIndex ?? 0;
      const btnH = 36;
      const gap = 6;

      // Panel chiếm bên trái (menu vẫn neo phải).
      const panelW = 340;
      const panelH = Math.min(team.length * (btnH + gap) + gap * 2, h - 140);
      const panelX = 14;
      const panelY = h - 100 - panelH; // Fit above message box (h-50)

      this.drawMenuPlate(panelX, panelY, panelW, panelH);

      team.forEach((p, i) => {
        const disabled = i === activeIdx || p.currentHp <= 0;
        const btnY = panelY + gap + i * (btnH + gap);
        if (btnY + btnH > panelY + panelH - gap) return; // Không tràn panel
        this.btn(
          `${p.nickname || p.speciesId} Lv.${p.level}  ${p.currentHp}/${p.maxHp}`,
          panelX + panelW - gap,
          btnY,
          () => {
            this.net.sendBattleSwitch(i);
            this.setMode('command');
          },
          disabled,
          undefined,
          panelW - gap * 2,
        );
      });

      // Back button ở đáy panel — neo phải.
      const backY = panelY + panelH - btnH - gap;
      this.btn(t('BATTLE_BACK'), panelX + panelW - gap, backY, () => this.setMode('command'), false, undefined, panelW - gap * 2);
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
        this.net.sendBattleRun();
        this.setMode('command');
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
      .text(M_W / 2, h * 0.3, title, ts(30, '#ffd76a', FONT.ui))
      .setOrigin(0.5);
    this.add(titleTxt);
    this.endObjs.push(titleTxt);

    let sub = '';
    if (state.expGained > 0) sub = t('BATTLE_EXP_GAINED').replace('{exp}', String(state.expGained));
    else if (state.caughtSpeciesId) sub = state.caughtSpeciesId;
    if (sub) {
      const subTxt = this.scene.add.text(M_W / 2, h * 0.44, sub, ts(17, '#eaf0ff', FONT.ui)).setOrigin(0.5);
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
    ok.setPosition(M_W / 2, h * 0.6).setOrigin(0.5);
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
