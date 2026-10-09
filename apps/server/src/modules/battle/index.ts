import { Room, type Client } from '@colyseus/core';
import { ArraySchema } from '@colyseus/schema';
import {
  BattleState,
  type BattleSide,
  BattlePokemon,
  BattleLogEntry,
} from '@pixelmon/shared/schema';
import {
  calcDamage,
  accuracyCheck,
  isCriticalHit,
  randomDamageFactor,
  typeEffectiveness,
  stabMultiplier,
  getEffectiveStatForCategory,
  calcExpGain,
  attemptCatch,
  canEscape,
  expForLevel,
  getNatureMod,
  computeOwnedPokemonStats,
  ballMultiplierFor,
  PVP_WIN_MONEY,
  PVP_LOSE_MONEY,
  type CatchContext,
  type StatusEffect,
} from '@pixelmon/shared';
import { gameData } from '@pixelmon/shared/data';
import { consumeBattleToken, peekBattleToken, type PendingBattle } from './manager.js';
import type { BattleTeamMember } from '../pokemon/battleParty.js';
import { pool } from '../../config/index.js';
import type { Species } from '@pixelmon/shared';
import { resolveItemEffect } from '@pixelmon/shared';
import {
  logXp,
  logLevelUp,
  logItemUsed,
  logCatch,
  logMoney,
} from '../events/eventLog.js';
import { tryEvolve } from '../evolution/evolution.service.js';
import { hasItem, removeItem } from '../items/inventory.service.js';
import { recordPokedexEntry } from '../pokemon/pokedex.js';

/** Client chỉ gửi token — toàn bộ team do server chuẩn bị (Plan 44 Phase 0). */
interface BattleOptions {
  token: string;
}

/** Thời gian cho mỗi lượt chọn (ms) — hết giờ auto chọn move đầu còn PP. */
const TURN_TIMEOUT_MS = 60_000;

/** Giới hạn log trên schema (tránh state phình). */
const MAX_LOG_ENTRIES = 60;

/**
 * BattleRoom — Colyseus room cho turn-based Pokémon battle (Plan 44 Phase 2).
 *
 * - `onCreate` chỉ nhận `token` 1-lần từ WorldRoom → team lấy từ payload
 *   server đã lưu (chống cheat; client không gửi team).
 * - Combat thật: `calcDamage` (power + STAB + type effectiveness + crit +
 *   random), `accuracyCheck`, PP, thứ tự lượt theo speed.
 * - Foe AI: chọn move có expected damage cao nhất (không random).
 * - Kết thúc → ghi HP/EXP/level của party về DB; phát `battle_end` cho
 *   WorldRoom gỡ chặn encounter.
 *
 * Fix trước đây (audit 2026-09-30): sessionId thay vì userId, ArraySchema.push,
 * guard empty team, guard divide-by-zero — vẫn giữ.
 */
export class BattleRoom extends Room<BattleState> {
  maxClients = 2;

  /**
   * `sessionId` (BattleRoom) → side trong state.
   *
   * Wild/trainer: 1 người chơi → luôn `ally`.
   * PvP: token `ally` → client tạo phòng; token `foe` → client join sau.
   */
  private sessionSide: Map<string, 'ally' | 'foe'> = new Map();
  /** Session trong WorldRoom của BÊN ALLY — gỡ chặn encounter khi kết thúc. */
  private worldSessionId = '';
  /** Session trong WorldRoom của BÊN FOE (PvP). */
  private foeWorldSessionId = '';
  /** userId (DB) bên ally — ghi kết quả. */
  private userId = '';
  /** userId (DB) bên foe (PvP). */
  private foeUserId = '';
  /** Token mà client foe dùng để join (PvP) — server validate ở onJoin. */
  private foeToken = '';
  /** `true` khi là trận 2 người chơi thật. */
  private isPvp = false;
  /** Đã kết thúc chưa (chống endBattle × 2). */
  private ended = false;
  /** Timer lượt hiện tại. */
  private turnTimer?: ReturnType<Room['clock']['setTimeout']>;
  /** Snapshot team (đã có level/EXP sau battle) để ghi DB. */
  private allySnapshot: BattleTeamMember[] = [];
  private foeSnapshot: BattleTeamMember[] = [];
  /** Các Pokémon id đã tham chiến (được chia EXP). */
  private participated: Set<string> = new Set();
  /** Thông tin Trainer NPC Battle */
  private isTrainer = false;
  private trainerName = '';
  private trainerId = '';
  private npcId = '';
  private rewardMoney = 0;
  private loseText = '';
  /**
   * Lượt của bên foe trong PvP: move đã chọn (index) hoặc -1 = chưa chọn.
   * Wild/trainer thì foe do AI quyết định nên không dùng giá trị này.
   */
  private foeSelectedMove = -1;
  /**
   * Lượt của bên ally trong PvP: move đã chọn (index) hoặc -1 = chưa chọn.
   * Lưu riêng để đối thủ không đọc được khỏi shared schema.
   */
  private allySelectedMove = -1;
  /**
   * Các bên đang bắt buộc đổi Pokémon sau khi gục (chờ switch).
   * Wild/trainer chỉ có `ally`; PvP có thể là 1 hoặc cả 2 bên.
   */
  private pendingSwitchSides = new Set<'ally' | 'foe'>();
  /**
   * PvP: các bên đã "hành động" lượt này bằng hành động KHÔNG phải chiêu
   * (dùng item / đổi Pokémon chủ động). Item/switch áp dụng ngay lúc commit;
   * lượt chỉ resolve khi CẢ 2 bên đã hành động. Bên trong set sẽ không ra đòn.
   */
  private actedWithoutMove = new Set<'ally' | 'foe'>();

