/**
 * Demo vật phẩm cho tài khoản test: mỗi vật phẩm 100, balls riêng 1000.
 *
 *   pnpm --filter server exec tsx src/scripts/grant-demo-items.ts [username]
 *
 * Không truyền username → grant cho admin + tienv2i.
 * Dùng `inventory` table (owner_id, item_id, quantity) — đặt số lượng tuyệt đối
 * (ON CONFLICT SET) để có đúng số lượng yêu cầu.
 */
import { pool } from '../config/database.js';
import { gameData } from '@pixelmon/shared/data';

/** Ball-type item ids (id kết thúc bằng 'ball') → 1000 mỗi thứ. */
const BALL_SUFFIX = 'ball';

function isBall(itemId: string): boolean {
  return itemId.endsWith(BALL_SUFFIX) || itemId === 'beastball';
}

async function grantTo(username: string): Promise<void> {
  const { rows } = await pool.query(`SELECT id FROM users WHERE username = $1`, [username]);
  if (rows.length === 0) {
    console.error(`User not found: ${username}`);
    return;
  }
  const userId = String(rows[0].id);
  const items = gameData.getAllItems();
  console.log(`[${username}] granting ${items.length} items ...`);

  for (const it of items) {
    const qty = isBall(it.id) ? 1000 : 100;
    await pool.query(
      `INSERT INTO inventory (owner_id, item_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, item_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [userId, it.id, qty],
    );
  }
  console.log(`[${username}] done — ${items.length} vật phẩm.`);
}

async function main(): Promise<void> {
  await gameData.load();
  const targets = process.argv.slice(2);
  const users = targets.length > 0 ? targets : ['admin', 'tienv2i'];
  for (const u of users) await grantTo(u);
  await pool.end();
  process.exit(0);
}

void main();
