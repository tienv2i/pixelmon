import type { Request, RequestHandler, Response } from 'express';
import path from 'path';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { pool } from '../../config/index.js';
import { asAuth } from '../../middleware/auth.js';
import { SPRITES } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** apps/server/public/sprites — file nhân vật đã xuất. */
export const SPRITE_DIR = path.resolve(__dirname, '..', '..', '..', 'public', 'sprites');

/**
 * Multer: giữ file trong RAM (4 MB tối đa) — `createAdminSprite` kiểm tra magic
 * number PNG rồi mới ghi ra đĩa, nên không cần sanitize file name.
 */
const spriteUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SPRITES.MAX_UPLOAD_BYTES },
});

/** Middleware upload — nhận field `image` (1 file PNG), chạy trước `createAdminSprite`. */
export const spriteUploadMiddleware: RequestHandler = spriteUpload.single('image');

/**
 * Magic number PNG (8 byte đầu). Ưu tiên kiểm tra content thay vì tin
 * `Content-Type` do client gửi lên — tránh upload file độc hại.
 */
function isPng(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return sig.every((b, i) => buf[i] === b);
}

function parseFrameSize(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  // Giữ nhận biết được cho các frame sheet pixel-art (8…256).
  return i >= 8 && i <= 256 ? i : null;
}

function parseFrames(raw: unknown): Array<{ x: number; y: number; w: number; h: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      return {
        x: Math.max(0, Math.floor(Number(o.x) || 0)),
        y: Math.max(0, Math.floor(Number(o.y) || 0)),
        w: Math.max(1, Math.floor(Number(o.w) || 0)),
        h: Math.max(1, Math.floor(Number(o.h) || 0)),
      };
    })
    .filter((f) => f.w > 0 && f.h > 0);
}

/**
 * `frameCount` chỉ nhận 12 (sheet ngang 384×32, 3f/dir) hoặc 16 (sheet lưới
 * 256×256, 4f/dir) — 2 layout mà `PlayerSprite` hỗ trợ (`FRAMES_PER_DIR`).
 */
function parseFrameCount(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n === 16 ? 16 : 12;
}

function toRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    mode: r.mode,
    sheetUrl: r.sheet_url,
    sourceUrl: r.source_url,
    frames: r.frames ?? [],
    frameW: r.frame_w,
    frameH: r.frame_h,
    frameCount: r.frame_count ?? SPRITES.FRAME_COUNT,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Sprite đủ điều kiện dùng trong game: phải có sheet baked + frame hợp lệ. */
function isUsable(s: Record<string, unknown>): boolean {
  const fw = Number(s.frame_w) || 0;
  const fc = Number(s.frame_count) || SPRITES.FRAME_COUNT;
  return !!s.sheet_url && fw >= 8 && fc >= 12;
}

/** Tạo object `sprite` gửi kèm user — null nếu không dùng được. */
export function toUserSprite(s: Record<string, unknown> | null | undefined) {
  if (!s || !isUsable(s)) return null;
  return {
    id: s.id,
    name: s.name,
    sheetUrl: s.sheet_url,
    frameW: s.frame_w,
    frameH: s.frame_h,
    frameCount: s.frame_count ?? SPRITES.FRAME_COUNT,
  };
}

