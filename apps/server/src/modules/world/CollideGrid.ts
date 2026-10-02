/**
 * CollideGrid — bản server-side của `CollisionGrid` (client).
 *
 * Nguồn SSOT vẫn là `packages/shared/data/maps/server/*.json`, nạp qua `mapLoader`.
 * Cả hai dùng chung một bộ logic trong `formulas/mapruntime.ts` nên client & server
 * không bao giờ lệch nhau về chuyện "ô này đi được hay không".
 *
 * Chỉ server import module này (dùng `fs`); client import `apps/client/src/world/CollisionGrid.ts`.
 */
import { mapLoader } from '@pixelmon/shared/data';
import {
  isWalkable,
  isWater,
  isGrass,
  isLedge,
  getLedgeDirection,
  getWarpAt,
  getCollisionFlag,
  CollisionFlag,
  type ServerMap,
  type WalkableOptions,
} from '@pixelmon/shared';

/** Hướng di chuyển 4 chiều. */
export type Dir = 'up' | 'down' | 'left' | 'right';

/** Vector đơn vị của 4 hướng. */
export const DIR_VECTOR: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** Các hướng đối diện (dùng validate warp `direction`). */
const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function isDir(v: unknown): v is Dir {
  return v === 'up' || v === 'down' || v === 'left' || v === 'right';
}

export function normalizeDir(v: unknown, fallback: Dir = 'down'): Dir {
  return isDir(v) ? v : fallback;
}

export class CollideGrid {
  constructor(readonly map: ServerMap) {}

  get mapId(): string {
    return this.map.mapId;
  }
  get width(): number {
    return this.map.width;
  }
  get height(): number {
    return this.map.height;
  }

  /** Ô có trong biên map không? */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Ô đi được không? (water cần `canSurf`). */
  walkable(x: number, y: number, opts: WalkableOptions = {}): boolean {
    return isWalkable(this.map, x, y, opts);
  }

  water(x: number, y: number): boolean {
    return isWater(this.map, x, y);
  }
  grass(x: number, y: number): boolean {
    return isGrass(this.map, x, y);
  }
  ledge(x: number, y: number): boolean {
    return isLedge(this.map, x, y);
  }
  /** Hướng rơi của ledge, `null` nếu không phải ledge. */
  ledgeDir(x: number, y: number): Dir | null {
    return getLedgeDirection(this.map, x, y);
  }
  /** Ô ledge có cho nhảy theo `dir` không. */
  ledgeAllows(x: number, y: number, dir: Dir): boolean {
    return getLedgeDirection(this.map, x, y) === dir;
  }
  warpAt(x: number, y: number) {
    return getWarpAt(this.map, x, y);
  }
  flag(x: number, y: number): number {
    return getCollisionFlag(this.map, x, y);
  }
  /** Ô warp trong collision bitmask (bit 0x80). */
  hasWarpBit(x: number, y: number): boolean {
    return (this.flag(x, y) & CollisionFlag.WARP) !== 0;
  }

  /**
   * Tìm ô walkable gần nhất (vòng xoáy, bán kính `maxRadius`).
   * Dùng cho spawn & warp landing → không bao giờ rơi vào tường.
   *
   * - Nếu ô đích walkable → **luôn trả về ô đó** (warp dest là chính xác, kể cả
   *   cửa kín 3 hướng; chấm điểm độ thoáng chỉ áp dụng khi ô đích KHÔNG walkable).
   * - Nếu ô đích blocked → ưu tiên ô thoáng nhất trong bán kính, tránh kẹt góc/tường.
   */
  nearestWalkable(
    x: number,
    y: number,
    opts: WalkableOptions = {},
    maxRadius = 8,
  ): { x: number; y: number } | null {
    if (this.walkable(x, y, opts)) return { x, y };
    let best: { x: number; y: number; score: number } | null = null;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!this.walkable(nx, ny, opts)) continue;
          const score = this.openNeighborCount(nx, ny, opts);
          if (!best || score > best.score) {
            best = { x: nx, y: ny, score };
          }
          // Điểm tối đa = 4 (ô giữa trống) → dừng sớm nếu đã đạt.
          if (score >= 4) return { x: nx, y: ny };
        }
      }
    }
    if (best) return { x: best.x, y: best.y };
    return null;
  }

  /** Đếm số ô walkable 4 hướng xung quanh — proxy cho "độ thoáng" của ô. */
  private openNeighborCount(x: number, y: number, opts: WalkableOptions): number {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let n = 0;
    for (const [dx, dy] of dirs) {
      if (this.walkable(x + dx, y + dy, opts)) n++;
    }
    return n;
  }
}

