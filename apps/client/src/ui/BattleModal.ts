import Phaser from 'phaser';
import { UiModal, type UiModalOptions } from './UiModal';
import { C, FONT, ts } from './theme';
import { ColyseusManager, type InventoryItem } from '../network/ColyseusManager';
import { t, mkText, onLangChange, getLang } from '../i18n';
import { resolveItemEffect } from '@pixelmon/shared';
import { PartySelectModal } from './PartySelectModal';
import type { PokemonData } from './PokemonSummaryModal';
import { SoundManager } from '../audio/SoundManager';

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
  isTrainer?: boolean;
  trainerName?: string;
  /** `true` khi là trận PvP (2 người chơi thật) — dùng để hiện tên trainer + khoá ball/chạy. */
  isPvp?: boolean;
  /** Tên người chơi đối thủ (PvP) — hiện trên info plate bên đối thủ. */
  foeName?: string;
}

interface BattleMemberView {
  id: string;
  speciesId: string;
  nickname: string;
  level: number;
  types?: string[];
  maxHp: number;
  currentHp: number;
  shiny?: boolean;
  gender?: string;
  natureName?: string;
  moves?: Array<{
    id: string;
    name: string;
    type: string;
    category?: string;
    power?: number | null;
    accuracy?: number;
    priority?: number;
    description?: string;
    maxPp: number;
  }>;
}

interface MoveView {
  id: string;
  name: string;
  type: string;
  category: string;
  power: number | null;
  accuracy: number;
  priority: number;
  description: string;
  maxPp: number;
}

type MenuMode = 'command' | 'move' | 'switch' | 'bag' | 'none';

export type BattleBagCategory = 'all' | 'ball' | 'medicine' | 'battle';

export interface BattleUsableItem extends InventoryItem {
  isBall?: boolean;
  cat: 'ball' | 'medicine' | 'battle' | 'other';
  effectText: string;
  locked?: boolean;
  lockReason?: string;
}

const M_W = 820;
const M_H = 470;

// ── Layout bands ──
const HEADER_H = 34;
const CONTENT_H = M_H - HEADER_H; // 436

// ── Vùng BATTLE SCENE (trái): bóp lại chiều ngang, cao hơn ──
const B_X = 14;
const B_W = 490; // 14..504

const FIELD_TOP = 38; // dưới title bar
const FIELD_BOTTOM = 300; // trên dải nút lệnh
const BOTTOM_Y = 308; // dải 4 nút
const BOTTOM_H = CONTENT_H - 10 - BOTTOM_Y; // 118

// ── Dải 4 nút chiếm trọn phần dưới bên trái ──
const ACT_X = B_X;
const ACT_W = B_W;
const ACT_PAD = 12;
const ACT_GAP = 10;
const ACT_INNER_W = ACT_W - ACT_PAD * 2; // 466
const ACT_INNER_H = BOTTOM_H - ACT_PAD * 2; // 94
const ACT_COL_W = (ACT_INNER_W - ACT_GAP) / 2; // 228

// ── Cột phải: dùng chung cho TEXT và các khung chọn (chiêu / item / party) ──
const SB_X = 512;
const SB_W = M_W - SB_X - 14; // 294
const SB_Y = FIELD_TOP;
const SB_H = CONTENT_H - 10 - SB_Y; // 388
const SB_PAD = 10;
const SB_INNER_W = SB_W - SB_PAD * 2; // 274
const SB_TITLE_H = 22;
const SB_TOP = SB_Y + SB_PAD + SB_TITLE_H + 4;
const SB_FOOT_H = 24;
const SB_FOOT_Y = SB_Y + SB_H - SB_PAD - SB_FOOT_H;
const SB_BOTTOM = SB_FOOT_Y - 6;

// ── Khung party rút gọn (mode SWITCH) ──
const SW_ROW_H = 26; // chiều cao 1 thẻ thành viên
const SW_GAP = 6; // khoảng cách giữa các thẻ
const SW_ICON = 18; // icon Pokémon trong thẻ

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

