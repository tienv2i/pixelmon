import Phaser from 'phaser';
import { UiModal, type UiModalOptions } from './UiModal';
import { C, FONT, ts } from './theme';
import { ColyseusManager } from '../network/ColyseusManager';
import { t, mkText, onLangChange } from '../i18n';

/**
 * BattleModal — **Cửa sổ battle dạng popup** (Plan 44 Phase 3b).
 *
 * Thay cho BattleScene riêng, trận wild hiện dưới dạng modal `lockUi` (khóa
 * gameplay phía dưới), tái sử dụng khung `UiModal` thống nhất của game.
 *
 * - Toàn bộ dữ liệu lấy từ **Colyseus state** của BattleRoom (server tính
 *   damage/EXP) — modal chỉ render + gửi lệnh.
 * - Sprite thật: `battlers/front|back/{species}.png` + battleback `grass_*`.
 * - Menu: FIGHT (4 chiêu + PP/type) / POKEMON (đổi người) / BAG / RUN.
 * - Khi kết thúc: overlay OK → `onFinished()` (WorldScene đóng modal + refresh).
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
};

export class BattleModal extends UiModal {
  private net = ColyseusManager.getInstance();
  private init: BattleInitData;
  private mode: MenuMode = 'command';
  private ended = false;
  private unsubState?: () => void;
  private unsubLang?: () => void;
  private built = false;

  /** moveId → thông tin chiêu (từ payload). */
  private moveInfo = new Map<string, MoveView>();

  // ── Objects trong contentContainer ──
  private bg?: Phaser.GameObjects.Graphics;
  private foeSprite?: Phaser.GameObjects.Image;
  private allySprite?: Phaser.GameObjects.Image;
  private foeHp?: Phaser.GameObjects.Rectangle;
  private allyHp?: Phaser.GameObjects.Rectangle;
  private allyExp?: Phaser.GameObjects.Rectangle;
  private foeName?: Phaser.GameObjects.Text;
  private allyName?: Phaser.GameObjects.Text;
  private foeLvl?: Phaser.GameObjects.Text;
  private allyLvl?: Phaser.GameObjects.Text;
  private msgText?: Phaser.GameObjects.Text;
  private turnText?: Phaser.GameObjects.Text;
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private endObjs: Phaser.GameObjects.GameObject[] = [];
  private lastFoeHp = -1;
  private lastAllyHp = -1;
  private lastLogLen = 0;
  private needSwitch = false;

    /**
   * Tải sprite battle (foe front / ally back / battleback) trước khi mở modal.
   * Gọi 1 lần trước `new BattleModal(...)` — texture được cache theo key.
   */
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

  /** Texture thiếu (404) → placeholder tròn. */
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
      showClose: false, // không cho đóng giữa trận
      showMinimize: false,
      showDock: false,
      draggable: false,
      defaultAlign: 'center',
      depth: 300,
    };
    super(scene, opts);
    this.init = data ?? {};
    this.collectMoveInfo();

    // Đăng ký đồng bộ state ngay khi vào.
    const room = this.net.battle;
    if (room) {
      room.onStateChange(() => this.syncFromState());
    }
    this.unsubLang = onLangChange(() => this.refreshLabels());
    this.buildContent();
    this.show();

    // Nếu không join được room → không kẹt người chơi.
    if (!room) {
      this.msgText?.setText('Battle connection failed...');
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
    const h = M_H - 34; // trừ header
    const cc = this.contentContainer;

    // Nền trời + mặt đất.
    this.bg = this.add(this.scene.add.graphics());
    this.bg.fillStyle(COL.sky, 1);
    this.bg.fillRect(0, 0, w, h * 0.62);
    this.bg.fillStyle(COL.ground, 1);
    this.bg.fillRect(0, h * 0.62, w, h * 0.38);
    this.bg.lineStyle(1, COL.border, 0.5);
    this.bg.strokeRect(0.5, 0.5, w - 1, h - 1);

    // Sprite (đã load qua Image async ở open()).
    this.foeSprite = this.add(this.scene.add.image(w * 0.72, h * 0.4, 'battle_foe_front'));
    this.allySprite = this.add(this.scene.add.image(w * 0.26, h * 0.66, 'battle_ally_back'));

    // Plates.
    this.foeName = this.mkPlateLabel(14, 10, '');
    this.foeLvl = this.mkPlateLabel(14, 30, '', 0.62);
    this.foeHp = this.mkBar(14, 54, w * 0.42, COL.hpGreen);

    this.allyName = this.mkPlateLabel(w - 250, h * 0.66 + 20, '');
    this.allyLvl = this.mkPlateLabel(w - 250, h * 0.66 + 40, '', 0.62);
    this.allyHp = this.mkBar(w - 250, h * 0.66 + 64, 230, COL.hpGreen);
    this.allyExp = this.mkBar(w - 250, h * 0.66 + 78, 230, COL.expBar);

    // Turn indicator + message box (đáy modal).
    this.turnText = mkText(this.scene, 'BATTLE_CHOOSE_MOVE', ts(13, '#ffd76a', FONT.ui));
    this.turnText.setPosition(14, h - 66);
    this.add(this.turnText);

    const msgBg = this.scene.add.rectangle(0, h - 50, w, 50, 0x0b101c).setOrigin(0, 0);
    msgBg.setStrokeStyle(1, COL.border);
    this.add(msgBg);
    this.msgText = mkText(this.scene, '', ts(14, '#f4f6fb', FONT.ui));
    this.msgText.setPosition(14, h - 34);
    this.add(this.msgText);

    this.buildMenu();
    this.syncFromState();
  }

  private mkPlateLabel(x: number, y: number, text: string, originX = 0): Phaser.GameObjects.Text {
    const txt = this.scene.add
      .text(x, y, text, ts(14, '#f4f6fb', FONT.ui))
      .setOrigin(originX, 0);
    this.add(txt);
    return txt;
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
      this.setBar(this.foeHp, foe.currentHp, foe.maxHp);
      if (this.lastFoeHp >= 0 && foe.currentHp < this.lastFoeHp) this.flashHit(this.foeSprite);
      this.lastFoeHp = foe.currentHp;
    }
    if (ally && this.allyHp) {
      this.allyName?.setText(ally.nickname || ally.speciesId);
      this.allyLvl?.setText(`Lv.${ally.level}`);
      this.setBar(this.allyHp, ally.currentHp, ally.maxHp);
      const expPct =
        ally.expToNext > 0 ? Math.min(1, Math.max(0, (ally.exp ?? 0) / ally.expToNext)) : 1;
      if (this.allyExp) this.allyExp.width = Math.max(0, 230 * expPct);
      if (this.lastAllyHp >= 0 && ally.currentHp < this.lastAllyHp) this.flashHit(this.allySprite);
      this.lastAllyHp = ally.currentHp;
    }

    if (this.turnText && !this.ended) {
      if (state.phase === 'switch' || this.needSwitch) this.turnText.setText(t('BATTLE_CHOOSE_POKÉMON'));
      else if (state.phase === 'select') this.turnText.setText(`${t('BATTLE_CHOOSE_MOVE')} · Turn ${state.turn}`);
      else this.turnText.setText('');
    }

    // Log mới → dòng cuối.
    const logArr: any[] = state.log ? Array.from(state.log) : [];
    if (logArr.length > this.lastLogLen) {
      const entry = logArr[logArr.length - 1];
      if (entry && this.msgText) this.msgText.setText(String(entry.text ?? ''));
      this.lastLogLen = logArr.length;
    }

    // Menu theo phase.
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

  private setBar(bar: Phaser.GameObjects.Rectangle, hp: number, max: number): void {
    const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    const wFull = (bar.getData('full') as number) ?? 230;
    bar.setData('full', wFull);
    bar.width = Math.max(0, wFull * pct);
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
  }

  private btn(
    label: string,
    x: number,
    y: number,
    onClick?: () => void,
    disabled = false,
  ): Phaser.GameObjects.Text {
    const txt = mkText(this.scene, label, {
      fontSize: '14px',
      fontFamily: FONT.ui,
      color: disabled ? '#6b7a94' : '#f4f6fb',
      backgroundColor: disabled ? COL.btnOff : COL.btn,
      padding: { x: 10, y: 8 },
      align: 'left',
    });
    txt.setPosition(x, y).setOrigin(0, 0);
    if (onClick && !disabled) {
      txt.setInteractive({ useHandCursor: true });
      txt.on('pointerover', () => txt.setStyle({ backgroundColor: COL.btnHover }));
      txt.on('pointerout', () => txt.setStyle({ backgroundColor: COL.btn }));
      txt.on('pointerdown', onClick);
    }
    this.contentContainer.add(txt);
    this.menuObjs.push(txt);
    return txt;
  }

  private buildMenu(): void {
    this.clearMenu();
    if (this.ended) return;
    const h = M_H - 34;
    const baseY = h - 106;
    const state = this.net.battle?.state as any;

    if (this.mode === 'command') {
      const x1 = M_W - 240;
      const x2 = M_W - 120;
      this.btn(t('BATTLE_FIGHT'), x1, baseY, () => this.setMode('move'));
      this.btn(t('BATTLE_POKÉMON'), x2, baseY, () => this.setMode('switch'));
      this.btn(t('BATTLE_BAG'), x1, baseY + 44, () => this.msgText?.setText(t('BATTLE_NO_ITEMS')), true);
      this.btn(t('BATTLE_RUN'), x2, baseY + 44, () => {
        this.net.sendBattleRun();
        this.setMode('command');
      });
      return;
    }

    if (this.mode === 'move') {
      const ally = state?.ally?.team?.[state.ally.activeIndex ?? 0];
      const moves: string[] = ally?.moves ? Array.from(ally.moves) : [];
      const pp: number[] = ally?.pp ? Array.from(ally.pp) : [];
      const x1 = M_W - 340;
      const x2 = M_W - 175;
      moves.forEach((id, i) => {
        const cx = i % 2 === 0 ? x1 : x2;
        const cy = baseY + Math.floor(i / 2) * 44;
        const left = pp[i] ?? 0;
        const info = this.moveInfo.get(id);
        const label = info ? `${info.name} [${info.type}] ${left}/${info.maxPp}` : `${id} ${left}`;
        this.btn(
          label,
          cx,
          cy,
          () => {
            this.net.sendBattleMove(i);
            this.setMode('command');
          },
          left <= 0,
        );
      });
      this.btn(t('BATTLE_BACK'), x1, baseY + 96, () => this.setMode('command'));
      return;
    }

    if (this.mode === 'switch') {
      const team: any[] = state?.ally?.team ? Array.from(state.ally.team) : [];
      const activeIdx = state?.ally?.activeIndex ?? 0;
      const startY = Math.max(6, h - 106 - 200);
      team.forEach((p, i) => {
        const disabled = i === activeIdx || p.currentHp <= 0;
        this.btn(
          `${p.nickname || p.speciesId} Lv.${p.level}  ${p.currentHp}/${p.maxHp}`,
          14,
          startY + i * 38,
          () => {
            this.net.sendBattleSwitch(i);
            this.setMode('command');
          },
          disabled,
        );
      });
      this.btn(t('BATTLE_BACK'), 14, startY + team.length * 38 + 4, () => this.setMode('command'));
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
    for (const o of this.endObjs) o.destroy();
    this.endObjs = [];
    this.destroy();
  }
}
