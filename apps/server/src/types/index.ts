import type { Server } from 'colyseus';
import type { NextFunction, Request, Response } from 'express';
import type { Schema } from '@colyseus/schema';

export interface WorldState extends Schema {
  [key: string]: any;
}

export interface BattleState extends Schema {
  [key: string]: any;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
  };
}

export type AsyncHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => Promise<void> | void;
