/**
 * Theme — Palette + fonts + text‑style helpers.
 * Mọi file UI phải import từ đây, không hardcode màu.
 */

// ── Palette ──────────────────────────────────────────────────────────────
export const C = {
  /** Nền canvas / body */
  bg: 0x0f1020,
  /** Panel / card background */
  panel: 0x1c1f3a,
  /** Border chung */
  border: 0x2e3358,
  /** Accent chính (cyan) */
  accent: 0x00cec9,
  /** Accent phụ (tím) */
  accent2: 0x6c5ce7,
  /** Text chính */
  text: '#e8eaf6',
  /** Text phụ / muted */
  muted: '#9aa0c3',
  /** HP full / ok */
  ok: 0x00b894,
  /** HP warning / exp */
  warn: 0xfdcb6e,
  /** Error / low HP */
  err: 0xff7675,
  /** Overlay tối */
  overlay: 0x0f1020,
  /** Player shadow */
  shadow: 0x000000,
  /** Grassy tile */
  grass: 0x3a7d44,
  /** Path tile */
  path: 0x8b6b47,
  /** Water tile */
  water: 0x3498db,
  /** Tree foliage */
  tree: 0x27ae60,
  /** Roof */
  roof: 0xc0392b,
  /** Wall */
  wall: 0x7f8c8d,
  /** Door */
  door: 0xd35400,
  /** Flower */
  flower: 0xe74c3c,
  /** Grass alternate (sáng hơn) */
  grassAlt: 0x4a9d55,
  /** White pixel helper */
  white: 0xffffff,
} as const;

// ── Font families ────────────────────────────────────────────────────────
export const FONT = {
  mono: 'monospace',
  ui: 'system-ui, -apple-system, sans-serif',
  sans: 'system-ui, -apple-system, sans-serif',
} as const;

// ── Phaser text‑style factories ──────────────────────────────────────────

/**
 * Tạo config chuẩn cho `scene.add.text()`.
 * `size` tính bằng px; `color` là CSS string từ palette.
 */
export function ts(size: number, color: string = C.text, fontFamily: string = FONT.mono) {
  return { fontSize: `${size}px`, fontFamily, color } as const;
}

/** Style label nhỏ (HUD value). */
export function labelStyle(sz = 12) {
  return ts(sz, '#9aa0c3');
}
