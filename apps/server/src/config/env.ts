import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Find the repo root by walking up from cwd until we hit a directory that
// contains pnpm-workspace.yaml. This avoids fragile relative paths that break
// depending on which file calls us or where the process was started.
function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const repoRoot = findRepoRoot(process.cwd());
if (repoRoot) {
  const envPath = path.join(repoRoot, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  WS_PORT: Number(process.env.WS_PORT ?? 2567),
  DATABASE_PATH: process.env.DATABASE_PATH ?? './pixelmon.db',
  JWT_SECRET: process.env.JWT_SECRET ?? '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? 'admin',
};

const ENV_DEFAULT_JWT = 'dev-secret-change-me';

export function assertEnv(): void {
  if (!env.JWT_SECRET || env.JWT_SECRET === ENV_DEFAULT_JWT) {
    throw new Error('JWT_SECRET is not configured (set it in .env)');
  }
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD must be set together (in .env)'
    );
  }
}
