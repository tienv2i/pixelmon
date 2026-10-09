/** Verify số lượng demo items. pnpm --filter server exec tsx src/scripts/verify-demo-items.ts [username] */
import { pool } from '../config/database.js';

async function main(): Promise<void> {
  const username = process.argv[2] ?? 'admin';
  const r = await pool.query(
    `SELECT i.item_id, i.quantity FROM inventory i JOIN users u ON u.id = i.owner_id
     WHERE u.username = $1 AND i.item_id IN ('pokeball','greatball','potion','firestone','rarecandy')
     ORDER BY i.item_id`,
    [username],
  );
  for (const row of r.rows) console.log(`${row.item_id} x${row.quantity}`);

  const c = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE quantity = 1000)::int AS balls,
            count(*) FILTER (WHERE quantity = 100)::int AS others
       FROM inventory i JOIN users u ON u.id = i.owner_id
      WHERE u.username = $1`,
    [username],
  );
  console.log(`summary(${username}):`, JSON.stringify(c.rows[0]));
  await pool.end();
  process.exit(0);
}

void main();
