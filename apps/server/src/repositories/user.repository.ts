import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Role } from '@pixelmon/shared';
import { env } from '../config/env.js';

export interface UserRow {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  role: Role;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  email: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface AuthTokenPayload {
  sub: string;
  userId: number;
  username: string;
  role: Role;
}

export interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  role?: Role;
}

const SALT_ROUNDS = 10;

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

export class UserRepository {
  constructor(private readonly db: DatabaseSync) {}

  async create(input: CreateUserInput): Promise<PublicUser> {
    const hash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const result = this.db
      .prepare(
        `INSERT INTO users(email, username, password_hash, role) VALUES(?, ?, ?, ?)`
      )
      .run(input.email, input.username, hash, input.role ?? 'player');
    const row = this.getRowById(Number(result.lastInsertRowid));
    if (!row) throw new Error('Failed to create user');
    return toPublic(row);
  }

  getRowByEmail(email: string): UserRow | undefined {
    const row = this.db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    return row ? (row as unknown as UserRow) : undefined;
  }

  getRowByUsername(username: string): UserRow | undefined {
    const row = this.db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    return row ? (row as unknown as UserRow) : undefined;
  }

  getRowById(id: number): UserRow | undefined {
    const row = this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    return row ? (row as unknown as UserRow) : undefined;
  }

  getByEmail(email: string): PublicUser | undefined {
    const row = this.getRowByEmail(email);
    return row ? toPublic(row) : undefined;
  }

  getById(id: number): PublicUser | undefined {
    const row = this.getRowById(id);
    return row ? toPublic(row) : undefined;
  }

  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as unknown as {
      n: number;
    };
    return row.n;
  }

  countByRole(role: Role): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM users WHERE role = ?`)
      .get(role) as unknown as { n: number };
    return row.n;
  }

  listAll(): PublicUser[] {
    const rows = this.db
      .prepare(`SELECT * FROM users ORDER BY id ASC`)
      .all() as unknown as UserRow[];
    return rows.map(toPublic);
  }

  async verifyPassword(user: PublicUser, password: string): Promise<boolean> {
    const row = this.getRowById(user.id);
    if (!row) return false;
    return bcrypt.compare(password, row.password_hash);
  }

  touchLastLogin(userId: number): void {
    this.db
      .prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`)
      .run(userId);
  }

  setRole(userId: number, role: Role): void {
    this.db
      .prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(role, userId);
  }

  setActive(userId: number, active: boolean): void {
    this.db
      .prepare(
        `UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(active ? 1 : 0, userId);
  }

  async setPassword(userId: number, newPassword: string): Promise<void> {
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    this.db
      .prepare(
        `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(hash, userId);
  }

  generateToken(user: PublicUser): string {
    const payload: AuthTokenPayload = {
      sub: randomUUID(),
      userId: user.id,
      username: user.username,
      role: user.role,
    };
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
  }

  verifyToken(token: string): AuthTokenPayload | null {
    try {
      return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    } catch {
      return null;
    }
  }

  async register(email: string, username: string, password: string): Promise<PublicUser> {
    return this.create({ email, username, password, role: 'player' });
  }

  async login(
    email: string,
    password: string
  ): Promise<{ user: PublicUser; token: string } | null> {
    const user = this.getByEmail(email);
    if (!user || !user.isActive) return null;
    const ok = await this.verifyPassword(user, password);
    if (!ok) return null;
    this.touchLastLogin(user.id);
    const token = this.generateToken(user);
    return { user, token };
  }

  async seedAdminFromEnv(): Promise<void> {
    const existing = this.getRowByEmail(env.ADMIN_EMAIL);
    if (existing) {
      console.log('[seed] admin already exists, skipping');
      return;
    }
    if (this.count() > 0) {
      console.log(
        '[seed] users exist but admin email not found, skipping to avoid overwrite'
      );
      return;
    }
    await this.create({
      email: env.ADMIN_EMAIL,
      username: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
      role: 'admin',
    });
    console.log(`[seed] created admin ${env.ADMIN_EMAIL}`);
  }
}
