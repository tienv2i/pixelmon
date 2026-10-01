import { Room } from '@colyseus/core';
import { ArraySchema } from '@colyseus/schema';
import { BattleState, type BattleSide, BattlePokemon } from '@pixelmon/shared/schema';

interface BattleOptions {
  allyPlayerId: string;
  allyDisplayName: string;
  foePlayerId: string;
  foeDisplayName: string;
  isPvp: boolean;
  allyTeam: Record<string, unknown>[];
  foeTeam: Record<string, unknown>[];
}

/**
 * BattleRoom — Colyseus room cho turn-based Pokémon battle.
 *
 * Fix sau audit 2026-09-30:
 *  - sessionId thay vì userId để xác định ally/foe trong message handler
 *  - populateSide dùng ArraySchema.push đúng cách
 *  - check empty team trước resolveTurn
 *  - guard divide-by-zero trong applyAttack
 */
export class BattleRoom extends Room<BattleState> {
  maxClients = 2;

  /** Map sessionId → 'ally' | 'foe' (được set trong onJoin) */
  private sessionSide: Map<string, 'ally' | 'foe'> = new Map();

  onCreate(options: BattleOptions) {
    this.setState(new BattleState());
    this.state.isPvp = options.isPvp;
    this.state.turn = 1;
    this.state.battleId = this.roomId;

    // Populate sides
    this.populateSide(this.state.ally, options.allyTeam);
    this.state.ally.playerId = options.allyPlayerId ?? '';

    this.populateSide(this.state.foe, options.foeTeam);
    this.state.foe.playerId = options.foePlayerId ?? '';

    // ── Messages ──
    this.onMessage('battle_move', (client, data: { moveIndex: number }) => {
      const side = this.sessionSide.get(client.sessionId);
      if (!side) return;
      if (side === 'ally') {
        this.state.ally.selectedMove = data.moveIndex;
      } else {
        this.state.foe.selectedMove = data.moveIndex;
      }
      this.checkResolveTurn();
    });

    this.onMessage('battle_item', (client, data: { itemId: string }) => {
      console.log(`[battle] ${client.sessionId} used item ${data.itemId}`);
    });

    this.onMessage('battle_switch', (client, data: { pokemonIndex: number }) => {
      console.log(`[battle] ${client.sessionId} switches to slot ${data.pokemonIndex}`);
    });

    this.onMessage('battle_forfeit', (client) => {
      const side = this.sessionSide.get(client.sessionId);
      if (!side) return;
      this.state.winner = side === 'ally' ? 'foe' : 'ally';
      this.broadcast('battle_result', { type: 'battle_result', winner: this.state.winner });
      this.clock.setTimeout(() => this.disconnect(), 3000);
    });

    // Timeout
    this.clock.setTimeout(() => {
      if (!this.state.winner) {
        this.state.winner = 'draw';
        this.broadcast('battle_result', { type: 'battle_result', winner: 'draw' });
      }
    }, 60_000);
  }

  onJoin(client: Room['clients'][number]) {
    // Client đầu tiên = ally, client thứ hai = foe
    const side = this.sessionSide.size === 0 ? 'ally' : 'foe';
    this.sessionSide.set(client.sessionId, side);
    console.log(`[battle] ${client.sessionId} joined as ${side}`);
  }

  onLeave(client: Room['clients'][number]) {
    this.sessionSide.delete(client.sessionId);
  }

  private populateSide(side: BattleSide, teamData: Record<string, unknown>[]) {
    const team = new ArraySchema<BattlePokemon>();
    for (const p of teamData) {
      const pokemon = new BattlePokemon();
      pokemon.pokemonId = String(p.id ?? '');
      pokemon.speciesId = String(p.speciesId ?? p.id ?? '');
      pokemon.level = Number(p.level ?? 1);
      const stats = (p.stats ?? {}) as Record<string, number>;
      pokemon.currentHp = Number(p.currentHp ?? stats.hp ?? 1);
      pokemon.maxHp = Number(stats.hp ?? pokemon.currentHp);
      pokemon.attack = Number(stats.attack ?? 0);
      pokemon.defense = Number(stats.defense ?? 0);
      pokemon.spAttack = Number(stats.spAttack ?? 0);
      pokemon.spDefense = Number(stats.spDefense ?? 0);
      pokemon.speed = Number(stats.speed ?? 0);
      const moves = p.currentMoves as { moveId: string }[] | undefined;
      pokemon.moves = moves?.map((m) => m.moveId) ?? [];
      team.push(pokemon);
    }
    side.team = team;
  }

