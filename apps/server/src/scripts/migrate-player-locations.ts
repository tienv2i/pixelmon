import { pool } from '../config/index.js';

async function main() {
  console.log('[migrate] Updating existing player locations to Pallet Town...');
  const res = await pool.query(`
    UPDATE players
       SET map_id = 'pallet-town',
           x = CASE WHEN x = 0 OR x > 600 THEN 160 ELSE x END,
           y = CASE WHEN y = 0 OR y > 540 OR y = 144 THEN 368 ELSE y END
     WHERE map_id = 'route_1' OR map_id IS NULL OR map_id = 'pallet-town';
  `);
  console.log(`[migrate] Updated ${res.rowCount} player records.`);

  const list = await pool.query(`
    SELECT u.username, p.x, p.y, p.map_id, p.direction
      FROM players p
      JOIN users u ON u.id = p.id
     LIMIT 15;
  `);
  console.log('[migrate] Sample players:');
  console.table(list.rows);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
