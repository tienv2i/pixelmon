import type { Request, Response } from 'express';
import { pool } from '../../config/index.js';

interface AuthRequest extends Request {
  user?: { userId: string; username: string; role: string };
}

let tableInitialized = false;

/**
 * Khởi tạo bảng pokedex nếu chưa có
 */
export async function initPokedexTable(): Promise<void> {
  if (tableInitialized) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pokedex (
        user_id UUID NOT NULL,
        species_id VARCHAR(50) NOT NULL,
        status VARCHAR(10) NOT NULL,
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, species_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pokedex_user_id ON pokedex(user_id);
    `);
    tableInitialized = true;
  } catch (err) {
    console.error('[pokedex:initTable] Error creating pokedex table:', err);
  }
}

export interface PokedexProgress {
  seen: string[];
  caught: string[];
  totalSpecies: number;
}

/**
 * Lấy tiến độ Pokédex của người chơi:
 * - Query từ bảng pokedex
 * - Tự động bổ sung mọi loài người chơi đang sở hữu từ bảng pokemon vào 'caught' & 'seen'
 */
export async function getPokedexProgress(userId: string): Promise<PokedexProgress> {
  await initPokedexTable();

  const dexRes = await pool.query<{ species_id: string; status: string }>(
    `SELECT species_id, status FROM pokedex WHERE user_id = $1`,
    [userId],
  );

  const ownedRes = await pool.query<{ species_id: string }>(
    `SELECT DISTINCT species_id FROM pokemon WHERE owner_id = $1`,
    [userId],
  );

  const seenSet = new Set<string>();
  const caughtSet = new Set<string>();

  for (const row of dexRes.rows) {
    const sId = row.species_id.toLowerCase().trim();
    seenSet.add(sId);
    if (row.status === 'caught') {
      caughtSet.add(sId);
    }
  }

  // Tự động bổ sung mọi loài player đã sở hữu vào trạng thái 'caught' & 'seen'
  for (const row of ownedRes.rows) {
    const sId = row.species_id.toLowerCase().trim();
    caughtSet.add(sId);
    seenSet.add(sId);
  }

  return {
    seen: Array.from(seenSet).sort(),
    caught: Array.from(caughtSet).sort(),
    totalSpecies: 898,
  };
}

/**
 * Ghi nhận Pokédex entry: 'seen' hoặc 'caught' (nếu đã caught thì không hạ xuống seen)
 */
export async function recordPokedexEntry(
  userId: string,
  speciesId: string,
  status: 'seen' | 'caught',
): Promise<void> {
  if (!userId || !speciesId) return;
  await initPokedexTable();

  const cleanSpeciesId = speciesId.toLowerCase().trim();

  try {
    await pool.query(
      `INSERT INTO pokedex (user_id, species_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, species_id)
       DO UPDATE SET status = CASE
         WHEN pokedex.status = 'caught' THEN 'caught'
         ELSE EXCLUDED.status
       END`,
      [userId, cleanSpeciesId, status],
    );
  } catch (err) {
    console.error(`[pokedex:recordEntry] Error updating entry for user ${userId}, species ${speciesId}:`, err);
  }
}

/**
 * GET /api/pokemon/pokedex
 * Trả về danh sách loài đã gặp (seen), đã bắt (caught), và tổng số loài (898)
 */
export async function getPokedexHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }

    const progress = await getPokedexProgress(userId);
    res.json({
      ok: true,
      seen: progress.seen,
      caught: progress.caught,
      totalSpecies: progress.totalSpecies,
    });
  } catch (err) {
    console.error('[pokemon:pokedex]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}
