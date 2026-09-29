# Project Status — Pixelmon MMORPG

> Cập nhật: 2026-09-29 · Thư mục: `/mnt/data/AI-Agent/pixelmon`

## Trạng thái verify (mới chạy)

| Lệnh | Kết quả |
|---|---|
| `pnpm build` | ✅ 3/3 tasks (shared → client + server) |
| `pnpm typecheck` | ✅ 4/4 tasks |
| `pnpm --filter @pixelmon/shared lint` | ✅ pass, 0 lỗi |
| `pnpm --filter @pixelmon/shared format:check` | ✅ pass |

⚠️ Repo **chưa phải git repository** — chưa commit gì.

## Tổng quan kiến trúc

Monorepo pnpm workspace + Turborepo 2.x:

```
pixelmon/
├── package.json              # root devDeps: turbo, typescript, prettier; packageManager pnpm@8.15.9
├── pnpm-workspace.yaml       # packages/* + apps/*
├── turbo.json                # tasks: build, dev, lint, typecheck, test
├── tsconfig.base.json        # ⭐ config TS chung (strict, verbatimModuleSyntax, noImplicitOverride...)
│
├── packages/shared/          # @pixelmon/shared — types + constants + formulas + network messages
├── apps/client/              # @pixelmon/client — Phaser 3 + Vite
└── apps/server/              # @pixelmon/server — Colyseus 0.16.5 + Express + Zod
```

## Chi tiết package

### `packages/shared` (`@pixelmon/shared`)

**Mục tiêu:** package dùng chung cho cả client và server.

Cấu hình export trong `package.json`: `.`, `./types/*`, `./constants/*`, `./schema/*`, `./formulas/*`, `./network/*`.

```
src/
├── index.ts                  # re-export tất cả
├── types/
│   ├── position.ts           # Direction ('up'|'down'|'left'|'right'), Position { x, y, direction }
│   ├── player.ts             # IPlayer, IPokemon (+status), IItem, IIVs, IEVs, ISkill, IStats
│   └── index.ts
├── network/index.ts          # MESSAGE_MOVE / CHAT / START_BATTLE / BATTLE_ACTION / JOIN_WORLD / LEAVE_WORLD
│                             #   + payload typed tương ứng (MessageMovePayload, ...)
├── constants/
│   ├── index.ts              # GRID_SIZE, TILE_SIZE, TICK_RATE, MAX_PLAYERS_PER_ROOM, INITIAL_MAP...
│   └── tiles.ts              # TILE_COLLISION / GRASS / WATER / NPC
├── formulas/index.ts         # calculateStat, calculateDamage...
└── schema/index.ts           # SchemaDefs placeholder (Record<string, unknown>)
```

Tooling riêng:
- `tsconfig.json` extends `../../tsconfig.base.json`
- `eslint.config.js` — ESLint 9 flat config + `typescript-eslint` type-checked
- `.prettierrc.json` — singleQuote, printWidth 90, trailingComma all, LF
- `.prettierignore`
- Scripts: `build` (tsc), `lint`, `format`, `format:check`, `typecheck`, `test` (vitest run)

### `apps/client` (`@pixelmon/client`)

Phaser 3 + Vite + colyseus.js.

```
src/
├── main.ts                   # new Phaser.Game(config), khai báo 4 scenes
├── scenes/
│   ├── BootScene.ts          # load assets (stub)
│   ├── LoginScene.ts         # stub text
│   ├── WorldScene.ts         # stub text
│   └── BattleScene.ts        # stub text
├── entities/
│   ├── PlayerSprite.ts       # stub class extends Phaser.Sprite
│   └── PokemonSprite.ts      # stub
└── network/NetworkManager.ts # colyseus.js Client wrapper: connect(), joinWorld() (stub)
```

Config:
- `vite.config.ts` (không React plugin — chỉ Vite thuần cho Phaser)
- `tsconfig.json` extends base, override `lib: ["ES2020", "DOM", "DOM.Iterable"]`, path alias `@/*` → `src/*`
- `index.html` mount `<div id="game">` + script `/src/main.ts`

