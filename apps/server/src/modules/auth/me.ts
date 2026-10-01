import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/index.js';
import { config } from '../../config/index.js';

export async function meHandler(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, code: 'NO_TOKEN' });
      return;
    }

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string; username: string };

    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.language, u.created_at, u.last_login_at,
              p.x, p.y, p.map_id, p.direction, p.level, p.exp, p.money, p.stats,
              ui.birthday, ui.bio, ui.notes
       FROM users u
       JOIN players p ON p.id = u.id
       LEFT JOIN user_info ui ON ui.user_id = u.id
       WHERE u.id = $1`,
      [payload.sub],
    );

    if (rows.length === 0) {
      res.status(404).json({ ok: false, code: 'USER_NOT_FOUND' });
      return;
    }

    const r = rows[0];
    res.json({
      ok: true,
      user: {
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        role: r.role,
        language: r.language || 'en',
        birthday: r.birthday || null,
        bio: r.bio || '',
        notes: r.notes || '',
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
      },
      player: {
        x: r.x,
        y: r.y,
        mapId: r.map_id,
        direction: r.direction,
        level: r.level,
        exp: r.exp,
        money: r.money,
        stats: r.stats,
      },
    });
  } catch (err: unknown) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ ok: false, code: 'INVALID_TOKEN' });
      return;
    }
    console.error('[auth:me]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}
