/**
 * requireAuth — Express middleware kiểm tra JWT Bearer token.
 * Gắn req.user = { userId, username, role } nếu hợp lệ, trả 401 nếu không.
 *
 * Dùng trong app.ts:
 *   app.get('/api/admin/...', requireAuth, handler)
 *   app.get('/api/admin/...', requireAuth, requireAdmin, handler)
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface AuthUser {
  userId: string;
  username: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Helper — casting an Express Request to AuthRequest,
 * avoiding module augmentation issues with strict TS.
 */
export function asAuth(req: Request): AuthRequest {
  return req as AuthRequest;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, code: 'NO_TOKEN', message: 'Authentication required' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      username: string;
      role?: string;
    };
    asAuth(req).user = {
      userId: payload.sub,
      username: payload.username,
      role: payload.role ?? 'player',
    };
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ ok: false, code: 'INVALID_TOKEN', message: 'Invalid token' });
      return;
    }
    next(err);
  }
}

/**
 * requireAdmin — chặn không phải admin (dùng sau requireAuth).
 * Trả 403 nếu role không phải 'admin'.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = asAuth(req);
  if (!auth.user) {
    res.status(401).json({ ok: false, code: 'NO_TOKEN', message: 'Authentication required' });
    return;
  }
  if (auth.user.role !== 'admin') {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Chỉ admin mới được truy cập' });
    return;
  }
  next();
}

/**
 * requireNotBanned — chặn user bị ban (dùng cho game API).
 * Trả 403 nếu role là 'banned'.
 */
export function requireNotBanned(req: Request, res: Response, next: NextFunction): void {
  const auth = asAuth(req);
  if (!auth.user) {
    res.status(401).json({ ok: false, code: 'NO_TOKEN' });
    return;
  }
  if (auth.user.role === 'banned') {
    res.status(403).json({ ok: false, code: 'BANNED', message: 'Tài khoản đã bị khóa' });
    return;
  }
  next();
}
