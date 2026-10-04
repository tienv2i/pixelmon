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
  ballMultiplierFor,
  canEscape,
  expForLevel,
  getNatureMod,
  computeOwnedPokemonStats,
} from '@pixelmon/shared';
import { gameData } from '@pixelmon/shared/data';
import { consumeBattleToken } from './manager.js';
import type { BattleTeamMember } from '../pokemon/battleParty.js';
import { pool } from '../../config/index.js';
import type { Species } from '@pixelmon/shared';

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
  maxClients = 1;

  /** sessionId → 'ally' (wild battle = 1 người chơi). */
  private sessionSide: Map<string, 'ally' | 'foe'> = new Map();
  /** Session trong WorldRoom để gỡ chặn encounter khi trận kết thúc. */
  private worldSessionId = '';
  /** userId (DB) — ghi kết quả. */
  private userId = '';
  /** Đã kết thúc chưa (chống endBattle × 2). */
  private ended = false;
  /** Timer lượt hiện tại. */
  private turnTimer?: ReturnType<Room['clock']['setTimeout']>;
  /** Snapshot team (đã có level/EXP sau battle) để ghi DB. */
  private allySnapshot: BattleTeamMember[] = [];
  private foeSnapshot: BattleTeamMember[] = [];
  /** Các Pokémon id đã tham chiến (được chia EXP). */
  private participated: Set<string> = new Set();

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

    this.state.battleId = this.roomId;
    this.state.isPvp = false;
    this.state.turn = 1;
    this.state.phase = 'select';

    this.populateSide(this.state.ally, this.allySnapshot, false);
    this.state.ally.playerId = pending.userId;

    this.populateSide(this.state.foe, this.foeSnapshot, true);
    this.state.foe.playerId = 'wild';

    const foe = this.state.foe.team[this.state.foe.activeIndex];
    this.log(`A wild ${foe?.nickname ?? 'Pokémon'} appeared!`, 'system');
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

    this.onMessage('battle_item', (_client, data: { itemId?: string }) => {
      // Wild battle v1: chưa có inventory → báo rõ (không im lặng).
      this.log('No items available in this battle!', 'fail');
      void data;
    });

    this.onMessage('battle_forfeit', (client) => {
      this.handleForfeit(client);
    });

    this.startTurnTimer();
    console.log(
      `[battle] ${this.roomId} created: ally=${this.state.ally.team.length} vs foe=${this.state.foe.team.length}`,
    );
  }

  onJoin(client: Room['clients'][number]) {
    // Wild battle: 1 client duy nhất = ally.
    this.sessionSide.set(client.sessionId, 'ally');
    console.log(`[battle] ${client.sessionId} joined as ally`);
  }

  onLeave(client: Room['clients'][number]) {
    this.sessionSide.delete(client.sessionId);
    if (!this.ended) {
      // Rời trận chưa xong → coi như bỏ cuộc.
      this.endBattle('foe', 'forfeit');
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
    this.turnTimer = this.clock.setTimeout(() => {
      if (this.ended || this.state.phase !== 'select') return;
      // Auto chọn move đầu còn PP.
      const ally = this.state.ally;
      const active = this.activeOf(ally);
      if (!active) return;
      const idx = active.moves.findIndex((_, i) => (active.pp[i] ?? 0) > 0);
      if (idx >= 0) {
        this.log('Time out! Auto-selected a move.', 'system');
        ally.selectedMove = idx;
        this.checkResolveTurn();
      }
    }, TURN_TIMEOUT_MS);
  }

  private clearTurnTimer(): void {
    this.turnTimer?.clear();
    this.turnTimer = undefined;
  }

  private handleMove(client: Client, moveIndex: number): void {
    if (this.ended || this.state.phase !== 'select') return;
    if (!this.sessionSide.has(client.sessionId)) return;
    const active = this.activeOf(this.state.ally);
    if (!active) return;
    if (typeof moveIndex !== 'number' || !Number.isInteger(moveIndex)) return;
    if (moveIndex < 0 || moveIndex >= active.moves.length) return;
    if ((active.pp[moveIndex] ?? 0) <= 0) {
      this.log('No PP left for this move!', 'fail');
      return;
    }
    this.state.ally.selectedMove = moveIndex;
    this.checkResolveTurn();
  }

  private checkResolveTurn(): void {
    if (this.ended) return;
    if (this.state.ally.selectedMove < 0 || this.state.foe.selectedMove < 0) return;
    this.resolveTurn();
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
    const allyFirst = a.speed >= f.speed;
    const foeMove = this.foeAI();

    if (allyFirst) {
      this.executeMove(this.state.ally, this.state.foe, ally.selectedMove);
      if (!this.ended && f.currentHp > 0 && a.currentHp > 0) {
        this.executeMove(this.state.foe, this.state.ally, foeMove);
      }
    } else {
      this.executeMove(this.state.foe, this.state.ally, foeMove);
      if (!this.ended && a.currentHp > 0 && f.currentHp > 0) {
        this.executeMove(this.state.ally, this.state.foe, ally.selectedMove);
      }
    }

    if (this.ended) return;
    this.handleFaints();
    if (this.ended) return;
    this.nextTurn();
  }

  private nextTurn(): void {
    this.state.ally.selectedMove = -1;
    this.state.foe.selectedMove = -1;
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

    const atkLabel = atkSide === this.state.ally ? `${atk.nickname}` : `The wild ${atk.nickname}`;
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
      `${defSide === this.state.ally ? def.nickname : `The wild ${def.nickname}`} took ${damage} damage.`,
      'damage',
    );
  }

  /** Xử lý Pokémon gục: đổi người / kết thúc trận. */
  private handleFaints(): void {
    for (const side of ['ally', 'foe'] as const) {
      const s = this.state[side];
      const active = this.activeOf(s);
      if (!active || active.currentHp > 0) continue;

      const label = side === 'ally' ? active.nickname : `The wild ${active.nickname}`;
      this.log(`${label} fainted!`, 'faint');

      const next = s.team.findIndex((p, i) => i !== s.activeIndex && p.currentHp > 0);
      if (next === -1) {
        this.endBattle(side === 'ally' ? 'foe' : 'ally', side === 'ally' ? 'defeat' : 'victory');
        return;
      }

      if (side === 'foe') {
        // Foe: tự đổi pokemon kế.
        s.activeIndex = next;
        const incoming = s.team[next]!;
        this.log(`The wild ${incoming.nickname} was sent out!`, 'system');
        this.participated.add(incoming.pokemonId);
      } else {
        // Ally: bắt buộc chọn (không tốn lượt).
        this.state.phase = 'switch';
        this.log('Choose your next Pokémon!', 'system');
        this.broadcast('battle_need_switch', { type: 'battle_need_switch' });
      }
    }
  }

  private handleSwitch(client: Client, pokemonIndex: number): void {
    if (this.ended) return;
    if (!this.sessionSide.has(client.sessionId)) return;
    const phase = this.state.phase;
    if (phase !== 'select' && phase !== 'switch') return;
    const s = this.state.ally;
    if (typeof pokemonIndex !== 'number' || !Number.isInteger(pokemonIndex)) return;
    if (pokemonIndex === s.activeIndex) return;
    const target = s.team[pokemonIndex];
    if (!target || target.currentHp <= 0) return;

    s.activeIndex = pokemonIndex;
    this.participated.add(target.pokemonId);
    this.log(`Go! ${target.nickname}!`, 'system');

    if (phase === 'select') {
      // Đổi pokemon tốn 1 lượt → foe đánh trả.
      this.clearTurnTimer();
      this.state.phase = 'anim';
      this.executeMove(this.state.foe, this.state.ally, this.foeAI());
      if (this.ended) return;
      this.handleFaints();
      if (this.ended) return;
      this.nextTurn();
    } else {
      // Đổi sau khi gục → tiếp tục chọn.
      this.nextTurn();
    }
  }

  private handleRun(client: Client): void {
    if (this.ended || this.state.phase !== 'select') return;
    if (!this.sessionSide.has(client.sessionId)) return;
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
    this.executeMove(this.state.foe, this.state.ally, this.foeAI());
    if (this.ended) return;
    this.handleFaints();
    if (this.ended) return;
    this.nextTurn();
  }

  private handleCatch(client: Client, ballId?: string): void {
    if (this.ended || this.state.phase !== 'select') return;
    if (!this.sessionSide.has(client.sessionId)) return;
    const f = this.activeOf(this.state.foe);
    if (!f) return;
    const species = gameData.getSpecies(f.speciesId);
    if (!species) return;

    this.clearTurnTimer();
    this.state.phase = 'anim';

    const ball = ballId ?? 'pokeball';
    const multiplier = ballMultiplierFor(ball);
    this.log(`You threw a ${ball === 'pokeball' ? 'Poké Ball' : ball}!`, 'system');
    const result = attemptCatch(species, f.currentHp, f.maxHp, f.status || null, multiplier);

    if (result.caught) {
      this.log(result.message, 'result');
      this.state.caughtSpeciesId = f.speciesId;
      void this.insertCaughtPokemon(f, species);
      this.endBattle('ally', 'caught');
      return;
    }

    this.log(result.message, 'fail');
    this.executeMove(this.state.foe, this.state.ally, this.foeAI());
    if (this.ended) return;
    this.handleFaints();
    if (this.ended) return;
    this.nextTurn();
  }

  private handleForfeit(client: Client): void {
    if (this.ended) return;
    if (!this.sessionSide.has(client.sessionId)) return;
    this.log('You gave up the battle!', 'result');
    this.endBattle('foe', 'forfeit');
  }

  // ── Kết thúc trận ──────────────────────────────────────────────────────

  private endBattle(winner: 'ally' | 'foe' | 'draw', result: string): void {
    if (this.ended) return;
    this.ended = true;
    this.clearTurnTimer();

    this.state.winner = winner;
    this.state.result = result;
    this.state.phase = 'ended';

    if (winner === 'ally' && result === 'victory') {
      this.state.expGained = this.grantExp();
      this.log(`You won the battle! Gained ${this.state.expGained} EXP!`, 'result');
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

  private publishBattleEnd(): void {
    if (!this.worldSessionId) return;
    this.presence.publish('battle_end', { sessionId: this.worldSessionId });
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

    const gain = calcExpGain(foe.level, species.baseExperience, share.length, true);
    let total = 0;

    for (const m of share) {
      const sp = gameData.getSpecies(m.speciesId);
      if (!sp) continue;
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
      }
      m.expToNext = Math.max(1, expForLevel(m.level + 1, sp.growthRate) - m.exp);
      // Đồng bộ snapshot → schema cho client.
      const idx = this.state.ally.team.findIndex((p) => p.pokemonId === m.id);
      if (idx >= 0) this.syncMemberToSchema(this.state.ally.team[idx]!, m);
    }
    return total;
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

  /** Ghi lại HP/EXP/level/status của party vào DB. */
  private async saveResults(): Promise<void> {
    if (!this.userId) return;
    try {
      for (const m of this.allySnapshot) {
        await pool.query(
          `UPDATE pokemon
              SET current_hp = $1, level = $2, exp = $3, stats = $4, status = $5
            WHERE id = $6 AND owner_id = $7`,
          [
            Math.max(0, Math.min(m.maxHp, m.currentHp)),
            m.level,
            m.exp,
            JSON.stringify(m.stats),
            m.status || null,
            m.id,
            this.userId,
          ],
        );
      }
      console.log(
        `[battle] ${this.roomId} results saved (${this.allySnapshot.length} pokemon, exp=${this.state.expGained})`,
      );
    } catch (err) {
      console.error('[battle] failed to save results:', err);
    }
  }

  /** Pokémon vừa bắt được → insert vào party (nếu <6) hoặc box. */
  private async insertCaughtPokemon(foe: BattlePokemon, species: Species): Promise<void> {
    if (!this.userId) return;
    try {
      const { generatePokemon } = await import('@pixelmon/shared');
      // Sinh lại đúng chuẩn (IV/nature/moveset theo level) — con bắt được.
      const owned = generatePokemon(
        species,
        foe.level,
        gameData.getMovesForLevel.bind(gameData),
        Math.random,
        'wild',
      );
      const partyCountRes = await pool.query(
        `SELECT count(*)::int AS c FROM pokemon WHERE owner_id = $1 AND party_slot IS NOT NULL`,
        [this.userId],
      );
      const partyCount = Number(partyCountRes.rows[0]?.c ?? 0);
      const slot = partyCount < 6 ? partyCount : null;

      await pool.query(
        `INSERT INTO pokemon (
          id, owner_id, species_id, nickname, level, exp, ivs, evs, stats, current_hp, moves, status, shiny, party_slot, nature, gender
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
          owned.nature.name,
          owned.gender,
        ],
      );
      console.log(
        `[battle] ${this.roomId} caught ${owned.speciesId} Lv.${owned.level} → ${slot === null ? 'box' : `party slot ${slot}`}`,
      );
    } catch (err) {
      console.error('[battle] failed to insert caught pokemon:', err);
    }
  }
}