  onCreate(options: BattleOptions) {
    this.setState(new BattleState());

    const pending = consumeBattleToken(options?.token ?? '');
    if (!pending) {
      console.warn('[battle] rejected — invalid/expired battle token');
      this.state.winner = 'draw';
      this.state.phase = 'ended';
      this.state.result = 'invalid_token';
      this.clock.setTimeout(() => this.disconnect(), 0);
      return;
    }

    this.worldSessionId = pending.worldSessionId;
    this.userId = pending.userId;
    this.allySnapshot = pending.allyTeam as unknown as BattleTeamMember[];
    this.foeSnapshot = pending.foeTeam as unknown as BattleTeamMember[];
    this.isTrainer = Boolean(pending.isTrainer);
    this.isPvp = Boolean(pending.isPvp);
    this.trainerName = pending.trainerName ?? '';
    this.trainerId = pending.trainerId ?? '';
    this.npcId = pending.npcId ?? '';
    this.rewardMoney = pending.rewardMoney ?? 0;
    this.loseText = pending.loseText ?? '';
    if (this.isPvp) {
      this.foeWorldSessionId = pending.opponentWorldSessionId ?? '';
      this.foeUserId = pending.opponentUserId ?? '';
      this.foeToken = pending.foeToken ?? '';
      this.rewardMoney = PVP_WIN_MONEY;
    }

    // 2 bên chưa join đủ → chờ (PvP). onCreate chỉ chạy lúc phòng được tạo
    // bởi bên `ally`; bên `foe` join sau bằng joinById.
    this.maxClients = this.isPvp ? 2 : 1;

    this.state.battleId = this.roomId;
    this.state.isPvp = this.isPvp;
    this.state.turn = 1;
    this.state.phase = 'select';
    if (this.isPvp) {
      this.state.allySessionId = pending.worldSessionId;
      this.state.foeSessionId = this.foeWorldSessionId;
      this.state.allyUserId = this.userId;
      this.state.foeUserId = this.foeUserId;
      this.state.allyName = pending.allyName ?? '';
      this.state.foeName = pending.opponentName ?? '';
      this.state.rewardMoney = this.rewardMoney;
    }

    this.populateSide(this.state.ally, this.allySnapshot, false);
    this.state.ally.playerId = this.isPvp ? pending.userId : pending.userId;
    // Chọn Pokémon còn sống đầu tiên làm activeIndex
    const firstAliveAlly = this.state.ally.team.findIndex((p) => p.currentHp > 0);
    if (firstAliveAlly >= 0) {
      this.state.ally.activeIndex = firstAliveAlly;
    }

    // PvP: cả 2 bên đều là Pokémon của người chơi → không phải wild.
    this.populateSide(this.state.foe, this.foeSnapshot, this.isPvp ? false : !this.isTrainer);
    this.state.foe.playerId = this.isPvp
      ? (this.foeUserId || 'foe')
      : this.isTrainer
      ? 'trainer'
      : 'wild';
    const firstAliveFoe = this.state.foe.team.findIndex((p) => p.currentHp > 0);
    if (firstAliveFoe >= 0) {
      this.state.foe.activeIndex = firstAliveFoe;
    }

    const foe = this.state.foe.team[this.state.foe.activeIndex];
    if (this.isPvp) {
      this.log(`${pending.allyName ?? 'Player'} challenged ${pending.opponentName ?? 'you'}!`, 'system');
    } else if (this.isTrainer) {
      this.log(`${this.trainerName || 'Trainer'} wants to battle!`, 'system');
    } else {
      this.log(`A wild ${foe?.nickname ?? 'Pokémon'} appeared!`, 'system');
    }

    // Tự động ghi nhận loài của đối thủ (foe) vào Pokédex 'seen'
    if (this.userId) {
      if (Array.isArray(this.foeSnapshot)) {
        for (const f of this.foeSnapshot) {
          if (f?.speciesId) {
            void recordPokedexEntry(this.userId, f.speciesId, 'seen');
          }
        }
      }
      if (foe?.speciesId) {
        void recordPokedexEntry(this.userId, foe.speciesId, 'seen');
      }
    }

    const ally = this.state.ally.team[this.state.ally.activeIndex];
    if (ally) {
      this.log(`Go! ${ally.nickname}!`, 'system');
      this.participated.add(ally.pokemonId);
    }

    // ── Messages ──
    this.onMessage('battle_move', (client, data: { moveIndex: number }) => {
      this.handleMove(client, data?.moveIndex);
    });

    this.onMessage('battle_switch', (client, data: { pokemonIndex: number }) => {
      this.handleSwitch(client, data?.pokemonIndex);
    });

    this.onMessage('battle_run', (client) => {
      this.handleRun(client);
    });

    this.onMessage('battle_catch', (client, data: { ballId?: string }) => {
      this.handleCatch(client, data?.ballId);
    });

    this.onMessage('battle_item', (client, data: { itemId?: string; targetIndex?: number }) => {
      void this.handleBattleItem(client, data?.itemId, data?.targetIndex);
    });

    this.onMessage('battle_forfeit', (client) => {
      this.handleForfeit(client);
    });

    this.startTurnTimer();
    console.log(
      `[battle] ${this.roomId} created: ally=${this.state.ally.team.length} vs foe=${this.state.foe.team.length}`,
    );

    // PvP: báo WorldRoom của bên foe biết roomId + foeToken để họ join vào.
    if (this.isPvp && this.foeWorldSessionId && this.foeToken) {
      this.presence.publish('pvp_room_ready', {
        sessionId: this.foeWorldSessionId,
        roomId: this.roomId,
        foeToken: this.foeToken,
        opponentName: this.state.allyName,
      });
      // Đối thủ chưa join trong 20s → không bao giờ tự đánh (kết thúc không thi đấu).
      this.clock.setTimeout(() => {
        if (this.ended || this.sessionSide.size >= 2) return;
        console.warn(`[battle] ${this.roomId} pvp opponent never joined — abort`);
        this.log('The opponent never showed up. Battle cancelled.', 'fail');
        this.endBattle('draw', 'no_show');
      }, 20_000);
    }
  }

  onJoin(client: Room['clients'][number], options?: BattleOptions) {
    if (this.isPvp) {
      // Client đầu tiên (tạo phòng) = ally. Client thứ 2 = foe, phải mang foeToken.
      const side = this.sessionSide.size === 0 ? 'ally' : 'foe';
      if (side === 'foe') {
        // Validate foeToken: chỉ client mang token foe hợp lệ mới được vào.
        const foeToken = String(options?.token ?? '');
        const foePending = peekBattleToken(foeToken);
        if (!foePending || !foePending.isPvp || foePending.side !== 'foe') {
          console.warn(`[battle] ${this.roomId} rejected foe join — bad foeToken`);
          // Đuổi client không hợp lệ khỏi phòng (không nhận state/action).
          client.leave();
          return;
        }
        consumeBattleToken(foeToken);
      }
      this.sessionSide.set(client.sessionId, side);
      // Gửi side riêng cho client này (client dùng để xác định ally/foe view).
      client.send('battle_seat', { type: 'battle_seat', side });
      console.log(`[battle] ${client.sessionId} joined as ${side} (pvp)`);
      // Bên thứ 2 tới nơi → bắt đầu đồng hồ lượt (trước đó timer chưa chạy).
      if (this.sessionSide.size >= 2) {
        console.log(`[battle] ${this.roomId} both players ready — start turns`);
        this.startTurnTimer();
      }
      return;
    }
    // Wild/trainer battle: 1 client duy nhất = ally.
    this.sessionSide.set(client.sessionId, 'ally');
    console.log(`[battle] ${client.sessionId} joined as ally`);
  }

  onLeave(client: Room['clients'][number]) {
    // Client bị từ chối ở onJoin (foeToken sai) chưa từng vào sessionSide —
    // không tính là bỏ cuộc (nếu không, ally bị xử thua oan).
    if (!this.sessionSide.has(client.sessionId)) return;
    const side = this.sessionSide.get(client.sessionId) ?? 'ally';
    this.sessionSide.delete(client.sessionId);
    if (!this.ended) {
      // Rời trận chưa xong → coi như bỏ cuộc. Side rời đi thì bên kia thắng.
      if (this.isPvp) {
        this.endBattle(side === 'ally' ? 'foe' : 'ally', 'forfeit');
      } else {
        this.endBattle('foe', 'forfeit');
      }
    } else {
      this.publishBattleEnd();
    }
  }

  // ── Populate / helpers ──────────────────────────────────────────────────

  private populateSide(side: BattleSide, teamData: BattleTeamMember[], isWild: boolean) {
    const team = new ArraySchema<BattlePokemon>();
    for (const m of teamData) {
      const pokemon = new BattlePokemon();
      pokemon.pokemonId = m.id;
      pokemon.speciesId = m.speciesId;
      pokemon.nickname = m.nickname || m.speciesId;
      pokemon.level = m.level;
      pokemon.currentHp = m.currentHp;
      pokemon.maxHp = m.maxHp;
      pokemon.attack = m.stats.attack;
      pokemon.defense = m.stats.defense;
      pokemon.spAttack = m.stats.spAttack;
      pokemon.spDefense = m.stats.spDefense;
      pokemon.speed = m.stats.speed;
      pokemon.status = m.status;
      pokemon.gender = m.gender;
      pokemon.shiny = Boolean(m.shiny);
      pokemon.heldItem = m.heldItem ?? '';
      pokemon.moves = m.moves.map((x) => x.id);
      pokemon.pp = m.moves.map((x) => x.currentPp);
      pokemon.maxPp = m.moves.map((x) => x.maxPp);
      pokemon.types = m.types.join(',');
      // Schema `exp` = EXP trong level hiện tại (client vẽ thanh EXP).
      pokemon.exp = Math.max(0, m.exp - expForLevel(m.level, gameData.getSpecies(m.speciesId)?.growthRate ?? 'mediumFast'));
      pokemon.expToNext = m.expToNext;
      pokemon.isWild = isWild;
      team.push(pokemon);
    }
    side.team = team;
  }

  private log(text: string, kind: string = 'system'): void {
    const entry = new BattleLogEntry();
    entry.text = text;
    entry.kind = kind;
    this.state.log.push(entry);
    while (this.state.log.length > MAX_LOG_ENTRIES) this.state.log.shift();
  }

  private activeOf(side: BattleSide): BattlePokemon | undefined {
    return side.team[side.activeIndex];
  }