### `apps/server` (`@pixelmon/server`)

Colyseus 0.16.5 + Express + WebSocketServer + Zod validation.

```
src/
├── index.ts                  # entry: express app + colyseus Server + ws transport
├── app.ts                    # mount /api/auth, /api/player
├── config/
│   ├── env.ts                # PORT, JWT_SECRET, DATABASE_URL, validate
│   └── validation.ts         # zod schemas: RegisterSchema, LoginSchema, CreatePokemonSchema
├── types/index.ts            # AsyncHandler, WorldState/BattleState placeholder interfaces
└── modules/
    ├── auth/
    │   ├── index.ts          # Router: POST /register, /login
    │   ├── auth.handlers.ts  # bcrypt hash + jwt sign/verify
    │   └── auth.middleware.ts# requireAuth (Bearer token)
    ├── player/
    │   ├── index.ts          # GET /me (requireAuth)
    │   └── player.handlers.ts
    ├── pokemon/
    │   ├── index.ts
    │   └── pokemon.data.ts   # POKEMON_DATABASE: bulbasaur / charmander / squirtle
    ├── world/world.room.ts   # WorldRoom extends Room<WorldState>, onCreate/onJoin/onLeave/onDispose
    └── battle/battle.room.ts # BattleRoom extends Room<BattleState>
```

Versions đã chốt tương thích peer deps:
- `colyseus@^0.16.5`
- `@colyseus/schema@^3.0.76`
- `@colyseus/ws-transport@^0.16.5`
- `express@^4.21.2`, `cors`, `dotenv`, `zod`, `bcrypt`, `jsonwebtoken`

## Tooling toàn repo

| Công cụ | Trạng thái |
|---|---|
| pnpm workspace | ✅ `packages/*` + `apps/*` |
| Turborepo 2.x | ✅ `tasks` (không còn `pipeline`), `build` phụ thuộc `^build` |
| TypeScript | ✅ `tsconfig.base.json` ở root, cả 3 package `extends` |
| ESLint 9 flat config | ✅ riêng `shared`; ❌ `client`/`server` chưa có |
| Prettier | ✅ cài ở root, config riêng `shared`; ❌ `client`/`server` chưa có |
| Vitest | ✅ mỗi package có `vitest.config.ts` (chưa có test case) |

## Việc còn dở (theo thứ tự ưu tiên)

1. **Git**: chưa `git init`, chưa commit. Toàn bộ work đang uncommitted.
2. **Lint/format cho client & server**: thêm `eslint.config.js` + `.prettierrc.json` vào 2 app để `pnpm lint` / `pnpm format` chạy được toàn repo.
3. **Colyseus Schema thật**: `WorldState` / `BattleState` trên server vẫn là placeholder interface → cần viết bằng `@colyseus/schema` class-based (`@type()` decorators).
4. **Client gameplay**: các scene/entity/network đều là stub — chưa render tilemap Tiled, chưa kết nối room thật, chưa có input handler di chuyển.
5. **Persistence**: player/pokemon chỉ in-memory → chưa có DB (Prisma/TypeORM) hay Redis.
6. **Tests**: chưa có test case nào (`passWithNoTests: true` mới chỉ đặt ở shared).

## Ghi chú kỹ thuật đã xử lý

- `turbo.json` đổi `pipeline` → `tasks` (Turborepo 2.x breaking change).
- Root `package.json` giữ `"packageManager": "pnpm@8.15.9"` khớp bản cài thực tế.
- `verbatimModuleSyntax` bật ở base config → server phải dùng `import type` cho `Express`, `Request/Response`, `Client`, `WorldState/BattleState`.
- `noImplicitOverride` bật → `WorldRoom`/`BattleRoom` phải đánh dấu `override` trên lifecycle methods.
- `@colyseus/schema@3.x` không publish tên `@colyseus/schema` độc lập như v2 → đã gỡ khỏi deps, chỉ giữ qua peer của `colyseus@0.16.5`.
- Shared `schema/index.ts` đổi empty interface → `SchemaDefs = Record<string, unknown>` để hết lỗi lint `no-empty-object-type`.
