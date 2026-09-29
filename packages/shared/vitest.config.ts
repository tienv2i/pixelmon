import type { Config } from 'vitest/config';

export default <Config>{
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
};
