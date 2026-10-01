import type { Request, Response } from 'express';
import { pool } from '../../config/index.js';
import { asAuth } from '../../middleware/auth.js';
import { t, localeFromRequest } from '../../i18n/index.js';

/** GET /api/users/:id/info — xem thông tin profile của user */
export async function getUserInfo(req: Request, res: Response): Promise<void> {
  const lang = localeFromRequest(req);
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.language, u.role,
              ui.birthday, ui.bio, ui.notes, ui.updated_at
       FROM users u
       LEFT JOIN user_info ui ON ui.user_id = u.id
       WHERE u.id = $1`,
      [id],
    );
    if (rows.length === 0) {
      res
        .status(404)
        .json({ ok: false, code: 'USER_NOT_FOUND', message: t(lang, 'USER_NOT_FOUND') });
      return;
    }
    const r = rows[0];
    res.json({
      ok: true,
      user: {
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        language: r.language,
        role: r.role,
      },
      info: {
        birthday: r.birthday || null,
        bio: r.bio || '',
        notes: r.notes || '',
        updatedAt: r.updated_at,
      },
    });
  } catch (err) {
    console.error('[user-info:get]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: t(lang, 'INTERNAL') });
  }
}

/** PUT /api/users/:id/info — cập nhật profile (chính mình hoặc admin) */
export async function updateUserInfo(req: Request, res: Response): Promise<void> {
  const lang = localeFromRequest(req);
  try {
    const { id } = req.params;
    const auth = asAuth(req);

    // Chỉ chính mình hoặc admin mới được sửa
    if (auth.user && (auth.user.userId !== id || auth.user.role !== 'admin')) {
      res.status(403).json({ ok: false, code: 'FORBIDDEN', message: t(lang, 'FORBIDDEN') });
      return;
    }

    const check = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res
        .status(404)
        .json({ ok: false, code: 'USER_NOT_FOUND', message: t(lang, 'USER_NOT_FOUND') });
      return;
    }

    const { birthday, bio, notes } = req.body || {};

    // UPSERT user_info
    await pool.query(
      `INSERT INTO user_info (user_id, birthday, bio, notes, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         birthday = EXCLUDED.birthday,
         bio = EXCLUDED.bio,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [
        id,
        birthday || null,
        typeof bio === 'string' ? bio : undefined,
        typeof notes === 'string' ? notes : undefined,
      ],
    );

    res.json({ ok: true, message: t(lang, 'INFO_SAVED') });
  } catch (err) {
    console.error('[user-info:update]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: t(lang, 'INTERNAL') });
  }
}

/** GET /api/users/:id/language — lấy language hiện tại (không cần auth) */
export async function getUserLanguage(_req: Request, res: Response): Promise<void> {
  try {
    const { id } = _req.params;
    const { rows } = await pool.query('SELECT language FROM users WHERE id = $1', [id]);
    if (rows.length === 0) {
      res.json({ ok: true, language: 'en' });
      return;
    }
    res.json({ ok: true, language: rows[0].language });
  } catch (err) {
    console.error('[user-lang:get]', err);
    res.json({ ok: true, language: 'en' });
  }
}