  private typesOf(p: BattlePokemon): string[] {
    return p.types ? p.types.split(',').filter(Boolean) : [];
  }

  // ── Turn flow ───────────────────────────────────────────────────────────

  private startTurnTimer(): void {
    this.clearTurnTimer();
    if (this.ended) return;
    // PvP: chỉ bắt đầu đồng hồ khi CẢ 2 bên đã vào phòng — nếu không, foe chưa
    // tới mà timer auto-pick sẽ khiến trận tự đánh trước bên đối thủ.
    if (this.isPvp && this.sessionSide.size < 2) return;
    this.turnTimer = this.clock.setTimeout(() => {
      if (this.ended || this.state.phase !== 'select') return;

      // PvP: auto-chọn cho BÊN chưa chọn (thường là cả 2 cùng lúc khi cả 2
      // đều không thao tác) — rồi resolve nếu đã đủ cả 2.
      if (this.isPvp) {
        let auto = false;
        if (this.allySelectedMove < 0 && !this.actedWithoutMove.has('ally')) {
          const active = this.activeOf(this.state.ally);
          if (active && active.currentHp > 0) {
            this.allySelectedMove = this.autoPickForSide('ally');
            auto = true;
          }
        }
        if (this.foeSelectedMove < 0 && !this.actedWithoutMove.has('foe')) {
          const fActive = this.activeOf(this.state.foe);
          if (fActive && fActive.currentHp > 0) {
            this.foeSelectedMove = this.autoPickForSide('foe');
            auto = true;
          }
        }
        if (auto) {
          this.log('Time out! Move auto-selected.', 'system');
          this.checkResolveTurn();
        }
        return;
      }

      const active = this.activeOf(this.state.ally);
      if (!active || active.currentHp <= 0) return;
      // Auto chọn move đầu còn PP.
      const idx = active.moves.findIndex((_, i) => (active.pp[i] ?? 0) > 0);
      if (idx >= 0) {
        this.log('Time out! Auto-selected a move.', 'system');
        this.state.ally.selectedMove = idx;
        this.checkResolveTurn();
      }
    }, TURN_TIMEOUT_MS);
  }

  private clearTurnTimer(): void {
    this.turnTimer?.clear();
    this.turnTimer = undefined;
  }

  /** Side của client gửi message, hoặc null nếu client không hợp lệ. */
  private sideOfClient(client: Client): 'ally' | 'foe' | null {
    return this.sessionSide.get(client.sessionId) ?? null;
  }

  /**
   * Gửi message tới 1 bên cụ thể (PvP) — hoặc broadcast (wild/trainer).
   *
   * PvP: chỉ client ở side đó nhận. Wild/trainer: cả room đều nhận (foe là AI
   * nên không cần target — nhưng vẫn broadcast để client hiện animation).
   */
  private sendToSide(side: 'ally' | 'foe', type: string, data: Record<string, unknown>): void {
    if (!this.isPvp) {
      this.broadcast(type, data);
      return;
    }
    for (const client of this.clients) {
      if (this.sessionSide.get(client.sessionId) === side) client.send(type, data);
    }
  }

  /**
   * Nhãn hiển thị cho Pokémon của 1 bên (log/info plate).
   * PvP: `"<tên trainer> 's <nickname>"` cho cả 2 bên.
   */
  private labelOf(side: 'ally' | 'foe', pokemon: BattlePokemon): string {
    if (this.isPvp) {
      const trainer = side === 'ally' ? this.state.allyName : this.state.foeName;
      return trainer ? `${trainer}'s ${pokemon.nickname}` : pokemon.nickname;
    }
    if (side === 'ally') return pokemon.nickname;
    return this.isTrainer ? `${this.trainerName}'s ${pokemon.nickname}` : `The wild ${pokemon.nickname}`;
  }

  private handleMove(client: Client, moveIndex: number): void {
    if (this.ended || this.state.phase !== 'select') return;
    const side = this.sideOfClient(client);
    if (!side) return;
    // Đang bắt buộc đổi Pokémon (gục) → không nhận chọn chiêu.
    if (this.pendingSwitchSides.has(side)) return;
    // PvP: đã dùng item / đổi Pokémon trong lượt này → không chọn chiêu nữa
    // (đó là 1 hành động duy nhất mỗi lượt).
    if (this.isPvp && this.actedWithoutMove.has(side)) return;
    const active = this.activeOf(this.state[side]);
    if (!active || active.currentHp <= 0) return;
    if (typeof moveIndex !== 'number' || !Number.isInteger(moveIndex)) return;
    if (moveIndex < 0 || moveIndex >= active.moves.length) return;
    if ((active.pp[moveIndex] ?? 0) <= 0) {
      this.log('No PP left for this move!', 'fail');
      return;
    }
    if (this.isPvp) {
      // PvP: lưu riêng (private) — KHÔNG ghi vào schema chung, để đối thủ không
      // đọc được mình đã chọn chiêu nào trước khi resolve (ẩn thông tin đối thủ).
      if (side === 'ally') this.allySelectedMove = moveIndex;
      else this.foeSelectedMove = moveIndex;
    } else if (side === 'ally') {
      this.state.ally.selectedMove = moveIndex;
    } else {
      this.foeSelectedMove = moveIndex;
    }
    this.checkResolveTurn();
  }

  /**
   * Resolve lượt khi ĐỦ chọn.
   *
   * Wild/trainer: chỉ cần ally chọn (foe do AI).
   * PvP: cả 2 bên phải chọn (hoặc hết giờ auto-chọn) mới resolve — tránh lộ
   * move của đối thủ trước.
   */
  private checkResolveTurn(): void {
    if (this.ended) return;
    if (this.isPvp) {
      // Chưa đủ 2 người → chưa resolve (chờ bên kia join).
      if (this.sessionSide.size < 2) return;
      // PvP: mỗi bên hành động bằng move HOẶC item/switch; đủ cả 2 mới resolve.
      const allyReady = this.allySelectedMove >= 0 || this.actedWithoutMove.has('ally');
      const foeReady = this.foeSelectedMove >= 0 || this.actedWithoutMove.has('foe');
      if (!allyReady || !foeReady) return;
      this.resolvePvpTurn();
      return;
    }
    if (this.state.ally.selectedMove < 0) return;
    this.resolveTurn();
  }

  /**
   * Auto-chọn move khi hết giờ (PvP): server chọn move đầu còn PP.
   *
   * Wild/trainer timer chỉ auto cho ally (foe là AI nên luôn có move).
   */
  private autoPickForSide(side: 'ally' | 'foe'): number {
    const s = this.state[side];
    const active = this.activeOf(s);
    if (!active) return -1;
    const idx = active.moves.findIndex((_, i) => (active.pp[i] ?? 0) > 0);
    return idx >= 0 ? idx : 0;
  }

  /** Foe AI: move có expected damage cao nhất (bỏ move hết PP / status move). */
  private foeAI(): number {
    const foe = this.state.foe.team[this.state.foe.activeIndex];
    const ally = this.state.ally.team[this.state.ally.activeIndex];
    if (!foe || !ally) return 0;
    const defTypes = this.typesOf(ally);
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < foe.moves.length; i++) {
      if ((foe.pp[i] ?? 0) <= 0) continue;
      const move = gameData.getMove(foe.moves[i]!);
      if (!move) continue;
      const power = move.power && move.power > 0 ? move.power : 1;
      const eff = move.power && move.power > 0 ? typeEffectiveness(move.type, defTypes) : 0;
      const stab = stabMultiplier(move.type, this.typesOf(foe)) === 1.5 ? 1.5 : 1;
      const score = power * eff * stab * (move.accuracy / 100);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best < 0 ? 0 : best;
  }

