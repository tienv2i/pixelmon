import type { Request, Response } from 'express';
import { pool, redis } from '../../config/index.js';
import { toUserSprite } from './sprite.js';

const LIMIT_MAX = 500;

/** Roles hợp lệ trong hệ thống */
export const ROLES = ['player', 'moderator', 'admin', 'banned'] as const;
export type Role = (typeof ROLES)[number];

function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

function parseLimit(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), LIMIT_MAX);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kiểm tra `spriteId` có tồn tại trong `sprite_catalog` và dùng được cho game
 * (có sheet baked). Trả `null` nếu hợp lệ để xóa gán (về sprite mặc định).
 *
 * - `undefined` → không đổi (không thêm vào UPDATE)
 * - `null` / `''` → bỏ gán sprite
 * - string → phải là UUID có trong catalog
 * - khác → throw `AdminApiError` (400/404) — caller bắt và trả lỗi
 */
async function validateSpriteId(raw: unknown): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const id = String(raw);
  if (!UUID_RE.test(id)) {
    throw new AdminApiError(400, 'INVALID_SPRITE', 'spriteId phải là UUID hợp lệ');
  }
  const { rows } = await pool.query(
    `SELECT id FROM sprite_catalog WHERE id = $1 AND sheet_url IS NOT NULL AND frame_w >= 8 AND frame_count >= 12`,
    [id],
  );
  if (rows.length === 0) {
    throw new AdminApiError(404, 'SPRITE_NOT_FOUND', 'Sprite không tồn tại trong thư viện');
  }
  return id;
}

