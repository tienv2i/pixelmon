import { pool } from '../../config/index.js';
import { gameData } from '@pixelmon/shared/data';
import { expForLevel, generatePokemon, type OwnedPokemon } from '@pixelmon/shared';

/**
 * Battle party helper (Plan 44 Phase 0/2).
 *
 * Nguồn sự thật cho đội hình khi vào trận là **database**, không phải dữ liệu
 * client gửi lên (chống cheat: client không thể tự khai level 100).
 */

/** 1 thành viên đội đã chuẩn hoá — dùng chung cho DB row và `generatePokemon`. */
export interface BattleTeamMember {
  /** `pokemon.id` trong DB (dùng để ghi lại HP/EXP sau trận). */
  id: string;
  speciesId: string;
  nickname: string;
  level: number;
  exp: number;
  /** EXP cần thêm để lên level tiếp theo. */
  expToNext: number;
  types: string[];
  /** `stats.hp` = max HP. */
  stats: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  maxHp: number;
  currentHp: number;
  status: string;
  /** Giới tính: `male` | `female` | `genderless` — hiển thị ♂/♀ trên info plate. */
  gender: string;
  /** Item đang cầm (Plan 45) — trống = chưa cầm. */
  heldItem?: string;
  shiny: boolean;
  moves: BattleMoveSlot[];
  /** IV/EV/nature — dùng để recompute stats khi level-up (Plan 44 Phase 2). */
  ivs: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  evs: { hp: number; attack: number; defense: number; spAttack: number; spDefense: number; speed: number };
  natureName: string;
}

/** Move đầy đủ (PP, type, power…) — schema `BattlePokemon.moves` chỉ giữ id + pp. */
export interface BattleMoveSlot {
  id: string;
  name: string;
  type: string;
  category: string;
  power: number | null;
  accuracy: number;
  maxPp: number;
  currentPp: number;
  priority: number;
  /** Mô tả chiêu (client hiện ở popup hover trong BattleModal). */
  description?: string;
}

/** Row từ bảng `pokemon` (subset cần dùng). */
interface PokemonDbRow {
  id: string;
  species_id: string;
  nickname: string | null;
  level: number;
  exp: number | null;
  stats: Record<string, number> | null;
  current_hp: number | null;
  moves: unknown;
  status: string | null;
  gender: string | null;
  shiny: boolean | null;
  ivs: Record<string, number> | null;
  evs: Record<string, number> | null;
  /**
   * DB lưu `nature` dạng JSONB **object** (`{name,increases,decreases}` —
   * xem generator.ts) chứ không phải string. Giữ union để chịu được cả 2
   * shape (dữ liệu cũ có thể chỉ là tên).
   */
  nature: { name?: string } | string | null;
  held_item: string | null;
}

/** Bóc tên nature từ giá trị DB (object JSONB hoặc string) → luôn là string. */
function normalizeNature(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string') {
    const name = (raw as { name: string }).name.trim();
    if (name) return name;
  }
  return 'hardy';
}

/** `stats` trong DB có thể thiếu field → luôn trả về đủ 6 chỉ số. */
function normalizeStats(raw: Record<string, number> | null): BattleTeamMember['stats'] {
  const n = (v: unknown, fallback: number) => (typeof v === 'number' && v > 0 ? v : fallback);
  return {
    hp: n(raw?.hp, 10),
    attack: n(raw?.attack, 5),
    defense: n(raw?.defense, 5),
    spAttack: n(raw?.spAttack, 5),
    spDefense: n(raw?.spDefense, 5),
    speed: n(raw?.speed, 5),
  };
}

/** IV/EV: 0 là giá trị hợp lệ → chỉ default khi thiếu/không phải số. */
function normalizeSpread(raw: Record<string, number> | null): BattleTeamMember['ivs'] {
  const n = (v: unknown) => (typeof v === 'number' && v >= 0 ? Math.floor(v) : 0);
  return {
    hp: n(raw?.hp),
    attack: n(raw?.attack),
    defense: n(raw?.defense),
    spAttack: n(raw?.spAttack),
    spDefense: n(raw?.spDefense),
    speed: n(raw?.speed),
  };
}

