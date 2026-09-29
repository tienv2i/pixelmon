import express from 'express';
import cors from 'cors';
import type { Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { createAuthRouter } from './modules/auth/index.js';
import { createAdminRouter } from './modules/admin/index.js';

export function createApp(db: DatabaseSync): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/admin', createAdminRouter(db));
  return app;
}
