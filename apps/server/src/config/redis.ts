import Redis from 'ioredis';
import { config } from './env.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('connect', () => console.log('[redis] connected'));
redis.on('error', (err: Error) => console.error('[redis] error:', err.message));

/**
 * Đóng kết nối Redis.
 * Bắt buộc gọi trong script CLI (seed, user-admin) — nếu không, ioredis giữ
 * event loop mở và process không thoát.
 */
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

/** Simple session token cache: userId -> sessionId */
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export async function cacheSession(userId: string, sessionId: string): Promise<void> {
  await redis.set(`session:${userId}`, sessionId, 'EX', SESSION_TTL);
}

export async function getCachedSession(userId: string): Promise<string | null> {
  return redis.get(`session:${userId}`);
}

export async function clearSession(userId: string): Promise<void> {
  await redis.del(`session:${userId}`);
}

/** Player online tracking: username -> room sessionId */
export async function setPlayerOnline(username: string, roomId: string): Promise<void> {
  await redis.set(`online:${username}`, roomId, 'EX', 60 * 60);
}

export async function setPlayerOffline(username: string): Promise<void> {
  await redis.del(`online:${username}`);
}