  /**
   * Resolve lượt PvP — cả 2 bên đã hành động (move hoặc item).
   *
   * - Thứ tự theo speed (tie → ally trước) như trận thường.
   * - Bên đã dùng ITEM thì KHÔNG ra đòn lượt này (item = dùng lượt đó).
   * - Có thể cả 2 cùng dùng item → không ai đánh, chỉ xử lý gục rồi sang lượt.
   */
  private resolvePvpTurn(): void {
    this.clearTurnTimer();
    this.state.phase = 'anim';

    const a = this.activeOf(this.state.ally);
    const f = this.activeOf(this.state.foe);
    if (!a || !f) {
      this.endBattle('draw', 'error');
      return;
    }

    const allyMove = this.actedWithoutMove.has('ally') ? -1 : this.allySelectedMove;
    const foeMove = this.actedWithoutMove.has('foe') ? -1 : this.foeSelectedMove;

    // Danh sách bên ra đòn, sắp theo speed giảm dần (tie → ally trước).
    const attackers: Array<{ atk: 'ally' | 'foe'; move: number }> = [];
    if (this.allyFirst(a.speed, f.speed)) {
      if (allyMove >= 0) attackers.push({ atk: 'ally', move: allyMove });
      if (foeMove >= 0) attackers.push({ atk: 'foe', move: foeMove });
    } else {
      if (foeMove >= 0) attackers.push({ atk: 'foe', move: foeMove });
      if (allyMove >= 0) attackers.push({ atk: 'ally', move: allyMove });
    }

    const runAttack = (idx: number): void => {
      if (idx >= attackers.length) {
        this.clock.setTimeout(() => {
          if (this.ended) return;
          this.handleFaints();
          if (this.ended || this.state.phase === 'switch') return;
          this.nextTurn();
        }, 900);
        return;
      }
      const atk = attackers[idx]!;
      // Kẻ ra đòn đã gục trước đó (đối thủ đi trước KO) → bỏ qua, không được đánh bù.
      const attackerNow = this.activeOf(this.state[atk.atk]);
      if (!attackerNow || attackerNow.currentHp <= 0) {
        runAttack(idx + 1);
        return;
      }
      this.executeMove(
        this.state[atk.atk],
        this.state[atk.atk === 'ally' ? 'foe' : 'ally'],
        atk.move,
      );
      if (this.ended) return;
      const aNow = this.activeOf(this.state.ally);
      const fNow = this.activeOf(this.state.foe);
      if (!aNow || !fNow || aNow.currentHp <= 0 || fNow.currentHp <= 0) {
        runAttack(idx + 1);
        return;
      }
      this.clock.setTimeout(() => runAttack(idx + 1), 1100);
    };

    runAttack(0);
  }

  /** `true` khi tốc độ ally >= foe (ally đi trước khi hòa tốc độ). */
  private allyFirst(allySpeed: number, foeSpeed: number): boolean {
    return allySpeed >= foeSpeed;
  }

  private resolveTurn(): void {
    this.clearTurnTimer();
    this.state.phase = 'anim';

    const ally = this.state.ally;
    const foe = this.state.foe;
    const a = this.activeOf(ally);
    const f = this.activeOf(foe);
    if (!a || !f) {
      this.endBattle('draw', 'error');
      return;
    }

    // Thứ tự lượt: speed cao hơn đi trước (tie → ally trước).
    const allyFirst = this.allyFirst(a.speed, f.speed);
    // PvP không đi qua đây (đã có resolvePvpTurn); foe do AI chọn.
    const foeMove = this.foeAI();

    const firstAtkSide = allyFirst ? this.state.ally : this.state.foe;
    const firstDefSide = allyFirst ? this.state.foe : this.state.ally;
    const firstMove = allyFirst ? ally.selectedMove : foeMove;

    const secondAtkSide = allyFirst ? this.state.foe : this.state.ally;
    const secondDefSide = allyFirst ? this.state.ally : this.state.foe;
    const secondMove = allyFirst ? foeMove : ally.selectedMove;

    // Chiêu thứ nhất
    this.executeMove(firstAtkSide, firstDefSide, firstMove);
    if (this.ended) return;

    const aNow = this.activeOf(ally);
    const fNow = this.activeOf(foe);

    if (aNow && fNow && aNow.currentHp > 0 && fNow.currentHp > 0) {
      // Chờ 1100ms để hiệu ứng chớp sát thương và trừ máu chiêu 1 diễn ra xong rồi mới tới chiêu kế tiếp
      this.clock.setTimeout(() => {
        if (this.ended) return;
        this.executeMove(secondAtkSide, secondDefSide, secondMove);
        if (this.ended) return;
        this.clock.setTimeout(() => {
          if (this.ended) return;
          this.handleFaints();
          if (this.ended || this.state.phase === 'switch') return;
          this.nextTurn();
        }, 900);
      }, 1100);
    } else {
      // Chỉ có 1 chiêu (một bên đã gục) -> chờ 900ms rồi xử lý gục / kết thúc
      this.clock.setTimeout(() => {
        if (this.ended) return;
        this.handleFaints();
        if (this.ended || this.state.phase === 'switch') return;
        this.nextTurn();
      }, 900);
    }
  }

  private nextTurn(): void {
    this.pendingSwitchSides.clear();
    this.actedWithoutMove.clear();
    this.state.ally.selectedMove = -1;
    this.state.foe.selectedMove = -1;
    // PvP: reset lượt chọn riêng của 2 bên (đều private để ẩn thông tin).
    this.allySelectedMove = -1;
    this.foeSelectedMove = -1;
    this.state.turn = Math.min(65535, this.state.turn + 1);
    this.state.phase = 'select';
    this.startTurnTimer();
  }

  /**
   * Thực hiện 1 move (dùng chung cho ally & foe).
   * Validate PP, tiêu PP, kiểm tra miss, tính damage thật.
   */
  private executeMove(atkSide: BattleSide, defSide: BattleSide, moveIndex: number): void {
    if (this.ended) return;
    const atk = this.activeOf(atkSide);
    const def = this.activeOf(defSide);
    if (!atk || !def || atk.currentHp <= 0 || def.currentHp <= 0) return;
    if (moveIndex < 0 || moveIndex >= atk.moves.length) return;

    const moveId = atk.moves[moveIndex]!;
    const move = gameData.getMove(moveId);
    if (!move) return;

    // Tiêu PP.
    if ((atk.pp[moveIndex] ?? 0) > 0) atk.pp[moveIndex] = (atk.pp[moveIndex] ?? 0) - 1;

    const atkLabel = this.labelOf(atkSide === this.state.ally ? 'ally' : 'foe', atk);
    this.log(`${atkLabel} used ${move.name}!`, 'damage');

    if (!accuracyCheck(move.accuracy)) {
      this.log(`${atkLabel}'s attack missed!`, 'fail');
      return;
    }

    // Status move (power null/0) — chưa xử lý effect → chỉ log.
    if (move.power == null || move.power <= 0) {
      this.log('But it had no effect...', 'fail');
      return;
    }

    const effectiveness = typeEffectiveness(move.type, this.typesOf(def));
    const { attackerStat, defenderStat } = getEffectiveStatForCategory(
      move.category,
      atk as unknown as { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number },
      def as unknown as { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number },
    );
    const stab = stabMultiplier(move.type, this.typesOf(atk)) === 1.5;
    const crit = isCriticalHit();
    const { damage, messages } = calcDamage({
      level: atk.level,
      power: move.power,
      attackerStat,
      defenderStat,
      effectiveness,
      stab,
      isCritical: crit,
      randomFactor: randomDamageFactor(),
    });

    for (const m of messages) this.log(m, 'damage');
    def.currentHp = Math.max(0, def.currentHp - damage);

    if (effectiveness === 0) {
      this.log("It doesn't affect the enemy...", 'fail');
    } else if (effectiveness > 1) {
      this.log("It's super effective!", 'damage');
    } else if (effectiveness < 1) {
      this.log("It's not very effective...", 'fail');
    }
    this.log(
      `${this.labelOf(defSide === this.state.ally ? 'ally' : 'foe', def)} took ${damage} damage.`,
      'damage',
    );
  }

