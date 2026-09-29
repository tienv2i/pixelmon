import type { NextFunction, Request, Response } from 'express';
import type { Schema } from '@colyseus/schema';
import type { AuthUser } from './auth.js';

export interface WorldState extends Schema {
  [key: string]: unknown;
}

export interface BattleState extends Schema {
  [key: string]: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;
