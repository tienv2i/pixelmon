import pg from 'pg';
import { config } from './env.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'moderator', 'admin', 'banned')),
        language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'vi')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );

      -- Thông tin bổ sung của người chơi (1-1 với users)
      CREATE TABLE IF NOT EXISTS user_info (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        birthday DATE,
        bio TEXT NOT NULL DEFAULT '',           -- giới thiệu / self intro
        notes TEXT NOT NULL DEFAULT '',         -- ghi chú (admin)
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS players (
        id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        x REAL NOT NULL DEFAULT 160,
        y REAL NOT NULL DEFAULT 144,
        map_id TEXT NOT NULL DEFAULT 'lappet-town',
        direction TEXT NOT NULL DEFAULT 'down',
        level INTEGER NOT NULL DEFAULT 1,
        exp BIGINT NOT NULL DEFAULT 0,
        money INTEGER NOT NULL DEFAULT 5000,
        stats JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pokemon (
        id UUID PRIMARY KEY,
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        species_id TEXT NOT NULL,
        nickname TEXT,
        level INTEGER NOT NULL DEFAULT 1,
        exp BIGINT NOT NULL DEFAULT 0,
        ivs JSONB NOT NULL DEFAULT '{}'::jsonb,
        evs JSONB NOT NULL DEFAULT '{}'::jsonb,
        stats JSONB NOT NULL DEFAULT '{}'::jsonb,
        current_hp INTEGER NOT NULL DEFAULT 0,
        moves JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT,
        shiny BOOLEAN NOT NULL DEFAULT FALSE,
        caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        party_slot SMALLINT,          -- 0-5 = party, NULL = PC box
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS inventory (
        owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (owner_id, item_id)
      );

      CREATE INDEX IF NOT EXISTS idx_pokemon_owner ON pokemon(owner_id);
      CREATE INDEX IF NOT EXISTS idx_players_map ON players(map_id);

      -- ── Thư viện sprite nhân vật ──
      -- mode: 'baked' = sheet đã ghé (384×32, 12 frame), 'atlas' = ảnh gốc + file toạ độ
      CREATE TABLE IF NOT EXISTS sprite_catalog (
        id UUID PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        mode TEXT NOT NULL DEFAULT 'baked' CHECK (mode IN ('baked', 'atlas')),
        sheet_url TEXT,
        source_url TEXT,
        frames JSONB NOT NULL DEFAULT '[]'::jsonb,
        frame_w INTEGER NOT NULL DEFAULT 32,
        frame_h INTEGER NOT NULL DEFAULT 32,
        frame_count SMALLINT NOT NULL DEFAULT 12,   -- 12 = 384×32 (3f/dir), 16 = 256×256 (4f/dir)
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sprite_catalog_name ON sprite_catalog(name);

      -- Gán sprite cho user: trỏ tới thư viện, xóa sprite → user tự quay về mặc định
      ALTER TABLE users ADD COLUMN IF NOT EXISTS sprite_id UUID REFERENCES sprite_catalog(id) ON DELETE SET NULL;
      ALTER TABLE sprite_catalog ADD COLUMN IF NOT EXISTS frame_count SMALLINT NOT NULL DEFAULT 12;

      -- ── Plan 45: Items / Evolution / Trade (idempotent) ──
      -- Cầm đồ trên Pokemon
      ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS held_item TEXT;
      ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS friendship SMALLINT NOT NULL DEFAULT 70;
      ALTER TABLE pokemon ADD COLUMN IF NOT EXISTS poke_ball TEXT DEFAULT 'pokeball';

      -- Log event (event feed + audit + anti-abuse)
      CREATE TABLE IF NOT EXISTS pokemon_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        pokemon_id UUID,
        kind TEXT NOT NULL,          -- xp_gain | level_up | evolve | item_used | trade | catch | money
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pokemon_events_user ON pokemon_events(user_id, created_at DESC);

      -- Lịch sử tiến hoá (từ đâu → đi đâu, method, ai ép)
      CREATE TABLE IF NOT EXISTS pokemon_evolution_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pokemon_id UUID NOT NULL,
        user_id UUID NOT NULL,
        from_species_id TEXT NOT NULL,
        to_species_id TEXT NOT NULL,
        method TEXT NOT NULL,        -- level | item | trade | force | reverse
        moderator_id UUID,           -- ai ép (force/reverse)
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pokemon_evo_hist_pokemon ON pokemon_evolution_history(pokemon_id, created_at DESC);

      -- Pokédex (lưu tiến độ khám phá: seen, caught)
      CREATE TABLE IF NOT EXISTS pokedex (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        species_id VARCHAR(50) NOT NULL,
        status VARCHAR(10) NOT NULL,
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, species_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pokedex_user_id ON pokedex(user_id);
    `);

    // ── Migration: cột role / language (DB cũ đã tạo trước các cột này) ──
    const existingCols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name IN ('role', 'language')`,
    );
    const colNames = existingCols.rows.map((r) => r.column_name);

    if (!colNames.includes('role')) {
      await client.query(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'`);
      console.log('[db] Migration: added users.role');
    }
    if (!colNames.includes('language')) {
      await client.query(`ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en'`);
      console.log('[db] Migration: added users.language');
    }

    console.log('[db] PostgreSQL schema ready');
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
