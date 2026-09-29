import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { env } from './env.js';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const raw = env.DATABASE_PATH;
  if (raw !== ':memory:') {
    const path = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
    mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path);
  } else {
    db = new DatabaseSync(':memory:');
  }
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