  /** Xử lý Pokémon gục: đổi người / kết thúc trận. Trả về true nếu có Pokémon gục. */
  private handleFaints(): boolean {
    let hasFaint = false;

    // Kiểm tra gục cho cả 2 bên. Lưu ý: nếu cả 2 bên cùng gục (ví dụ chiêu recoil/reversal),
    // xử lý lần lượt theo logic quy chuẩn.
    for (const side of ['ally', 'foe'] as const) {
      const s = this.state[side];
      const active = this.activeOf(s);
      if (!active || active.currentHp > 0) continue;

      hasFaint = true;
      this.log(`${this.labelOf(side, active)} fainted!`, 'faint');

      const next = s.team.findIndex((p, i) => i !== s.activeIndex && p.currentHp > 0);
      if (next === -1) {
        this.endBattle(side === 'ally' ? 'foe' : 'ally', side === 'ally' ? 'defeat' : 'victory');
        return true;
      }

      if (this.isPvp) {
        // PvP: chỉ bên CÓ pokemon gục mới bị bắt buộc chọn (không ép cả 2).
        this.pendingSwitchSides.add(side);
      } else if (side === 'ally') {
        this.pendingSwitchSides.add(side);
      } else {
        // Wild/trainer foe: tự đổi pokemon kế.
        s.activeIndex = next;
        const incoming = s.team[next]!;
        if (this.isTrainer) {
          this.log(`${this.trainerName} sent out ${incoming.nickname}!`, 'system');
        } else {
          this.log(`The wild ${incoming.nickname} was sent out!`, 'system');
        }
        this.participated.add(incoming.pokemonId);
      }
    }

    if (this.pendingSwitchSides.size > 0) {
      this.clearTurnTimer();
      this.state.phase = 'switch';
      if (this.isPvp) {
        // Gửi riêng từng bên đang chờ — client kia không bị ép chuyển.
        for (const s of this.pendingSwitchSides) {
          this.sendToSide(s, 'battle_need_switch', { type: 'battle_need_switch' });
        }
        this.log('Choose your next Pokémon!', 'system');
      } else {
        this.log('Choose your next Pokémon!', 'system');
        this.broadcast('battle_need_switch', { type: 'battle_need_switch' });
      }
    }

    return hasFaint;
  }

  private handleSwitch(client: Client, pokemonIndex: number): void {
    if (this.ended) return;
    if (!this.sessionSide.has(client.sessionId)) return;
    const phase = this.state.phase;
    if (phase !== 'select' && phase !== 'switch') return;
    const side = this.sideOfClient(client);
    if (!side) return;
    if (this.isPvp && this.actedWithoutMove.has(side)) return;
    const s = this.state[side];
    if (typeof pokemonIndex !== 'number' || !Number.isInteger(pokemonIndex)) return;
    if (pokemonIndex === s.activeIndex) return;
    const target = s.team[pokemonIndex];
    if (!target || target.currentHp <= 0) return;

    // ── Ép đổi sau khi gục (phase 'switch'): chỉ side đang chờ mới được đổi ──
    if (phase === 'switch') {
      if (!this.pendingSwitchSides.has(side)) return;
      s.activeIndex = pokemonIndex;
      this.participated.add(target.pokemonId);
      this.log(`Go! ${target.nickname}!`, 'system');
      this.pendingSwitchSides.delete(side);
      if (this.pendingSwitchSides.size === 0) this.nextTurn();
      return;
    }

    // ── Đổi chủ động trong lượt select (tốn 1 lượt) ──
    s.activeIndex = pokemonIndex;
    this.participated.add(target.pokemonId);
    const trainerName = side === 'ally' ? this.state.allyName : this.state.foeName;
    this.log(
      this.isPvp ? `${trainerName} sent out ${target.nickname}!` : `Go! ${target.nickname}!`,
      'system',
    );

    if (this.isPvp) {
      // PvP: switch = hành động KHÔNG phải chiêu của lượt này. Bên này không ra
      // đòn; lượt chỉ resolve khi bên kia cũng đã hành động (move hoặc item/switch).
      // Switch áp dụng ngay nên đối thủ thấy Pokémon mới trước khi ra đòn.
      this.actedWithoutMove.add(side);
      this.checkResolveTurn();
      return;
    }

    // Wild/trainer: đổi tốn 1 lượt, foe (AI) đánh trả.
    this.clearTurnTimer();
    this.state.phase = 'anim';
    this.clock.setTimeout(() => {
      if (this.ended) return;
      this.executeMove(this.state.foe, this.state.ally, this.foeAI());
      if (this.ended) return;
      this.clock.setTimeout(() => {
        if (this.ended) return;
        this.handleFaints();
        if (this.ended || this.state.phase === 'switch') return;
        this.nextTurn();
      }, 900);
    }, 700);
  }

  private handleRun(client: Client): void {
    if (this.ended || this.state.phase !== 'select') return;
    if (!this.sessionSide.has(client.sessionId)) return;
    // PvP: không bỏ chạy (người chơi thật — forfeit mới là cách thoát).
    if (this.isPvp) {
      this.log("You can't run from a PvP battle! Use Forfeit instead.", 'fail');
      return;
    }
    if (this.isTrainer) {
      this.log("No! There's no running from a Trainer battle!", 'fail');
      return;
    }
    const a = this.activeOf(this.state.ally);
    const f = this.activeOf(this.state.foe);
    if (!a || !f) return;

    this.clearTurnTimer();
    this.state.phase = 'anim';

    if (canEscape(a.speed, f.speed)) {
      this.log('Got away safely!', 'result');
      this.endBattle('ally', 'run');
      return;
    }

    this.log("Can't escape!", 'fail');
    this.clock.setTimeout(() => {
      if (this.ended) return;
      this.executeMove(this.state.foe, this.state.ally, this.foeAI());
      if (this.ended) return;
      this.clock.setTimeout(() => {
        if (this.ended) return;
        this.handleFaints();
        if (this.ended || this.state.phase === 'switch') return;
        this.nextTurn();
      }, 900);
    }, 700);
  }

  /**
   * `battle_catch` — ném ball. **Không còn flow riêng**: đuổi về `handleBattleItem`
   * để ball được trừ trong túi + validate ownership (tránh bug ném ball miễn phí).
   * Client Plan 45 Phase 6 đã chuyển ball vào khung BAG → dùng `battle_item`.
   */
  private handleCatch(client: Client, ballId?: string): void {
    void this.handleBattleItem(client, ballId ?? 'pokeball');
  }

  private handleForfeit(client: Client): void {
    if (this.ended) return;
    const side = this.sideOfClient(client);
    if (!side) return;
    this.log('You gave up the battle!', 'result');
    if (this.isPvp) {
      // Bỏ cuộc → bên kia thắng.
      this.endBattle(side === 'ally' ? 'foe' : 'ally', 'forfeit');
      return;
    }
    this.endBattle('foe', 'forfeit');
  }

  // ── Plan 45 §1.6: dùng item trong battle ────────────────────────────────

  /**
   * Hành động item bị hủy (dùng sai mục tiêu / hết tác dụng).
   *
   * - Wild/trainer: tốn lượt (`nextTurn`) — như trước.
   * - PvP: KHÔNG tốn lượt; đưa trận về `select` để người chơi chọn lại (item
   *   chưa cộng dồn gì nên không bị lỗ). Nếu đối thủ đã chọn chiêu thì cũng
   *   chưa resolve (bên này chưa `actedWithoutMove`).
   */
  private cancelItemUse(): void {
    if (this.isPvp) {
      this.state.phase = 'select';
      this.startTurnTimer();
      return;
    }
    this.nextTurn();
  }

