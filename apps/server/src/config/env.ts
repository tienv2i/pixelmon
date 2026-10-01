import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 2567),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
  jwtExpiresIn: '7d',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/pixelmon',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
} as const;

export type AppConfig = typeof config;
