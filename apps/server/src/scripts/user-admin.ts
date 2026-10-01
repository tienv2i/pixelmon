import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { pool, initDatabase, closeDatabase, closeRedis } from '../config/index.js';

/**
 * Quản lý tài khoản người chơi (admin CLI).
 *
 * Chạy:  npx tsx src/scripts/user-admin.ts <lệnh> [args]
 *   list                          — liệt kê tất cả tài khoản
 *   create <user> <pass> [name]  — tạo tài khoản mới (kèm player row)
 *   passwd <user> <newpass>       — đổi mật khẩu
 *   delete <user>                 — xóa tài khoản (cascade xóa players + pokemon)
 *   show <user>                   — xem chi tiết 1 tài khoản
 *
 * Ví dụ:
 *   npx tsx src/scripts/user-admin.ts create admin admin123 "Administrator"
 *   npx tsx src/scripts/user-admin.ts passwd admin admin123
 *   npx tsx src/scripts/user-admin.ts delete tien2i
 */

const START_LEVEL = 5;
const START_MONEY = 5000;

type Command = 'list' | 'create' | 'passwd' | 'delete' | 'show' | 'help';

async function cmdList(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT u.username, u.display_name, u.created_at, u.last_login_at,
            p.level, p.money, p.map_id, p.x, p.y
     FROM users u
     LEFT JOIN players p ON p.id = u.id
     ORDER BY u.created_at ASC`,
  );
  if (rows.length === 0) {
    console.log('[user-admin] chưa có tài khoản nào');
    return;
  }
  console.log(`\n[user-admin] ${rows.length} tài khoản:\n`);
  console.log(
    '  ' +
      'USERNAME'.padEnd(18) +
      'DISPLAY'.padEnd(18) +
      'LV'.padStart(3) +
      'MONEY'.padStart(7) +
      'MAP'.padEnd(12) +
      'LAST LOGIN',
  );
  console.log('  ' + '-'.repeat(80));
  for (const r of rows) {
    const lastLogin = r.last_login_at ? new Date(r.last_login_at).toLocaleString('vi-VN') : '—';
    console.log(
      '  ' +
        String(r.username).padEnd(18) +
        String(r.display_name ?? '—')
          .slice(0, 17)
          .padEnd(18) +
        String(r.level ?? '—').padStart(3) +
        String(r.money ?? '—').padStart(7) +
        String(r.map_id ?? '—').padEnd(12) +
        lastLogin,
    );
  }
  console.log();
}

async function cmdShow(username: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.created_at, u.last_login_at,
            p.x, p.y, p.map_id, p.direction, p.level, p.exp, p.money, p.stats
     FROM users u
     LEFT JOIN players p ON p.id = u.id
     WHERE u.username = $1`,
    [username],
  );
  if (rows.length === 0) {
    console.error(`[user-admin] không tìm thấy user "${username}"`);
    process.exitCode = 1;
    return;
  }
  const r = rows[0];
  console.log(`\n[user-admin] chi tiết "${username}":\n`);
  console.log(`  id           ${r.id}`);
  console.log(`  displayName  ${r.display_name ?? '—'}`);
  console.log(`  createdAt    ${new Date(r.created_at).toLocaleString('vi-VN')}`);
  console.log(
    `  lastLoginAt  ${r.last_login_at ? new Date(r.last_login_at).toLocaleString('vi-VN') : '—'}`,
  );
  console.log(`  ── player ──`);
  console.log(`  mapId        ${r.map_id ?? '—'}`);
  console.log(`  position     (${r.x ?? '—'}, ${r.y ?? '—'}) facing ${r.direction ?? '—'}`);
  console.log(`  level        ${r.level ?? '—'}`);
  console.log(`  exp          ${r.exp ?? '—'}`);
  console.log(`  money        ${r.money ?? '—'}`);
  console.log();

  const { rows: pkm } = await pool.query(
    'SELECT species_id, nickname, level, is_shiny, party_slot FROM pokemon WHERE owner_id = $1 ORDER BY party_slot NULLS LAST',
    [r.id],
  );
  if (pkm.length === 0) {
    console.log('  (chưa có Pokémon)');
  } else {
    console.log(`  ── Pokémon (${pkm.length}) ──`);
    for (const p of pkm) {
      const shiny = p.is_shiny ? ' ✦' : '';
      const slot = p.party_slot === null ? '-' : p.party_slot;
      console.log(`  [${slot}] ${p.species_id}${shiny} "${p.nickname ?? ''}" Lv.${p.level}`);
    }
  }
  console.log();
}

