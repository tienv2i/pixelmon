# AGENTS.md — Hướng dẫn cho AI Agent / Developer

Dự án: **Pixelmon** — Pokemon MMORPG trên web (Phaser 3 Client + Colyseus Server), Monorepo pnpm + Turborepo.

## 1. Quy tắc chung

- **Thư mục gốc:** `/mnt/data/AI-Agent/pixelmon` — mọi đường dẫn, import, script đều tính từ đây.
- **KHÔNG đọc code từ thư mục khác** ngoài thư mục gốc (không `../other-project`, không symlink ra ngoài).
- **KHÔNG tự ý chạy test** — chỉ chạy khi user yêu cầu rõ ràng. Agent chỉ tạo/sửa file, không `pnpm test`, không `vitest`, không `jest`.
- **Xử lý ảnh & Sprite:** Môi trường đã có sẵn Python với **Pillow 12.3.0** (`.venv/bin/python3`). Khi cần chỉnh sửa, cắt ghép, resize, kiểm tra kích thước frame hoặc tạo spritesheet, **hãy viết script Python sử dụng Pillow** để xử lý trực tiếp trên đĩa (chuẩn xác từng pixel và không tốn token ngữ cảnh). Tránh dùng tool `read` nạp raw binary ảnh lớn thành chuỗi base64 vào lịch sử chat nhiều lần.
- **KHÔNG đọc trực tiếp toàn bộ file JSON lớn** (`data/species.json` 1.2MB, `moves.json`), chỉ grep dòng cần thiết hoặc truy xuất qua module `gameData`.
- **KHÔNG quét các thư mục log/temp:** `.playwright-mcp/`, `temp/`, `.venv/`.
- Cập nhật `project_status.md` (và `projects_status.md` nếu có) **sau khi hoàn thành mỗi plan/phase**.
- Giữ nguyên cấu trúc thư mục đã định (xem mục 3). Thêm file mới phải đặt đúng chỗ.

## 2. Cấu trúc thư mục (bắt buộc)

```
├── packages/
│   └── shared/                 # Dữ liệu dùng chung giữa Client & Server
│       ├── src/
│       │   ├── types/          # Interfaces: Player, Stats, Item...
│       │   ├── constants/      # Grid size, move speeds, map IDs...
│       │   ├── schema/         # Colyseus State Schemas
│       │   └── formulas/       # Công thức damage, stat exp...
│       └── package.json
├── apps/
│   ├── client/                 # Phaser 3 + Vite (vanilla, không React/Vue)
│   │   ├── src/
│   │   │   ├── scenes/         # Boot, Login, WorldScene, BattleScene
│   │   │   ├── network/        # Colyseus Client Manager
│   │   │   └── entities/       # PlayerSprite, PokemonSprite...
│   │   └── package.json
│   └── server/                 # Colyseus Game Server + Express API
│       ├── src/
│       │   ├── app.ts          # Setup Express + Colyseus WebSocket Server
│       │   ├── config/         # Database (PostgreSQL + Redis)
│       │   ├── modules/        # Modular Architecture
│       │   │   ├── auth/       # JWT, Register, Login API
│       │   │   ├── player/     # Load/Save stats, inventory
│       │   │   ├── world/      # Colyseus WorldRoom (Map, Movement)
│       │   │   ├── battle/     # Colyseus BattleRoom (Turn-based logic)
│       │   │   └── pokemon/    # Pokemon database, IV/EV, skills
│       │   └── index.ts
│       └── package.json
├── package.json
├── turbo.json
└── pnpm-workspace.yaml
```

## 3. Quy ước kỹ thuật

- **Language:** TypeScript strict, ESM.
- **Shared package:** tên package `@pixelmon/shared` — Client và Server đều import từ đây (types, constants, formulas, schema).
- **Server:** Express + Colyseus `@colyseus/server`; Room logic trong `modules/*`.
- **Client:** Phaser 3 + Vite; kết nối qua `@colyseus/client` trong `network/`.
- **Database:** PostgreSQL (persistent: users, pokemon, inventory) + Redis (session/cache/pubsub). Cấu hình trong `apps/server/src/config/`.
- **State management:** Colyseus Schema classes dùng chung từ `packages/shared/src/schema/` (nếu shared được compile) — server broadcast, client `onStateChange`.
- **Naming:** file `.ts` thường (camelCase), class `PascalCase`, constant `UPPER_SNAKE_CASE`.

### 3.1 Game Data (`packages/shared/data/` + `assets/`)

Đã import sẵn từ project `pixmon`. **Dùng data này, không tự tạo data Pokémon mới.**

- `data/species.json` — 649 species, `data/moves.json` — 559 moves, `data/items.json` — 526 items
- `data/types.json` — type chart 18 hệ (đọc qua `getTypeChart()` / `setTypeChart()`)
- `data/encounters.json`, `data/trainers.json`, `data/quests/`
- `data/maps/server/*.json` — collision bitmask + objects (server-side, nhẹ)
- `assets/icons/pokemon/icon1..649.png` — icon Pokémon (`.png` hậu tố `_1.._3` = shiny, `f` = female)
- `assets/tilesets/*.png` — tileset 16x16

Cách dùng:

```ts
import {
  gameData,
  mapLoader,
  setTypeChart,
  generatePokemon,
} from '@pixelmon/shared';

await gameData.load(); // 1 lần lúc server boot
setTypeChart(gameData.getTypeChart()); // đưa chart vào formulas
const species = gameData.getSpecies('bulbasaur');
const pkm = generatePokemon(
  species,
  16,
  gameData.getMovesForLevel.bind(gameData),
);
const map = await mapLoader.load('pallet-town');
```

### 3.2 Field name chuẩn của project (đã chuẩn hóa từ data gốc)

| Không dùng (data gốc) | Dùng (project)     |
| --------------------- | ------------------ |
| `special_attack`      | `spAttack`         |
| `special_defense`     | `spDefense`        |
| `creatureId`          | `pokemonId` / `id` |
| `medium_slow`         | `mediumSlow`       |
| `base_exp`            | `baseExperience`   |

Không import trực tiếp từ `data/*.json` trong code — luôn qua `gameData` / `mapLoader` (đã normalize + validate).

## 4. Workflow plan

1. Viết plan vào `project_status.md` (mục Plans) trước khi code.
2. Code từng step theo plan.
3. **Không chạy test.**
4. Sau khi xong plan → cập nhật `project_status.md`: đánh dấu `[x]`, ghi ngày, ghi chú kết quả.
5. Tiếp tục plan tiếp theo.

## 5. Lệnh dev (chỉ khi user yêu cầu)

```bash
pnpm install          # cài deps
pnpm dev              # chạy cả client + server (turbo)
pnpm dev:server       # chỉ server :2567
pnpm dev:client       # chỉ client :5173
```

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
