import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../config/index.js';
import type { Player } from '@pixelmon/shared';

const PlayerQuerySchema = z.object({
  userId: z.string().uuid(),
});

export async function getPlayer(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = PlayerQuerySchema.parse(req.params);
    const { rows } = await pool.query(
      `SELECT p.*, u.username, u.display_name
       FROM players p JOIN users u ON u.id = p.id
       WHERE p.id = $1`,
      [userId],
    );
    if (rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND' });
      return;
    }
    const r = rows[0];
    res.json({
      ok: true,
      player: {
        id: r.id,
        username: r.username,
        displayName: r.display_name,
        x: r.x,
        y: r.y,
        mapId: r.map_id,
        direction: r.direction,
        level: r.level,
        exp: r.exp,
        money: r.money,
        stats: r.stats,
      } satisfies Partial<Player>,
    });
  } catch (err) {
    console.error('[player:get]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

export async function listOnlinePlayers(_req: Request, res: Response): Promise<void> {
  // Returns stub; real implementation uses Redis online set or room census
  res.json({ ok: true, players: [] });
}
