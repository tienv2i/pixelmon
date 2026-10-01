import { pool } from '../config/index.js';
import { autoSeedStarters } from '../modules/pokemon/index.js';

async function main() {
  console.log('[seed] Starting seeding Pokemon for all accounts...');
  const { rows: users } = await pool.query('SELECT id, username FROM users ORDER BY username ASC');
  console.log(`[seed] Found ${users.length} users in database:`, users.map((u) => u.username).join(', '));

  for (const user of users) {
    console.log(`\n[seed] Processing user: ${user.username} (${user.id})...`);
    // Xóa Pokemon cũ nếu có
    await pool.query('DELETE FROM pokemon WHERE owner_id = $1', [user.id]);
    // Seed 6 con party + 10 con PC box (Gen 1)
    await autoSeedStarters(user.id);
    const count = await pool.query('SELECT count(*) FROM pokemon WHERE owner_id = $1', [user.id]);
    console.log(`[seed] Successfully seeded ${count.rows[0].count} Pokemon for ${user.username}!`);
  }

  const total = await pool.query('SELECT count(*) FROM pokemon');
  console.log(`\n[seed] All done! Total Pokemon across all accounts: ${total.rows[0].count}`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
