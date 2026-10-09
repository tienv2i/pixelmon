import { pool } from '../../config/database.js';
import { gameData } from '@pixelmon/shared/data';
import { logMoney } from '../events/eventLog.js';

/**
 * Store service (Plan 45 §2.1).
 *
 * - Mọi ± tiền nằm trong **1 transaction** với `SELECT ... FOR UPDATE` (chống
 *   double-spend khi 2 request mua/bán cùng lúc).
 * - `gameData.getItem(itemId).buyPrice > 0` là điều kiện mua; bán theo sellPrice.
 */

export interface StoreActionOk {
  ok: true;
  money: number;
  itemId: string;
  quantity: number;
}

export interface StoreActionErr {
  ok: false;
  error: string;
}

export type StoreActionResult = StoreActionOk | StoreActionErr;

/** Mua `qty` item với giá `buyPrice`. */
export async function buyItem(
  userId: string,
  itemId: string,
  qty: number,
): Promise<StoreActionResult> {
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { ok: false, error: 'bad_qty' };
  const item = gameData.getItem(itemId);
  if (!item) return { ok: false, error: 'unknown_item' };
  if (item.buyPrice <= 0) return { ok: false, error: 'not_for_sale' };
  const cost = item.buyPrice * qty;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT money FROM players WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'no_player' };
    }
    const money = Number(rows[0].money);
    if (money < cost) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'insufficient_funds' };
    }
    await client.query(`UPDATE players SET money = money - $2 WHERE id = $1`, [userId, cost]);
    await client.query(
      `INSERT INTO inventory (owner_id, item_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, item_id)
       DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity`,
      [userId, itemId, qty],
    );
    const after = await client.query(`SELECT money FROM players WHERE id = $1`, [userId]);
    await client.query('COMMIT');
    const newMoney = Number(after.rows[0].money);
    void logMoney(userId, -cost, 'buy', { itemId, qty, price: item.buyPrice });
    return { ok: true, money: newMoney, itemId, quantity: qty };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[store] buy failed:', err);
    return { ok: false, error: 'db_error' };
  } finally {
    client.release();
  }
}

/** Bán `qty` item với giá `sellPrice`. */
export async function sellItem(
  userId: string,
  itemId: string,
  qty: number,
): Promise<StoreActionResult> {
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { ok: false, error: 'bad_qty' };
  const item = gameData.getItem(itemId);
  if (!item) return { ok: false, error: 'unknown_item' };
  const price = item.sellPrice > 0 ? item.sellPrice : Math.floor(item.buyPrice / 2);
  if (price <= 0) return { ok: false, error: 'not_sellable' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT quantity FROM inventory WHERE owner_id = $1 AND item_id = $2 FOR UPDATE`,
      [userId, itemId],
    );
    const have = rows.length > 0 ? Number(rows[0].quantity) : 0;
    if (have < qty) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'not_enough_items' };
    }
    const left = have - qty;
    if (left === 0) {
      await client.query(`DELETE FROM inventory WHERE owner_id = $1 AND item_id = $2`, [
        userId,
        itemId,
      ]);
    } else {
      await client.query(
        `UPDATE inventory SET quantity = $3 WHERE owner_id = $1 AND item_id = $2`,
        [userId, itemId, left],
      );
    }
    await client.query(`UPDATE players SET money = money + $2 WHERE id = $1`, [userId, price * qty]);
    const after = await client.query(`SELECT money FROM players WHERE id = $1`, [userId]);
    await client.query('COMMIT');
    const newMoney = Number(after.rows[0].money);
    void logMoney(userId, price * qty, 'sell', { itemId, qty, price });
    return { ok: true, money: newMoney, itemId, quantity: left };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[store] sell failed:', err);
    return { ok: false, error: 'db_error' };
  } finally {
    client.release();
  }
}

/** Đọc số dư hiện tại. */
export async function getMoney(userId: string): Promise<number> {
  const { rows } = await pool.query(`SELECT money FROM players WHERE id = $1`, [userId]);
  return rows.length > 0 ? Number(rows[0].money) : 0;
}
