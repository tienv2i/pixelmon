import type { Request, Response } from 'express';
import { pool } from '../../config/database.js';

/**
 * Admin Phase 7 — Items & Trades:
 * - Inventory distribution (top items in bags)
 * - Top spenders / richest players
 * - Evolution history (ai ép, method)
 * - Event log (pokemon_events) with filters
 */

const EVENT_KINDS = ['xp_gain', 'level_up', 'evolve', 'item_used', 'trade', 'catch', 'money'] as const;

function parseLimit(raw: unknown, fallback: number, max = 500): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** GET /api/admin/items/overview — phân bố túi đồ toàn server. */
export async function getItemOverview(_req: Request, res: Response): Promise<void> {
  try {
    const totals = await pool.query(
      `SELECT COUNT(*)::int AS rows,
              COALESCE(SUM(quantity),0)::int AS total_qty,
              COUNT(DISTINCT item_id)::int AS distinct_items,
              COUNT(DISTINCT owner_id)::int AS owners
       FROM inventory`,
    );
    const topByQty = await pool.query(
      `SELECT item_id, SUM(quantity)::int AS qty, COUNT(DISTINCT owner_id)::int AS owners
       FROM inventory GROUP BY item_id ORDER BY qty DESC LIMIT 20`,
    );
    const topByOwners = await pool.query(
      `SELECT item_id, COUNT(DISTINCT owner_id)::int AS owners, SUM(quantity)::int AS qty
       FROM inventory GROUP BY item_id ORDER BY owners DESC, qty DESC LIMIT 20`,
    );
    res.json({
      ok: true,
      totals: totals.rows[0],
      topByQty: topByQty.rows,
      topByOwners: topByOwners.rows,
    });
  } catch (err) {
    console.error('[admin:items:overview]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** GET /api/admin/items/top-spenders — người chơi có nhiều tiền nhất. */
export async function listTopSpenders(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseLimit(req.query.limit, 10, 50);
    const { rows } = await pool.query(
      `SELECT u.username, u.display_name, u.role, p.money, p.level, p.map_id
       FROM players p JOIN users u ON u.id = p.id
       ORDER BY p.money DESC NULLS LAST LIMIT $1`,
      [limit],
    );
    res.json({
      ok: true,
      players: rows.map((r) => ({
        username: r.username,
        displayName: r.display_name,
        role: r.role,
        money: r.money,
        level: r.level,
        mapId: r.map_id,
      })),
    });
  } catch (err) {
    console.error('[admin:items:top-spenders]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** GET /api/admin/evolution/history?limit=&pokemonId=&userId= — lịch sử tiến hoá. */
export async function listEvolutionHistory(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseLimit(req.query.limit, 50, 200);
    const params: unknown[] = [];
    const conds: string[] = [];
    if (req.query.pokemonId) {
      params.push(String(req.query.pokemonId));
      conds.push(`h.pokemon_id = $${params.length}`);
    }
    if (req.query.userId) {
      params.push(String(req.query.userId));
      conds.push(`h.user_id = $${params.length}`);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT h.id, h.pokemon_id, h.user_id, h.from_species_id, h.to_species_id,
              h.method, h.moderator_id, h.created_at,
              u.username AS owner_name, m.username AS moderator_name
       FROM pokemon_evolution_history h
       LEFT JOIN users u ON u.id = h.user_id
       LEFT JOIN users m ON m.id = h.moderator_id
       ${where}
       ORDER BY h.created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    res.json({
      ok: true,
      history: rows.map((r) => ({
        id: r.id,
        pokemonId: r.pokemon_id,
        userId: r.user_id,
        ownerName: r.owner_name,
        moderatorId: r.moderator_id,
        moderatorName: r.moderator_name,
        from: r.from_species_id,
        to: r.to_species_id,
        method: r.method,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[admin:evolution:history]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}

/** GET /api/admin/events?limit=&kind=&userId= — event feed (audit trail). */
export async function listEventLog(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseLimit(req.query.limit, 100, 500);
    const params: unknown[] = [];
    const conds: string[] = [];
    if (req.query.kind && (EVENT_KINDS as readonly string[]).includes(String(req.query.kind))) {
      params.push(String(req.query.kind));
      conds.push(`e.kind = $${params.length}`);
    }
    if (req.query.userId) {
      params.push(String(req.query.userId));
      conds.push(`e.user_id = $${params.length}`);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT e.id, e.user_id, e.pokemon_id, e.kind, e.payload, e.created_at,
              u.username AS owner_name
       FROM pokemon_events e
       LEFT JOIN users u ON u.id = e.user_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    res.json({
      ok: true,
      events: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        pokemonId: r.pokemon_id,
        ownerName: r.owner_name,
        kind: r.kind,
        payload: r.payload,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[admin:events]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL' });
  }
}