/** `moves` trong DB là JSON array (MoveSlot hoặc {id, ...}) → chuẩn hoá. */
function normalizeMoves(raw: unknown): BattleMoveSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: BattleMoveSlot[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const mv = m as Record<string, unknown>;
    const id = String(mv.id ?? '');
    if (!id) continue;
    // Ưu tiên dữ liệu game chuẩn (chính xác hơn snapshot trong DB).
    const def = gameData.getMove(id);
    out.push({
      id,
      name: def?.name ?? String(mv.name ?? id),
      type: def?.type ?? String(mv.type ?? 'normal'),
      category: def?.category ?? String(mv.category ?? 'physical'),
      power: def?.power ?? (typeof mv.power === 'number' ? mv.power : null),
      accuracy: def?.accuracy ?? (typeof mv.accuracy === 'number' ? mv.accuracy : 100),
      maxPp: def?.pp ?? (typeof mv.maxPp === 'number' ? mv.maxPp : 10),
      currentPp:
        typeof mv.currentPp === 'number' && mv.currentPp > 0
          ? mv.currentPp
          : (def?.pp ?? (typeof mv.maxPp === 'number' ? mv.maxPp : 10)),
      priority: def?.priority ?? (typeof mv.priority === 'number' ? mv.priority : 0),
      description: def?.description ?? (typeof mv.description === 'string' ? mv.description : ''),
    });
  }
  return out;
}

/** EXP cần để lên level tiếp theo (0 nếu đã max level). */
function expToNextFor(speciesId: string, level: number): number {
  if (level >= 100) return 0;
  const growth = gameData.getSpecies(speciesId)?.growthRate ?? 'mediumFast';
  return Math.max(1, expForLevel(level + 1, growth) - expForLevel(level, growth));
}

/** Chuyển 1 row DB → `BattleTeamMember`. */
function rowToMember(row: PokemonDbRow): BattleTeamMember {
  const stats = normalizeStats(row.stats);
  const species = gameData.getSpecies(row.species_id);
  const level = Math.max(1, Number(row.level) || 1);
  return {
    id: row.id,
    speciesId: row.species_id,
    nickname: row.nickname || species?.name || row.species_id,
    level,
    exp: Number(row.exp) || 0,
    expToNext: expToNextFor(row.species_id, level),
    types: species?.types ? [...species.types] : ['normal'],
    stats,
    maxHp: stats.hp,
    currentHp: Math.max(0, Math.min(stats.hp, Number(row.current_hp ?? stats.hp))),
    status: row.status ?? '',
    gender: row.gender ?? 'genderless',
    heldItem: row.held_item ?? '',
    shiny: Boolean(row.shiny),
    moves: normalizeMoves(row.moves),
    ivs: normalizeSpread(row.ivs),
    evs: normalizeSpread(row.evs),
    natureName: normalizeNature(row.nature),
  };
}

/**
 * Load đội hình (party) của user từ DB.
 * Trả về mảng đã sort theo `party_slot` (0..5), Pokémon đã gục vẫn giữ
 * (BattleRoom tự lọc khi cần lên sân).
 */
export async function loadBattleParty(userId: string): Promise<BattleTeamMember[]> {
  if (!userId) return [];
  const { rows } = await pool.query(
    // PHẢI include `ivs`, `evs`, `nature`: `rowToMember` đọc trực tiếp từ row
    // (normalizeSpread/natureName) và `BattleRoom` recompute stats khi level-up.
    // Thiếu 3 cột này → IV/EV bị về 0, nature về hardy, rồi saveTeam() ghi đè
    // `stats` xuống DB = phá stat vĩnh viễn cho tới lần recompute kế tiếp.
    `SELECT id, species_id, nickname, level, exp, stats, current_hp, moves, status, gender, shiny,
            ivs, evs, nature, friendship, held_item
       FROM pokemon
      WHERE owner_id = $1 AND party_slot IS NOT NULL
      ORDER BY party_slot ASC`,
    [userId],
  );
  return (rows as PokemonDbRow[]).map(rowToMember);
}

/** Số thành viên còn sống trong đội. */
export function aliveCount(members: BattleTeamMember[]): number {
  return members.filter((m) => m.currentHp > 0).length;
}

/**
 * Chuyển Pokémon vừa `generatePokemon` (wild) → `BattleTeamMember`.
 * Dùng chung shape với party load từ DB để BattleRoom xử lý đồng nhất.
 */
export function ownedToMember(pkm: OwnedPokemon): BattleTeamMember {
  return {
    id: pkm.id,
    speciesId: pkm.speciesId,
    nickname: pkm.nickname || gameData.getSpecies(pkm.speciesId)?.name || pkm.speciesId,
    level: pkm.level,
    exp: pkm.exp,
    expToNext: expToNextFor(pkm.speciesId, pkm.level),
    types: [...pkm.types],
    stats: {
      hp: pkm.maxHp,
      attack: pkm.stats.attack,
      defense: pkm.stats.defense,
      spAttack: pkm.stats.spAttack,
      spDefense: pkm.stats.spDefense,
      speed: pkm.stats.speed,
    },
    maxHp: pkm.maxHp,
    currentHp: pkm.currentHp,
    status: pkm.status === 'none' ? '' : pkm.status,
    gender: pkm.gender,
    shiny: pkm.shiny,
    moves: normalizeMoves(pkm.moves),
    ivs: pkm.ivs,
    evs: pkm.evs,
    natureName: pkm.nature.name,
  };
}