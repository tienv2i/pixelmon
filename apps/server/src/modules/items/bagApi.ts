import { Router, type Router as ExpressRouter } from 'express';
import { gameData } from '@pixelmon/shared/data';
import { requireAuth, asAuth } from '../../middleware/auth.js';
import { getEnrichedBag } from './inventory.service.js';

/**
 * Bag API (Plan 45 §1.2).
 *
 * - `GET /api/inventory` — trả túi đồ đã enrich (name/category/price/pocket).
 * - `GET /api/inventory/events` — 10 event gần nhất (Summary tab, Phase 6).
 */
export const bagRouter: ExpressRouter = Router();

bagRouter.get('/', requireAuth, async (req, res) => {
  const userId = asAuth(req).user?.userId ?? '';
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    return res.json({ ok: true, items: await getEnrichedBag(userId) });
  } catch (err) {
    console.error('[bag] list failed:', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/** Event feed (Summary tab Phase 6 / Admin Phase 7). */
bagRouter.get('/events', requireAuth, async (req, res) => {
  const userId = asAuth(req).user?.userId ?? '';
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    const { recentEvents } = await import('../events/eventLog.js');
    const events = await recentEvents(userId, 10);
    return res.json({ ok: true, events });
  } catch (err) {
    console.error('[bag] events failed:', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/** Danh sách hàng bán đã enrich (STORE_STOCK → shared). */
bagRouter.get('/store', requireAuth, async (_req, res) => {
  try {
    await gameData.load();
    const { STORE_STOCK } = await import('@pixelmon/shared');
    const items = STORE_STOCK.map((id) => gameData.getItem(id))
      .filter((i): i is NonNullable<typeof i> => Boolean(i))
      .map((i) => ({
        itemId: i.id,
        quantity: 0,
        name: i.name,
        category: i.category,
        pocket: i.pocket,
        buyPrice: i.buyPrice,
        sellPrice: i.sellPrice,
        iconUrl: i.iconUrl,
        description: i.description,
      }));
    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[bag] store stock failed:', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});

/** Lấy money hiện tại (client sync khi mở Store). */
bagRouter.get('/money', requireAuth, async (req, res) => {
  const userId = asAuth(req).user?.userId ?? '';
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    const { getMoney } = await import('../store/store.service.js');
    const money = await getMoney(userId);
    return res.json({ ok: true, money });
  } catch (err) {
    console.error('[bag] money failed:', err);
    return res.status(500).json({ ok: false, error: 'internal' });
  }
});
