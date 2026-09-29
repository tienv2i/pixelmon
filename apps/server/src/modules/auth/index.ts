import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authMiddleware } from './auth.middleware.js';
import { makeRegisterHandler, makeLoginHandler, makeMeHandler } from './auth.handlers.js';
import { UserRepository } from '../../repositories/user.repository.js';

export function createAuthRouter(db: DatabaseSync): Router {
  const users = new UserRepository(db);
  const router = Router();
  router.post('/register', makeRegisterHandler(users));
  router.post('/login', makeLoginHandler(users));
  router.get('/me', authMiddleware, makeMeHandler(users));
  return router;
}
