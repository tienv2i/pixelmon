import { pixelToTile, tileToPixel } from './PlaceholderMap';

interface Pt {
  col: number;
  row: number;
}

/** Hàm kiểm tra 1 ô có đi được không (thường là `CollisionGrid.isWalkable`). */
export type TileCollider = (col: number, row: number) => boolean;

/**
 * A* pathfinding trên grid walkable của map hiện tại.
 *
 * `isWalkable` phải là collider thật của map (Client `CollisionGrid`); nếu không
 * truyền, dùng mặc định "luôn đi được" để giữ tương thích ngược.
 *
 * Trả về danh sách ô đích → gốc (**đã loại ô xuất phát**, vì đó là vị trí hiện tại).
 */
export function findPath(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  isWalkable: TileCollider = () => true,
): Pt[] {
  const start = pixelToTile(fromX, fromY);
  const goal = pixelToTile(toX, toY);

  // Nếu đích đứng trên ô bị chặn → tìm ô đi được gần nhất
  const target = isWalkable(goal.col, goal.row) ? goal : nearestWalkable(goal, isWalkable);
  if (!target) return [];

  // Nếu điểm xuất phát đang ở ô blocked (ví dụ vừa tắt noclip hoặc kẹt tường)
  let searchStart = start;
  let escapeStep: Pt | null = null;
  if (!isWalkable(start.col, start.row)) {
    const safe = nearestWalkable(start, isWalkable);
    if (safe) {
      searchStart = safe;
      escapeStep = safe;
    }
  }

  if (target.col === start.col && target.row === start.row) {
    return escapeStep ? [escapeStep] : [];
  }

  const open = new Map<number, Node>();
  const closed = new Set<number>();
  const key = (c: number, r: number) => r * 100000 + c;

  const h = (a: Pt, b: Pt) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  const startNode: Node = {
    col: searchStart.col,
    row: searchStart.row,
    g: 0,
    f: h(searchStart, target),
    parent: null,
  };
  open.set(key(searchStart.col, searchStart.row), startNode);

  let guard = 0;
  const MAX_NODES = 100000;

  while (open.size > 0 && guard++ < MAX_NODES) {
    // Chọn node f nhỏ nhất
    let current: Node | null = null;
    let bestKey = -1;
    for (const [k, n] of open) {
      if (!current || n.f < current.f) {
        current = n;
        bestKey = k;
      }
    }
    if (!current) break;

    open.delete(bestKey);
    closed.add(bestKey);

    if (current.col === target.col && current.row === target.row) {
      const res = reconstruct(current);
      if (escapeStep) {
        if (res.length === 0 || (res[0].col !== escapeStep.col || res[0].row !== escapeStep.row)) {
          res.unshift(escapeStep);
        }
      }
      return res;
    }

    for (const [dc, dr] of NEIGHBORS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (!isWalkable(nc, nr)) continue;
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;

      const moveCost = 1;
      const g = current.g + moveCost;
      const existing = open.get(nk);
      if (existing && g >= existing.g) continue;

      open.set(nk, {
        col: nc,
        row: nr,
        g,
        f: g + h({ col: nc, row: nr }, target),
        parent: current,
      });
    }
  }

  return escapeStep ? [escapeStep] : [];
}

const NEIGHBORS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

interface Node extends Pt {
  g: number;
  f: number;
  parent: Node | null;
}

function reconstruct(node: Node): Pt[] {
  const path: Pt[] = [];
  let n: Node | null = node;
  while (n && n.parent) {
    path.push({ col: n.col, row: n.row });
    n = n.parent;
  }
  path.reverse();
  return path;
}

/** Tìm ô đi được gần nhất trong bán kính 12 ô (dùng collider). */
function nearestWalkable(p: Pt, isWalkable: TileCollider): Pt | null {
  for (let r = 1; r <= 12; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
        const c = p.col + dc;
        const row = p.row + dr;
        if (isWalkable(c, row)) return { col: c, row: row };
      }
    }
  }
  return null;
}

/** Chuyển path grid → tọa độ pixel (giữa tile), để nhân vật bám theo. */
export function pathToPixels(path: Pt[]): Array<{ x: number; y: number }> {
  return path.map((p) => tileToPixel(p.col, p.row));
}