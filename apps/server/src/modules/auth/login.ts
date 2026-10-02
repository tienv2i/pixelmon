import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool, cacheSession } from '../../config/index.js';
import { config } from '../../config/index.js';
import { t, localeFromRequest } from '../../i18n/index.js';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const lang = localeFromRequest(req);
  try {
    const body = LoginSchema.parse(req.body);
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.password_hash, u.display_name, u.role, u.language,
              p.x, p.y, p.map_id, p.direction
       FROM users u
       LEFT JOIN players p ON p.id = u.id
       WHERE u.username = $1`,
      [body.username],
    );

    if (rows.length === 0) {
      res
        .status(401)
        .json({ ok: false, code: 'INVALID_CREDENTIALS', message: t(lang, 'INVALID_CREDENTIALS') });
      return;
    }

    const user = rows[0];
    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      res
        .status(401)
        .json({ ok: false, code: 'INVALID_CREDENTIALS', message: t(lang, 'INVALID_CREDENTIALS') });
      return;
    }

    // ── Banned: chặn đăng nhập (dùng language của user) ──
    if (user.role === 'banned') {
      const userLang = user.language === 'vi' ? 'vi' : 'en';
      res.status(403).json({ ok: false, code: 'BANNED', message: t(userLang, 'BANNED') });
      return;
    }

    await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn },
    );

    await cacheSession(user.id, token);

    res.json({
      ok: true,
      token,
      userId: user.id,
      displayName: user.display_name,
      role: user.role,
      language: user.language || 'en',
      player: user.map_id
        ? {
            x: Number(user.x),
            y: Number(user.y),
            mapId: user.map_id,
            direction: user.direction || 'down',
          }
        : null,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        ok: false,
        code: 'VALIDATION',
        message: t(lang, 'VALIDATION'),
        issues: err.issues,
      });
      return;
    }
    console.error('[auth:login]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: t(lang, 'LOGIN_FAILED') });
  }
}