async function cmdCreate(
  username: string,
  password: string,
  displayName?: string,
  role: string = 'player',
): Promise<void> {
  if (username.length < 3) {
    console.error('[user-admin] username tối thiểa 3 ký tự');
    process.exitCode = 1;
    return;
  }
  if (password.length < 6) {
    console.error('[user-admin] password tối thiểu 6 ký tự');
    process.exitCode = 1;
    return;
  }

  const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    console.error(
      `[user-admin] user "${username}" đã tồn tại — dùng lệnh "passwd" để đổi mật khẩu`,
    );
    process.exitCode = 1;
    return;
  }

  const id = uuid();
  const hash = await bcrypt.hash(password, 10);
  const name = displayName?.trim() || username;
  const validRoles = ['player', 'moderator', 'admin', 'banned'];
  const finalRole = validRoles.includes(role) ? role : 'player';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, username, hash, name, finalRole],
    );
    await client.query(
      `INSERT INTO players (id, x, y, map_id, direction, level, exp, money)
       VALUES ($1, 256, 256, 'lappet-town', 'down', $2, 0, $3)`,
      [id, START_LEVEL, START_MONEY],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[user-admin] lỗi tạo user:', err);
    process.exitCode = 1;
    return;
  } finally {
    client.release();
  }

  console.log(
    `[user-admin] ✓ đã tạo "${username}" (${name}) — level ${START_LEVEL}, money ${START_MONEY}`,
  );
}

async function cmdPasswd(username: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) {
    console.error('[user-admin] password tối thiểu 6 ký tự');
    process.exitCode = 1;
    return;
  }
  const { rowCount } = await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [
    await bcrypt.hash(newPassword, 10),
    username,
  ]);
  if (rowCount === 0) {
    console.error(`[user-admin] không tìm thấy user "${username}"`);
    process.exitCode = 1;
    return;
  }
  console.log(`[user-admin] ✓ đã đổi mật khẩu "${username}"`);
}

async function cmdDelete(username: string): Promise<void> {
  const check = await pool.query('SELECT id, display_name FROM users WHERE username = $1', [
    username,
  ]);
  if (check.rows.length === 0) {
    console.error(`[user-admin] không tìm thấy user "${username}"`);
    process.exitCode = 1;
    return;
  }
  // players + pokemon bị xóa cascade nhờ FK ON DELETE CASCADE
  await pool.query('DELETE FROM users WHERE username = $1', [username]);
  console.log(`[user-admin] ✓ đã xóa "${username}" (kèm player + pokemon nếu có)`);
}

function usage(): void {
  console.log(`
[user-admin] Quản lý tài khoản người chơi

Cách dùng:
  npx tsx src/scripts/user-admin.ts list
  npx tsx src/scripts/user-admin.ts show <username>
  npx tsx src/scripts/user-admin.ts create <username> <password> [displayName]
  npx tsx src/scripts/user-admin.ts passwd <username> <newPassword>
  npx tsx src/scripts/user-admin.ts delete <username>

Ví dụ:
  npx tsx src/scripts/user-admin.ts create admin admin123 "Administrator"
  npx tsx src/scripts/user-admin.ts passwd admin newpass123
  npx tsx src/scripts/user-admin.ts delete user01
`);
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }

  await initDatabase();

  switch (cmd as Command) {
    case 'list':
      await cmdList();
      break;
    case 'show':
      if (!args[0]) throw new Error('thiếu <username>');
      await cmdShow(args[0]);
      break;
    case 'create':
      if (!args[0] || !args[1]) throw new Error('thiếu <username> <password>');
      await cmdCreate(args[0], args[1], args[2]);
      break;
    case 'passwd':
      if (!args[0] || !args[1]) throw new Error('thiếu <username> <newPassword>');
      await cmdPasswd(args[0], args[1]);
      break;
    case 'delete':
      if (!args[0]) throw new Error('thiếu <username>');
      await cmdDelete(args[0]);
      break;
    default:
      console.error(`[user-admin] lệnh không hợp lệ: ${cmd}`);
      usage();
      process.exitCode = 1;
  }

  await closeDatabase();
  await closeRedis();
}

main().catch((err) => {
  console.error('[user-admin] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
  void closeDatabase()
    .then(() => closeRedis())
    .finally(() => {
      process.exit(1);
    });
});
