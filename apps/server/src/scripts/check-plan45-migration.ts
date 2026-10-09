/**
 * Kiểm tra Plan 45 migration đã áp chưa:
 *   pnpm --filter server exec tsx src/scripts/check-plan45-migration.ts
 */
import { pool } from '../config/database.js';

async function main(): Promise<void> {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='pokemon' AND column_name IN ('held_item','friendship')`,
  );
  console.log('pokemon cols:', cols.rows.map((r: { column_name: string }) => r.column_name));

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('pokemon_events','pokemon_evolution_history','trade_sessions')`,
  );
  console.log('tables:', tables.rows.map((r: { table_name: string }) => r.table_name));

  await pool.end();
}

void main();
