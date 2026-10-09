/**
 * Evolution resolver — SSOT gộp MỌI method tiến hoá (level / item / trade /
 * friendship / move) vào một lần gọi duy nhất.
 *
 * Thay thế `evolveSpecies()` cũ (landmine: luôn `return null`).
 * Thuần tuý — không I/O; caller (server) lo phần recompute stats + ghi DB.
 */
import type { Species, EvolutionEntry } from '../data/contracts.js';

/**
 * Item id đá tiến hoá (khớp `evolutions[].item` trong data).
 * Data gốc để các đá này ở `category:'misc'` → dùng danh sách này để gán
 * `category:'evolution'` + dựng `evo_stone` effect.
 */
export const EVOLUTION_STONE_IDS = [
  'firestone',
  'waterstone',
  'thunderstone',
  'leafstone',
  'moonstone',
  'sunstone',
  'duskstone',
  'dawnstone',
  'shinystone',
  'icestone',
  'tartapple',
  'sweetapple',
  'crackedpot',
] as const;

export type EvolutionStoneId = (typeof EVOLUTION_STONE_IDS)[number];

const STONE_SET: ReadonlySet<string> = new Set(EVOLUTION_STONE_IDS);

/** Item id này có phải đá tiến hoá không. */
export function isEvolutionStone(itemId: string): itemId is EvolutionStoneId {
  return STONE_SET.has(itemId);
}

/** Ngưỡng friendship để tiến hoá (chuẩn mainline: 160). */
export const FRIENDSHIP_EVO_THRESHOLD = 160;

export type EvolutionMethod = EvolutionEntry['method'];

export type EvolutionSkipMethod = 'none' | EvolutionMethod;

export interface EvolutionContext {
  /** Level hiện tại của Pokémon (dùng cho method `level`). */
  level: number;
  /** Friendship 0..255 (dùng cho method `friendship`). */
  friendship?: number;
  /** Item id vừa dùng (đá tiến hoá) — dùng cho method `item`. */
  usedItemId?: string;
  /** Danh sách move id Pokémon đang biết — dùng cho method `move`. */
  knownMoves?: readonly string[];
  /**
   * Server quyết định — client KHÔNG được gửi cờ này.
   * Bật khi Pokémon vừa được giao dịch với NPC.
   */
  tradeWithNpc?: boolean;
  /** Bỏ qua method này (dùng khi người chơi đã giữ đá nhưng chưa học evolve). */
  skipMethod?: EvolutionSkipMethod;
}

export interface EvolutionResolution {
  targetId: string;
  method: EvolutionMethod;
  /** Level yêu cầu (method `level`) — để client hiển thị. */
  requiredLevel?: number;
}

/** Method này có bị `skipMethod` loại bỏ không. */
function skipped(method: EvolutionMethod, skip?: EvolutionSkipMethod): boolean {
  return skip === method;
}

/**
 * Kiểm tra 1 entry có thoả điều kiện không (method đã được xác định từ entry).
 * Không kiểm tra `skipMethod` — caller lo.
 */
function entrySatisfied(evo: EvolutionEntry, ctx: EvolutionContext): boolean {
  switch (evo.method) {
    case 'level': {
      // entry thiếu `level` → coi như không thoả (data thiếu, an toàn).
      if (evo.level === undefined) return false;
      return ctx.level >= evo.level;
    }
    case 'item': {
      if (!evo.item) return false;
      return ctx.usedItemId === evo.item;
    }
    case 'trade':
      return ctx.tradeWithNpc === true;
    case 'friendship': {
      const need = evo.condition?.minFriendship;
      const threshold =
        typeof need === 'number' ? need : FRIENDSHIP_EVO_THRESHOLD;
      return (ctx.friendship ?? 0) >= threshold;
    }
    case 'move': {
      if (!evo.move) return false;
      return (ctx.knownMoves ?? []).includes(evo.move);
    }
    default:
      return false;
  }
}

/**
 * Gộp mọi method, gọi 1 lần — trả về targetId nếu thoả.
 *
 * **Thứ tự ưu tiên** (theo plan 45 §0.2):
 * `skipMethod` loại bỏ → `trade` → `level` → `item` → `friendship` → `move`.
 *
 * Lý do: khi vừa trade vừa lên level cùng lúc, mainline ưu tiên trade;
 * đá tiến hoá được ưu tiên trên friendship/move vì player đã chủ động dùng đồ.
 *
 * @param resolveTarget - kiểm tra targetId có tồn tại trong data (optional).
 */
export function resolveEvolution(
  species: Species,
  ctx: EvolutionContext,
  resolveTarget?: (id: string) => unknown,
): EvolutionResolution | null {
  const list = species.evolutions;
  if (!list || list.length === 0) return null;

  const exists = (id: string) => (resolveTarget ? Boolean(resolveTarget(id)) : true);

  const find = (method: EvolutionMethod): EvolutionResolution | null => {
    if (skipped(method, ctx.skipMethod)) return null;
    for (const evo of list) {
      if (evo.method !== method) continue;
      if (!exists(evo.to)) continue;
      if (!entrySatisfied(evo, ctx)) continue;
      return { targetId: evo.to, method, requiredLevel: evo.level };
    }
    return null;
  };

  // Người chơi CHỦ ĐỘNG dùng đá → `item` phải đứng TRƯỚC `level`. Nếu không,
  // eevee Lv16+ (hoặc kirlia Lv30+) dùng Water/Dawn Stone sẽ tiến hoá theo level
  // (Leafeon / Gardevoir) thay vì theo đá (Vaporeon / Gallade) — mất đá + sai loài.
  if (ctx.usedItemId) {
    return (
      find('trade') ??
      find('item') ??
      find('level') ??
      find('friendship') ??
      find('move')
    );
  }

  return (
    find('trade') ??
    find('level') ??
    find('item') ??
    find('friendship') ??
    find('move')
  );
}

/** TargetId cho MỘT method cụ thể (dùng cho precheck / admin tools). */
export function evolutionTargetForMethod(
  species: Species,
  method: EvolutionMethod,
): string[] {
  return species.evolutions
    .filter((e) => e.method === method)
    .map((e) => e.to);
}

/** Method `level` mà species có thể đạt tối thiểu (để client hiện "Lv.16 → Raichu"). */
export function nextLevelEvolution(
  species: Species,
  level: number,
): { targetId: string; atLevel: number } | null {
  let best: { targetId: string; atLevel: number } | null = null;
  for (const evo of species.evolutions) {
    if (evo.method !== 'level' || evo.level === undefined) continue;
    if (evo.level <= level) continue;
    if (!best || evo.level < best.atLevel) {
      best = { targetId: evo.to, atLevel: evo.level };
    }
  }
  return best;
}
