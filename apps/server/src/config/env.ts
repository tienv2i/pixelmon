export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  WS_PORT: Number(process.env.WS_PORT ?? 2567),
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgres://user:password@localhost:5432/pixelmon',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};

export function assertEnv() {
  if (!env.DATABASE_URL || !env.REDIS_URL || !env.JWT_SECRET) {
    throw new Error('Missing required environment variables');
  }
}
