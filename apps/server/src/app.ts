import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import authRouter from './modules/auth/index.js';
import playerRouter from './modules/player/index.js';

export const app: Express = express();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/player', playerRouter);
