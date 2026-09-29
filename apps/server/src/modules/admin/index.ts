import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { authMiddleware } from '../auth/auth.middleware.js';
import { requireRole } from '../auth/roles.middleware.js';
import {
  makeListUsersHandler,
  makeSetRoleHandler,
  makeSetActiveHandler,
} from './admin.handlers.js';
import { UserRepository } from '../../repositories/user.repository.js';

export function createAdminRouter(db: DatabaseSync): Router {
  const users = new UserRepository(db);
  const router = Router();
  router.use(authMiddleware);
  router.get('/users', requireRole('moderator'), makeListUsersHandler(users));
  router.patch('/users/:id/role', requireRole('admin'), makeSetRoleHandler(users));
  router.patch('/users/:id/active', requireRole('admin'), makeSetActiveHandler(users));
  return router;
}
