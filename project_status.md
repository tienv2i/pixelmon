# Project Status — Pixelmon MMORPG

> Cập nhật: 2026-09-29 · Thư mục: `/mnt/data/AI-Agent/pixelmon`

## Trạng thái verify (mới chạy)

| Lệnh                           | Kết quả                                          |
| ------------------------------ | ------------------------------------------------ |
| `pnpm build`                   | ✅ 3/3 tasks (shared → client + server)          |
| `pnpm typecheck`               | ✅ 4/4 tasks                                     |
| `pnpm lint`                    | ✅ 4/4 tasks (shared + client + server, 0 lỗi)   |
| `pnpm exec prettier --check .` | ✅ toàn repo pass (đã format lại toàn bộ source) |

✅ Repo đã là git repository, remote `origin` = `git@github.com:tienv2i/pixelmon.git`, branch `main`.

## Tổng quan kiến trúc

Monorepo pnpm workspace + Turborepo 2.x:

```
pixelmon/
├── package.json              # root devDeps: turbo, typescript, prettier; packageManager pnpm@8.15.9
├── .prettierrc.json          # ⭐ Prettier config chung toàn repo (singleQuote, printWidth 90)
├── .prettierignore           # node_modules, dist, .turbo, lockfiles...
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
- Scripts: `build` (tsc), `lint`, `typecheck`, `test` (vitest run)
- Prettier dùng config chung ở root (`../../.prettierrc.json`)

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

- `eslint.config.js` — ESLint 9 flat config, type-checked rules (type-aware linting)
- `vite.config.ts` (không React plugin — chỉ Vite thuần cho Phaser)
- `tsconfig.json` extends base, override `lib: ["ES2020", "DOM", "DOM.Iterable"]`, path alias `@/*` → `src/*`
- `index.html` mount `<div id="game">` + script `/src/main.ts`
- Scripts: `dev` (vite), `build` (tsc && vite build), `lint`, `typecheck`, `test`

### `apps/server` (`@pixelmon/server`)

Colyseus 0.16.5 + Express + WebSocketServer + Zod validation.

```
src/
├── index.ts                  # entry: express app + colyseus Server + ws transport
├── app.ts                    # mount /api/auth, /api/player
├── config/
│   ├── env.ts                # PORT, JWT_SECRET, DATABASE_URL, validate
│   └── validation.ts         # zod schemas: RegisterSchema, LoginSchema, CreatePokemonSchema
├── types/index.ts            # AsyncHandler, WorldState/BattleState placeholder interfaces, AuthUser + declare global Request.user
└── modules/
    ├── auth/
    │   ├── index.ts          # Router: POST /register, /login
    │   ├── auth.handlers.ts  # bcrypt hash + jwt sign/verify (không trả passwordHash qua API)
    │   └── auth.middleware.ts# requireAuth (Bearer token), gán req.user theo type AugmentedRequest
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

Tooling riêng:

- `eslint.config.js` — ESLint 9 flat config, type-checked rules + `no-explicit-any` warn
- Scripts: `dev` (tsx watch), `build` (tsc), `lint`, `typecheck`, `test`
- Prettier dùng config chung ở root

## Tooling toàn repo

| Công cụ              | Trạng thái                                                     |
| -------------------- | -------------------------------------------------------------- |
| pnpm workspace       | ✅ `packages/*` + `apps/*`                                     |
| Turborepo 2.x        | ✅ `tasks` (không còn `pipeline`), `build` phụ thuộc `^build`  |
| TypeScript           | ✅ `tsconfig.base.json` ở root, cả 3 package `extends`         |
| ESLint 9 flat config | ✅ cả 3 package (shared, client, server) — type-checked rules  |
| Prettier             | ✅ config chung ở root `.prettierrc.json`, toàn repo đã format |
| Vitest               | ✅ mỗi package có `vitest.config.ts` (chưa có test case)       |

## Việc còn dở (theo thứ tự ưu tiên)

1. **Colyseus Schema thật**: `WorldState` / `BattleState` trên server vẫn là placeholder interface → cần viết bằng `@colyseus/schema` class-based (`@type()` decorators).
2. **Client gameplay**: các scene/entity/network đều là stub — chưa render tilemap Tiled, chưa kết nối room thật, chưa có input handler di chuyển.
3. **Persistence**: player/pokemon chỉ in-memory → chưa có DB (Prisma/TypeORM) hay Redis.
4. **Tests**: chưa có test case nào (`passWithNoTests: true` mới chỉ đặt ở shared).
5. **DRY lint config**: hiện mỗi app tự khai báo `eslint.config.js` riêng; nếu muốn gọn hơn, tách base ra `packages/config-eslint`.

## Ghi chú kỹ thuật đã xử lý

- `turbo.json` đổi `pipeline` → `tasks` (Turborepo 2.x breaking change).
- Root `package.json` giữ `"packageManager": "pnpm@8.15.9"` khớp bản cài thực tế.
- `verbatimModuleSyntax` bật ở base config → server phải dùng `import type` cho `Express`, `Request/Response`, `Client`, `WorldState/BattleState`.
- `noImplicitOverride` bật → `WorldRoom`/`BattleRoom` phải đánh dấu `override` trên lifecycle methods.
- `@colyseus/schema@3.x` không publish tên `@colyseus/schema` độc lập như v2 → đã gỡ khỏi deps, chỉ giữ qua peer của `colyseus@0.16.5`.
- Shared `schema/index.ts` đổi empty interface → `SchemaDefs = Record<string, unknown>` để hết lỗi lint `no-empty-object-type`.
- Prettier config đặt ở root (`.prettierrc.json`) dùng chung toàn repo; shared giữ `.prettierrc.json` riêng trùng nội dung cho `format:check` local.
- `auth.middleware.ts`: thay vì `(req as any).user`, dùng `declare global { namespace Express { interface Request { user?: AuthUser } } }` — an toàn type, hết lỗi TS2339.
- `auth.handlers.ts`: bỏ field `passwordHash` khỏi response login/register (chống lộ hash qua API).
- `NetworkManager.currentRoom`: đổi từ `any` → `Room` (import type từ `colyseus.js`).
- Gỡ `express` unused import trong `apps/server/src/index.ts`.
