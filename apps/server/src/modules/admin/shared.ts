/** Hằng số dùng chung cho thư viện sprite. */
export const SPRITES = {
  /** 4 hướng × 3 frame */
  FRAME_COUNT: 12,
  DIRS: ['down', 'up', 'left', 'right'] as const,
  FRAME_SIZE: 32,
  BASE_URL: '/sprites',
  MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
} as const;
