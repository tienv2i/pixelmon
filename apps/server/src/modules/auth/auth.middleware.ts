import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export interface JWTPayload {
  sub: string;
  username: string;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
