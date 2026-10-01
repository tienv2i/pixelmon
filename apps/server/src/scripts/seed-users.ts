import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { pool, initDatabase, closeDatabase, closeRedis } from '../config/index.js';

/**
 * Seed dữ liệu người chơi:
 *   - admin / anhtien123  (display name "Administrator")
 *   - 10 user thường: user01..user10 / 123
 *
 * Chạy:  npx tsx src/scripts/seed-users.ts
 * Idempotent: user đã tồn tại thì bỏ qua (không ghi đè).
 */

const ADMIN = {
  username: 'admin',
  password: 'admin123',
  displayName: 'Administrator',
};

const REGULAR_COUNT = 10;
const REGULAR_PASSWORD = '123';
const START_LEVEL = 5;
const START_MONEY = 5000;

async function seedUser(
  username: string,
  password: string,
  displayName: string,
  role: string = 'player',
): Promise<'created' | 'skipped'> {
  const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) return 'skipped';

  const id = uuid();
  const hash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, username, hash, displayName, role],
    );
    await client.query(
      `INSERT INTO players (id, x, y, map_id, direction, level, exp, money)
       VALUES ($1, 0, 0, 'route_1', 'down', $2, 0, $3)`,
      [id, START_LEVEL, START_MONEY],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return 'created';
}

async function main(): Promise<void> {
  console.log('[seed] ensuring schema...');
  await initDatabase();

  console.log(`[seed] admin: ${ADMIN.username} / ${'*'.repeat(ADMIN.password.length)}`);
  const adminResult = await seedUser(ADMIN.username, ADMIN.password, ADMIN.displayName, 'admin');

  // Migration: đảm bảo admin có role='admin' (kể cả khi đã tồn tại từ trước)
  const adminRow = await pool.query('SELECT id, role FROM users WHERE username = $1', [
    ADMIN.username,
  ]);
  if (adminRow.rows.length > 0 && adminRow.rows[0].role !== 'admin') {
    await pool.query("UPDATE users SET role = 'admin' WHERE username = $1", [ADMIN.username]);
    console.log(`[seed] promoted "${ADMIN.username}" → role=admin`);
  }
  console.log(`[seed]   → ${adminResult}`);

  let created = 0;
  let skipped = 0;
  for (let i = 1; i <= REGULAR_COUNT; i++) {
    const username = `user${String(i).padStart(2, '0')}`;
    const displayName = `Trainer ${String(i).padStart(2, '0')}`;
    const result = await seedUser(username, REGULAR_PASSWORD, displayName);
    if (result === 'created') created++;
    else skipped++;
    console.log(`[seed] ${username} / ${REGULAR_PASSWORD} → ${result}`);
  }

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  console.log(
    `[seed] done. created=${created + (adminResult === 'created' ? 1 : 0)} ` +
      `skipped=${skipped + (adminResult === 'skipped' ? 1 : 0)} total=${rows[0]?.n ?? 0}`,
  );

  await closeDatabase();
  await closeRedis();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exitCode = 1;
  void closeDatabase()
    .then(() => closeRedis())
    .finally(() => {
      process.exit(1);
    });
});
