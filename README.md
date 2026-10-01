# Pixelmon — Pokémon MMORPG

Web-based Pokémon MMORPG built with Phaser 3 (client) + Colyseus (server).

## Prerequisites

- Node.js 20+
- pnpm 9+ (enable via `corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- PostgreSQL 14+ (running on `localhost:5432`)
- Redis 6+ (running on `localhost:6379`)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create database
createdb pixelmon

# 3. Configure environment
cp .env.example .env
# Edit .env with your database credentials and JWT secret

# 4. Start development servers (both client + server)
pnpm dev

# Server runs on http://localhost:2567
# Client runs on http://localhost:5173
```

### Individual servers

```bash
pnpm dev:server    # only server :2567
pnpm dev:client    # only client :5173
```

### Build & lint

```bash
pnpm build          # build all packages (turbo)
pnpm lint           # eslint (root-level)
pnpm format         # prettier --write
pnpm format:check   # prettier --check
```

## Project structure

```
├── packages/
│   └── shared/              # @pixelmon/shared — types, formulas, schema, data
│       ├── src/
│       │   ├── data/        # contracts (Zod), normalize, loader (server-only)
│       │   ├── formulas/    # typechart, combat, stats, encounter, generator, learnset, mapruntime
│       │   ├── schema/      # Colyseus state classes (WorldState, BattleState)
│       │   ├── types/       # Player, Messages, InventorySlot
│       │   └── constants/   # Grid, game, maps
│       ├── data/            # Game data JSON (species, moves, items, maps)
│       └── assets/          # Pokémon icons, tilesets
├── apps/
│   ├── client/              # Phaser 3 + Vite
│   └── server/              # Colyseus + Express
│       ├── src/config/      # PostgreSQL, Redis, env
│       └── src/modules/     # auth, player, pokemon, world, battle
```

## API Endpoints

| Method | Path                 | Description                    |
| ------ | -------------------- | ------------------------------ |
| POST   | `/api/auth/register` | Register new user              |
| POST   | `/api/auth/login`    | Login                          |
| GET    | `/api/auth/me`       | Get current user + player info |

## Game data

649 species, 559 moves, 526 items, type chart (18 types), collision maps — loaded from JSON files in `packages/shared/data/`. Managed by `GameData` and `MapLoader` (server-only, uses `fs`).

## Architecture notes

- **Single session policy**: login from a second device revokes the first session.
- **Token lifecycle**: 15-min access token (JWT), 30-day refresh token (rotated on each use).
- **Colyseus rooms**: `WorldRoom` (movement, chat, encounters), `BattleRoom` (turn-based combat).
- **State sync**: Colyseus Schema classes shared between client and server.