  private async handleBattleItem(client: Client, itemId?: string, targetIndex?: number): Promise<void> {
    if (this.ended || this.state.phase !== 'select') return;
    const side = this.sideOfClient(client);
    if (!side) return;
    // PvP: 1 hành động/lượt — đã dùng item / đổi Pokémon rồi thì không được nữa.
    if (this.isPvp && this.actedWithoutMove.has(side)) return;
    if (!itemId) {
      this.log('Item not specified.', 'fail');
      return;
    }

    const effect = resolveItemEffect(itemId);
    if (!effect) {
      this.log('Item has no effect here.', 'fail');
      return;
    }

    // PvP: không Poké Ball (đối thủ là người chơi thật — không bắt được).
    if (this.isPvp && effect.kind === 'catch_ball') {
      this.log("You cannot catch another trainer's Pokémon!", 'fail');
      return;
    }

    const actorUserId = side === 'ally' ? this.userId : this.foeUserId;
    const actorSnapshot = side === 'ally' ? this.allySnapshot : this.foeSnapshot;

    // Khoá lượt TRƯỚC khi await: nếu chờ xong mới khoá, turn timer có thể fire
    // giữa chừng (PvP) và tự resolve lượt → item áp dụng lên trận đang anim.
    this.clearTurnTimer();
    this.state.phase = 'anim';

    // Chặn cheat: item phải thuộc owner (PvP: owner = bên đang hành động).
    if (!actorUserId || !(await hasItem(actorUserId, itemId, 1))) {
      this.log('You do not have that item!', 'fail');
      // Mở lại lượt (không tốn lượt vì hành động không hợp lệ).
      this.state.phase = 'select';
      this.startTurnTimer();
      return;
    }

    const own = this.state[side];
    const active = this.activeOf(own);

    // Xác định Pokémon mục tiêu: nếu client truyền targetIndex (0..team.length-1) thì dùng con đó, ngược lại là active
    let target = active;
    let targetIdx = own.activeIndex;
    if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex < own.team.length) {
      target = own.team[targetIndex];
      targetIdx = targetIndex;
    }

    switch (effect.kind) {
      case 'heal': {
        if (!target) break;
        if (target.currentHp <= 0) {
          this.log(`${target.nickname} has fainted! Cannot use that item.`, 'fail');
          this.cancelItemUse();
          return;
        }
        if (target.currentHp >= target.maxHp) {
          this.log(`${target.nickname}'s HP is already full!`, 'fail');
          this.cancelItemUse();
          return;
        }
        const healed = Math.min(target.maxHp, target.currentHp + effect.hp);
        target.currentHp = healed;
        if (actorSnapshot[targetIdx]) {
          actorSnapshot[targetIdx].currentHp = healed;
        }
        this.log(`Used ${itemId}! Healed ${target.nickname}.`, 'system');
        break;
      }
      case 'revive': {
        if (!target) break;
        if (target.currentHp > 0) {
          this.log(`${target.nickname} is still conscious!`, 'fail');
          this.cancelItemUse();
          return;
        }
        const healed = Math.max(1, Math.round(target.maxHp * effect.pct));
        target.currentHp = healed;
        target.status = '';
        if (actorSnapshot[targetIdx]) {
          actorSnapshot[targetIdx].currentHp = healed;
          actorSnapshot[targetIdx].status = '';
        }
        this.log(`Used ${itemId}! Revived ${target.nickname} with ${healed} HP.`, 'system');
        break;
      }
      case 'cure_status': {
        if (!target) break;
        if (!target.status) {
          this.log(`${target.nickname} has no status condition to cure.`, 'fail');
          this.cancelItemUse();
          return;
        }
        if (!effect.status.includes(target.status)) {
          this.log('This item cannot cure that status.', 'fail');
          this.cancelItemUse();
          return;
        }
        target.status = '';
        if (actorSnapshot[targetIdx]) {
          actorSnapshot[targetIdx].status = '';
        }
        this.log(`Used ${itemId}! Cured ${target.nickname}'s status condition.`, 'system');
        break;
      }
      case 'restore_pp': {
        this.log('PP restore is not used in battle v1.', 'fail');
        this.cancelItemUse();
        return;
      }
      case 'buff': {
        this.log(`Used ${itemId}! (stat boost — v1 display only)`, 'system');
        break;
      }
      case 'evo_stone': {
        this.log('Cannot use evo stones in battle.', 'fail');
        this.cancelItemUse();
        return;
      }
      case 'exp_boost':
      case 'level_up': {
        this.log('Cannot use that in battle.', 'fail');
        this.cancelItemUse();
        return;
      }
      case 'catch_ball': {
        // Chỉ khi foe là wild → reuse attemptCatch. (PvP đã chặn trên.)
        const f = this.activeOf(this.state.foe);
        if (!f || !f.isWild) {
          this.log('You cannot catch a trainer Pokémon!', 'fail');
          this.cancelItemUse();
          return;
        }
        void this.attemptCatchWithBall(client, f, itemId, effect.rate);
        return;
      }
      default:
        this.log('Nothing happened.', 'fail');
        this.cancelItemUse();
        return;
    }

    // ── Hành động hợp lệ: trừ item + ghi nhận là \"đã hành động\" lượt này ──
    await removeItem(actorUserId, itemId, 1);
    void logItemUsed(actorUserId, null, itemId, { source: 'battle' });

    if (this.isPvp) {
      // PvP: item = 1 hành động (dùng thay cho chiêu). Chờ đến khi cả 2 bên đều
      // đã hành động rồi mới resolve (resolvePvpTurn sẽ bỏ qua bên này ở lượt đánh).
      this.actedWithoutMove.add(side);
      this.state.phase = 'select';
      this.checkResolveTurn();
      if (this.ended) return;
      // Chưa đủ điều kiện resolve (đối thủ chưa chọn) → mở lại đồng hồ chờ.
      this.startTurnTimer();
      return;
    }

