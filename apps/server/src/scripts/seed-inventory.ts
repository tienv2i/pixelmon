/**
 * Seed inventory cho tài khoản dev/test (Plan 45 §1.1).
 * Chạy: `pnpm --filter server exec tsx src/scripts/seed-inventory.ts [username]`
 * Idempotent — chỉ seed khi túi trống.
 */
import { pool } from '../config/database.js';
import { seedIfEmpty } from '../modules/items/inventory.service.js';

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: seed-inventory <username>');
    process.exit(1);
  }
  const { rows } = await pool.query(`SELECT id FROM users WHERE username = $1`, [username]);
  if (rows.length === 0) {
    console.error(`User not found: ${username}`);
    process.exit(1);
  }
  const userId = String(rows[0].id);
  await seedIfEmpty(userId);
  const { rows: inv } = await pool.query(
    `SELECT item_id, quantity FROM inventory WHERE owner_id = $1 ORDER BY item_id`,
    [userId],
  );
  console.log(`Seeded inventory for ${username}:`);
  for (const r of inv) console.log(`  ${r.item_id} x${r.quantity}`);
  await pool.end();
  process.exit(0);
}

void main();