/** Snap pixel → tọa độ ô (tile size 32px — khớp `TILE_SIZE`). */
export function pixelToTile(px: number, py: number): { x: number; y: number } {
  return { x: Math.floor(px / 32), y: Math.floor(py / 32) };
}

/** Tâm pixel của ô. */
export function tileToPixel(col: number, row: number): { x: number; y: number } {
  return { x: col * 32 + 16, y: row * 32 + 16 };
}

/** Điều kiện di chuyển 1 bước (hoặc nhảy ledge 2 ô) — validate ở server. */
export interface StepValidation {
  ok: boolean;
  /** Lý do từ chối (chỉ ghi log / trả về debug). */
  reason?: string;
  /** Landed tile (nếu nhảy ledge → ô đích đã tính). */
  to?: { x: number; y: number };
}

/**
 * Validate 1 bước di chuyển tile-based từ ô `from` sang ô `to`.
 *
 * Luật:
 * - `to` phải cách `from` đúng 1 ô theo 4 hướng (hoặc 2 ô nếu nhảy ledge).
 * - `to` phải walkable (trừ ledge: ô đích đã tính).
 * - Nếu ô đứng `from` là ledge → chỉ được đi theo đúng hướng ledge (2 ô),
 *   các hướng khác bị chặn.
 * - Không có ledge → chỉ được bước 1 ô.
 */
export function validateStep(
  grid: CollideGrid,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: WalkableOptions = {},
): StepValidation {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Ledge nhảy 2 ô
  const isLedgeHop = Math.abs(dx) <= 2 && Math.abs(dy) <= 2 && (Math.abs(dx) === 2 || Math.abs(dy) === 2);
  const isSingleStep = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (Math.abs(dx) + Math.abs(dy)) === 1;

  if (isLedgeHop) {
    // Chỉ hợp lệ khi ô `from` là ledge và hướng nhảy khớp hướng ledge.
    if (!grid.ledge(from.x, from.y)) {
      return { ok: false, reason: 'ledge_hop_without_ledge' };
    }
    // Hướng nhảy = hướng vector (nếu nhảy chéo thì coi là sai).
    if (dx !== 0 && dy !== 0) return { ok: false, reason: 'ledge_hop_diagonal' };
    const hopDir: Dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    if (!grid.ledgeAllows(from.x, from.y, hopDir)) {
      return { ok: false, reason: 'ledge_wrong_direction' };
    }
    if (!grid.walkable(to.x, to.y, opts)) {
      return { ok: false, reason: 'ledge_landing_blocked' };
    }
    return { ok: true, to };
  }

  if (!isSingleStep) return { ok: false, reason: 'not_adjacent' };

  // Đứng trên ledge → chỉ được nhảy (2 ô), không được bước 1 ô.
  if (grid.ledge(from.x, from.y)) {
    return { ok: false, reason: 'on_ledge_must_hop' };
  }

  if (!grid.walkable(to.x, to.y, opts)) {
    return { ok: false, reason: 'destination_blocked' };
  }
  return { ok: true, to };
}

/** Distance check speed limit — pixel. */
export const MAX_STEP_PX = 32; // 1 ô
export const MAX_LEDGE_PX = 64; // 2 ô

/** Gán quyền surf theo trạng thái server (hiện luôn false — chưa có HM Surf). */
export const DEFAULT_WALK_OPTS: WalkableOptions = { canSurf: false };

/** Trả về grid của map (nạp qua mapLoader nếu chưa cache). */
export async function getGrid(mapId: string): Promise<CollideGrid> {
  const map = await mapLoader.load(mapId);
  return new CollideGrid(map);
}
