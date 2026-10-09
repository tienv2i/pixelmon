/**
 * STORE_STOCK — danh sách hàng bán của cửa hàng (Plan 45 §2.2).
 *
 * Không filter toàn bộ `items.json` (561 item có buyPrice) để tránh leak +
 * dễ balance. Client fetch qua `GET /api/inventory/store`.
 */
export const STORE_STOCK: readonly string[] = [
  // Medicine
  'potion',
  'superpotion',
  'hyperpotion',
  'maxpotion',
  'revive',
  'maxrevive',
  'antidote',
  'paralyzeheal',
  'awakening',
  'iceheal',
  'burnheal',
  'fullheal',
  'ether',
  'elixir',
  // Balls
  'pokeball',
  'greatball',
  'ultraball',
  // Evolution stones (khớp `evolutions[].item`)
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
  // Special
  'rarecandy',
  'luckyegg',
  'everstone',
  'muscleband',
  'wiseglasses',
] as const;