  private checkResolveTurn() {
    if (this.state.ally.selectedMove < 0 || this.state.foe.selectedMove < 0) return;
    this.resolveTurn();
  }

  private resolveTurn() {
    // Guard: empty teams → auto-draw
    if (this.state.ally.team.length === 0 || this.state.foe.team.length === 0) {
      this.state.winner = 'draw';
      this.broadcast('battle_result', { type: 'battle_result', winner: 'draw' });
      this.clock.setTimeout(() => this.disconnect(), 2000);
      return;
    }

    const allyPokemon = this.state.ally.team[this.state.ally.activeIndex];
    const foePokemon = this.state.foe.team[this.state.foe.activeIndex];
    if (!allyPokemon || !foePokemon) {
      this.state.winner = 'draw';
      this.broadcast('battle_result', { type: 'battle_result', winner: 'draw' });
      this.clock.setTimeout(() => this.disconnect(), 2000);
      return;
    }

    // Determine turn order by speed
    const firstIsAlly = allyPokemon.speed >= foePokemon.speed;

    if (firstIsAlly) {
      this.applyAttack(allyPokemon, foePokemon, this.state.ally.selectedMove, 'ally');
      if (foePokemon.currentHp > 0) {
        this.applyAttack(foePokemon, allyPokemon, this.state.foe.selectedMove, 'foe');
      }
    } else {
      this.applyAttack(foePokemon, allyPokemon, this.state.foe.selectedMove, 'foe');
      if (allyPokemon.currentHp > 0) {
        this.applyAttack(allyPokemon, foePokemon, this.state.ally.selectedMove, 'ally');
      }
    }

    // Check fainted — ally
    if (allyPokemon.currentHp <= 0) {
      const nextAlly = this.state.ally.team.findIndex(
        (p: BattlePokemon, i: number) => i !== this.state.ally.activeIndex && p.currentHp > 0,
      );
      if (nextAlly === -1) {
        this.state.winner = 'foe';
        this.broadcast('battle_result', { type: 'battle_result', winner: 'foe', expGained: 0 });
        this.clock.setTimeout(() => this.disconnect(), 2000);
        return;
      }
      this.state.ally.activeIndex = nextAlly;
    }

    // Check fainted — foe
    if (foePokemon.currentHp <= 0) {
      const nextFoe = this.state.foe.team.findIndex(
        (p: BattlePokemon, i: number) => i !== this.state.foe.activeIndex && p.currentHp > 0,
      );
      if (nextFoe === -1) {
        this.state.winner = 'ally';
        this.broadcast('battle_result', { type: 'battle_result', winner: 'ally', expGained: 50 });
        this.clock.setTimeout(() => this.disconnect(), 2000);
        return;
      }
      this.state.foe.activeIndex = nextFoe;
    }

    // Next turn
    this.state.turn += 1;
    this.state.ally.selectedMove = -1;
    this.state.foe.selectedMove = -1;
    this.broadcast('battle_state', {
      type: 'battle_state',
      battleId: this.state.battleId,
      turn: this.state.turn,
      phase: 'select',
    });
  }

  private applyAttack(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    moveIndex: number,
    side: 'ally' | 'foe',
  ) {
    // Guard divide-by-zero
    const def = defender.defense > 0 ? defender.defense : 1;
    const damage = Math.max(
      1,
      Math.floor((attacker.attack / def) * 10 * (1 + Math.random() * 0.3)),
    );
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    console.log(
      `[battle] ${side} move=${moveIndex} dmg=${damage} defender_hp=${defender.currentHp}`,
    );
  }
}
