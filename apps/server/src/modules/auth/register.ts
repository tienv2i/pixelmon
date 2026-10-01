import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { pool } from '../../config/index.js';
import { config } from '../../config/index.js';

const RegisterSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(100),
  displayName: z.string().min(1).max(30),
  spriteId: z.string().uuid().nullable().optional(),
});

export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = RegisterSchema.parse(req.body);
    const id = uuid();
    const passwordHash = await bcrypt.hash(body.password, 10);

    let spriteId: string | null = null;
    if (body.spriteId) {
      const s = await pool.query('SELECT id FROM sprite_catalog WHERE id = $1', [body.spriteId]);
      if (s.rows.length > 0) spriteId = s.rows[0].id;
    }

    await pool.query(
      `INSERT INTO users (id, username, password_hash, display_name, sprite_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, body.username, passwordHash, body.displayName, spriteId],
    );

    // Create default player row
    await pool.query(
      `INSERT INTO players (id, x, y, map_id, direction, level, exp, money)
       VALUES ($1, 0, 0, 'route_1', 'down', 1, 0, 5000)`,
      [id],
    );

    const token = jwt.sign({ sub: id, username: body.username }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    res.status(201).json({ ok: true, token, userId: id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res
        .status(400)
        .json({ ok: false, code: 'VALIDATION', message: 'Invalid input', issues: err.issues });
      return;
    }
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      res.status(409).json({ ok: false, code: 'USER_EXISTS', message: 'Username already taken' });
      return;
    }
    console.error('[auth:register]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: 'Registration failed' });
  }
}