/** GET /api/admin/sprites — danh sách thư viện sprite. */
export async function listAdminSprites(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, mode, sheet_url, source_url, frames, frame_w, frame_h, frame_count, created_at, updated_at
         FROM sprite_catalog
        ORDER BY created_at DESC`,
    );
    res.json({
      ok: true,
      sprites: rows.map(toRow),
      dirs: SPRITES.DIRS,
      frameCount: SPRITES.FRAME_COUNT,
    });
  } catch (err) {
    console.error('[admin:sprites:list]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/**
 * POST /api/admin/sprites — tạo sprite trong thư viện.
 *
 * Nhận `multipart/form-data` nếu có file (`image`), nếu không nhận JSON với
 * `sheetUrl` đã có sẵn. Body:
 * - `name`        — tên sprite (bắt buộc, unique)
 * - `mode`        — `baked` (xuất sheet) | `atlas` (ảnh gốc + toạ độ)
 * - `frameW/H`    — kích thước 1 frame, mặc định 32
 * - `frames`      — JSON string, chỉ dùng cho mode `atlas`
 * - `image`       — file PNG gốc (tuỳ chọn)
 * - `sheetUrl`    — dùng lại sheet đã lưu, bỏ qua upload (tuỳ chọn)
 */
export async function createAdminSprite(req: Request, res: Response): Promise<void> {
  try {
    // multer đã parse body multipart → b.name, b.frames (string) sẵn sàng
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b.name || '').trim();
    if (!name) {
      res
        .status(400)
        .json({ ok: false, code: 'MISSING_FIELDS', message: 'Tên sprite là bắt buộc' });
      return;
    }
    if (name.length > 64) {
      res.status(400).json({ ok: false, code: 'INVALID', message: 'Tên sprite tối đa 64 ký tự' });
      return;
    }

    const mode = b.mode === 'atlas' ? 'atlas' : 'baked';
    const frameW = parseFrameSize(b.frameW) ?? SPRITES.FRAME_SIZE;
    const frameH = parseFrameSize(b.frameH) ?? SPRITES.FRAME_SIZE;
    const frameCount = parseFrameCount(b.frameCount) ?? SPRITES.FRAME_COUNT;
    const frames = mode === 'atlas' ? parseFrames(parseFramesInput(b.frames)) : [];

    const dup = await pool.query('SELECT 1 FROM sprite_catalog WHERE name = $1', [name]);
    if (dup.rows.length > 0) {
      res
        .status(409)
        .json({ ok: false, code: 'SPRITE_EXISTS', message: `Sprite "${name}" đã tồn tại` });
      return;
    }

    const { v4: uuid } = await import('uuid');
    const id = uuid();

    await mkdir(SPRITE_DIR, { recursive: true });

    let sheetUrl: string | null = typeof b.sheetUrl === 'string' && b.sheetUrl ? b.sheetUrl : null;
    let sourceUrl: string | null = null;

    // Upload file gốc (nếu có) → giữ nguyên ảnh + tạo sheet đã chuẩn hoá
    const file = (req.file ?? undefined) as Express.Multer.File | undefined;
    if (file) {
      const buf = file.buffer;
      if (!isPng(buf)) {
        res
          .status(400)
          .json({ ok: false, code: 'INVALID_FILE', message: 'Chỉ chấp nhận file PNG' });
        return;
      }
      if (buf.length > SPRITES.MAX_UPLOAD_BYTES) {
        res.status(413).json({ ok: false, code: 'TOO_LARGE', message: 'File vượt quá 4 MB' });
        return;
      }

      sourceUrl = `${SPRITES.BASE_URL}/${id}.png`;
      await writeFile(path.join(SPRITE_DIR, `${id}.png`), buf);
    }

    // Client đã tự ghép sheet ở trình duyệt → lưu luôn sheet đó (dạng 384×32 mà
    // `PlayerSprite` cần). Không có → chỉ giữ ảnh gốc + toạ độ (mode atlas).
    if (typeof b.bakedSheet === 'string' && b.bakedSheet.startsWith('data:image/png;base64,')) {
      try {
        sheetUrl = await writeBakedSheet(b.bakedSheet, id);
      } catch {
        res.status(400).json({
          ok: false,
          code: 'INVALID_SHEET',
          message: 'bakedSheet phải là PNG hợp lệ',
        });
        return;
      }
    }

    if (mode === 'baked' && !sheetUrl) {
      res.status(400).json({
        ok: false,
        code: 'MISSING_SHEET',
        message: 'Chế độ baked cần sheet PNG đã ghé (384×32 hoặc 2D theo toạ độ frame)',
      });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO sprite_catalog (id, name, mode, sheet_url, source_url, frames, frame_w, frame_h, frame_count, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, mode, sheet_url, source_url, frames, frame_w, frame_h, frame_count, created_at, updated_at`,
      [
        id,
        name,
        mode,
        sheetUrl,
        sourceUrl,
        JSON.stringify(frames),
        frameW,
        frameH,
        frameCount,
        asAuth(req).user?.userId ?? null,
      ],
    );

    res.status(201).json({ ok: true, sprite: toRow(rows[0]), message: `Đã tạo sprite "${name}"` });
  } catch (err) {
    console.error('[admin:sprites:create]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** GET /api/admin/sprites/:id — chi tiết 1 sprite (dùng cho nút Sửa). */
export async function getAdminSprite(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, name, mode, sheet_url, source_url, frames, frame_w, frame_h, frame_count, created_at, updated_at
         FROM sprite_catalog WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Sprite không tồn tại' });
      return;
    }
    res.json({ ok: true, sprite: toRow(rows[0]) });
  } catch (err) {
    console.error('[admin:sprites:get]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** PATCH /api/admin/sprites/:id — đổi tên / metadata / sheet mới (FormData hoặc JSON). */
export async function updateAdminSprite(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const b = (req.body ?? {}) as Record<string, unknown>;

    const check = await pool.query('SELECT id FROM sprite_catalog WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Sprite không tồn tại' });
      return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name) {
        res.status(400).json({ ok: false, code: 'INVALID', message: 'Tên không được rỗng' });
        return;
      }
      const dup = await pool.query('SELECT 1 FROM sprite_catalog WHERE name = $1 AND id <> $2', [
        name,
        id,
      ]);
      if (dup.rows.length > 0) {
        res
          .status(409)
          .json({ ok: false, code: 'SPRITE_EXISTS', message: `Sprite "${name}" đã tồn tại` });
        return;
      }
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (b.frames !== undefined) {
      params.push(JSON.stringify(parseFrames(parseFramesInput(b.frames))));
      updates.push(`frames = $${params.length}::jsonb`);
    }
    if (b.frameW !== undefined) {
      const v = parseFrameSize(b.frameW);
      if (!v) {
        res.status(400).json({ ok: false, code: 'INVALID', message: 'frameW phải trong 8…256' });
        return;
      }
      params.push(v);
      updates.push(`frame_w = $${params.length}`);
    }
    if (b.frameH !== undefined) {
      const v = parseFrameSize(b.frameH);
      if (!v) {
        res.status(400).json({ ok: false, code: 'INVALID', message: 'frameH phải trong 8…256' });
        return;
      }
      params.push(v);
      updates.push(`frame_h = $${params.length}`);
    }
    if (b.frameCount !== undefined) {
      const v = parseFrameCount(b.frameCount);
      if (!v) {
        res
          .status(400)
          .json({ ok: false, code: 'INVALID', message: 'frameCount phải là 12 hoặc 16' });
        return;
      }
      params.push(v);
      updates.push(`frame_count = $${params.length}`);
    }

    // Sheet mới export từ trình duyệt (chế độ sửa) → ghi đè file sheet cũ.
    if (typeof b.bakedSheet === 'string' && b.bakedSheet.startsWith('data:image/png;base64,')) {
      try {
        const url = await writeBakedSheet(b.bakedSheet, id);
        params.push(url);
        updates.push(`sheet_url = $${params.length}`);
      } catch {
        res
          .status(400)
          .json({ ok: false, code: 'INVALID_SHEET', message: 'bakedSheet phải là PNG hợp lệ' });
        return;
      }
    }

    // Ảnh gốc mới (tuỳ chọn) — thay file `{id}.png` và cập nhật source_url.
    const file = (req.file ?? undefined) as Express.Multer.File | undefined;
    if (file) {
      if (!isPng(file.buffer)) {
        res
          .status(400)
          .json({ ok: false, code: 'INVALID_FILE', message: 'Chỉ chấp nhận file PNG' });
        return;
      }
      await mkdir(SPRITE_DIR, { recursive: true });
      const sourceUrl = `${SPRITES.BASE_URL}/${id}.png`;
      await writeFile(path.join(SPRITE_DIR, `${id}.png`), file.buffer);
      params.push(sourceUrl);
      updates.push(`source_url = $${params.length}`);
    }

    if (updates.length === 0) {
      res.json({ ok: true, message: 'Không có gì thay đổi' });
      return;
    }

    updates.push('updated_at = NOW()');
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE sprite_catalog SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, mode, sheet_url, source_url, frames, frame_w, frame_h, frame_count, created_at, updated_at`,
      params,
    );

    res.json({ ok: true, sprite: toRow(rows[0]), message: 'Đã cập nhật sprite' });
  } catch (err) {
    console.error('[admin:sprites:update]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** DELETE /api/admin/sprites/:id — xoá entry + file trên đĩa. */
export async function deleteAdminSprite(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT name FROM sprite_catalog WHERE id = $1', [id]);
    if (rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Sprite không tồn tại' });
      return;
    }

    await pool.query('DELETE FROM sprite_catalog WHERE id = $1', [id]);
    // Xoá cả ảnh gốc lẫn sheet đã bake. File có thể đã bị admin xoá tay — bỏ qua ENOENT.
    // `users.sprite_id` có ON DELETE SET NULL → user tự quay về sprite mặc định.
    await unlink(path.join(SPRITE_DIR, `${id}.png`)).catch(() => {});
    await unlink(path.join(SPRITE_DIR, `${id}-sheet.png`)).catch(() => {});

    res.json({ ok: true, message: `Đã xoá sprite "${rows[0].name}"` });
  } catch (err) {
    console.error('[admin:sprites:delete]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** `frames` có thể là array (JSON body) hoặc string (FormData). */
function parseFramesInput(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeBakedSheet(dataUrl: string, id: string): Promise<string> {
  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  const buf = Buffer.from(base64, 'base64');
  if (!isPng(buf)) {
    throw new Error('bakedSheet không phải PNG hợp lệ');
  }
  const url = `${SPRITES.BASE_URL}/${id}-sheet.png`;
  await writeFile(path.join(SPRITE_DIR, `${id}-sheet.png`), buf);
  return url;
}