    // Wild/trainer: foe (AI) đánh trả sau khi mình tốn lượt.
    this.clock.setTimeout(() => {
      if (this.ended) return;
      this.executeMove(this.state.foe, this.state.ally, this.foeAI());
      if (this.ended) return;
      this.clock.setTimeout(() => {
        if (this.ended) return;
        this.handleFaints();
        if (this.ended || this.state.phase === 'switch') return;
        this.nextTurn();
      }, 900);
    }, 700);
  }

  /** Dùng Poké Ball trong trận — reuse attemptCatch + log + catch_anim. */
  private async attemptCatchWithBall(
    client: Client,
    foe: BattlePokemon,
    ballId: string,
    _baseRate: number,
  ): Promise<void> {
    const species = gameData.getSpecies(foe.speciesId);
    if (!species) {
      this.nextTurn();
      return;
    }

    const activeAlly = this.activeOf(this.state.ally);
    const ctx: CatchContext = {
      turn: this.state.turn,
      types: foe.types ? foe.types.split(',').filter(Boolean) : [],
      baseSpeed: species.baseStats.speed,
      allyLevel: activeAlly?.level ?? 1,
      foeLevel: foe.level,
    };
    const rate = ballMultiplierFor(ballId, ctx);

    this.log(`You threw a ${ballId}!`, 'system');
    const result = attemptCatch(species, foe.currentHp, foe.maxHp, foe.status || null, rate);
    await removeItem(this.userId, ballId, 1);
    void logItemUsed(this.userId, null, ballId, { source: 'battle_catch' });

    // Khóa trạng thái lúc đang diễn hoạt ném bóng
    this.state.phase = 'animating';

    // Bắn event animation cho client (bóng bay, co rút, lắc bóng, sao lấp lánh)
    client.send('catch_anim', {
      type: 'catch_anim',
      ballId,
      shakes: result.shakes,
      caught: result.caught,
      critical: result.critical,
      message: result.message,
      speciesId: foe.speciesId,
      nickname: foe.nickname,
      level: foe.level,
      shiny: foe.shiny,
    });

    const animDelayMs = 1200 + result.shakes * 650;
    this.clock.setTimeout(async () => {
      if (this.ended) return;

      if (result.caught) {
        this.log(result.message, 'result');
        this.state.caughtSpeciesId = foe.speciesId;
        if (this.userId && foe.speciesId) {
          void recordPokedexEntry(this.userId, foe.speciesId, 'caught');
        }
        const caughtData = await this.insertCaughtPokemon(foe, species, ballId);
        if (caughtData) {
          try {
            client.send('pokemon_caught', { pokemon: caughtData });
          } catch {
            // Client might have disconnected
          }
          if (caughtData.slot === null) {
            this.log(`${species.name} was transferred to the PC Box!`, 'info');
          } else {
            this.log(`${species.name} was added to your party!`, 'info');
          }
        }
        this.endBattle('ally', 'caught');
        return;
      }

      this.log(result.message, 'fail');
      this.state.phase = 'anim';
      this.clock.setTimeout(() => {
        if (this.ended) return;
        this.executeMove(this.state.foe, this.state.ally, this.foeAI());
        if (this.ended) return;
        this.clock.setTimeout(() => {
          if (this.ended) return;
          this.handleFaints();
          if (this.ended || this.state.phase === 'switch') return;
          this.nextTurn();
        }, 900);
      }, 700);
    }, animDelayMs);
  }

  // ── Kết thúc trận ──────────────────────────────────────────────────────

  private endBattle(winner: 'ally' | 'foe' | 'draw', result: string): void {
    if (this.ended) return;
    this.ended = true;
    this.clearTurnTimer();

    this.state.winner = winner;
    this.state.result = result;
    this.state.phase = 'ended';

    if (this.isPvp) {
      this.finishPvpBattle(winner, result);
      return;
    }

    if (winner === 'ally' && result === 'victory') {
      this.state.expGained = this.grantExp();
      if (this.isTrainer) {
        if (this.loseText) {
          this.log(`${this.trainerName}: "${this.loseText}"`, 'trainer');
        }
        this.log(`You defeated ${this.trainerName}! Earned ₽${this.rewardMoney}!`, 'result');
        if (this.rewardMoney > 0 && this.userId) {
          void pool
            .query('UPDATE players SET money = money + $1 WHERE id = $2', [this.rewardMoney, this.userId])
            .catch((err) => {
              console.error('[battle] failed to reward money:', err);
            });
          void logMoney(this.userId, this.rewardMoney, 'battle_trainer', { trainerId: this.trainerId });
        }
        if (this.worldSessionId) {
          this.presence.publish('trainer_defeated', {
            sessionId: this.worldSessionId,
            npcId: this.npcId,
            trainerId: this.trainerId,
          });
        }
      } else {
        this.log(`You won the battle! Gained ${this.state.expGained} EXP!`, 'result');
      }
    } else if (winner === 'ally' && result === 'caught') {
      this.state.expGained = 0;
      this.log('You caught the Pokémon!', 'result');
    } else if (winner === 'foe') {
      this.log('You lost the battle...', 'result');
    } else if (result === 'run') {
      this.log('You fled the battle.', 'result');
    }

    this.publishBattleEnd();
    void this.saveResults();
    this.clock.setTimeout(() => this.disconnect(), 3000);
  }

  /** Nhận `evolved` từ battle room (publish qua presence). */
  onEvolved?: (msg: { sessionId?: string; pokemonId?: string; from?: string; to?: string }) => void;

  private publishBattleEnd(): void {
    if (this.worldSessionId) {
      this.presence.publish('battle_end', { sessionId: this.worldSessionId });
    }
    if (this.isPvp && this.foeWorldSessionId) {
      this.presence.publish('battle_end', { sessionId: this.foeWorldSessionId });
    }
  }

  /**
   * Kết thúc trận PvP (Plan 47).
   *
   * Luật đã chốt với user:
   *  - **Không EXP** cho cả 2 bên (không cày level qua PvP).
   *  - Người thắng nhận `PVP_WIN_MONEY`; người thua không bị trừ (`PVP_LOSE_MONEY = 0`).
   *  - HP/status của cả 2 party vẫn được ghi về DB (đánh nhau thì phải hồi máu).
   *  - Gửi `battle_end` cho WorldRoom của cả 2 để gỡ chặn encounter.
   */
  private finishPvpBattle(winner: 'ally' | 'foe' | 'draw', result: string): void {
    this.state.expGained = 0;
    const allyWon = winner === 'ally';
    const draw = winner === 'draw';

    const allyName = this.state.allyName || 'Player';
    const foeName = this.state.foeName || 'Opponent';

    if (draw) {
      this.log("It's a draw!", 'result');
    } else if (allyWon) {
      this.log(`${allyName} defeated ${foeName}!`, 'result');
    } else {
      this.log(`${foeName} defeated ${allyName}!`, 'result');
    }

    // Tiền thưởng cho người thắng (trừ bù theo PVP_LOSE_MONEY nếu có).
    const pay = (userId: string, amount: number): void => {
      if (!userId || amount === 0) return;
      void pool
        .query('UPDATE players SET money = money + $1 WHERE id = $2', [amount, userId])
        .then(() => logMoney(userId, amount, 'battle_pvp', { result }))
        .catch((err) => console.error('[battle] pvp money update failed:', err));
    };

    if (!draw) {
      const winnerId = allyWon ? this.userId : this.foeUserId;
      const loserId = allyWon ? this.foeUserId : this.userId;
      pay(winnerId, PVP_WIN_MONEY);
      pay(loserId, -PVP_LOSE_MONEY);
    }

    // Ghi money event cho cả 2 bên (pay() đã log 'battle_pvp').
    this.publishBattleEnd();
    void this.saveResults();
    this.clock.setTimeout(() => this.disconnect(), 4000);
  }

  /** Chia EXP cho Pokémon đã tham chiến + level-up (recompute stats). */
  private grantExp(): number {
    const foe = this.state.foe.team[0];
    if (!foe) return 0;
    const species = gameData.getSpecies(foe.speciesId);
    if (!species) return 0;

    const targets = this.allySnapshot.filter((m) => this.participated.has(m.id) && m.currentHp > 0);
    const share = targets.length > 0 ? targets : this.allySnapshot.filter((m) => m.currentHp > 0);
    if (share.length === 0) return 0;

    const baseGain = calcExpGain(foe.level, species.baseExperience, share.length, !this.isTrainer);
    let total = 0;

    void logXp(this.userId, share[0]?.id ?? '', baseGain, this.isTrainer ? 'battle_trainer' : 'battle_wild', { foe: foe.speciesId });

    for (const m of share) {
      const sp = gameData.getSpecies(m.speciesId);
      if (!sp) continue;

      // Lucky Egg (và item EXP boost khác) là **held item**: nhân EXP theo
      // multiplier của item đang cầm. `resolveItemEffect` là SSOT nên không
      // hard-code tên item ở đây.
      let gain = baseGain;
      if (m.heldItem) {
        const held = resolveItemEffect(m.heldItem);
        if (held && held.kind === 'exp_boost') {
          gain = Math.floor(baseGain * held.mult);
        }
      }

      const beforeLevel = m.level;
      m.exp += gain;
      total += gain;
      // Level-up loop (tính lại stats đúng IV/EV/nature).
      while (m.level < 100 && m.exp >= expForLevel(m.level + 1, sp.growthRate)) {
        m.level += 1;
        const { maxHp, stats } = computeOwnedPokemonStats(
          sp.baseStats,
          m.ivs,
          m.evs,
          m.level,
          getNatureMod(m.natureName),
        );
        const delta = maxHp - m.maxHp;
        m.maxHp = maxHp;
        m.stats = stats;
        m.currentHp = Math.min(m.maxHp, m.currentHp + Math.max(0, delta)); // +HP khi lên level
        m.expToNext = Math.max(1, expForLevel(m.level + 1, sp.growthRate) - m.exp);
        this.log(`${m.nickname} grew to Lv.${m.level}!`, 'levelup');
        void logLevelUp(this.userId, m.id, beforeLevel, m.level, 'up');
      }
      m.expToNext = Math.max(1, expForLevel(m.level + 1, sp.growthRate) - m.exp);
      // Đồng bộ snapshot → schema cho client.
      const idx = this.state.ally.team.findIndex((p) => p.pokemonId === m.id);
      if (idx >= 0) this.syncMemberToSchema(this.state.ally.team[idx]!, m);
      // Auto-evolve sau level-up (Plan 45 §3.2).
      if (m.level > beforeLevel) {
        void this.maybeAutoEvolve(m.id, m.level);
      }
    }
    return total;
  }

  /** Auto-evolve sau level-up (Plan 45 §3.2) — fire-and-forget. */
  private async maybeAutoEvolve(pokemonId: string, level: number): Promise<void> {
    const { rows } = await pool.query(
      `SELECT friendship, moves, held_item FROM pokemon WHERE id = $1 AND owner_id = $2`,
      [pokemonId, this.userId],
    );
    if (rows.length === 0) return;
    const row = rows[0] as { friendship: number; moves: unknown; held_item: string | null };
    const moves = Array.isArray(row.moves) ? (row.moves as Array<{ id: string }>).map((m) => m.id) : [];
    const r = await tryEvolve(this.userId, pokemonId, {
      level,
      friendship: Number(row.friendship),
      knownMoves: moves,
    });
    if (r.evolved) {
      this.log(`${r.from} evolved into ${r.to}!`, 'result');
      // Gửi evolved message về world room (client hiện EvolveModal).
      this.publishEvolved(pokemonId, r.from!, r.to!);
    }
  }

  /** Gửi `evolved` về world room để client hiện EvolveModal. */
  private publishEvolved(pokemonId: string, from: string, to: string): void {
    if (!this.worldSessionId) return;
    this.presence.publish('evolved', {
      sessionId: this.worldSessionId,
      pokemonId,
      from,
      to,
    });
  }

  private syncMemberToSchema(p: BattlePokemon, m: BattleTeamMember): void {
    p.level = m.level;
    p.currentHp = m.currentHp;
    p.maxHp = m.maxHp;
    p.attack = m.stats.attack;
    p.defense = m.stats.defense;
    p.spAttack = m.stats.spAttack;
    p.spDefense = m.stats.spDefense;
    p.speed = m.stats.speed;
    // EXP trong level hiện tại (khớp với populateSide).
    const growth = gameData.getSpecies(m.speciesId)?.growthRate ?? 'mediumFast';
    p.exp = Math.max(0, m.exp - expForLevel(m.level, growth));
    p.expToNext = m.expToNext;
  }

  /**
   * Ghi lại HP/level/EXP/status của party vào DB.
   *
   * Wild/trainer: chỉ party của người chơi (`ally`).
   * PvP: ghi CẢ HAI party — mỗi Pokémon có `owner_id` riêng nên 2 lệnh UPDATE
   * độc lập, không ghi đè lẫn nhau.
   */
  private async saveResults(): Promise<void> {
    await this.saveTeam(this.allySnapshot, this.state.ally, this.userId);
    if (this.isPvp && this.foeUserId) {
      await this.saveTeam(this.foeSnapshot, this.state.foe, this.foeUserId);
    }
  }

  /** Ghi 1 team xuống DB (owner = `ownerId`). */
  private async saveTeam(
    snapshot: BattleTeamMember[],
    side: BattleSide,
    ownerId: string,
  ): Promise<void> {
    if (!ownerId || snapshot.length === 0) return;
    try {
      for (let i = 0; i < snapshot.length; i++) {
        const m = snapshot[i]!;
        const schema = side.team[i];
        const hp = schema ? schema.currentHp : m.currentHp;
        const status = schema ? schema.status : m.status;
        await pool.query(
          `UPDATE pokemon
              SET current_hp = $1, level = $2, exp = $3, stats = $4, status = $5
            WHERE id = $6 AND owner_id = $7`,
          [
            Math.max(0, Math.min(m.maxHp, hp)),
            m.level,
            m.exp,
            JSON.stringify(m.stats),
            status || null,
            m.id,
            ownerId,
          ],
        );
      }
      console.log(
        `[battle] ${this.roomId} saved ${snapshot.length} pokemon for ${ownerId} (exp=${this.state.expGained})`,
      );
    } catch (err) {
      console.error('[battle] failed to save results:', err);
    }
  }

  /** Pokémon vừa bắt được → insert vào party (nếu <6) hoặc box. */
  private async insertCaughtPokemon(
    foe: BattlePokemon,
    species: Species,
    ballId: string = 'pokeball',
  ): Promise<{
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
  } | null> {
    if (!this.userId) return null;
    try {
      const { generatePokemon, computeOwnedPokemonStats, NATURES } = await import('@pixelmon/shared');
      const foeSource = this.foeSnapshot[0];
      // Sinh lại đúng chuẩn (IV/nature/moveset theo level) — con bắt được.
      const owned = generatePokemon(
        species,
        foe.level,
        gameData.getMovesForLevel.bind(gameData),
        Math.random,
        'wild',
      );

      if (foeSource) {
        if (foeSource.shiny !== undefined) owned.shiny = foeSource.shiny;
        if (foeSource.gender) owned.gender = foeSource.gender as any;
        if (foeSource.natureName) {
          const nat = NATURES.find((n) => n.name.toLowerCase() === foeSource.natureName.toLowerCase());
          if (nat) owned.nature = nat;
        }
        if (foeSource.ivs) owned.ivs = { ...foeSource.ivs };
        if (foeSource.moves && foeSource.moves.length > 0) {
          owned.moves = foeSource.moves.map((m) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            category: m.category as 'status' | 'physical' | 'special',
            power: m.power,
            accuracy: m.accuracy,
            maxPp: m.maxPp,
            currentPp: m.maxPp,
            priority: m.priority,
          }));
        }
        if (foeSource.heldItem) {
          (owned as any).heldItem = foeSource.heldItem;
        }
      }

      // Recompute stats theo nature và ivs
      const { maxHp, stats } = computeOwnedPokemonStats(
        species.baseStats,
        owned.ivs,
        owned.evs,
        owned.level,
        owned.nature,
      );
      owned.maxHp = maxHp;
      owned.stats = stats;

      // Xử lý hiệu ứng bóng đặc biệt
      const normBall = ballId.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normBall === 'healball') {
        owned.currentHp = maxHp;
        owned.status = 'none';
      } else {
        owned.currentHp = Math.max(1, foe.currentHp);
        owned.status = (foe.status as StatusEffect) || 'none';
      }

      let initialFriendship = 70;
      if (normBall === 'friendball') {
        initialFriendship = 200;
      } else if (normBall === 'luxuryball') {
        initialFriendship = 120;
      }

      // Tìm slot party trống nhỏ nhất từ 0..5 (chống bug trùng slot)
      const partyRes = await pool.query(
        `SELECT party_slot FROM pokemon WHERE owner_id = $1 AND party_slot IS NOT NULL`,
        [this.userId],
      );
      const takenSlots = new Set(partyRes.rows.map((r) => Number(r.party_slot)));
      let slot: number | null = null;
      for (let s = 0; s < 6; s++) {
        if (!takenSlots.has(s)) {
          slot = s;
          break;
        }
      }

      await pool.query(
        `INSERT INTO pokemon (
          id, owner_id, species_id, nickname, level, exp, ivs, evs, stats, current_hp, moves, status, shiny, party_slot, nature, gender, held_item, friendship, poke_ball
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          owned.id,
          this.userId,
          owned.speciesId,
          owned.nickname || species.name,
          owned.level,
          owned.exp,
          JSON.stringify(owned.ivs),
          JSON.stringify(owned.evs),
          JSON.stringify(owned.stats),
          owned.currentHp,
          JSON.stringify(owned.moves),
          owned.status === 'none' ? null : owned.status,
          owned.shiny,
          slot,
          JSON.stringify(owned.nature),
          owned.gender,
          (owned as any).heldItem || null,
          initialFriendship,
          ballId,
        ],
      );

      // Ghi log sự kiện catch
      void logCatch(this.userId, owned.id, owned.speciesId, owned.level);

      console.log(
        `[battle] ${this.roomId} caught ${owned.speciesId} Lv.${owned.level} with ${ballId} → ${slot === null ? 'box' : `party slot ${slot}`}`,
      );

      return {
        id: owned.id,
        speciesId: owned.speciesId,
        name: species.name,
        nickname: owned.nickname || species.name,
        level: owned.level,
        shiny: owned.shiny,
        gender: owned.gender,
        nature: owned.nature.name,
        ballId,
        slot,
      };
    } catch (err) {
      console.error('[battle] failed to insert caught pokemon:', err);
      return null;
    }
  }
}