/** Nhãn hiển thị của loại chiêu (category). */
const CAT_LABEL: Record<string, string> = {
  physical: 'PHYSICAL',
  special: 'SPECIAL',
  status: 'STATUS',
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

const STATUS_COLORS: Record<string, { bg: number; text: string }> = {
  paralysis: { bg: 0x4d4215, text: '#d6c880' },
  par: { bg: 0x4d4215, text: '#d6c880' },
  poison: { bg: 0x40224d, text: '#cba0db' },
  psn: { bg: 0x40224d, text: '#cba0db' },
  badly_poisoned: { bg: 0x391c45, text: '#cba0db' },
  tox: { bg: 0x391c45, text: '#cba0db' },
  burn: { bg: 0x4d2420, text: '#dba19a' },
  brn: { bg: 0x4d2420, text: '#dba19a' },
  sleep: { bg: 0x313945, text: '#a6b7cc' },
  slp: { bg: 0x313945, text: '#a6b7cc' },
  freeze: { bg: 0x1a3d4f, text: '#8bc2db' },
  frz: { bg: 0x1a3d4f, text: '#8bc2db' },
  faint: { bg: 0x272e38, text: '#7d8a9e' },
};

export class BattleModal extends UiModal {
  private net = ColyseusManager.getInstance();
  private init: BattleInitData;

  /**
   * Side mà client này đứng trong phòng battle (`ally` | `foe`).
   *
   * Wild/trainer luôn là `ally`. PvP thì server gán qua `battle_seat`; client
   * đứng bên `foe` cần đảo góc nhìn (team của mình = `state.foe`).
   */
  private seat: 'ally' | 'foe' = 'ally';
  /** Callback để WorldScene gán seat sớm (trước khi state về). */
  onSeatAssigned?: (seat: 'ally' | 'foe') => void;

  /** Trạng thái (schema) của BÊN MÌNH trong `state`. */
  private get myState(): any {
    const state = this.net.battle?.state as any;
    return state?.[this.seat];
  }

  /** Trạng thái của BÊN ĐỐI THỦ trong `state`. */
  private get oppState(): any {
    const state = this.net.battle?.state as any;
    return state?.[this.seat === 'ally' ? 'foe' : 'ally'];
  }

  /** Tên hiển thị trainer 2 bên (chỉ có ở PvP). */
  private myTrainerName(): string {
    const state = this.net.battle?.state as any;
    if (!state?.isPvp) return '';
    return String(state[this.seat === 'ally' ? 'allyName' : 'foeName'] ?? '');
  }
  private mode: MenuMode = 'command';
  private ended = false;
  /** PvP: đã "vũ trang" đầu hàng chưa (bấm 2 lần mới forfeit). */
  private pvpForfeitArmed = false;
  /** PvP: mình đã chọn hành động lượt này chưa (hiện "chờ đối thủ"). */
  private myActionChosen = false;
  /** Số lượt cuối đã thấy — dùng để reset cờ khi sang lượt mới. */
  private lastSeenTurn = -1;
  private unsubState?: () => void;
  private unsubSeat?: () => void;
  private unsubNeedSwitch?: () => void;
  private unsubLang?: () => void;
  private stateListener?: (state: unknown) => void;
  private built = false;

  private moveInfo = new Map<string, MoveView>();

  /** Item trong túi đồ — nạp khi mở menu BAG (dùng `battle_item`). */
  private bagItems?: import('../network/ColyseusManager').InventoryItem[];
  /** Vị trí cuộn danh sách BAG (khi item nhiều hơn khung). */
  private bagScroll = 0;
  /** Nhóm phân loại túi đồ đang chọn trong battle. */
  private bagCategory: BattleBagCategory = 'all';
  /** Từ khoá tìm kiếm item trong battle. */
  private bagSearchQuery = '';
  /** Ô HTML input để gõ tìm kiếm item trực tiếp. */
  private bagSearchInputEl: HTMLInputElement | null = null;
  /** Trạng thái focus của ô tìm kiếm item. */
  private bagSearchFocused = false;
  /** Graphics khung viền của ô search input. */
  private bagSearchBoxGfx?: Phaser.GameObjects.Graphics;
  /** Toạ độ và kích thước khung search box để căn input HTML. */
  private bagSearchBoxBounds = { x: 0, y: 0, w: 0, h: 0 };
  /** Handler blur ô search khi nhấp chuột ra ngoài canvas. */
  private onCanvasClick?: () => void;

  /** Vị trí cuộn danh sách SWITCH (khi party nhiều hơn khung). */
  private switchScroll = 0;
  /** Chữ ký trạng thái team — tránh vẽ lại khung party mỗi tick khi không đổi. */
  private switchSig = '';
  /** Species đang hiển thị trên sprite — để đổi texture khi switch. */
  private lastAllySpecies?: string;
  private lastFoeSpecies?: string;
  private lastPhase = '';
  private partySelectModal?: PartySelectModal;

  /** Kiểm tra xem trận đấu hiện tại có phải là wild battle không */
  private isWildBattle(): boolean {
    if (this.init.isTrainer) return false;
    if ((this.init.foe as any)?.isWild === false) return false;
    const state = this.net.battle?.state as any;
    if (state?.isTrainer) return false;
    if (state?.isPvp) return false;
    const foePkm = state?.foe?.team?.[state?.foe?.activeIndex ?? 0];
    if (foePkm && foePkm.isWild !== undefined) return Boolean(foePkm.isWild);
    return !this.init.isTrainer;
  }

  /** Trận hiện tại có phải PvP (2 người chơi thật) không? */
  private isPvpBattle(): boolean {
    const state = this.net.battle?.state as any;
    return Boolean(state?.isPvp) || Boolean(this.init.isPvp);
  }

  /**
   * Đánh dấu đã chọn hành động trong lượt (PvP) → cập nhật nhãn "chờ đối thủ"
   * và vẽ lại panel. Không tốn gì nếu không phải PvP.
   */
  private markActionChosen(): void {
    if (!this.isPvpBattle()) return;
    this.myActionChosen = true;
    this.refreshTextPanel();
  }

  /**
   * Phân loại vật phẩm sử dụng trong trận theo mục đích:
   * - `ball`: Poké Ball ném bắt
   * - `medicine`: hồi HP / giải trạng thái bất lợi
   * - `battle`: tăng chỉ số / buff chiến đấu
   * - `other`: các vật phẩm hỗ trợ khác
   */
  private getItemCategory(itemId: string): 'ball' | 'medicine' | 'battle' | 'other' {
    const e = resolveItemEffect(itemId);
    if (!e) return 'other';
    if (e.kind === 'catch_ball') return 'ball';
    if (e.kind === 'heal' || e.kind === 'cure_status' || e.kind === 'revive') return 'medicine';
    if (e.kind === 'buff') return 'battle';
    return 'other';
  }

  /**
   * Tóm tắt ngắn gọn hiệu ứng của item để người chơi nắm rõ ngay trong trận.
   */
  private getItemEffectSummary(itemId: string): string {
    const e = resolveItemEffect(itemId);
    if (!e) return '';
    const isVi = getLang() === 'vi';
    switch (e.kind) {
      case 'catch_ball':
        if (e.rate >= 255) return isVi ? 'Bắt 100% (Master)' : '100% Catch Rate';
        return isVi ? `Tỉ lệ bắt ×${e.rate}` : `Catch Rate ×${e.rate}`;
      case 'heal':
        if (e.hp === Infinity) return isVi ? 'Hồi đầy HP' : 'Restores full HP';
        return isVi ? `Hồi +${e.hp} HP` : `Restores +${e.hp} HP`;
      case 'revive':
        if (e.pct >= 1) return isVi ? 'Hồi sinh đầy HP' : 'Revives with 100% HP';
        return isVi ? `Hồi sinh ${Math.round(e.pct * 100)}% HP` : `Revives with ${Math.round(e.pct * 100)}% HP`;
      case 'cure_status': {
        const statuses = e.status.map((s) => {
          if (s === 'poison' || s === 'badly_poisoned') return isVi ? 'Độc' : 'Poison';
          if (s === 'paralysis') return isVi ? 'Tê liệt' : 'Paralysis';
          if (s === 'sleep') return isVi ? 'Ngủ' : 'Sleep';
          if (s === 'freeze') return isVi ? 'Đóng băng' : 'Freeze';
          if (s === 'burn') return isVi ? 'Bỏng' : 'Burn';
          return s;
        });
        const uniq = Array.from(new Set(statuses));
        if (uniq.length >= 4) return isVi ? 'Chữa mọi trạng thái' : 'Cures all statuses';
        return isVi ? `Chữa: ${uniq.join(', ')}` : `Cures: ${uniq.join(', ')}`;
      }
      case 'buff':
        return isVi ? `Tăng ${e.stat.toUpperCase()} (+${e.stages})` : `Boosts ${e.stat.toUpperCase()} (+${e.stages})`;
      default:
        return '';
    }
  }

  /**
   * Item dùng được trong trận, sắp BALL trước (để ném bắt), còn lại theo túi.
   * Loại đá tiến hoá / rare candy / lucky egg — server từ chối trong battle.
   * Trong trận PvP hoặc PvE (huấn luyện viên), khoá các vật phẩm không được dùng (ví dụ Poké Ball).
   */
  private battleUsableItems(): BattleUsableItem[] {
    const banned = new Set(['evo_stone', 'exp_boost', 'level_up']);
    const out: BattleUsableItem[] = [];
    const isWild = this.isWildBattle();
    const state = this.net.battle?.state as any;
    const isPvp = Boolean(state?.isPvp);
    const isVi = getLang() === 'vi';

    for (const it of this.bagItems ?? []) {
      if (it.quantity <= 0) continue;
      const e = resolveItemEffect(it.itemId);
      if (!e || banned.has(e.kind)) continue;
      const cat = this.getItemCategory(it.itemId);
      const isBall = e.kind === 'catch_ball';
      const effectText = this.getItemEffectSummary(it.itemId) || it.description || '';

      let locked = false;
      let lockReason = '';

      if (isBall && !isWild) {
        locked = true;
        lockReason = isPvp
          ? (isVi ? 'Không thể dùng trong trận PvP' : 'Cannot use in PvP battle')
          : (isVi ? 'Không thể bắt Pokémon của huấn luyện viên!' : 'Cannot catch Trainer Pokémon!');
      }

      out.push({
        ...it,
        isBall,
        cat,
        effectText,
        locked,
        lockReason,
      });
    }

    out.sort((a, b) => {
      if (Boolean(a.locked) !== Boolean(b.locked)) {
        return Number(a.locked ?? false) - Number(b.locked ?? false);
      }
      return Number(b.isBall) - Number(a.isBall) || a.name.localeCompare(b.name);
    });
    return out;
  }

  private ensureBagSearchInput(): HTMLInputElement {
    if (this.bagSearchInputEl) return this.bagSearchInputEl;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = t('BATTLE_BAG_SEARCH_PLACEHOLDER');
    input.value = this.bagSearchQuery;
    input.style.position = 'fixed';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.color = '#f1f5f9';
    input.style.fontFamily = FONT.sans || 'sans-serif';
    input.style.padding = '0 4px';
    input.style.zIndex = '310';
    input.style.display = 'none';

    input.addEventListener('focus', () => {
      this.bagSearchFocused = true;
      if (this.bagSearchBoxGfx && this.bagSearchBoxBounds.w > 0) {
        this.bagSearchBoxGfx.lineStyle(1.5, 0x00cec9, 1);
        this.bagSearchBoxGfx.strokeRoundedRect(
          this.bagSearchBoxBounds.x,
          this.bagSearchBoxBounds.y,
          this.bagSearchBoxBounds.w,
          this.bagSearchBoxBounds.h,
          4,
        );
      }
    });

    input.addEventListener('blur', () => {
      this.bagSearchFocused = false;
      if (this.bagSearchBoxGfx && this.bagSearchBoxBounds.w > 0) {
        this.bagSearchBoxGfx.lineStyle(1, 0x2e3b52, 1);
        this.bagSearchBoxGfx.strokeRoundedRect(
          this.bagSearchBoxBounds.x,
          this.bagSearchBoxBounds.y,
          this.bagSearchBoxBounds.w,
          this.bagSearchBoxBounds.h,
          4,
        );
      }
    });

    input.addEventListener('input', () => {
      this.bagSearchQuery = input.value.trim().toLowerCase();
      this.bagScroll = 0;
      this.buildMenu();
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        if (input.value) {
          input.value = '';
          this.bagSearchQuery = '';
          this.bagScroll = 0;
          this.buildMenu();
        } else {
          input.blur();
          this.setMode('command');
        }
      }
    });

    document.body.appendChild(input);
    this.bagSearchInputEl = input;
    return input;
  }

  private positionBagSearchInput(x: number, y: number, w: number, h: number): void {
    const input = this.ensureBagSearchInput();
    if (!this.open || this.mode !== 'bag' || this.ended) {
      input.style.display = 'none';
      return;
    }
    const { scale } = this.getScaleAndBounds();
    const rect = this.scene.scale.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;

    const padLeft = this.contentContainer.x;
    const padTop = this.contentContainer.y;
    const localX = padLeft + x;
    const localY = padTop + y;

    input.style.left = `${rect.left + (this.currentX + localX * scale) * scaleX}px`;
    input.style.top = `${rect.top + (this.currentY + localY * scale) * scaleY}px`;
    input.style.width = `${Math.max(10, w * scale * scaleX)}px`;
    input.style.height = `${Math.max(10, h * scale * scaleY)}px`;
    input.style.fontSize = `${Math.max(10, Math.round(11 * scale))}px`;
    input.style.display = 'block';
  }

  private hideBagSearchInput(): void {
    if (this.bagSearchInputEl) {
      this.bagSearchInputEl.style.display = 'none';
      this.bagSearchInputEl.blur();
    }
  }

  private removeBagSearchInput(): void {
    if (this.bagSearchInputEl) {
      this.bagSearchInputEl.remove();
      this.bagSearchInputEl = null;
    }
  }

  // ── Objects ──
  private bg?: Phaser.GameObjects.Graphics;
  private battlebackImg?: Phaser.GameObjects.GameObject;
  private foeBase?: Phaser.GameObjects.Image;
  private allyBase?: Phaser.GameObjects.Image;
  private foeSprite?: Phaser.GameObjects.Image;
  private allySprite?: Phaser.GameObjects.Image;
  private foeShadow?: Phaser.GameObjects.Ellipse;
  private allyShadow?: Phaser.GameObjects.Ellipse;
  private foeBalls: Phaser.GameObjects.Arc[] = [];
  private allyBalls: Phaser.GameObjects.Arc[] = [];
  private foeTypeBadge?: Phaser.GameObjects.Text;
  private allyTypeBadge?: Phaser.GameObjects.Text;
  private foeTypeBg?: Phaser.GameObjects.Graphics;
  private allyTypeBg?: Phaser.GameObjects.Graphics;
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
  private foeStatusBg?: Phaser.GameObjects.Graphics;
  private allyStatusBg?: Phaser.GameObjects.Graphics;
  private foeItem?: Phaser.GameObjects.Rectangle;
  private allyItem?: Phaser.GameObjects.Rectangle;
  private allyExpLabel?: Phaser.GameObjects.Text;
  /** Nhãn trạng thái lượt (dòng đầu khung TEXT ở cột phải). */
  private turnText?: Phaser.GameObjects.Text;
  /** Nội dung text hiện tại — nguồn dữ liệu để vẽ lại khung TEXT. */
  private turnLabel = '';
  private logLines: string[] = [];
  private popText?: Phaser.GameObjects.Text;
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private endObjs: Phaser.GameObjects.GameObject[] = [];
  private lastFoeHp = -1;
  private lastAllyHp = -1;
  private lastLogLen = 0;
  private needSwitch = false;
  private keyboardHandler?: (e: KeyboardEvent) => void;
  private unsubCatchAnim?: () => void;
  private unsubPokemonCaught?: () => void;
  private lastCaughtInfo?: {
    id: string;
    speciesId: string;
    name: string;
    nickname: string;
    level: number;
    shiny: boolean;
    gender: string;
    nature: string;
    ballId: string;
    slot: number | null;
  };
  private catchBallSprite?: Phaser.GameObjects.Image;

  static async loadTextures(scene: Phaser.Scene, data: BattleInitData): Promise<void> {
    const origin = (() => {
      const url: string = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567';
      return url.replace(/^ws/, 'http');
    })();
    const jobs: Promise<boolean>[] = [];
    const foe = data.foe;
    const ally = (data.ally ?? [])[0];
    if (foe?.speciesId) {
      const folder = foe.shiny ? 'front_shiny' : 'front';
      jobs.push(
        BattleModal.loadTexture(scene, 'battle_foe_front', `${origin}/assets/battlers/${folder}/${foe.speciesId}.png`).then(
          (ok) => {
            if (!ok && foe.shiny) {
              return BattleModal.loadTexture(scene, 'battle_foe_front', `${origin}/assets/battlers/front/${foe.speciesId}.png`);
            }
            return ok;
          },
        ),
      );
    }
    if (ally?.speciesId) {
      const folder = ally.shiny ? 'back_shiny' : 'back';
      jobs.push(
        BattleModal.loadTexture(scene, 'battle_ally_back', `${origin}/assets/battlers/${folder}/${ally.speciesId}.png`).then(
          (ok) => {
            if (!ok && ally.shiny) {
              return BattleModal.loadTexture(scene, 'battle_ally_back', `${origin}/assets/battlers/back/${ally.speciesId}.png`);
            }
            return ok;
          },
        ),
      );
    }
    jobs.push(BattleModal.loadTexture(scene, 'battleback_bg', `${origin}/assets/battlebacks/field_bg.png`));
    jobs.push(BattleModal.loadTexture(scene, 'battle_base_foe', `${origin}/assets/battlebacks/field_base0.png`));
    jobs.push(BattleModal.loadTexture(scene, 'battle_base_ally', `${origin}/assets/battlebacks/field_base1.png`));
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
  ) {
    const isTrainer = Boolean(data?.isTrainer || (data?.foe as any)?.isWild === false);
    const trainerName = data?.trainerName;
    const initialTitle = data?.isPvp
      ? t('BATTLE_PVP_TITLE')
      : isTrainer && trainerName
      ? `TRẬN ĐẤU — HLV ${trainerName.toUpperCase()}`
      : t('BATTLE_TITLE');

    const opts: UiModalOptions = {
      title: initialTitle,
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

    // Khởi tạo SoundManager và phát BGM
    SoundManager.getInstance(scene).playBgm(this.init.isTrainer ? 'battle_trainer' : 'battle_wild');

    const room = this.net.battle;
    if (room) {
      // Perspective: cập nhật seat sớm từ manager (đã nhận `battle_seat` khi join).
      this.seat = this.net.battleSeat;
      const seatHandler = (data: any) => {
        if (data?.side === 'foe' || data?.side === 'ally') {
          this.seat = data.side;
          this.onSeatAssigned?.(data.side);
          this.syncFromState();
          this.buildMenu();
        }
      };
      room.onMessage('battle_seat', seatHandler);
      this.unsubSeat = () => room.onMessage('battle_seat', () => {});

      // PvP: chỉ bên BỊ gục mới nhận message này → ép chọn Pokémon thay thế.
      const needSwitchHandler = () => {
        if (this.ended) return;
        this.needSwitch = true;
        this.setMode('switch');
      };
      room.onMessage('battle_need_switch', needSwitchHandler);
      this.unsubNeedSwitch = () => room.onMessage('battle_need_switch', () => {});

      this.stateListener = () => this.syncFromState();
      room.onStateChange(this.stateListener);
      this.unsubState = () => {
        if (this.stateListener) room.onStateChange.remove(this.stateListener);
      };

      // ── Safety net: phòng battle đóng/đứt đột ngột ────────────────────────
      // Không có ở đây thì modal TREO: `finish()` chỉ chạy qua nút OK (cần
      // `showEnd()` → cần `state.winner`), qua nhánh `!room`, hoặc run/forfeit.
      // Nếu server dispose phòng (no_show timeout, endBattle → disconnect,
      // mất mạng…) mà client chưa kịp thấy `winner` thì modal mở mãi →
      // `canMove=false` + `isBlockingUiOpen()` true → mất quyền điều khiển.
      const bailOut = () => {
        if (this.ended) return;
        // Nhường 1 frame cho `syncFromState` nếu state cuối đã có `winner`
        // (muốn vậy thì hiện màn kết thúc thay vì báo lỗi).
        this.scene.time.delayedCall(1, () => {
          if (this.ended || !this.isOpen()) return;
          this.finish('error');
        });
      };
      room.onLeave(() => bailOut());
      room.onError(() => bailOut());

      const catchHandler = (data: any) => this.playCatchAnimation(data);
      room.onMessage('catch_anim', catchHandler);
      this.unsubCatchAnim = () => {
        room.onMessage('catch_anim', () => {});
      };

      const caughtHandler = (data: any) => {
        this.lastCaughtInfo = data?.pokemon;
      };
      room.onMessage('pokemon_caught', caughtHandler);
      this.unsubPokemonCaught = () => {
        room.onMessage('pokemon_caught', () => {});
      };
    }
    this.unsubLang = onLangChange(() => this.refreshLabels());
    this.buildContent();
    this.show();

    this.keyboardHandler = (e: KeyboardEvent) => this.handleKey(e);
    window.addEventListener('keydown', this.keyboardHandler);

    this.onCanvasClick = () => {
      if (this.bagSearchInputEl && document.activeElement === this.bagSearchInputEl) {
        this.bagSearchInputEl.blur();
      }
    };
    this.scene.input.on('pointerdown', this.onCanvasClick);

    if (!room) {
      this.logLines = [t('BATTLE_CONNECTION_FAILED')];
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
          category: mv.category ?? 'physical',
          power: mv.power ?? null,
          accuracy: mv.accuracy ?? 100,
          priority: mv.priority ?? 0,
          description: mv.description ?? '',
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

    const w = B_W; // bề rộng vùng battle (trái: 490px)
    const fieldH = FIELD_BOTTOM - FIELD_TOP; // 262px

    // ── LỚP 1: BATTLE FIELD BACKGROUND ──
    if (this.scene.textures.exists('battleback_bg')) {
      this.battlebackImg = this.add(
        this.scene.add
          .image(B_X, FIELD_TOP, 'battleback_bg')
          .setOrigin(0, 0)
          .setDisplaySize(w, fieldH)
          .setTint(0x8f9cb3),
      );
      // Lớp kính lọc dịu mắt phong cách dark theme của game
      this.add(this.scene.add.rectangle(B_X, FIELD_TOP, w, fieldH, 0x070d18, 0.32).setOrigin(0, 0));
    } else {
      // Fallback nền bầu trời + mặt đất gradient êm dịu
      this.bg = this.add(this.scene.add.graphics());
      this.bg.fillStyle(0x182233, 1);
      this.bg.fillRect(B_X, FIELD_TOP, w, fieldH * 0.58);
      this.bg.fillStyle(0x1d3023, 1);
      this.bg.fillRect(B_X, FIELD_TOP + fieldH * 0.58, w, fieldH * 0.42);
    }

    // Viền khung sàn đấu êm mắt
    const fieldBorder = this.add(this.scene.add.graphics());
    fieldBorder.lineStyle(1, 0x2e3d57, 0.7);
    fieldBorder.strokeRoundedRect(B_X + 0.5, FIELD_TOP + 0.5, w - 1, fieldH - 1, 4);

    // ── LỚP 2: BỆ ĐỨNG BATTLE BASES ──
    // Foe Base (bệ đứng đối thủ)
    if (this.scene.textures.exists('battle_base_foe')) {
      this.foeBase = this.add(
        this.scene.add
          .image(B_X + w * 0.72, 156, 'battle_base_foe')
          .setOrigin(0.5, 0.5)
          .setDisplaySize(200, 42)
          .setTint(0x94a5bd),
      );
    } else {
      const g = this.add(this.scene.add.graphics());
      g.fillStyle(0x1b3620, 0.85);
      g.fillEllipse(B_X + w * 0.72, 156, 170, 36);
      g.lineStyle(1, 0x284a2d, 0.9);
      g.strokeEllipse(B_X + w * 0.72, 156, 170, 36);
    }
    this.foeShadow = this.add(this.scene.add.ellipse(B_X + w * 0.72, 146, 86, 18, 0x000000, 0.28));

    // Ally Base (bệ đứng của người chơi)
    if (this.scene.textures.exists('battle_base_ally')) {
      this.allyBase = this.add(
        this.scene.add
          .image(B_X + w * 0.26, 246, 'battle_base_ally')
          .setOrigin(0.5, 0.5)
          .setDisplaySize(236, 60)
          .setTint(0x94a5bd),
      );
    } else {
      const g = this.add(this.scene.add.graphics());
      g.fillStyle(0x19331d, 0.85);
      g.fillEllipse(B_X + w * 0.26, 246, 210, 46);
      g.lineStyle(1, 0x284a2d, 0.9);
      g.strokeEllipse(B_X + w * 0.26, 246, 210, 46);
    }
    this.allyShadow = this.add(this.scene.add.ellipse(B_X + w * 0.26, 230, 105, 22, 0x000000, 0.28));

    // Sprites Pokémon
    this.foeSprite = this.add(this.scene.add.image(B_X + w * 0.72, 134, 'battle_foe_front'));
    this.allySprite = this.add(this.scene.add.image(B_X + w * 0.26, 214, 'battle_ally_back'));
    this.fitSprite(this.foeSprite, 140);
    this.fitSprite(this.allySprite, 140);

    // ── LỚP 3: TEAM POKÉ BALL INDICATORS (6 quả bóng mỗi bên) ──
    this.buildTeamBalls(B_X + 16, FIELD_TOP + 4, 'foe');

    // ── LỚP 4: OPPONENT PLATE (Góc trên trái) ──
    const foePlateW = 236;
    const foePlate = this.buildInfoPlate({ x: B_X + 10, y: FIELD_TOP + 12, w: foePlateW });
    this.foeName = foePlate.name;
    this.foeHp = foePlate.hp;
    this.foeHpTrack = foePlate.hpTrack;
    this.foeHpText = foePlate.hpText;
    this.foeStatus = foePlate.status;
    this.foeStatusBg = foePlate.statusBg;
    this.foeTypeBadge = foePlate.typeBadge;
    this.foeTypeBg = foePlate.typeBg;
    this.foeItem = foePlate.item;

    // Banner huấn luyện viên đối thủ (nếu là trận đấu Trainer)
    if (this.init.isTrainer || this.init.trainerName) {
      const bannerW = 200;
      const bannerH = 22;
      const bannerX = B_X + w - bannerW - 10;
      const bannerY = FIELD_TOP + 6;

      const bgGfx = this.add(this.scene.add.graphics());
      bgGfx.fillStyle(0x0e1726, 0.92);
      bgGfx.fillRoundedRect(bannerX, bannerY, bannerW, bannerH, 4);
      bgGfx.lineStyle(1.5, 0x3b82f6, 0.9);
      bgGfx.strokeRoundedRect(bannerX, bannerY, bannerW, bannerH, 4);

      this.add(
        this.scene.add.text(
          bannerX + bannerW / 2,
          bannerY + bannerH / 2,
          `🏆 HLV: ${(this.init.trainerName || 'ĐỐI THỦ').toUpperCase()}`,
          {
            fontSize: '11px',
            fontFamily: FONT.ui,
            fontStyle: 'bold',
            color: '#60a5fa',
          },
        ).setOrigin(0.5, 0.5),
      );
    }

    // ── LỚP 5: PLAYER PLATE (Góc dưới phải) + EXP BAR ──
    const allyPlateW = 236;
    const allyPlateH = PLATE_H;
    const allyPlateX = B_X + w - allyPlateW - 12;
    const allyPlateY = FIELD_BOTTOM - allyPlateH - 24;
    const allyPlate = this.buildInfoPlate({ x: allyPlateX, y: allyPlateY, w: allyPlateW });
    this.allyName = allyPlate.name;
    this.allyHp = allyPlate.hp;
    this.allyHpTrack = allyPlate.hpTrack;
    this.allyHpText = allyPlate.hpText;
    this.allyStatus = allyPlate.status;
    this.allyStatusBg = allyPlate.statusBg;
    this.allyTypeBadge = allyPlate.typeBadge;
    this.allyTypeBg = allyPlate.typeBg;
    this.allyItem = allyPlate.item;

    // Team Poké Balls cho người chơi (dưới chân Ally plate)
    this.buildTeamBalls(allyPlateX + 12, allyPlateY + allyPlateH + 16, 'ally');

    // Dòng EXP liền kề đáy Ally plate
    const expLabel = this.scene.add.text(allyPlateX + 8, allyPlateY + allyPlateH + 3, 'EXP', {
      fontSize: '10px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#4a6f9c',
    }).setOrigin(0, 0);
    this.add(expLabel);
    this.allyExpLabel = expLabel;
    this.allyExp = this.mkBar(allyPlateX + 36, allyPlateY + allyPlateH + 4, allyPlateW - 46, 0x2b658f);

    // Pop text (effectiveness/crit) — giữa field
    this.popText = this.scene.add
      .text(B_X + w / 2, FIELD_TOP + 70, '', ts(20, '#e5c469', FONT.ui))
      .setOrigin(0.5)
      .setAlpha(0);
    this.add(this.popText);

    this.buildMenu();
    this.syncFromState();
    void this.loadSwitchIcons();
  }

  /** Dựng 6 chấm bóng Pokéball cho đội hình */
  private buildTeamBalls(startX: number, y: number, side: 'foe' | 'ally'): void {
    const arr = side === 'foe' ? this.foeBalls : this.allyBalls;
    arr.forEach((b) => b.destroy());
    arr.length = 0;
    for (let i = 0; i < 6; i++) {
      const bx = startX + i * 11;
      const ball = this.scene.add.circle(bx, y, 3, 0x212a3b, 0.85);
      ball.setStrokeStyle(1, 0x111621, 0.9);
      this.add(ball);
      arr.push(ball);
    }
  }

  private drawPlate(x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    // Nền tối bán trong suốt dịu mắt
    g.fillStyle(0x0a1120, 0.9);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0x2c3b52, 0.75);
    g.strokeRoundedRect(x, y, w, h, 6);
    this.add(g);
    return g;
  }

  /**
   * Dựng 1 Pokémon info plate hiện đại dịu mắt:
   * ┌─────────────────────────────────────────┐
   * │ [TYPE] Name ♂ Lv.5              [item]  │
   * │ [STATUS]  HP ████████░░ 12/20           │
   * └─────────────────────────────────────────┘
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
    statusBg: Phaser.GameObjects.Graphics;
    typeBadge: Phaser.GameObjects.Text;
    typeBg: Phaser.GameObjects.Graphics;
    item: Phaser.GameObjects.Rectangle;
  } {
    const { x, y, w } = o;
    this.drawPlate(x, y, w, PLATE_H);

    // Pill hiển thị hệ (Type badge)
    const typeBg = this.scene.add.graphics();
    this.add(typeBg);
    const typeBadge = mkText(this.scene, '', {
      fontSize: '9px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#93a7c7',
    });
    typeBadge.setPosition(x + 28, y + PLATE_NAME_Y + 1).setOrigin(0.5, 0);
    this.add(typeBadge);

    // Dòng 1: Tên Pokémon + Giới tính + Lv
    const nameX = x + 54;
    const nameW = w - 64 - PLATE_ITEM_W - PLATE_ITEM_GAP;
    const name = mkText(this.scene, '', {
      fontSize: '13px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#dce4f2',
      fixedWidth: nameW,
    });
    name.setPosition(nameX, y + PLATE_NAME_Y).setOrigin(0, 0);
    this.add(name);

    // Ô item góc phải
    const item = this.scene.add
      .rectangle(x + w - 8 - PLATE_ITEM_W, y + PLATE_NAME_Y - 1, PLATE_ITEM_W, PLATE_ITEM_H, 0x121a28)
      .setOrigin(0, 0);
    item.setStrokeStyle(1, 0x28354c, 0.7);
    this.add(item);

    // Dòng 2: Status pill badge
    const statusBg = this.scene.add.graphics();
    this.add(statusBg);
    const statusW = 44;
    const status = mkText(this.scene, '', {
      fontSize: '9px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#c8d4e6',
      fixedWidth: statusW,
      align: 'center',
    });
    status.setPosition(x + 8 + statusW / 2, y + PLATE_STATUS_Y + 4).setOrigin(0.5, 0);
    this.add(status);

    // Nhãn "HP" nhỏ phong cách retro
    const hpTag = this.scene.add.text(x + 10 + statusW + 2, y + PLATE_STATUS_Y + 3, 'HP', {
      fontSize: '9px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#b88d43',
    });
    this.add(hpTag);

    const barX = x + 10 + statusW + 20;
    const barW = w - (statusW + 36) - 64; // Chừa chỗ cho số máu HP text
    const hpTrack = this.mkBarTrack(barX, y + PLATE_STATUS_Y + 3, barW);
    const hp = this.mkBar(barX, y + PLATE_STATUS_Y + 3, barW, 0x27ae60);

    // Số máu HP
    const hpText = mkText(this.scene, '', {
      fontSize: '11px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#bac7db',
    });
    hpText.setPosition(x + w - 8, y + PLATE_STATUS_Y + 1).setOrigin(1, 0);
    this.add(hpText);

    return { name, hp, hpTrack, hpText, status, statusBg, typeBadge, typeBg, item };
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

  /** Dòng tên: `Name ♂ Lv.5` — gộp tên + giới tính + level trong 1 dòng (tiền tố S. cho Shiny). */
  private nameLine(p: any): string {
    const nick = p.nickname || p.speciesId;
    const sym = p.gender === 'male' ? '♂' : p.gender === 'female' ? '♀' : '';
    const prefix = p.shiny ? 'S. ' : '';
    return `${prefix}${nick} ${sym} Lv.${p.level}`.trim();
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

    // PvP: sang lượt mới → bỏ cờ "đã chọn" (cho phép chọn lại hành động).
    if (state.turn !== this.lastSeenTurn) {
      this.lastSeenTurn = state.turn;
      this.myActionChosen = false;
    }

    const foe = this.oppState?.team?.[this.oppState?.activeIndex ?? 0];
    const ally = this.myState?.team?.[this.myState?.activeIndex ?? 0];

    // PvP: hiện tên trainer trước nickname để nhận ra đối thủ.
    const myTrainer = this.myTrainerName();
    const oppTrainer = (() => {
      const state = this.net.battle?.state as any;
      if (!state?.isPvp) return '';
      return String(state[this.seat === 'ally' ? 'foeName' : 'allyName'] ?? '');
    })();

    const foeShiny = Boolean(foe?.shiny ?? this.init.foe?.shiny);
    const allyShiny = Boolean(ally?.shiny ?? (this.init.ally ?? [])[0]?.shiny);
    const foeKey = `${foe?.speciesId}_${foeShiny}`;
    const allyKey = `${ally?.speciesId}_${allyShiny}`;

    // Đổi sprite khi Pokémon active thay đổi (switch trong trận / foe gục / shiny).
    if (ally && allyKey !== this.lastAllySpecies) {
      const isFirst = !this.lastAllySpecies;
      this.lastAllySpecies = allyKey;
      this.swapBattlerSprite('ally', ally.speciesId, allyShiny);
      if (allyShiny && isFirst) {
        this.playShinySparkles('ally');
      }
    }
    if (foe && foeKey !== this.lastFoeSpecies) {
      const isFirst = !this.lastFoeSpecies;
      this.lastFoeSpecies = foeKey;
      this.swapBattlerSprite('foe', foe.speciesId, foeShiny);
      if (foeShiny && isFirst) {
        this.playShinySparkles('foe');
      }
    }

    // Cập nhật 6 chấm bóng Pokéball cho cả 2 bên (tông trầm dịu)
    const updateTeamBalls = (arr: Phaser.GameObjects.Arc[], teamData: any) => {
      const teamArr: any[] = teamData ? Array.from(teamData) : [];
      for (let i = 0; i < 6; i++) {
        const ball = arr[i];
        if (!ball) continue;
        const p = teamArr[i];
        if (!p) {
          ball.setFillStyle(0x18202e, 0.35); // slot trống
        } else if ((p.currentHp ?? 0) <= 0) {
          ball.setFillStyle(0x424c5c, 0.8); // gục ngã
        } else {
          ball.setFillStyle(0x943636, 0.95); // sẵn sàng chiến đấu (đỏ trầm)
        }
      }
    };
    updateTeamBalls(this.foeBalls, this.oppState?.team);
    updateTeamBalls(this.allyBalls, this.myState?.team);

    // Cập nhật Type Badge (màu dịu mắt)
    const updateTypeBadge = (txt?: Phaser.GameObjects.Text, bg?: Phaser.GameObjects.Graphics, p?: any) => {
      if (!txt || !bg) return;
      bg.clear();
      if (!p) {
        txt.setText('');
        return;
      }
      const rawType = (p.types ? String(p.types).split(',')[0] : '').toLowerCase().trim();
      if (!rawType) {
        txt.setText('');
        return;
      }
      const colorHex = TYPE_COLORS[rawType] ?? '#4a5568';
      const mutedBgHex = this.muteHex(colorHex, 0.32);
      const bgNum = Phaser.Display.Color.HexStringToColor(mutedBgHex).color;
      txt.setText(rawType.toUpperCase());
      txt.setColor('#8ea5c7');
      bg.fillStyle(bgNum, 0.95);
      bg.fillRoundedRect(txt.x - 22, txt.y - 1, 44, 15, 3);
      bg.lineStyle(1, 0x2b384d, 0.6);
      bg.strokeRoundedRect(txt.x - 22, txt.y - 1, 44, 15, 3);
    };
    updateTypeBadge(this.foeTypeBadge, this.foeTypeBg, foe);
    updateTypeBadge(this.allyTypeBadge, this.allyTypeBg, ally);

    // Cập nhật Status Badge
    const updateStatusBadge = (txt?: Phaser.GameObjects.Text, bg?: Phaser.GameObjects.Graphics, rawStatus?: string) => {
      if (!txt || !bg) return;
      bg.clear();
      const s = (rawStatus ?? '').toLowerCase().trim();
      if (!s || s === 'none') {
        txt.setText('');
        return;
      }
      const cfg = STATUS_COLORS[s] ?? { bg: 0xe74c3c, text: '#ffffff' };
      const shortText = s === 'paralysis' ? 'PAR' : s === 'poison' || s === 'badly_poisoned' ? 'PSN' : s === 'burn' ? 'BRN' : s === 'sleep' ? 'SLP' : s === 'freeze' ? 'FRZ' : s.slice(0, 3).toUpperCase();
      txt.setText(shortText);
      txt.setColor(cfg.text);
      bg.fillStyle(cfg.bg, 1);
      bg.fillRoundedRect(txt.x - 20, txt.y - 1, 40, 14, 3);
    };
    updateStatusBadge(this.foeStatus, this.foeStatusBg, foe?.status);
    updateStatusBadge(this.allyStatus, this.allyStatusBg, ally?.status);

    if (foe && this.foeHp) {
      this.foeName?.setText(
        oppTrainer ? `${oppTrainer}: ${this.nameLine(foe)}` : this.nameLine(foe),
      );
      this.foeName?.setColor(foeShiny ? '#f1c40f' : '#ffffff');
      this.foeHpText?.setText(`${foe.currentHp}/${foe.maxHp}`);
      this.tweenBar(this.foeHp, foe.currentHp, foe.maxHp);
      if (this.lastFoeHp >= 0 && foe.currentHp < this.lastFoeHp) this.flashHit(this.foeSprite);
      this.lastFoeHp = foe.currentHp;
    }
    if (ally && this.allyHp) {
      this.allyName?.setText(
        myTrainer ? `${myTrainer}: ${this.nameLine(ally)}` : this.nameLine(ally),
      );
      this.allyName?.setColor(allyShiny ? '#f1c40f' : '#ffffff');
      this.allyHpText?.setText(`${ally.currentHp}/${ally.maxHp}`);
      this.tweenBar(this.allyHp, ally.currentHp, ally.maxHp);
      const expPct =
        ally.expToNext > 0 ? Math.min(1, Math.max(0, (ally.exp ?? 0) / ally.expToNext)) : 1;
      if (this.allyExp) this.allyExp.width = Math.max(0, (EXP_BAR_W - 8) * expPct);
      if (this.lastAllyHp >= 0 && ally.currentHp < this.lastAllyHp) this.flashHit(this.allySprite);
      this.lastAllyHp = ally.currentHp;
    }

    // ── TEXT panel (cột phải) — cập nhật theo từng thao tác ──
    let turnLabel = '';
    if (state.phase === 'switch' || this.needSwitch) turnLabel = t('BATTLE_CHOOSE_POKÉMON');
    else if (state.phase === 'select') {
      // PvP: đã chọn xong → chờ đối thủ (không lộ chiêu đối thủ đã chọn gì).
      turnLabel =
        this.isPvpBattle() && this.myActionChosen
          ? t('BATTLE_WAITING_OPP')
          : `${t('BATTLE_CHOOSE_MOVE')} · ${t('BATTLE_TURN')} ${state.turn}`;
    }
    if (turnLabel !== this.turnLabel) {
      this.turnLabel = turnLabel;
      this.refreshTextPanel(); // cột phải đang ở trang text → vẽ lại với dòng mới
    }

    const logArr: any[] = state.log ? Array.from(state.log) : [];
    if (logArr.length > this.lastLogLen) {
      const last = logArr[logArr.length - 1];
      const text = String(last?.text ?? '');
      this.logLines.push(text);
      if (this.logLines.length > 40) this.logLines.shift(); // giữ 40 dòng mới nhất
      this.lastLogLen = logArr.length;
      this.refreshTextPanel(); // vẽ lại text trong cột phải (nếu đang ở trang text)

      if (text.includes('super effective') || text.includes('Super effective')) {
        this.showPop(t('BATTLE_SUPER_EFFECTIVE'));
      } else if (text.includes('critical') || text.includes('Critical')) {
        this.showPop(t('BATTLE_CRITICAL_HIT'));
      } else if (text.includes('missed') || text.includes('Missed')) {
        this.showPop(t('BATTLE_MISSED'));
      }
    }

    const currentPhase = state.phase;
    if (this.lastPhase !== currentPhase) {
      this.lastPhase = currentPhase;
      if (currentPhase === 'select' && this.mode === 'bag') {
        void ColyseusManager.getInstance().fetchInventory().then((items) => {
          this.bagItems = items;
          if (this.mode === 'bag') this.buildMenu();
        });
      }
    }

    if (this.isPvpBattle()) {
      // PvP: KHÔNG vào switch mode theo phase chung (phase là shared).
      // Chỉ vào khi nhận `battle_need_switch` riêng cho side của mình (xử lý
      // qua listener) — server chỉ gửi tới side đang thực sự bắt buộc đổi.
      if (state.phase === 'select' && this.needSwitch) {
        this.needSwitch = false;
        this.setMode('command');
      } else if (state.phase === 'select' && this.mode === 'none') {
        this.setMode('command');
      }
    } else if (state.phase === 'switch' && !this.needSwitch) {
      this.needSwitch = true;
      this.setMode('switch');
    } else if (state.phase === 'select' && this.needSwitch) {
      this.needSwitch = false;
      this.setMode('command');
    } else if (state.phase === 'select' && this.mode === 'none') {
      this.setMode('command');
    }

    // Sidebar đang hiện khung chọn (switch) → vẽ lại khi HP đổi.
    if (this.mode === 'switch') {
      const team: any[] = this.myState?.team ? Array.from(this.myState.team) : [];
      const sig = team
        .map(
          (p) =>
            `${p.pokemonId ?? p.speciesId}:${p.currentHp}:${this.myState?.activeIndex ?? 0}`,
        )
        .join('|');
      if (sig !== this.switchSig) {
        this.switchSig = sig;
        this.buildMenu();
      }
    }

    if (state.winner && state.winner !== '' && !this.ended) {
      this.ended = true;
      this.showEnd(state);
    }
  }

  /** Đổi texture sprite battler (ally=back / foe=front) + nạp nếu thiếu (hỗ trợ Shiny). */
  private swapBattlerSprite(side: 'ally' | 'foe', speciesId: string, isShiny?: boolean): void {
    if (!speciesId) return;
    const sprite = side === 'ally' ? this.allySprite : this.foeSprite;
    if (!sprite) return;
    const baseDir = side === 'ally' ? 'back' : 'front';
    const folder = isShiny ? `${baseDir}_shiny` : baseDir;
    const key = `battle_${folder}_${speciesId}`;
    const origin = ((import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567').replace(/^ws/, 'http');
    const url = `${origin}/assets/battlers/${folder}/${speciesId}.png`;

    const apply = () => {
      if (sprite.texture?.key !== key) sprite.setTexture(key);
      this.fitSprite(sprite, 140);
    };
    if (this.scene.textures.exists(key)) {
      apply();
      return;
    }
    BattleModal.loadTexture(this.scene, key, url).then((ok) => {
      if (ok) {
        apply();
      } else if (isShiny) {
        // Fallback sang ảnh thường nếu ảnh shiny chưa có
        const fbKey = `battle_${baseDir}_${speciesId}`;
        const fbUrl = `${origin}/assets/battlers/${baseDir}/${speciesId}.png`;
        BattleModal.loadTexture(this.scene, fbKey, fbUrl).then((fbOk) => {
          if (fbOk) {
            if (sprite.texture?.key !== fbKey) sprite.setTexture(fbKey);
            this.fitSprite(sprite, 140);
          }
        });
      }
    });
  }

  /** Hiệu ứng sao vàng lấp lánh khi Pokémon Shiny xuất hiện */
  private playShinySparkles(side: 'ally' | 'foe'): void {
    const sprite = side === 'ally' ? this.allySprite : this.foeSprite;
    if (!sprite) return;
    const cx = sprite.x;
    const cy = sprite.y;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 30 + Math.random() * 38;
      const star = this.scene.add
        .text(cx, cy, '✦', {
          fontSize: `${11 + Math.floor(Math.random() * 8)}px`,
          fontFamily: FONT.ui,
          color: i % 2 === 0 ? '#f1c40f' : '#ffffff',
        })
        .setOrigin(0.5);
      this.add(star);
      this.scene.tweens.add({
        targets: star,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: { from: 1, to: 0 },
        scale: { from: 1.4, to: 0.3 },
        duration: 700 + Math.random() * 250,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  }

  private tweenBar(bar: Phaser.GameObjects.Rectangle, hp: number, max: number): void {    const pct = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
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
    if (!sprite || !sprite.active) return;
    const baseX = (sprite.getData('baseX') as number | undefined) ?? sprite.x;
    sprite.setData('baseX', baseX);

    // Dừng các tween cũ nếu có để tránh lệch tọa độ
    this.scene.tweens.killTweensOf(sprite);
    sprite.setX(baseX);

    // 1. Rung lắc ngang (shake)
    this.scene.tweens.add({
      targets: sprite,
      x: baseX + 8,
      duration: 45,
      yoyo: true,
      repeat: 5,
      onComplete: () => {
        if (sprite.active) sprite.setX(baseX);
      },
    });

    // 2. Chớp chớp nhấp nháy rõ nét (flicker alpha: 0.15 <-> 1.0)
    this.scene.tweens.add({
      targets: sprite,
      alpha: 0.15,
      duration: 55,
      yoyo: true,
      repeat: 4,
      onComplete: () => {
        if (sprite.active) {
          sprite.setAlpha(1);
          sprite.clearTint();
        }
      },
    });

    // 3. Nhấp nháy màu đỏ / trắng khi nhận đòn
    sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (sprite.active) sprite.setTint(0xff5252);
    });
    this.scene.time.delayedCall(200, () => {
      if (sprite.active) sprite.setTintFill(0xffffff);
    });
    this.scene.time.delayedCall(320, () => {
      if (sprite.active) sprite.clearTint();
    });

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
    if (mode !== 'bag') {
      this.hideBagSearchInput();
    }
    this.mode = mode;
    if (mode === 'bag') {
      // Nạp túi đồ (đã enrich) để chọn item dùng trong trận (gồm cả Poké Ball).
      this.bagScroll = 0;
      void ColyseusManager.getInstance().fetchInventory().then((items) => {
        this.bagItems = items;
        this.buildMenu();
      });
      return;
    }
    if (mode === 'switch') {
      // Khung party rút gọn: reset cuộn + nạp icon (battler back) cho cả team.
      this.switchScroll = 0;
      this.buildMenu();
      void this.loadSwitchIcons();
      return;
    }
    this.buildMenu();
  }

  /**
   * Nạp icon battler (back) cho toàn bộ team để hiển thị trong khung party
   * rút gọn. Ảnh thiếu → để trống, thẻ vẫn hoạt động.
   */
  private async loadSwitchIcons(): Promise<void> {
    const team: any[] = (this.net.battle?.state as any)?.ally?.team ? Array.from((this.net.battle?.state as any).ally.team) : [];
    const origin = ((import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567').replace(/^ws/, 'http');
    let changed = false;
    for (const p of team) {
      const sid = p?.speciesId;
      if (!sid) continue;
      const key = `battle_front_${sid}`;
      if (this.scene.textures.exists(key)) continue;
      const ok = await BattleModal.loadTexture(this.scene, key, `${origin}/assets/battlers/front/${sid}.png`);
      if (ok) changed = true;
    }
    if (changed && this.mode === 'switch' && !this.ended) this.buildMenu();
  }

  private clearMenu(): void {
    this.hideMoveTip();
    if (this.mode !== 'bag') {
      this.hideBagSearchInput();
    }
    this.bagSearchBoxGfx = undefined;
    for (const o of this.menuObjs) o.destroy();
    this.menuObjs = [];
    this.turnText = undefined;
    this.menuPlateGfx?.destroy();
    this.menuPlateGfx = undefined;
  }

  /**
   * Nút menu chuẩn — vẽ nền `Graphics` box đúng kích thước (x, y, w, h) +
   * text căn giữa. Dùng box thật thay vì `Text.padding` → không còn dính nhau
   * hay tràn ra ngoài plate.
   *
   * @param originRight =true → `x` là mép phải của nút (neo phải, không tràn).
   */
  private btn(
    label: string,
    x: number,
    y: number,
    onClick?: () => void,
    disabled = false,
    bgColor?: string,
    width?: number,
    height?: number,
    originRight = true,
    opts?: { border?: number; shortcut?: string; icon?: string; textColor?: string },
  ): void {
    const boxW = width ?? ACT_COL_W;
    const boxH = height ?? 30;
    const bx = originRight ? x - boxW : x;
    const fill = disabled ? 0x1e2636 : Phaser.Display.Color.HexStringToColor(bgColor ?? COL.btn).color;
    const stroke = disabled ? 0x2a3550 : (opts?.border ?? 0x3f5070);

    const g = this.scene.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(bx, y, boxW, boxH, 6);
    g.lineStyle(1.5, stroke, 1);
    g.strokeRoundedRect(bx, y, boxW, boxH, 6);
    this.contentContainer.add(g);
    this.menuObjs.push(g);

    // Font nhỏ vừa ô, kèm icon nếu có
    const fullText = opts?.icon ? `${opts.icon} ${label}` : label;
    const fontSize = boxH <= 24 ? '11px' : boxH <= 32 ? '13px' : '15px';
    const txt = mkText(this.scene, fullText, {
      fontSize,
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: disabled ? '#5f6d85' : (opts?.textColor ?? '#f4f6fb'),
      align: 'center',
      wordWrap: { width: boxW - 20 },
    });
    txt.setPosition(bx + boxW / 2, y + boxH / 2).setOrigin(0.5, 0.5);
    this.contentContainer.add(txt);
    this.menuObjs.push(txt);

    // Badge phím tắt góc phải trên (nếu có shortcut)
    if (opts?.shortcut && !disabled) {
      const scBg = this.scene.add.graphics();
      scBg.fillStyle(0x000000, 0.45);
      scBg.fillRoundedRect(bx + boxW - 18, y + 4, 14, 14, 3);
      this.contentContainer.add(scBg);
      this.menuObjs.push(scBg);

      const scTxt = mkText(this.scene, opts.shortcut, {
        fontSize: '9px',
        fontFamily: FONT.ui,
        fontStyle: 'bold',
        color: '#9fb0cc',
      });
      scTxt.setPosition(bx + boxW - 11, y + 11).setOrigin(0.5, 0.5);
      this.contentContainer.add(scTxt);
      this.menuObjs.push(scTxt);
    }

    // Hitbox bằng zone thật (đủ box)
    const zone = this.scene.add
      .zone(bx + boxW / 2, y + boxH / 2, boxW, boxH)
      .setInteractive({ useHandCursor: !disabled });
    this.contentContainer.add(zone);
    this.menuObjs.push(zone);
    if (onClick && !disabled) {
      zone.on('pointerover', () => {
        g.setAlpha(0.88);
        g.lineStyle(1.5, 0x5b7094, 0.9);
        g.strokeRoundedRect(bx, y, boxW, boxH, 6);
      });
      zone.on('pointerout', () => {
        g.setAlpha(1);
        g.lineStyle(1.5, stroke, 1);
        g.strokeRoundedRect(bx, y, boxW, boxH, 6);
      });
      zone.on('pointerdown', onClick);
    }
  }

  /**
   * Vẽ menu — 2 vùng tách biệt:
   *
   * 1. **Khung dưới (`ACT_*`)** — 4 nút lệnh FIGHT / POKÉMON / BAG / RUN,
   *    chiều ngang rộng (320px), **luôn hiển thị** (không bị danh sách lấn).
   * 2. **Sidebar dọc bên phải (`SB_*`)** — danh sách chọn:
   *    `move` (chiêu thức) · `bag` (vật phẩm) · `switch` (đổi Pokémon).
   *    Ở mode `command`, sidebar hiện **party rút gọn** (chỉ xem, không bấm).
   */
  private buildMenu(): void {
    this.clearMenu();
    if (this.ended) return;
    const state = this.net.battle?.state as any;
    // `forced` = bắt buộc chọn Pokémon (đang chờ switch). Ở PvP chỉ dựa vào
    // `needSwitch` (server gửi riêng cho side đang chờ) — `state.phase` là
    // shared nên không dùng để suy ra trạng thái của riêng mình.
    const forced = this.isPvpBattle() ? this.needSwitch : state?.phase === 'switch' || this.needSwitch;

    // ── Khung 4 nút lệnh (luôn hiện) ──
    this.drawMenuPlate(ACT_X, BOTTOM_Y, ACT_W, BOTTOM_H);
    const actTop = BOTTOM_Y + ACT_PAD;
    const actH = (ACT_INNER_H - ACT_GAP) / 2; // 52
    const col1R = ACT_X + ACT_PAD + ACT_COL_W;
    const col2R = ACT_X + ACT_W - ACT_PAD;

    // 4 nút lệnh tông màu tối thanh lịch dịu mắt
    this.btn('FIGHT', col1R, actTop, () => this.setMode('move'), forced, '#36242a', ACT_COL_W, actH, true, {
      border: 0x543741,
      shortcut: '1',
      icon: '⚔️',
      textColor: '#d9c7cb',
    });
    this.btn('POKÉMON', col2R, actTop, () => this.setMode('switch'), false, '#1c2d27', ACT_COL_W, actH, true, {
      border: 0x2c473c,
      shortcut: '2',
      icon: '🐾',
      textColor: '#bed5cd',
    });
    this.btn('BAG', col1R, actTop + actH + ACT_GAP, () => this.setMode('bag'), forced, '#302b1f', ACT_COL_W, actH, true, {
      border: 0x4a402d,
      shortcut: '3',
      icon: '🎒',
      textColor: '#d4cebe',
    });
    this.btn(
      this.isPvpBattle()
        ? this.pvpForfeitArmed
          ? t('BATTLE_PVP_FORFEIT_CONFIRM')
          : t('BATTLE_PVP_FORFEIT')
        : 'RUN',
      col2R,
      actTop + actH + ACT_GAP,
      () => (this.isPvpBattle() ? this.pvpForfeit() : this.runNow()),
      forced,
      '#1e2938',
      ACT_COL_W,
      actH,
      true,
      {
        border: 0x2d3e54,
        shortcut: '4',
        icon: this.isPvpBattle() ? '🏳️' : '🏃',
        textColor: '#c0cfdf',
      },
    );

    // ── Cột phải: khung TEXT (mặc định) hoặc khung chọn theo mode ──
    if (this.mode === 'move') this.sidebarMoves(state);
    else if (this.mode === 'bag') this.sidebarBag();
    else if (this.mode === 'switch') this.sidebarParty(state, forced);
    else this.sidebarText();
  }

  /** Vẽ lại khung TEXT nếu nó đang là nội dung hiển thị ở cột phải. */
  private refreshTextPanel(): void {
    if (this.ended) return;
    if (this.mode === 'command' || this.mode === 'none') this.buildMenu();
  }

  /** Làm dịu màu: nhân RGB với `f` (mặc định 0.55) để bớt chói. */
  private muteHex(hex: string, f = 0.55): string {
    const c = Phaser.Display.Color.HexStringToColor(hex);
    const r = Math.round(c.red * f).toString(16).padStart(2, '0');
    const g = Math.round(c.green * f).toString(16).padStart(2, '0');
    const b = Math.round(c.blue * f).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  /** Nền + tiêu đề của sidebar. */
  private drawSidebarFrame(title: string): void {
    const bg = this.drawPlate(SB_X, SB_Y, SB_W, SB_H);
    this.menuObjs.push(bg); // clearMenu() sẽ dọn luôn (tránh dồn nền mỗi lần vẽ)

    const txt = mkText(this.scene, title, {
      fontSize: '12px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#93a3c0',
      fixedWidth: SB_INNER_W,
    });
    txt.setPosition(SB_X + SB_PAD, SB_Y + SB_PAD + 2).setOrigin(0, 0);
    this.contentContainer.add(txt);
    this.menuObjs.push(txt);

    const line = this.scene.add.graphics();
    line.lineStyle(1, COL.border, 0.45);
    line.lineBetween(SB_X + SB_PAD, SB_TOP - 8, SB_X + SB_W - SB_PAD, SB_TOP - 8);
    this.contentContainer.add(line);
    this.menuObjs.push(line);
  }

  /** Dòng "không có gì" giữa sidebar. */
  private sidebarEmpty(text: string): void {
    const txt = mkText(this.scene, text, {
      fontSize: '12px',
      fontFamily: FONT.sans,
      color: '#6b7a94',
      align: 'center',
      fixedWidth: SB_INNER_W,
      wordWrap: { width: SB_INNER_W },
    });
    txt.setPosition(SB_X + SB_PAD, SB_TOP + 12).setOrigin(0, 0);
    this.contentContainer.add(txt);
    this.menuObjs.push(txt);
  }

  /**
   * Hàng cuối của sidebar: BACK (trái) + cuộn ▲▼ (phải).
   * @param showBack =false khi bị ép đổi (bắt buộc chọn Pokémon còn sống).
   */
  private sidebarFooter(showBack: boolean, scrollable = false, onPrev?: () => void, onNext?: () => void): void {
    const y = SB_FOOT_Y;
    const navW = 30;
    const left = SB_X + SB_PAD;
    const right = SB_X + SB_W - SB_PAD;
    const backW = showBack ? (scrollable ? SB_INNER_W - navW * 2 - 8 : SB_INNER_W) : 0;

    if (showBack) {
      this.btn(t('BATTLE_BACK'), left + backW, y, () => this.setMode('command'), false, '#37415e', backW, SB_FOOT_H);
    }
    if (scrollable) {
      const navX = showBack ? left + backW + 4 + navW : left + navW;
      this.btn('▲', navX, y, onPrev, false, '#37415e', navW, SB_FOOT_H);
      this.btn('▼', right, y, onNext, false, '#37415e', navW, SB_FOOT_H);
    }
  }

  /**
   * Sidebar mode `move` — danh sách chiêu thức của Pokémon đang ra trận.
   * Màu nền lấy theo hệ nhưng **dịu** (muteHex) để không chói mắt.
   */
  private sidebarMoves(state: any): void {
    const ally = this.myState?.team?.[this.myState.activeIndex ?? 0];
    const moves: string[] = ally?.moves ? Array.from(ally.moves) : [];
    const pp: number[] = ally?.pp ? Array.from(ally.pp) : [];
    this.drawSidebarFrame(t('SB_MOVES'));

    if (moves.length === 0) {
      this.sidebarEmpty(t('SB_NO_MOVES'));
      return;
    }

    const rowH = 34;
    const gap = 6;
    const maxRows = Math.max(1, Math.floor((SB_BOTTOM - SB_TOP + gap) / (rowH + gap)));
    moves.slice(0, maxRows).forEach((id, i) => {
      const left = pp[i] ?? 0;
      const info = this.moveInfo.get(id);
      const bg = this.muteHex(TYPE_COLORS[info?.type ?? ''] ?? COL.btn, 0.42);
      this.moveRow(
        info,
        id,
        left,
        left > 0
          ? () => {
              this.net.sendBattleMove(i);
              this.markActionChosen();
              this.setMode('command');
            }
          : undefined,
        bg,
        SB_TOP + i * (rowH + gap),
        rowH,
        i + 1,
      );
    });

    this.sidebarFooter(true, false);
  }

  /**
   * Sidebar mode `bag` — vật phẩm dùng được trong trận:
   * - Hỗ trợ phân loại: Tất cả, Bóng, Hồi phục, Tăng chỉ số
   * - Hỗ trợ tìm kiếm theo tên hoặc hiệu ứng (search input real-time)
   * - Danh sách thẻ item thiết kế chuyên nghiệp với icon, số lượng, hiệu ứng
   * - Cuộn mượt mà qua nút điều hướng và cuộn chuột
   */
  private sidebarBag(): void {
    const allUsable = this.battleUsableItems();
    this.drawSidebarFrame(`${t('SB_BAG')} (${allUsable.length})`);

    const tabsY = SB_Y + SB_PAD + SB_TITLE_H + 4; // 74
    const tabsH = 22;
    const searchY = tabsY + tabsH + 6; // 102
    const searchH = 24;
    const listTopY = searchY + searchH + 7; // 133
    const cardH = 34;
    const gap = 5;
    const maxRows = Math.max(1, Math.floor((SB_BOTTOM - listTopY + gap) / (cardH + gap))); // ~6 rows

    // 1. Dải phân loại (Tabs)
    this.renderBagTabs(tabsY, tabsH, allUsable);

    // 2. Ô tìm kiếm (Search bar)
    this.renderBagSearchBar(searchY, searchH);

    // 3. Lọc danh sách theo Tab & Search Query
    let filtered = allUsable;
    if (this.bagCategory !== 'all') {
      filtered = filtered.filter((it) => it.cat === this.bagCategory);
    }
    if (this.bagSearchQuery) {
      const q = this.bagSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.itemId.toLowerCase().includes(q) ||
          it.effectText.toLowerCase().includes(q),
      );
    }

    // 4. Trạng thái rỗng
    if (filtered.length === 0) {
      this.renderBagEmpty(listTopY, allUsable.length);
      this.sidebarBagFooter(0, 1, 0, false);
      return;
    }

    // 5. Phân trang & Render danh sách
    const totalPages = Math.ceil(filtered.length / maxRows);
    const start = Phaser.Math.Clamp(this.bagScroll, 0, Math.max(0, filtered.length - maxRows));
    this.bagScroll = start;
    const currentPage = Math.floor(start / maxRows);

    // Vùng bắt sự kiện cuộn chuột ở nền trống (thêm TRƯỚC để nằm dưới các card)
    const emptyZone = this.scene.add
      .zone(SB_X + SB_PAD + SB_INNER_W / 2, listTopY + (maxRows * (cardH + gap)) / 2, SB_INNER_W, maxRows * (cardH + gap))
      .setInteractive();
    emptyZone.on('wheel', (pointer: any, deltaX: number, deltaY: number) => {
      if (deltaY > 0 && this.bagScroll + maxRows < filtered.length) {
        this.bagScroll = Math.min(filtered.length - 1, this.bagScroll + maxRows);
        this.buildMenu();
      } else if (deltaY < 0 && this.bagScroll > 0) {
        this.bagScroll = Math.max(0, this.bagScroll - maxRows);
        this.buildMenu();
      }
    });
    this.contentContainer.add(emptyZone);
    this.menuObjs.push(emptyZone);

    const slice = filtered.slice(start, start + maxRows);
    slice.forEach((it, i) => {
      this.bagItemCard(it, SB_X + SB_PAD, listTopY + i * (cardH + gap), SB_INNER_W, cardH, maxRows, filtered.length);
    });

    // 6. Thanh Footer điều hướng
    const hasPagination = filtered.length > maxRows;
    this.sidebarBagFooter(
      currentPage,
      totalPages,
      filtered.length,
      hasPagination,
      () => {
        this.bagScroll = Math.max(0, this.bagScroll - maxRows);
        this.buildMenu();
      },
      () => {
        this.bagScroll = Math.min(filtered.length - 1, this.bagScroll + maxRows);
        this.buildMenu();
      },
    );
  }

  private renderBagTabs(y: number, h: number, allUsable: BattleUsableItem[]): void {
    const tabs: Array<{ id: BattleBagCategory; label: string; icon: string }> = [
      { id: 'all', label: t('BATTLE_BAG_TAB_ALL'), icon: '📦' },
      { id: 'ball', label: t('BATTLE_BAG_TAB_BALL'), icon: '🔴' },
      { id: 'medicine', label: t('BATTLE_BAG_TAB_MEDICINE'), icon: '🧪' },
      { id: 'battle', label: t('BATTLE_BAG_TAB_BATTLE'), icon: '⚔️' },
    ];

    const counts: Record<BattleBagCategory, number> = {
      all: allUsable.length,
      ball: allUsable.filter((i) => i.cat === 'ball').length,
      medicine: allUsable.filter((i) => i.cat === 'medicine').length,
      battle: allUsable.filter((i) => i.cat === 'battle').length,
    };

    const gap = 4;
    const totalW = SB_INNER_W;
    const tabW = Math.floor((totalW - gap * (tabs.length - 1)) / tabs.length);
    let curX = SB_X + SB_PAD;

    tabs.forEach((tab, idx) => {
      const isLast = idx === tabs.length - 1;
      const w = isLast ? totalW - (tabW + gap) * (tabs.length - 1) : tabW;
      const active = this.bagCategory === tab.id;
      const count = counts[tab.id];

      const gfx = this.scene.add.graphics();
      const drawTab = (hover = false) => {
        gfx.clear();
        gfx.fillStyle(active ? 0x223652 : hover ? 0x1d273a : 0x131926, 1);
        gfx.fillRoundedRect(curX, y, w, h, 4);
        gfx.lineStyle(1.5, active ? 0x00cec9 : hover ? 0x415575 : 0x243247, 1);
        gfx.strokeRoundedRect(curX, y, w, h, 4);
      };
      drawTab();
      this.contentContainer.add(gfx);
      this.menuObjs.push(gfx);

      const labelTxt = `${tab.icon} ${tab.label}${count > 0 ? ` ${count}` : ''}`;
      const txt = mkText(this.scene, labelTxt, {
        fontSize: '9.5px',
        fontFamily: FONT.ui,
        fontStyle: active ? 'bold' : 'normal',
        color: active ? '#ffffff' : count > 0 ? '#b0c4de' : '#5d6f8a',
        align: 'center',
        fixedWidth: w,
      });
      txt.setPosition(curX, y + 4).setOrigin(0, 0);
      this.contentContainer.add(txt);
      this.menuObjs.push(txt);

      const zone = this.scene.add
        .zone(curX + w / 2, y + h / 2, w, h)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (!active) {
          drawTab(true);
          txt.setColor('#ffffff');
        }
      });
      zone.on('pointerout', () => {
        if (!active) {
          drawTab(false);
          txt.setColor(count > 0 ? '#b0c4de' : '#5d6f8a');
        }
      });
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        if (this.bagCategory !== tab.id) {
          this.bagCategory = tab.id;
          this.bagScroll = 0;
          this.buildMenu();
        }
      });
      this.contentContainer.add(zone);
      this.menuObjs.push(zone);

      curX += w + gap;
    });
  }

  private renderBagSearchBar(y: number, h: number): void {
    const x = SB_X + SB_PAD;
    const w = SB_INNER_W;
    this.bagSearchBoxBounds = { x, y, w, h };

    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0x0f1422, 0.95);
    gfx.fillRoundedRect(x, y, w, h, 4);
    gfx.lineStyle(1, this.bagSearchFocused ? 0x00cec9 : 0x2e3b52, 1);
    gfx.strokeRoundedRect(x, y, w, h, 4);
    this.contentContainer.add(gfx);
    this.menuObjs.push(gfx);
    this.bagSearchBoxGfx = gfx;

    // Icon kính lúp 🔍
    const searchIcon = mkText(this.scene, '🔍', {
      fontSize: '11px',
      fontFamily: FONT.sans,
      color: '#6b7a94',
    });
    searchIcon.setPosition(x + 6, y + 4).setOrigin(0, 0);
    this.contentContainer.add(searchIcon);
    this.menuObjs.push(searchIcon);

    const hasClear = !!this.bagSearchQuery;
    const clearBtnW = hasClear ? 20 : 0;
    const inputX = x + 24;
    const inputW = w - 26 - clearBtnW;

    this.positionBagSearchInput(inputX, y, inputW, h);

    if (hasClear) {
      const clearBtn = mkText(this.scene, '✕', {
        fontSize: '11px',
        fontFamily: FONT.ui,
        color: '#93a3c0',
      });
      clearBtn.setPosition(x + w - 16, y + 4).setOrigin(0.5, 0);
      clearBtn.setSize(20, 20);
      clearBtn.setInteractive({ useHandCursor: true });
      clearBtn.on('pointerover', () => clearBtn.setColor('#ff7675'));
      clearBtn.on('pointerout', () => clearBtn.setColor('#93a3c0'));
      clearBtn.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        this.bagSearchQuery = '';
        if (this.bagSearchInputEl) this.bagSearchInputEl.value = '';
        this.bagScroll = 0;
        this.buildMenu();
      });
      this.contentContainer.add(clearBtn);
      this.menuObjs.push(clearBtn);
    }
  }

  private bagItemCard(
    it: BattleUsableItem,
    x: number,
    y: number,
    w: number,
    h: number,
    maxRows?: number,
    totalFiltered?: number,
  ): void {
    const isBall = it.isBall;
    const cat = it.cat;
    const isLocked = Boolean(it.locked);

    const bgCol = isLocked
      ? 0x0f1420
      : isBall
        ? 0x1e192c
        : cat === 'medicine'
          ? 0x132422
          : cat === 'battle'
            ? 0x251c14
            : 0x151e2e;
    const borderCol = isLocked
      ? 0x283548
      : isBall
        ? 0x543775
        : cat === 'medicine'
          ? 0x265449
          : cat === 'battle'
            ? 0x5c3b24
            : 0x2b3d5c;
    const hoverBg = isLocked
      ? 0x0f1420
      : isBall
        ? 0x2d2442
        : cat === 'medicine'
          ? 0x1b3734
          : cat === 'battle'
            ? 0x38291c
            : 0x212f47;
    const hoverBorder = isLocked
      ? 0x3a4b63
      : isBall
        ? 0x8b5bbd
        : cat === 'medicine'
          ? 0x3fb89f
          : cat === 'battle'
            ? 0xb57843
            : 0x4f73a8;

    const gfx = this.scene.add.graphics();
    const drawCard = (hover = false) => {
      gfx.clear();
      gfx.fillStyle(hover ? hoverBg : bgCol, isLocked ? 0.75 : 0.95);
      gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1.5, hover ? hoverBorder : borderCol, isLocked ? 0.6 : 1);
      gfx.strokeRoundedRect(x, y, w, h, 4);

      // Pill badge chứa số lượng ở góc phải
      const pillW = 34;
      const pillH = 18;
      const pillX = x + w - pillW - 6;
      const pillY = y + (h - pillH) / 2;
      gfx.fillStyle(0x0c111a, isLocked ? 0.6 : 0.85);
      gfx.fillRoundedRect(pillX, pillY, pillW, pillH, 3);
      gfx.lineStyle(1, isLocked ? 0x1e2736 : 0x2b384d, 0.8);
      gfx.strokeRoundedRect(pillX, pillY, pillW, pillH, 3);
    };
    drawCard();
    this.contentContainer.add(gfx);
    this.menuObjs.push(gfx);

    // Icon bên trái
    const iconKey = `item_icon_${it.itemId}`;
    const iconSize = 22;
    const iconX = x + 16;
    const iconY = y + h / 2;

    if (it.iconUrl) {
      if (this.scene.textures.exists(iconKey)) {
        const img = this.scene.add.image(iconX, iconY, iconKey).setDisplaySize(iconSize, iconSize);
        if (isLocked) img.setAlpha(0.5);
        this.contentContainer.add(img);
        this.menuObjs.push(img);
      } else {
        const fallbackTxt = mkText(this.scene, isBall ? '🔴' : cat === 'medicine' ? '🧪' : cat === 'battle' ? '⚔️' : '📦', {
          fontSize: '13px',
          fontFamily: FONT.sans,
        }).setOrigin(0.5, 0.5).setPosition(iconX, iconY);
        if (isLocked) fallbackTxt.setAlpha(0.5);
        this.contentContainer.add(fallbackTxt);
        this.menuObjs.push(fallbackTxt);

        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => {
          if (!this.scene.textures.exists(iconKey)) {
            this.scene.textures.addImage(iconKey, el);
          }
          if (fallbackTxt.active) {
            fallbackTxt.destroy();
            const img = this.scene.add.image(iconX, iconY, iconKey).setDisplaySize(iconSize, iconSize);
            if (isLocked) img.setAlpha(0.5);
            this.contentContainer.add(img);
            this.menuObjs.push(img);
          }
        };
        el.src = it.iconUrl;
      }
    } else {
      const emojiTxt = mkText(this.scene, isBall ? '🔴' : cat === 'medicine' ? '🧪' : cat === 'battle' ? '⚔️' : '📦', {
        fontSize: '13px',
        fontFamily: FONT.sans,
      }).setOrigin(0.5, 0.5).setPosition(iconX, iconY);
      if (isLocked) emojiTxt.setAlpha(0.5);
      this.contentContainer.add(emojiTxt);
      this.menuObjs.push(emojiTxt);
    }

    // Tên item (dòng 1)
    const displayName = isLocked ? `🔒 ${it.name}` : it.name;
    const nameTxt = mkText(this.scene, displayName, {
      fontSize: '11px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: isLocked ? '#64748b' : isBall ? '#f3e8ff' : '#f0f6fc',
    });
    nameTxt.setPosition(x + 32, y + 3).setOrigin(0, 0);
    this.contentContainer.add(nameTxt);
    this.menuObjs.push(nameTxt);

    // Hiệu ứng tóm tắt (dòng 2)
    const effStr = isLocked ? (it.lockReason || 'Bị khoá trong trận này') : (it.effectText || '');
    const effColor = isLocked
      ? '#e17055'
      : isBall
        ? '#c084fc'
        : cat === 'medicine'
          ? '#4ade80'
          : cat === 'battle'
            ? '#fb923c'
            : '#94a3b8';
    const effTxt = mkText(this.scene, effStr, {
      fontSize: '9.5px',
      fontFamily: FONT.sans,
      color: effColor,
      fixedWidth: w - 82,
    });
    effTxt.setPosition(x + 32, y + 18).setOrigin(0, 0);
    this.contentContainer.add(effTxt);
    this.menuObjs.push(effTxt);

    // Số lượng badge
    const qtyTxt = mkText(this.scene, `×${it.quantity}`, {
      fontSize: '10px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: isLocked ? '#64748b' : '#38ef7d',
    });
    qtyTxt.setPosition(x + w - 23, y + h / 2).setOrigin(0.5, 0.5);
    this.contentContainer.add(qtyTxt);
    this.menuObjs.push(qtyTxt);

    // Click zone (được định vị tâm chuẩn x + w / 2, y + h / 2)
    const state = this.net.battle?.state as any;
    const isBusy = state?.phase !== 'select';
    const canClick = !isLocked && !isBusy;

    const zone = this.scene.add
      .zone(x + w / 2, y + h / 2, w, h)
      .setInteractive({ useHandCursor: canClick });
    this.contentContainer.add(zone);
    this.menuObjs.push(zone);

    zone.on('pointerover', () => {
      if (canClick) drawCard(true);
    });
    zone.on('pointerout', () => drawCard(false));
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      if (isLocked) {
        this.showPop(it.lockReason || (getLang() === 'vi' ? 'Vật phẩm bị khoá trong trận này!' : 'Item locked in this battle!'));
        return;
      }
      const st = this.net.battle?.state as any;
      if (st?.phase !== 'select') return;

      if (this.requiresPartyTarget(it.itemId)) {
        this.openPartySelectForItem(it);
      } else {
        this.useBattleItemDirect(it);
      }
    });
    if (maxRows !== undefined && totalFiltered !== undefined) {
      zone.on('wheel', (pointer: any, deltaX: number, deltaY: number) => {
        if (deltaY > 0 && this.bagScroll + maxRows < totalFiltered) {
          this.bagScroll = Math.min(totalFiltered - 1, this.bagScroll + maxRows);
          this.buildMenu();
        } else if (deltaY < 0 && this.bagScroll > 0) {
          this.bagScroll = Math.max(0, this.bagScroll - maxRows);
          this.buildMenu();
        }
      });
    }
  }

  private renderBagEmpty(y: number, totalUsable: number): void {
    const x = SB_X + SB_PAD;
    const w = SB_INNER_W;

    if (totalUsable === 0) {
      this.sidebarEmpty(t('BATTLE_BAG_EMPTY'));
      return;
    }

    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0x131926, 0.85);
    gfx.fillRoundedRect(x, y + 10, w, 90, 6);
    gfx.lineStyle(1, 0x273448, 1);
    gfx.strokeRoundedRect(x, y + 10, w, 90, 6);
    this.contentContainer.add(gfx);
    this.menuObjs.push(gfx);

    const icon = mkText(this.scene, '🔍', {
      fontSize: '20px',
      fontFamily: FONT.sans,
      color: '#64748b',
    });
    icon.setPosition(x + w / 2, y + 30).setOrigin(0.5, 0.5);
    this.contentContainer.add(icon);
    this.menuObjs.push(icon);

    const msg = mkText(this.scene, t('BATTLE_BAG_NO_MATCH'), {
      fontSize: '11px',
      fontFamily: FONT.sans,
      color: '#8ca0ba',
      align: 'center',
      fixedWidth: w - 20,
      wordWrap: { width: w - 20 },
    });
    msg.setPosition(x + 10, y + 46).setOrigin(0, 0);
    this.contentContainer.add(msg);
    this.menuObjs.push(msg);

    const resetBtn = mkText(this.scene, t('BATTLE_BAG_RESET_FILTER'), {
      fontSize: '10.5px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#00cec9',
    });
    resetBtn.setPosition(x + w / 2, y + 78).setOrigin(0.5, 0.5);
    resetBtn.setSize(120, 20);
    resetBtn.setInteractive({ useHandCursor: true });
    resetBtn.on('pointerover', () => resetBtn.setColor('#55efc4'));
    resetBtn.on('pointerout', () => resetBtn.setColor('#00cec9'));
    resetBtn.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event?.stopPropagation();
      this.bagCategory = 'all';
      this.bagSearchQuery = '';
      if (this.bagSearchInputEl) this.bagSearchInputEl.value = '';
      this.bagScroll = 0;
      this.buildMenu();
    });
    this.contentContainer.add(resetBtn);
    this.menuObjs.push(resetBtn);
  }

  private sidebarBagFooter(
    currentPage: number,
    totalPages: number,
    totalItems: number,
    scrollable: boolean,
    onPrev?: () => void,
    onNext?: () => void,
  ): void {
    const y = SB_FOOT_Y;
    const backW = 76;
    const navW = 26;
    const left = SB_X + SB_PAD;
    const right = SB_X + SB_W - SB_PAD;

    // Nút Quay lại
    this.btn(
      t('BATTLE_BACK'),
      left + backW,
      y,
      () => {
        this.hideBagSearchInput();
        this.setMode('command');
      },
      false,
      '#37415e',
      backW,
      SB_FOOT_H,
    );

    // Chỉ số trang ở giữa
    const pageStr = totalPages > 1 ? `${currentPage + 1}/${totalPages}` : `${totalItems}`;
    const pageTxt = mkText(this.scene, pageStr, {
      fontSize: '10.5px',
      fontFamily: FONT.ui,
      color: '#8ca0ba',
      align: 'center',
    });
    const centerIndicatorX = left + backW + (scrollable ? (SB_INNER_W - backW - navW * 2 - 8) / 2 : (SB_INNER_W - backW) / 2);
    pageTxt.setPosition(centerIndicatorX, y + SB_FOOT_H / 2).setOrigin(0.5, 0.5);
    this.contentContainer.add(pageTxt);
    this.menuObjs.push(pageTxt);

    if (scrollable) {
      const prevX = right - navW * 2 - 4;
      this.btn('▲', prevX + navW, y, currentPage > 0 ? onPrev : undefined, currentPage === 0, currentPage === 0 ? '#1f2536' : '#37415e', navW, SB_FOOT_H);
      this.btn('▼', right, y, currentPage < totalPages - 1 ? onNext : undefined, currentPage >= totalPages - 1, currentPage >= totalPages - 1 ? '#1f2536' : '#37415e', navW, SB_FOOT_H);
    }
  }

  /** Kiểm tra xem item có cần chọn Pokémon trong đội hay không (hồi máu, giải hiệu ứng, hồi sinh) */
  private requiresPartyTarget(itemId: string): boolean {
    const eff = resolveItemEffect(itemId);
    if (!eff) return false;
    return eff.kind === 'heal' || eff.kind === 'cure_status' || eff.kind === 'revive';
  }

  /** Dùng item trực tiếp không qua chọn party (Poké Ball ném vào wild foe, buff chiêu Pokémon active) */
  private useBattleItemDirect(it: BattleUsableItem): void {
    if (it.isBall && !this.isWildBattle()) {
      this.showPop(getLang() === 'vi' ? 'Không thể bắt Pokémon của huấn luyện viên!' : 'Cannot catch Trainer Pokémon!');
      return;
    }
    this.net.sendBattleItem(it.itemId);
    it.quantity = Math.max(0, it.quantity - 1);
    this.markActionChosen();

    if (!this.isWildBattle()) {
      this.hideBagSearchInput();
      this.setMode('command');
    } else {
      // Trong wild battle: Giữ nguyên mở cửa sổ Bag để quăng bóng nhiều lần không phải mở lại!
      this.buildMenu();
    }
  }

  /** Mở popup Mini Party để chọn Pokémon sử dụng vật phẩm */
  private openPartySelectForItem(it: BattleUsableItem): void {
    const isVi = getLang() === 'vi';
    const state = this.net.battle?.state as any;
    const team: any[] = this.myState?.team ? Array.from(this.myState.team) : [];

    // Lấy playerPokemonParty từ scene nếu có để bổ sung thông tin icon/ivs/types
    const sceneParty: PokemonData[] = (this.scene as any)?.playerPokemonParty || [];

    // Chuyển đổi team sang định dạng PokemonData đồng bộ máu/trạng thái chiến đấu
    const partyData: PokemonData[] = team.map((p, idx) => {
      const fallback = sceneParty[idx];
      return {
        id: p.pokemonId || fallback?.id || `ally_${idx}`,
        species_id: p.speciesId || fallback?.species_id || 'pikachu',
        nickname: p.nickname || fallback?.nickname,
        level: p.level || fallback?.level || 1,
        exp: p.exp ?? fallback?.exp ?? 0,
        current_hp: p.currentHp ?? fallback?.current_hp ?? 0,
        stats: {
          hp: p.maxHp ?? fallback?.stats?.hp ?? 10,
          attack: p.attack ?? fallback?.stats?.attack ?? 10,
          defense: p.defense ?? fallback?.stats?.defense ?? 10,
          spAttack: p.spAttack ?? fallback?.stats?.spAttack ?? 10,
          spDefense: p.spDefense ?? fallback?.stats?.spDefense ?? 10,
          speed: p.speed ?? fallback?.stats?.speed ?? 10,
        },
        status: p.status ?? fallback?.status ?? null,
        shiny: Boolean(p.shiny ?? fallback?.shiny),
        party_slot: idx,
        gender: p.gender || fallback?.gender,
        held_item: p.heldItem || fallback?.held_item,
      };
    });

    if (this.partySelectModal) {
      this.partySelectModal.destroy();
      this.partySelectModal = undefined;
    }

    const title = isVi ? `Dùng ${it.name}` : `Use ${it.name}`;
    const hint = isVi ? 'Chọn Pokémon trong đội để sử dụng vật phẩm' : 'Select a Pokémon from party to use item';

    this.partySelectModal = new PartySelectModal(this.scene, {
      title,
      party: partyData,
      hint,
      depth: 400, // Hiển thị đè lên trên BattleModal (depth 300)
      filterAlive: false, // Cho phép xem cả Pokémon ngất để thông báo hợp lý
      onSelect: (targetPokemon, targetIdx) => {
        this.handleUseItemOnPokemon(it, targetPokemon, targetIdx);
      },
      onCancel: () => {
        // Giữ nguyên giao diện Bag
      },
    });

    this.partySelectModal.show();
  }

  /** Xử lý khi chọn Pokémon trong mini party để dùng item */
  private handleUseItemOnPokemon(it: BattleUsableItem, pokemon: PokemonData, targetIndex: number): void {
    const isVi = getLang() === 'vi';
    const eff = resolveItemEffect(it.itemId);
    const maxHp = pokemon.stats?.hp ?? 10;
    const curHp = pokemon.current_hp ?? 0;

    if (eff?.kind === 'heal') {
      if (curHp <= 0) {
        this.showPop(isVi ? `${pokemon.nickname || pokemon.species_id} đã ngất!` : `${pokemon.nickname || pokemon.species_id} is fainted!`);
        return;
      }
      if (curHp >= maxHp) {
        this.showPop(isVi ? 'HP của Pokémon đã đầy!' : 'HP is already full!');
        return;
      }
    } else if (eff?.kind === 'revive') {
      if (curHp > 0) {
        this.showPop(isVi ? `${pokemon.nickname || pokemon.species_id} vẫn còn sống!` : `${pokemon.nickname || pokemon.species_id} is still conscious!`);
        return;
      }
    } else if (eff?.kind === 'cure_status') {
      if (curHp <= 0) {
        this.showPop(isVi ? `${pokemon.nickname || pokemon.species_id} đã ngất!` : `${pokemon.nickname || pokemon.species_id} is fainted!`);
        return;
      }
      if (!pokemon.status) {
        this.showPop(isVi ? 'Pokémon không có trạng thái bất lợi!' : 'Pokémon has no status condition!');
        return;
      }
      if (!eff.status.includes(pokemon.status)) {
        this.showPop(isVi ? 'Không giải được trạng thái này!' : 'Cannot cure this status!');
        return;
      }
    }

    // Đủ điều kiện: Gửi action lên server kèm targetIndex
    this.net.sendBattleItem(it.itemId, targetIndex);
    it.quantity = Math.max(0, it.quantity - 1);
    this.markActionChosen();

    if (this.partySelectModal) {
      this.partySelectModal.destroy();
      this.partySelectModal = undefined;
    }

    if (!this.isWildBattle()) {
      this.hideBagSearchInput();
      this.setMode('command');
    } else {
      // Trong wild battle: Giữ nguyên mở Bag để thuận tiện dùng tiếp
      this.buildMenu();
    }
  }

  /**
   * Sidebar mode `switch` — khung party rút gọn (icon + tên/Lv + thanh HP).
   * Ép đổi (phase `switch`) → ẩn BACK, bắt buộc chọn Pokémon còn sống.
   */
  private sidebarParty(state: any, forced: boolean): void {
    const team: any[] = this.myState?.team ? Array.from(this.myState.team) : [];
    const activeIdx = this.myState?.activeIndex ?? 0;
    this.drawSidebarFrame(t('SB_PARTY'));

    if (team.length === 0) {
      this.sidebarEmpty(t('BATTLE_PARTY_EMPTY'));
      this.sidebarFooter(!forced, false);
      return;
    }

    const maxRows = Math.max(1, Math.floor((SB_BOTTOM - SB_TOP + SW_GAP) / (SW_ROW_H + SW_GAP)));
    const start = Phaser.Math.Clamp(this.switchScroll, 0, Math.max(0, team.length - maxRows));
    this.switchScroll = start;

    team.slice(start, start + maxRows).forEach((p, i) => {
      const idx = start + i;
      this.switchCard(
        p,
        SB_X + SB_PAD,
        SB_TOP + i * (SW_ROW_H + SW_GAP),
        SB_INNER_W,
        SW_ROW_H,
        idx === activeIdx || (p?.currentHp ?? 0) <= 0,
        idx === activeIdx,
        () => {
          this.net.sendBattleSwitch(idx);
          this.needSwitch = false;
          this.markActionChosen();
          this.setMode('command');
        },
      );
    });

    const scrollable = team.length > maxRows;
    this.sidebarFooter(
      !forced,
      scrollable,
      scrollable ? () => {
        this.switchScroll = Phaser.Math.Clamp(this.switchScroll - maxRows, 0, team.length - maxRows);
        this.buildMenu();
      } : undefined,
      scrollable ? () => {
        this.switchScroll = Phaser.Math.Clamp(this.switchScroll + maxRows, 0, team.length - maxRows);
        this.buildMenu();
      } : undefined,
    );
  }

  /**
   * Nội dung cột phải ở mode `command` — **khung TEXT toàn bộ trận**:
   * dòng trạng thái lượt + các dòng log mới nhất (nhật ký battle) + gợi ý phím.
   * Dùng xong một tính năng (chọn chiêu/item/Pokémon) → quay về đây, nội dung
   * tự cập nhật theo thao tác vừa thực hiện.
   */
  private sidebarText(): void {
    this.drawSidebarFrame(t('SB_LOG'));

    // Dòng trạng thái (vàng nhạt).
    const turn = mkText(this.scene, this.turnLabel || t('BATTLE_CONNECTION_FAILED'), {
      fontSize: '13px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: '#d8b56a',
      wordWrap: { width: SB_INNER_W - 4 },
    });
    turn.setPosition(SB_X + SB_PAD, SB_TOP + 2).setOrigin(0, 0);
    this.contentContainer.add(turn);
    this.menuObjs.push(turn);
    this.turnText = turn;

    // Gạch phân cách.
    const line = this.scene.add.graphics();
    line.lineStyle(1, COL.border, 0.4);
    line.lineBetween(SB_X + SB_PAD, SB_TOP + 26, SB_X + SB_W - SB_PAD, SB_TOP + 26);
    this.contentContainer.add(line);
    this.menuObjs.push(line);

    // Log battle — dòng mới nhất ở trên, tối đa vừa khung.
    const maxRows = Math.max(3, Math.floor((SB_BOTTOM - (SB_TOP + 34) + 4) / 20));
    const shown = this.logLines.slice(-maxRows).reverse();
    if (shown.length === 0) {
      const empty = mkText(this.scene, '…', {
        fontSize: '13px',
        fontFamily: FONT.sans,
        color: '#5c6a82',
      });
      empty.setPosition(SB_X + SB_PAD, SB_TOP + 34).setOrigin(0, 0);
      this.contentContainer.add(empty);
      this.menuObjs.push(empty);
    } else {
      shown.forEach((l, i) => {
        const y = SB_TOP + 34 + i * 20;
        const alpha = i === 0 ? '#e8edf6' : `#${i === 1 ? 'aeb8cc' : '79859b'}`;
        const txt = mkText(this.scene, l, {
          fontSize: '12px',
          fontFamily: FONT.sans,
          color: alpha,
          wordWrap: { width: SB_INNER_W - 4 },
          fixedWidth: SB_INNER_W - 4,
        });
        txt.setPosition(SB_X + SB_PAD, y).setOrigin(0, 0);
        this.contentContainer.add(txt);
        this.menuObjs.push(txt);
      });
    }

    // Gợi ý phím ở đáy.
    const hint = mkText(this.scene, t('SB_HINT'), {
      fontSize: '11px',
      fontFamily: FONT.sans,
      color: '#6b7a94',
      align: 'center',
      fixedWidth: SB_INNER_W,
      wordWrap: { width: SB_INNER_W },
    });
    hint.setPosition(SB_X + SB_PAD, SB_FOOT_Y + 4).setOrigin(0, 0);
    this.contentContainer.add(hint);
    this.menuObjs.push(hint);
  }

  /**
   * 1 dòng chiêu thức trong cột phải — 2 dòng thông tin:
   * ```
   * Fire Punch              15/15      ← tên (sáng vừa) + PP
   * 🔥 FIRE · PHY · POW 75 · ACC 100   ← hệ + loại + sức mạnh + độ chính xác
   * ```
   * Chữ dùng màu xám-xanh `#ccd6e6` (không trắng thuần → đỡ chói, đỡ "mờ").
   * (Không dùng `setResolution` — bản Phaser này render text to gấp đôi.)
   *
   * **Hover** → popup chi tiết (hệ, loại, POW/ACC/PP/ưu tiên, mô tả).
   */
  private moveRow(
    info: MoveView | undefined,
    id: string,
    ppLeft: number,
    onClick: (() => void) | undefined,
    bg: string,
    y: number,
    h: number,
    index?: number,
  ): void {
    const x = SB_X + SB_PAD;
    const w = SB_INNER_W;
    const usable = !!onClick;
    const g = this.scene.add.graphics();
    g.fillStyle(Phaser.Display.Color.HexStringToColor(bg).color, 1);
    g.fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1.5, usable ? 0x485a7d : 0x242c3d, 1);
    g.strokeRoundedRect(x, y, w, h, 5);
    this.contentContainer.add(g);
    this.menuObjs.push(g);

    // Dòng 1: số phím tắt + tên + PP
    const prefix = index ? `[${index}] ` : '';
    const name = mkText(this.scene, prefix + (info ? info.name : id), {
      fontSize: '12px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: usable ? '#f1f5f9' : '#64748b',
      fixedWidth: w - 54,
    });
    name.setPosition(x + 8, y + 4).setOrigin(0, 0);
    this.contentContainer.add(name);
    this.menuObjs.push(name);

    const pp = mkText(this.scene, `${ppLeft}/${info?.maxPp ?? 0}`, {
      fontSize: '11px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: usable ? (ppLeft <= 3 ? '#f87171' : '#94a3b8') : '#475569',
    });
    pp.setPosition(x + w - 8, y + 5).setOrigin(1, 0);
    this.contentContainer.add(pp);
    this.menuObjs.push(pp);

    // Dòng 2: hệ · loại · POW · ACC
    const typeKey = info?.type ?? 'normal';
    const typeTxt = mkText(this.scene, (typeKey || '—').toUpperCase(), {
      fontSize: '10px',
      fontFamily: FONT.ui,
      fontStyle: 'bold',
      color: this.muteHex(TYPE_COLORS[typeKey] ?? '#8a94a6', 0.9),
    });
    typeTxt.setPosition(x + 8, y + 19).setOrigin(0, 0);
    this.contentContainer.add(typeTxt);
    this.menuObjs.push(typeTxt);

    const catIcon = info?.category === 'physical' ? '💥' : info?.category === 'special' ? '🔮' : '🛡️';
    const meta = `${catIcon} ${CAT_LABEL[info?.category ?? ''] ?? 'PHY'} · POW ${
      info?.power ?? '-'
    } · ACC ${info?.accuracy ?? '-'}`;
    const metaTxt = mkText(this.scene, meta, {
      fontSize: '10px',
      fontFamily: FONT.ui,
      color: usable ? '#94a3b8' : '#475569',
    });
    metaTxt.setPosition(x + 8 + typeTxt.width + 6, y + 19).setOrigin(0, 0);
    this.contentContainer.add(metaTxt);
    this.menuObjs.push(metaTxt);

    // Zone tương tác nhận click & hover cho chiêu thức
    const zone = this.scene.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: usable });
    this.contentContainer.add(zone);
    this.menuObjs.push(zone);

    if (info) {
      zone.on('pointerover', () => this.showMoveTip(info));
      zone.on('pointerout', () => this.hideMoveTip());
    }
    if (usable && onClick) {
      zone.on('pointerover', () => g.setAlpha(0.85));
      zone.on('pointerout', () => g.setAlpha(1));
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation();
        onClick();
      });
    }
  }

  // ── Popup chi tiết chiêu (hover) ────────────────────────────────────────
  private tipObjs?: Phaser.GameObjects.GameObject[];

  /** Hiện popup chi tiết chiêu ở **phía trái cột phải** (trùng lên field). */
  private showMoveTip(info: MoveView): void {
    this.hideMoveTip();
    const W = 236;
    const x = SB_X - 8 - W;
    const y = Phaser.Math.Clamp(SB_TOP - 4, FIELD_TOP + 6, M_H - HEADER_H - 150);
    const objs: Phaser.GameObjects.GameObject[] = [];

    const g = this.scene.add.graphics();
    g.fillStyle(0x0d1424, 0.97);
    g.fillRoundedRect(x, y, W, 140, 6);
    g.lineStyle(1.5, Phaser.Display.Color.HexStringToColor(TYPE_COLORS[info.type] ?? '#3a4666').color, 0.9);
    g.strokeRoundedRect(x, y, W, 140, 6);
    this.contentContainer.add(g);
    objs.push(g);

    const addText = (s: string, style: Phaser.Types.GameObjects.Text.TextStyle, tx: number, ty: number) => {
      const t2 = mkText(this.scene, s, style, tx, ty).setOrigin(0, 0);
      this.contentContainer.add(t2);
      objs.push(t2);
      return t2;
    };

    addText(info.name, { fontSize: '14px', fontFamily: FONT.ui, fontStyle: 'bold', color: '#dbe3f1' }, x + 10, y + 8);

    // Chip hệ + loại.
    const chip = this.scene.add.graphics();
    chip.fillStyle(Phaser.Display.Color.HexStringToColor(TYPE_COLORS[info.type] ?? '#4a5468').color, 0.9);
    chip.fillRoundedRect(x + 10, y + 30, 62, 16, 3);
    this.contentContainer.add(chip);
    objs.push(chip);
    addText((info.type || '—').toUpperCase(), { fontSize: '10px', fontFamily: FONT.ui, fontStyle: 'bold', color: '#10141f' }, x + 41, y + 34).setOrigin(0.5, 0);

    addText(
      CAT_LABEL[info.category] ?? info.category.toUpperCase(),
      { fontSize: '10px', fontFamily: FONT.ui, color: '#9fb0cc' },
      x + 80,
      y + 34,
    );

    // Dòng chỉ số.
    const stats = [
      `POW ${info.power ?? '—'}`,
      `ACC ${info.accuracy ?? '—'}`,
      `PP ${info.maxPp}`,
      `PRI ${info.priority >= 0 ? `+${info.priority}` : info.priority}`,
    ].join('   ');
    addText(stats, { fontSize: '11px', fontFamily: FONT.ui, color: '#aeb8cc' }, x + 10, y + 54);

    // Mô tả.
    addText(
      info.description || '—',
      { fontSize: '11px', fontFamily: FONT.sans, color: '#8b97ad', wordWrap: { width: W - 20 }, fixedWidth: W - 20 },
      x + 10,
      y + 76,
    );

    this.tipObjs = objs;
  }

  private hideMoveTip(): void {
    if (!this.tipObjs) return;
    for (const o of this.tipObjs) o.destroy();
    this.tipObjs = undefined;
  }

  /**
   * Thẻ Pokémon rút gọn trong khung party (mode SWITCH):
   * `[icon] Name ♂ Lv.5                    12/20`
   * `        ▓▓▓▓▓▓▓▓░░░░░░` (thanh HP)
   *
   * @param onClick    bỏ trống → thẻ chỉ để xem (mode `command`).
   * @param interactive =false → không gắn hitbox (dùng cho sidebar tóm tắt).
   */
  private switchCard(
    p: any,
    x: number,
    y: number,
    w: number,
    h: number,
    disabled: boolean,
    isActive: boolean,
    onClick?: () => void,
    interactive = true,
  ): void {
    const fill = disabled ? 0x1a2030 : 0x22304a;
    const border = isActive ? 0x4d7f5c : disabled ? 0x3a2430 : 0x3f5070;

    const g = this.scene.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1.5, border, 1);
    g.strokeRoundedRect(x, y, w, h, 4);
    this.contentContainer.add(g);
    this.menuObjs.push(g);

    // Icon Pokémon (battler front) — thiếu ảnh thì bỏ trống.
    const iconKey = `battle_front_${p?.speciesId}`;
    if (p?.speciesId && this.scene.textures.exists(iconKey)) {
      const icon = this.scene.add.image(x + 4 + SW_ICON / 2, y + h / 2, iconKey);
      const src = icon.texture.getSourceImage();
      if (src) icon.setScale(Math.min(SW_ICON / src.width, SW_ICON / src.height, 1));
      if (disabled) icon.setAlpha(0.4);
      this.contentContainer.add(icon);
      this.menuObjs.push(icon);
    }

    const textX = x + 6 + SW_ICON;
    const hpStr = `${p?.currentHp ?? 0}/${p?.maxHp ?? 0}`;
    const nameTxt = mkText(this.scene, this.nameLine(p), {
      fontSize: '11px',
      fontFamily: FONT.ui,
      color: disabled ? '#5f6d85' : '#c7d1e2',
      fixedWidth: w - (textX - x) - 60,
    });
    nameTxt.setPosition(textX, y + 3).setOrigin(0, 0);
    this.contentContainer.add(nameTxt);
    this.menuObjs.push(nameTxt);

    const hpTxt = mkText(this.scene, hpStr, {
      fontSize: '10px',
      fontFamily: FONT.ui,
      color: disabled ? '#6b7a94' : '#cdd6e6',
    });
    hpTxt.setPosition(x + w - 6, y + 4).setOrigin(1, 0);
    this.contentContainer.add(hpTxt);
    this.menuObjs.push(hpTxt);

    // Thanh HP (4px) ở đáy thẻ.
    const barX = textX;
    const barW = w - (textX - x) - 12;
    const barY = y + h - 7;
    const track = this.scene.add.rectangle(barX, barY, barW, 4, COL.track).setOrigin(0, 0);
    track.setStrokeStyle(1, COL.border, 0.5);
    this.contentContainer.add(track);
    this.menuObjs.push(track);

    const pct = (p?.maxHp ?? 0) > 0 ? Math.max(0, Math.min(1, (p?.currentHp ?? 0) / p.maxHp)) : 0;
    const bar = this.scene.add
      .rectangle(barX, barY, Math.max(0, barW * pct), 4, pct > 0.5 ? COL.hpGreen : pct > 0.2 ? COL.hpYellow : COL.hpRed)
      .setOrigin(0, 0);
    this.contentContainer.add(bar);
    this.menuObjs.push(bar);

    if (interactive && onClick) {
      const zone = this.scene.add
        .zone(x + w / 2, y + h / 2, w, h)
        .setInteractive({ useHandCursor: !disabled });
      this.contentContainer.add(zone);
      this.menuObjs.push(zone);
      if (!disabled) {
        zone.on('pointerover', () => g.setAlpha(0.85));
        zone.on('pointerout', () => g.setAlpha(1));
        zone.on('pointerdown', onClick);
      }
    }
  }

  // ── Keyboard ────────────────────────────────────────────────────────────

  private handleKey(e: KeyboardEvent): void {
    if (this.ended) return;
    if (this.bagSearchInputEl && document.activeElement === this.bagSearchInputEl) {
      return; // Đang nhập liệu tìm kiếm vật phẩm
    }
    const state = this.net.battle?.state as any;
    if (this.mode === 'command') {
      // 1=FIGHT 2=POKEMON 3=BAG 4=RUN (ném ball nằm trong BAG).
      // `forced` = bắt buộc chọn Pokémon (đang chờ switch). Ở PvP chỉ dựa vào
      // `needSwitch` (server gửi riêng cho side đang chờ) — `state.phase` là
      // shared nên không dùng để suy ra trạng thái của riêng mình.
      const forced = this.isPvpBattle()
        ? this.needSwitch
        : state?.phase === 'switch' || this.needSwitch;
      if (e.key === '1') {
        if (!forced) this.setMode('move');
      } else if (e.key === '2') this.setMode('switch');
      else if (e.key === '3') {
        if (!forced) this.setMode('bag');
      } else if (e.key === '4') {
        if (!forced) {
          // PvP: nút 4 = đầu hàng (không bỏ chạy được).
          if (this.isPvpBattle()) this.pvpForfeit();
          else this.runNow();
        }
      }
    } else if (this.mode === 'move') {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < 4) {
        this.net.sendBattleMove(idx);
        this.markActionChosen();
        this.setMode('command');
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        this.setMode('command');
      }
    } else if (this.mode === 'switch') {
      // 1–6 chọn trực tiếp Pokémon trong party (bỏ qua scroll).
      const n = parseInt(e.key);
      if (n >= 1 && n <= 6) {
        const team: any[] = (this.myState?.team ? Array.from(this.myState.team) : []) as any[];
        const p = team[n - 1];
        const activeIdx = this.myState?.activeIndex ?? 0;
        if (p && n - 1 !== activeIdx && (p.currentHp ?? 0) > 0) {
          this.net.sendBattleSwitch(n - 1);
          this.needSwitch = false;
          this.setMode('command');
        }
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        // Ép đổi (sau khi gục) → không cho back. `needSwitch` chỉ true khi
        // CHÍNH side này bị bắt buộc đổi (PvP gửi riêng qua message).
        if (!this.needSwitch) this.setMode('command');
      }
    } else if (this.mode === 'bag') {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        this.hideBagSearchInput();
        this.setMode('command');
      }
    }
  }

  // ── Diễn hoạt ném Pokéball & bắt Pokémon ────────────────────────────────

  private playCatchAnimation(data: {
    ballId: string;
    shakes: number;
    caught: boolean;
    critical: boolean;
    message: string;
  }): void {
    if (!this.scene || !this.scene.sys) return;

    const normBall = (data.ballId || 'pokeball').toLowerCase().replace(/[^a-z0-9]/g, '');
    const origin = window.location.origin;
    const ballKey = `item_icon_${normBall}`;

    if (!this.scene.textures.exists(ballKey)) {
      this.scene.load.image(ballKey, `${origin}/assets/icons/items/${normBall}.png`);
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.executeCatchVisuals(ballKey, data);
      });
      this.scene.load.start();
    } else {
      this.executeCatchVisuals(ballKey, data);
    }
  }

  private executeCatchVisuals(
    ballKey: string,
    data: { shakes: number; caught: boolean; critical: boolean; message: string },
  ): void {
    const w = B_W;
    const startX = this.allySprite ? this.allySprite.x : B_X + w * 0.28;
    const startY = this.allySprite ? this.allySprite.y : 206;
    const targetX = this.foeSprite ? this.foeSprite.x : B_X + w * 0.72;
    const targetY = this.foeSprite ? this.foeSprite.y : 138;
    const groundY = targetY + 28;

    if (this.catchBallSprite) {
      this.catchBallSprite.destroy();
      this.catchBallSprite = undefined;
    }

    const ball = this.scene.add.image(startX, startY, ballKey).setDisplaySize(28, 28);
    this.add(ball);
    this.catchBallSprite = ball;

    SoundManager.getInstance(this.scene).playSe('battle_throw');

    // Bay parabol sang đối thủ
    this.scene.tweens.add({
      targets: ball,
      x: targetX,
      duration: 450,
      ease: 'Linear',
    });

    this.scene.tweens.add({
      targets: ball,
      y: targetY - 40,
      duration: 220,
      ease: 'Quad.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: ball,
          y: targetY,
          duration: 230,
          ease: 'Quad.In',
          onComplete: () => {
            this.onBallHitFoe(ball, groundY, data);
          },
        });
      },
    });

    this.scene.tweens.add({
      targets: ball,
      rotation: Math.PI * 6,
      duration: 450,
    });
  }

  private onBallHitFoe(
    ball: Phaser.GameObjects.Image,
    groundY: number,
    data: { shakes: number; caught: boolean; critical: boolean; message: string },
  ): void {
    // 1. Chớp đỏ & Pokémon co rút vào bóng
    if (this.foeSprite) {
      this.foeSprite.setTint(0xff6b81);
      this.scene.tweens.add({
        targets: this.foeSprite,
        scaleX: 0,
        scaleY: 0,
        alpha: 0,
        duration: 250,
        ease: 'Quad.In',
      });
    }

    // 2. Bóng rơi xuống mặt đất và nảy nhẹ
    SoundManager.getInstance(this.scene).playSe('battle_ball_hit');
    this.scene.tweens.add({
      targets: ball,
      y: groundY,
      duration: 320,
      ease: 'Bounce.Out',
      onComplete: () => {
        this.startBallShakes(ball, data);
      },
    });
  }

  private startBallShakes(
    ball: Phaser.GameObjects.Image,
    data: { shakes: number; caught: boolean; critical: boolean; message: string },
  ): void {
    const numShakes = data.shakes;
    let current = 0;

    const shakeOnce = () => {
      if (current >= numShakes) {
        this.onCatchResolved(ball, data);
        return;
      }
      current++;
      SoundManager.getInstance(this.scene).playSe('battle_ball_shake');

      this.scene.tweens.add({
        targets: ball,
        angle: -24,
        x: ball.x - 3,
        duration: 110,
        yoyo: true,
        ease: 'Sine.InOut',
        onComplete: () => {
          this.scene.tweens.add({
            targets: ball,
            angle: 24,
            x: ball.x + 3,
            duration: 110,
            yoyo: true,
            ease: 'Sine.InOut',
            onComplete: () => {
              ball.angle = 0;
              this.scene.time.delayedCall(260, () => {
                shakeOnce();
              });
            },
          });
        },
      });
    };

    this.scene.time.delayedCall(160, () => {
      shakeOnce();
    });
  }

  private onCatchResolved(
    ball: Phaser.GameObjects.Image,
    data: { caught: boolean; critical: boolean; message: string },
  ): void {
    if (!data.caught) {
      // THẤT BẠI: Bóng vỡ ra, Pokémon nhảy ra ngoài
      this.scene.tweens.add({
        targets: ball,
        scaleX: 1.4,
        scaleY: 1.4,
        alpha: 0,
        duration: 180,
        onComplete: () => {
          ball.destroy();
          if (this.catchBallSprite === ball) this.catchBallSprite = undefined;
        },
      });

      if (this.foeSprite) {
        this.foeSprite.clearTint();
        this.scene.tweens.add({
          targets: this.foeSprite,
          scaleX: 1,
          scaleY: 1,
          alpha: 1,
          y: this.foeSprite.y - 12,
          duration: 200,
          yoyo: true,
          ease: 'Back.Out',
        });
      }
      this.popMessage(data.message, '#ff7675');
    } else {
      // THÀNH CÔNG: Click lock & Sao vàng phát sáng
      SoundManager.getInstance(this.scene).playSe('battle_catch_click');
      ball.setTint(0x95a5a6);
      this.scene.time.delayedCall(120, () => {
        ball.clearTint();
        this.spawnCatchStars(ball.x, ball.y);
        this.popMessage('★ Gotcha! Pokémon was caught!', '#ffd76a');
      });
    }
  }

  private spawnCatchStars(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const star = this.scene.add.text(x, y, '★', {
        fontSize: '18px',
        color: '#f1c40f',
      }).setOrigin(0.5);
      this.add(star);

      const destX = x + Math.cos(angle) * 36;
      const destY = y + Math.sin(angle) * 36;

      this.scene.tweens.add({
        targets: star,
        x: destX,
        y: destY,
        alpha: 0,
        scale: 1.4,
        duration: 550,
        ease: 'Cubic.Out',
        onComplete: () => star.destroy(),
      });
    }
  }

  /** Hiển thị tin nhắn thông báo ngắn trên màn hình trận đấu */
  private popMessage(text: string, color: string = '#ffffff'): void {
    this.logLines.push(text);
    if (this.logLines.length > 40) this.logLines.shift();
    this.refreshTextPanel();

    const toast = this.scene.add.text(M_W / 2, 180, text, {
      fontFamily: FONT.ui,
      fontSize: '14px',
      color: color,
      backgroundColor: '#0c1424ee',
      padding: { x: 14, y: 6 },
    }).setOrigin(0.5);
    this.add(toast);

    this.scene.tweens.add({
      targets: toast,
      y: toast.y - 28,
      alpha: 0,
      duration: 1600,
      ease: 'Power2',
      onComplete: () => toast.destroy(),
    });
  }

  // ── Kết thúc ────────────────────────────────────────────────────────────

  private showEnd(state: any): void {
    if (this.partySelectModal) {
      this.partySelectModal.destroy();
      this.partySelectModal = undefined;
    }
    this.clearMenu();
    this.turnLabel = '';
    const h = M_H - 34;

    if (state.result === 'caught') {
      this.showCaughtEnd(state, h);
      return;
    }

    let title = t('BATTLE_VICTORY');
    if (state.result === 'run') title = t('BATTLE_FLED');
    else if (state.winner === 'draw') title = t('BATTLE_DRAW');
    else if (this.isPvpBattle()) {
      // PvP: `winner` server-side ('ally'|'foe') phải quy về góc nhìn của mình.
      title = state.winner === this.seat ? t('BATTLE_VICTORY') : t('BATTLE_DEFEAT');
    } else if (state.winner === 'foe') {
      title = t('BATTLE_DEFEAT');
    }

    // PvP: nhạc thắng/thua theo đúng góc nhìn.
    const won = this.isPvpBattle()
      ? state.winner === this.seat
      : state.winner === 'ally' || state.result === 'win';
    if (won) {
      SoundManager.getInstance(this.scene).playBgm(
        this.init.isTrainer ? 'battle_victory_trainer' : 'battle_victory_wild',
        false,
      );
    }

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
    // PvP: không EXP nhưng có tiền thưởng cho người thắng.
    if (this.isPvpBattle() && won && state.rewardMoney > 0) {
      sub = t('BATTLE_PVP_REWARD').replace('{money}', String(state.rewardMoney));
    }
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

  /** Màn hình tổng kết chúc mừng bắt Pokémon chi tiết */
  private showCaughtEnd(state: any, h: number): void {
    const dim = this.scene.add.rectangle(0, 0, M_W, h, 0x050a14, 0.82).setOrigin(0, 0);
    this.add(dim);
    this.endObjs.push(dim);

    const info = this.lastCaughtInfo ?? {
      id: '',
      speciesId: state.caughtSpeciesId || this.init.foe?.speciesId || 'pokemon',
      name: this.init.foe?.nickname || state.caughtSpeciesId || 'Pokémon',
      nickname: this.init.foe?.nickname || state.caughtSpeciesId || 'Pokémon',
      level: this.init.foe?.level || 5,
      shiny: Boolean(this.init.foe?.shiny),
      gender: this.init.foe?.gender || '',
      nature: this.init.foe?.natureName || '',
      ballId: 'pokeball',
      slot: 0,
    };

    const cardW = 380;
    const cardH = 260;
    const cardX = M_W / 2;
    const cardY = h / 2 - 10;

    // Card background viền vàng
    const card = this.scene.add.rectangle(cardX, cardY, cardW, cardH, 0x141f36, 0.95);
    card.setStrokeStyle(2, 0xffd76a);
    this.add(card);
    this.endObjs.push(card);

    // Tiêu đề
    const title = this.scene.add.text(cardX, cardY - cardH / 2 + 24, t('BATTLE_CAUGHT'), ts(22, '#ffd76a', FONT.ui)).setOrigin(0.5);
    this.add(title);
    this.endObjs.push(title);

    // Ảnh Pokémon
    const pkmImg = this.scene.add.image(cardX - 110, cardY - 15, 'battle_foe_front').setDisplaySize(110, 110);
    this.add(pkmImg);
    this.endObjs.push(pkmImg);

    // Thông tin chi tiết
    let genderSymbol = '';
    let genderColor = '#bdc3c7';
    if (info.gender === 'male') { genderSymbol = ' ♂'; genderColor = '#3498db'; }
    else if (info.gender === 'female') { genderSymbol = ' ♀'; genderColor = '#e84393'; }

    const nameText = this.scene.add.text(
      cardX - 40,
      cardY - 65,
      `${info.shiny ? 'S. ' : ''}${info.nickname || info.name}${info.shiny ? ' ⭐' : ''}`,
      ts(19, info.shiny ? '#f1c40f' : '#ffffff', FONT.ui),
    );
    this.add(nameText);
    this.endObjs.push(nameText);

    const lvText = this.scene.add.text(
      cardX - 40,
      cardY - 38,
      `Lv.${info.level}${genderSymbol}`,
      ts(14, genderColor, FONT.ui),
    );
    this.add(lvText);
    this.endObjs.push(lvText);

    // Loại bóng đã dùng
    const ballName = info.ballId || 'Poké Ball';
    const ballText = this.scene.add.text(
      cardX - 40,
      cardY - 15,
      t('BATTLE_BALL_USED').replace('{ball}', ballName.toUpperCase()),
      ts(12, '#95a5a6', FONT.ui),
    );
    this.add(ballText);
    this.endObjs.push(ballText);

    // Nơi lưu trữ (Party hay PC Box)
    const destStr = info.slot !== null
      ? t('BATTLE_CAUGHT_PARTY').replace('{slot}', String((info.slot ?? 0) + 1))
      : t('BATTLE_CAUGHT_BOX');
    const destColor = info.slot !== null ? '#2ecc71' : '#3498db';
    const destText = this.scene.add.text(
      cardX - 40,
      cardY + 10,
      destStr,
      ts(13, destColor, FONT.ui),
    );
    this.add(destText);
    this.endObjs.push(destText);

    // Nút đặt Nickname
    if (info.id) {
      const renameBtn = mkText(this.scene, t('BATTLE_RENAME_BTN'), {
        fontSize: '12px',
        fontFamily: FONT.ui,
        color: '#ffffff',
        backgroundColor: '#6c5ce7',
        padding: { x: 12, y: 6 },
      });
      renameBtn.setPosition(cardX - 40, cardY + 42).setOrigin(0, 0.5);
      renameBtn.setInteractive({ useHandCursor: true });
      renameBtn.on('pointerdown', async () => {
        const input = window.prompt(t('BATTLE_RENAME_PROMPT'), info.nickname || info.name);
        if (input !== null) {
          const trimmed = input.trim();
          if (trimmed) {
            const ok = await ColyseusManager.getInstance().renamePokemon(info.id, trimmed);
            if (ok) {
              info.nickname = trimmed;
              nameText.setText(`${info.shiny ? 'S. ' : ''}${trimmed}${info.shiny ? ' ⭐' : ''}`);
              this.popMessage(t('BATTLE_RENAME_SUCCESS'), '#2ecc71');
            }
          }
        }
      });
      this.add(renameBtn);
      this.endObjs.push(renameBtn);
    }

    // Nút Xác nhận (OK)
    const ok = mkText(this.scene, t('BATTLE_OK'), {
      fontSize: '15px',
      fontFamily: FONT.ui,
      color: '#fff',
      backgroundColor: COL.btn,
      padding: { x: 35, y: 8 },
    });
    ok.setPosition(cardX, cardY + cardH / 2 - 25).setOrigin(0.5);
    ok.setInteractive({ useHandCursor: true });
    ok.on('pointerdown', () => this.finish('caught'));
    this.add(ok);
    this.endObjs.push(ok);
  }

  private finish(result: string): void {
    SoundManager.getInstance(this.scene).stopBgm();
    this.net.leaveBattle();
    this.close();
    this.onFinished(result);
  }

  /** Trận đã kết thúc (màn win/lose đã hiện hoặc đang đóng). */
  public isEnded(): boolean {
    return this.ended;
  }

  /**
   * Ép kết thúc trận ngay lập tức — **chỉ dùng làm ứng cứu khi kẹt**.
   *
   * Không gửi `battle_run` (trận có thể đã xong ở server). Khi gọi, modal được
   * đóng + trả `canMove = true` cho WorldScene. Từ `finish()` chạy trước nên
   * mọi lần gọi sau đều vô hại.
   */
  public forceClose(): void {
    if (this.ended) return;
    this.ended = true;
    this.finish('error');
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
    SoundManager.getInstance(this.scene).playSe('battle_flee');
    this.net.sendBattleRun();
    this.onRun?.();
    this.finish('run');
  }

  /**
   * PvP: không bỏ chạy được — nút 4 hoạt động như **đầu hàng (forfeit)**.
   *
   * Bấm lần 1 mới "vũ trang" (nút đổi nhãn `⚠ XÁC NHẬN`), bấm lần 2 mới thật sự
   * bỏ trận → tránh mất trận oan khi click nhầm.
   */
  private pvpForfeit(): void {
    if (this.ended) return;
    if (!this.pvpForfeitArmed) {
      this.pvpForfeitArmed = true;
      this.logLines.push(t('BATTLE_PVP_FORFEIT_ARM'));
      this.buildMenu();
      return;
    }
    this.ended = true;
    this.net.sendBattleForfeit();
    this.finish('forfeit');
  }

  private refreshLabels(): void {
    if (this.isPvpBattle()) {
      this.setTitle(t('BATTLE_PVP_TITLE'));
      this.buildMenu();
      return;
    }
    const isTrainer = Boolean(this.init.isTrainer || (this.init.foe as any)?.isWild === false);
    const trainerName = this.init.trainerName;
    const title = isTrainer && trainerName
      ? `TRẬN ĐẤU — HLV ${trainerName.toUpperCase()}`
      : t('BATTLE_TITLE');
    this.setTitle(title);
    this.buildMenu();
  }

  public override relayout(): void {
    super.relayout();
    if (this.mode === 'bag' && this.bagSearchBoxBounds.w > 0) {
      const hasClear = !!this.bagSearchQuery;
      const clearBtnW = hasClear ? 20 : 0;
      this.positionBagSearchInput(
        this.bagSearchBoxBounds.x + 24,
        this.bagSearchBoxBounds.y,
        this.bagSearchBoxBounds.w - 26 - clearBtnW,
        this.bagSearchBoxBounds.h,
      );
    }
  }

  override close(): void {
    super.close();
    if (this.onCanvasClick) {
      this.scene.input.off('pointerdown', this.onCanvasClick);
      this.onCanvasClick = undefined;
    }
    this.removeBagSearchInput();
    this.unsubState?.();
    this.unsubSeat?.();
    this.unsubNeedSwitch?.();
    this.unsubLang?.();
    this.unsubCatchAnim?.();
    this.unsubPokemonCaught?.();
    if (this.catchBallSprite) {
      this.catchBallSprite.destroy();
      this.catchBallSprite = undefined;
    }
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = undefined;
    }
    for (const o of this.endObjs) o.destroy();
    this.endObjs = [];
    this.destroy();
  }

  override destroy(): void {
    if (this.partySelectModal) {
      this.partySelectModal.destroy();
      this.partySelectModal = undefined;
    }
    if (this.onCanvasClick) {
      this.scene.input.off('pointerdown', this.onCanvasClick);
      this.onCanvasClick = undefined;
    }
    this.removeBagSearchInput();
    super.destroy();
  }
}
