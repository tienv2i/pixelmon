import { pool } from '../../config/database.js';
import { gameData } from '@pixelmon/shared/data';

/**
 * Inventory service (Plan 45 §1.1).
 *
 * Mọi ± item đi kèm quantity, dùng transaction `SELECT ... FOR UPDATE` để
 * chống race (2 request cùng lúc không double-spend).
 */

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

/** Item đã enrich metadata từ items.json (client cần `name` để render/filter). */
export interface EnrichedSlot extends InventorySlot {
  name: string;
  category: string;
  pocket: number;
  buyPrice: number;
  sellPrice: number;
  iconUrl?: string;
  description?: string;
}

/** Lấy toàn bộ túi đồ của user. */
export async function getBag(userId: string): Promise<InventorySlot[]> {
  const { rows } = await pool.query(
    `SELECT item_id AS "itemId", quantity FROM inventory WHERE owner_id = $1 ORDER BY item_id`,
    [userId],
  );
  return rows as InventorySlot[];
}

/**
 * Túi đồ đã enrich metadata từ items.json.
 *
 * BẮT BUỘC dùng hàm này (không phải `getBag`) cho mọi đường gửi túi đồ tới client:
 * `GET /api/inventory` và message `bag_update` của world room.
 * Gửi slot thô (chỉ itemId/quantity) làm client crash tại
 * `item.name.toLowerCase()` trong `BagModal.filteredItems()` khi đang tìm kiếm.
 */
export async function getEnrichedBag(userId: string): Promise<EnrichedSlot[]> {
  await gameData.load();
  const slots = await getBag(userId);
  const enriched: EnrichedSlot[] = [];
  for (const s of slots) {
    const item = gameData.getItem(s.itemId);
    if (!item) continue;
    enriched.push({
      itemId: s.itemId,
      quantity: s.quantity,
      name: item.name,
      category: item.category,
      pocket: item.pocket,
      buyPrice: item.buyPrice,
      sellPrice: item.sellPrice,
      iconUrl: item.iconUrl,
      description: item.description,
    });
  }
  return enriched;
}

/** Số lượng 1 item (0 nếu không có). */
export async function hasItem(userId: string, itemId: string, qty = 1): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT quantity FROM inventory WHERE owner_id = $1 AND item_id = $2`,
    [userId, itemId],
  );
  const q = rows.length > 0 ? Number(rows[0].quantity) : 0;
  return q >= qty;
}

/** Thêm item vào túi (transaction). Trả về số lượng mới. */
export async function addItem(
  userId: string,
  itemId: string,
  qty: number,
): Promise<{ itemId: string; quantity: number }> {
  if (qty <= 0) return { itemId, quantity: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO inventory (owner_id, item_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, item_id)
       DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
       RETURNING quantity`,
      [userId, itemId, qty],
    );
    await client.query('COMMIT');
    return { itemId, quantity: Number(rows[0].quantity) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Trừ item khỏi túi (transaction). Trả về số lượng còn lại (null = không đủ).
 */
export async function removeItem(
  userId: string,
  itemId: string,
  qty: number,
): Promise<{ itemId: string; quantity: number } | null> {
  if (qty <= 0) return { itemId, quantity: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT quantity FROM inventory WHERE owner_id = $1 AND item_id = $2 FOR UPDATE`,
      [userId, itemId],
    );
    const cur = rows.length > 0 ? Number(rows[0].quantity) : 0;
    if (cur < qty) {
      await client.query('ROLLBACK');
      return null;
    }
    const left = cur - qty;
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
    await client.query('COMMIT');
    return { itemId, quantity: left };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Seed inventory cho dev/test (idempotent — chỉ set khi chưa có item). */
export async function seedIfEmpty(userId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS c FROM inventory WHERE owner_id = $1`,
    [userId],
  );
  if (Number(rows[0]?.c ?? 0) > 0) return;
  await addItem(userId, 'potion', 10);
  await addItem(userId, 'pokeball', 5);
  await addItem(userId, 'firestone', 1);
  await addItem(userId, 'revive', 2);
  await addItem(userId, 'antidote', 3);
}
