import { MAP_COLS, MAP_ROWS, isWalkableTile, pixelToTile, tileToPixel } from './PlaceholderMap';

interface Pt {
  col: number;
  row: number;
}

/**
 * A* pathfinding trên grid walkable của map placeholder.
 * Trả về danh sách ô đích → gốc (đã loại ô đầu, vì đó là vị trí hiện tại).
 */
export function findPath(fromX: number, fromY: number, toX: number, toY: number): Pt[] {
  const start = pixelToTile(fromX, fromY);
  const goal = pixelToTile(toX, toY);

  // Nếu đích đứng trên ô bị chặn → tìm ô đi được gần nhất
  const target = isWalkableTile(goal.col, goal.row) ? goal : nearestWalkable(goal);
  if (!target || (target.col === start.col && target.row === start.row)) return [];

  const open = new Map<number, Node>();
  const closed = new Set<number>();
  const key = (c: number, r: number) => r * MAP_COLS + c;

  const h = (a: Pt, b: Pt) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  const startNode: Node = {
    col: start.col,
    row: start.row,
    g: 0,
    f: h(start, target),
    parent: null,
  };
  open.set(key(start.col, start.row), startNode);

  let guard = 0;
  const MAX_NODES = MAP_COLS * MAP_ROWS;

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
      return reconstruct(current);
    }

    for (const [dc, dr] of NEIGHBORS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (!isWalkableTile(nc, nr)) continue;
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;

      const moveCost = dc !== 0 && dr !== 0 ? 1.4 : 1;
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

  return [];
}

const NEIGHBORS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
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

/** Tìm ô đi được gần nhất trong bán kính 6 ô. */
function nearestWalkable(p: Pt): Pt | null {
  for (let r = 1; r <= 6; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
        const c = p.col + dc;
        const row = p.row + dr;
        if (isWalkableTile(c, row)) return { col: c, row };
      }
    }
  }
  return null;
}

/** Chuyển path grid → tọa độ pixel (giữa tile), để nhân vật bám theo. */
export function pathToPixels(path: Pt[]): Array<{ x: number; y: number }> {
  return path.map((p) => tileToPixel(p.col, p.row));
}