/** Lỗi API có sẵn mã HTTP — dùng trong handler để tránh code 400/404 lặp lại. */
class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** GET /api/admin/status — health của DB/Redis + số liệu tổng. */
export async function getAdminStatus(_req: Request, res: Response): Promise<void> {
  try {
    // PostgreSQL
    let dbStatus = 'connected';
    try {
      await pool.query('SELECT 1');
    } catch {
      dbStatus = '';
    }

    // Redis
    let redisStatus = 'connected';
    try {
      const pong = await redis.ping();
      if (pong !== 'PONG') redisStatus = 'unknown';
    } catch {
      redisStatus = '';
    }

    // Counts
    let userCount = 0;
    let pokemonCount = 0;
    let roleCounts: Record<string, number> = {};
    try {
      const u = await pool.query('SELECT COUNT(*)::int AS n FROM users');
      userCount = u.rows[0]?.n ?? 0;
      const p = await pool.query('SELECT COUNT(*)::int AS n FROM pokemon');
      pokemonCount = p.rows[0]?.n ?? 0;
      const r = await pool.query('SELECT role, COUNT(*)::int AS n FROM users GROUP BY role');
      roleCounts = Object.fromEntries(r.rows.map((x) => [x.role, x.n]));
    } catch {
      /* tables có thể chưa tồn tại */
    }

    res.json({
      ok: true,
      database: dbStatus,
      redis: redisStatus,
      userCount,
      pokemonCount,
      roleCounts,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin:status]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** GET /api/admin/users?limit=100&page=1&q=search&sort=username */
export async function listAdminUsers(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const search = String(req.query.q || '').trim();
    const roleFilter = String(req.query.role || '').trim();
    const sort = ['username', 'created_at', 'last_login_at', 'level'].includes(
      String(req.query.sort),
    )
      ? String(req.query.sort)
      : 'created_at';

    // Build WHERE clause
    let where = '';
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(u.username ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`,
      );
    }
    if (roleFilter && (ROLES as readonly string[]).includes(roleFilter)) {
      params.push(roleFilter);
      conditions.push(`u.role = $${params.length}`);
    }
    if (conditions.length > 0) {
      where = 'WHERE ' + conditions.join(' AND ');
    }

    // Count total
    const countParams = [...params];
    const countQuery = `SELECT COUNT(*)::int AS total FROM users u ${where}`;
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = countRows[0]?.total ?? 0;

    // Get page data
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT u.id, u.username, u.display_name, u.role, u.language, u.created_at, u.last_login_at,
             p.level, p.money, p.map_id,
             ui.birthday, ui.bio, ui.notes,
             u.sprite_id,
             sc.name AS sprite_name, sc.sheet_url AS sprite_sheet_url,
             sc.frame_w AS sprite_frame_w, sc.frame_h AS sprite_frame_h,
             sc.frame_count AS sprite_frame_count
      FROM users u
      LEFT JOIN players p ON p.id = u.id
      LEFT JOIN user_info ui ON ui.user_id = u.id
      LEFT JOIN sprite_catalog sc ON sc.id = u.sprite_id
      ${where}
      ORDER BY u.${sort === 'level' ? 'username' : sort} ${sort === 'level' ? 'ASC' : 'DESC NULLS LAST'}
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `;
    const { rows } = await pool.query(dataQuery, dataParams);

    res.json({
      ok: true,
      users: rows.map((r) => ({
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        role: r.role || 'player',
        language: r.language || 'en',
        birthday: r.birthday || null,
        bio: r.bio || '',
        notes: r.notes || '',
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        level: r.level ?? null,
        money: r.money ?? null,
        mapId: r.map_id ?? null,
        spriteId: r.sprite_id ?? null,
        sprite: toUserSprite(
          r.sprite_id
            ? {
                id: r.sprite_id,
                name: r.sprite_name,
                sheet_url: r.sprite_sheet_url,
                frame_w: r.sprite_frame_w,
                frame_h: r.sprite_frame_h,
                frame_count: r.sprite_frame_count,
              }
            : null,
        ),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + rows.length < total,
      },
    });
  } catch (err) {
    console.error('[admin:users]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** POST /api/admin/users — tạo user mới */
export async function createAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const { username, password, displayName, level = 5, money = 5000, spriteId } = req.body || {};
    if (!username || !password) {
      res
        .status(400)
        .json({ ok: false, code: 'MISSING_FIELDS', message: 'username và password bắt buộc' });
      return;
    }
    if (username.length < 3 || password.length < 6) {
      res
        .status(400)
        .json({ ok: false, code: 'INVALID', message: 'username ≥ 3 ký tự, password ≥ 6 ký tự' });
      return;
    }

    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      res.status(409).json({ ok: false, code: 'USER_EXISTS', message: 'Username đã tồn tại' });
      return;
    }

    // Validate sprite (nếu có) trước khi insert để không tạo user rác.
    let sprite: string | null | undefined;
    try {
      sprite = await validateSpriteId(spriteId);
    } catch (err) {
      if (err instanceof AdminApiError) {
        res.status(err.status).json({ ok: false, code: err.code, message: err.message });
        return;
      }
      throw err;
    }

    const bcrypt = await import('bcryptjs');
    const { v4: uuid } = await import('uuid');
    const id = uuid();
    const hash = await bcrypt.default.hash(password, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, username, password_hash, display_name, sprite_id) VALUES ($1, $2, $3, $4, $5)`,
        [id, username, hash, displayName || username, sprite ?? null],
      );
      await client.query(
        `INSERT INTO players (id, x, y, map_id, direction, level, exp, money)
         VALUES ($1, 0, 0, 'route_1', 'down', $2, 0, $3)`,
        [id, level, money],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.status(201).json({ ok: true, userId: id, message: `Đã tạo user "${username}"` });
  } catch (err) {
    console.error('[admin:create-user]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** PATCH /api/admin/users/:id — update user (displayName, level, money, role, language, bio, notes, spriteId) */
export async function updateAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { displayName, level, money, role, language, bio, notes, spriteId } = req.body || {};

    // Validate role
    if (role !== undefined && !isRole(role)) {
      res.status(400).json({
        ok: false,
        code: 'INVALID_ROLE',
        message: `Role không hợp lệ. Chỉ chấp nhận: ${ROLES.join(', ')}`,
      });
      return;
    }

    // Validate language
    if (language !== undefined && language !== 'en' && language !== 'vi') {
      res.status(400).json({
        ok: false,
        code: 'INVALID_LANGUAGE',
        message: 'Ngôn ngữ không hợp lệ. Chỉ chấp nhận: en, vi',
      });
      return;
    }

    // Validate spriteId (undefined = không đổi; null = bỏ gán)
    let sprite: string | null | undefined;
    try {
      sprite = await validateSpriteId(spriteId);
    } catch (err) {
      if (err instanceof AdminApiError) {
        res.status(err.status).json({ ok: false, code: err.code, message: err.message });
        return;
      }
      throw err;
    }

    // Check user exists
    const check = await pool.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'User không tồn tại' });
      return;
    }

    // ── Update users table (display_name + role + language + sprite_id) ──
    const userUpdates: string[] = [];
    const userParams: unknown[] = [];
    if (displayName !== undefined) {
      userParams.push(displayName);
      userUpdates.push(`display_name = $${userParams.length}`);
    }
    if (role !== undefined) {
      userParams.push(role);
      userUpdates.push(`role = $${userParams.length}`);
    }
    if (language !== undefined) {
      userParams.push(language);
      userUpdates.push(`language = $${userParams.length}`);
    }
    if (sprite !== undefined) {
      userParams.push(sprite);
      userUpdates.push(`sprite_id = $${userParams.length}`);
    }
    if (userUpdates.length > 0) {
      userParams.push(id);
      await pool.query(
        `UPDATE users SET ${userUpdates.join(', ')} WHERE id = $${userParams.length}`,
        userParams,
      );
    }

    // ── Update players table (level, money) ──
    const playerUpdates: string[] = [];
    const playerParams: unknown[] = [];
    if (level !== undefined) {
      playerParams.push(level);
      playerUpdates.push(`level = $${playerParams.length}`);
    }
    if (money !== undefined) {
      playerParams.push(money);
      playerUpdates.push(`money = $${playerParams.length}`);
    }
    if (playerUpdates.length > 0) {
      playerParams.push(id);
      await pool.query(
        `UPDATE players SET ${playerUpdates.join(', ')} WHERE id = $${playerParams.length}`,
        playerParams,
      );
    }

    // ── Update user_info (bio, notes) ──
    if (bio !== undefined || notes !== undefined) {
      const b = typeof bio === 'string' ? bio : '';
      const n = typeof notes === 'string' ? notes : '';
      await pool.query(
        `INSERT INTO user_info (user_id, bio, notes, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           bio = EXCLUDED.bio, notes = EXCLUDED.notes, updated_at = NOW()`,
        [id, b, n],
      );
    }

    res.json({ ok: true, message: 'Đã cập nhật user' });
  } catch (err) {
    console.error('[admin:update-user]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** POST /api/admin/users/:id/ban — ban user */
export async function banAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'User không tồn tại' });
      return;
    }
    const user = check.rows[0];
    if (user.role === 'banned') {
      res.json({ ok: true, message: `User "${user.username}" đã bị ban trước đó` });
      return;
    }
    await pool.query("UPDATE users SET role = 'banned' WHERE id = $1", [id]);
    res.json({ ok: true, message: `Đã ban user "${user.username}"` });
  } catch (err) {
    console.error('[admin:ban-user]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** POST /api/admin/users/:id/unban — unban user → player */
export async function unbanAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'User không tồn tại' });
      return;
    }
    const user = check.rows[0];
    if (user.role !== 'banned') {
      res.json({ ok: true, message: `User "${user.username}" không bị ban` });
      return;
    }
    await pool.query("UPDATE users SET role = 'player' WHERE id = $1", [id]);
    res.json({ ok: true, message: `Đã gỡ ban user "${user.username}"` });
  } catch (err) {
    console.error('[admin:unban-user]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** POST /api/admin/users/:id/password — reset password */
export async function resetAdminUserPassword(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ ok: false, code: 'INVALID', message: 'password ≥ 6 ký tự' });
      return;
    }

    const check = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'User không tồn tại' });
      return;
    }

    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);

    res.json({ ok: true, message: `Đã reset password user "${check.rows[0].username}"` });
  } catch (err) {
    console.error('[admin:reset-password]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** DELETE /api/admin/users/:id — xóa user (cascade xóa players + pokemon) */
export async function deleteAdminUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const check = await pool.query('SELECT id, username FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'User không tồn tại' });
      return;
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true, message: `Đã xóa user "${check.rows[0].username}"` });
  } catch (err) {
    console.error('[admin:delete-user]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** GET /api/admin/pokemon?limit=200 */
export async function listAdminPokemon(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseLimit(req.query.limit, 200);
    const { rows } = await pool.query(
      `SELECT p.id, p.owner_id, p.species_id, p.level, p.exp, p.party_slot, p.shiny,
              p.current_hp, p.caught_at, u.username, u.display_name
         FROM pokemon p
         LEFT JOIN users u ON u.id = p.owner_id
        ORDER BY p.caught_at DESC
        LIMIT $1`,
      [limit],
    );

    res.json({
      ok: true,
      pokemon: rows.map((r) => ({
        id: r.id,
        ownerId: r.owner_id,
        ownerName: r.display_name || r.username || r.owner_id,
        speciesId: r.species_id,
        level: r.level,
        exp: r.exp,
        partySlot: r.party_slot,
        shiny: !!r.shiny,
        currentHp: r.current_hp,
        caughtAt: r.caught_at,
        types: null, // species types lấy từ GameData nếu cần
      })),
    });
  } catch (err) {
    console.error('[admin:pokemon]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** GET /api/admin/players?limit=100 — vị trí người chơi hiện tại. */
export async function listAdminPlayers(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseLimit(req.query.limit, 100);
    const { rows } = await pool.query(
      `SELECT u.username, u.display_name, p.map_id, p.x, p.y, p.direction, p.level
         FROM players p
         JOIN users u ON u.id = p.id
        ORDER BY u.username
        LIMIT $1`,
      [limit],
    );

    res.json({
      ok: true,
      players: rows.map((r) => ({
        username: r.display_name || r.username,
        mapId: r.map_id,
        x: r.x,
        y: r.y,
        direction: r.direction,
        level: r.level,
      })),
    });
  } catch (err) {
    console.error('[admin:players]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}
