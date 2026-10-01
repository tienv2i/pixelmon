import type { Request, Response } from 'express';
import { pool } from '../../config/index.js';

/** Get all Pokemon owned by a user */
export async function getPokemonByUser(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.userId;
    const { rows } = await pool.query(
      `SELECT * FROM pokemon WHERE owner_id = $1 ORDER BY party_slot NULLS LAST, level DESC`,
      [userId],
    );
    res.json({ ok: true, pokemon: rows });
  } catch (err) {
    console.error('[pokemon:list]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}
