# AGENTS.md — Hướng dẫn cho AI Agent / Developer (OpenCode & IDE)

Dự án: **Pixelmon** — Pokemon MMORPG trên web (Phaser 3 Client + Colyseus Server), Monorepo pnpm + Turborepo.

## 1. Quy tắc chung & Tối ưu Token cho OpenCode

- **Thư mục gốc:** `/mnt/data/AI-Agent/pixelmon` — mọi đường dẫn, import, script đều tính từ đây.
- **KHÔNG đọc code từ thư mục khác** ngoài thư mục gốc.
- **KHÔNG tự ý chạy test** — chỉ chạy khi user yêu cầu rõ ràng. Agent chỉ tạo/sửa file, không `pnpm test`, không `vitest`, không `jest`.
- **TUYỆT ĐỐI KHÔNG đọc toàn bộ file JSON lớn** (`data/species.json` 1.2MB, `moves.json`, `items.json`, file `.tmj`).
  - Dùng CLI: `python3 scripts/tools/query_data.py species <name|dex>` hoặc `pnpm query species pikachu`.
  - Cực nhanh (0.1s) và chỉ tốn vài chục token thay vì đốt 350.000 token vào context.
- **Xử lý ảnh & Sprite/Tileset:** Môi trường có sẵn Python với **Pillow 12.3.0** (`.venv/bin/python3`).
  - Dùng CLI: `python3 scripts/tools/inspect_image.py <path> [tile_size]` để kiểm tra kích thước W×H, kênh màu, bounding box, grid columns/rows.
  - Không đọc raw binary ảnh thành chuỗi base64 vào lịch sử chat.
  - Tileset `Outdoor.png` là chuẩn **32×32 pixels, 8 cột tiles** (chiều rộng 256px).
- **KHÔNG quét các thư mục log/temp:** `.playwright-mcp/`, `temp/`, `.venv/`, `.turbo/`, `.pm/logs/`.
- **KHÔNG quét các thư mục media & archive lớn:** `packages/shared/assets/` (audio, battlers, battlebacks, characters, tilesets, animations...) và `packages/shared/data/pbs/`. Đã cấu hình chặn quét trong `.opencodeignore` và `.ignore`.
- Cập nhật `project_status.md` **sau khi hoàn thành mỗi plan/phase**.
- Giữ nguyên cấu trúc thư mục đã định (xem mục 2).

## 2. Cấu trúc thư mục (bắt buộc)

```
├── packages/
│   └── shared/                 # Dữ liệu dùng chung giữa Client & Server
│       ├── data/               # species.json, moves.json, items.json, maps/
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
│   │   │   ├── world/          # TiledMapLoader (32x32 tileset)
│   │   │   └── entities/       # PlayerSprite, PokemonSprite...
│   │   └── package.json
│   └── server/                 # Colyseus Game Server + Express API
│       ├── src/
│       │   ├── app.ts          # Setup Express + Colyseus WebSocket Server
│       │   ├── config/         # Database (PostgreSQL + Redis)
│       │   ├── modules/        # Modular Architecture (auth, player, world, battle...)
│       │   └── index.ts
│       └── package.json
├── scripts/
│   ├── pm.sh                   # Quản lý tiến trình server & client
│   └── tools/
│       ├── query_data.py       # Tra cứu Pokémon/Move/Item/Map siêu tốc
│       └── inspect_image.py    # Phân tích kích thước và grid ảnh bằng Pillow
├── opencode.json               # Cấu hình OpenCode (watcher ignore, commands)
├── package.json
├── turbo.json
└── pnpm-workspace.yaml
```

## 3. Quy ước kỹ thuật

- **Language:** TypeScript strict, ESM.
- **Shared package:** `@pixelmon/shared` — Client và Server đều import từ đây (types, constants, formulas, schema).
- **Server:** Express + Colyseus `@colyseus/server`; Room logic trong `modules/*`.
- **Client:** Phaser 3 + Vite; kết nối qua `@colyseus/client` trong `network/`.
- **Database:** PostgreSQL (persistent: users, pokemon, inventory, coordinates) + Redis. Cấu hình trong `apps/server/src/config/`.
- **Naming:** file `.ts` thường (camelCase), class `PascalCase`, constant `UPPER_SNAKE_CASE`.

### 3.1 Game Data (`packages/shared/data/` + `assets/`)

Dữ liệu Pokémon Essentials v21.1: **898 loài, 740 chiêu thức, 693 vật phẩm, 267 đặc tính, 19 hệ**.

Tra cứu qua CLI (khuyên dùng cho AI Agent):
```bash
python3 scripts/tools/query_data.py species pikachu   # Tra cứu Pokémon
python3 scripts/tools/query_data.py move thunderbolt  # Tra cứu chiêu thức
python3 scripts/tools/query_data.py item potion       # Tra cứu vật phẩm
python3 scripts/tools/query_data.py map pallet-town   # Tra cứu map, warps, signs
python3 scripts/tools/query_data.py search species char # Tìm kiếm theo từ khoá
```

Tra cứu ảnh/tileset:
```bash
python3 scripts/tools/inspect_image.py packages/shared/assets/tilesets/Outdoor.png 32
```

Dùng trong code:
```ts
import {
  gameData,
  mapLoader,
  setTypeChart,
  generatePokemon,
} from '@pixelmon/shared';

await gameData.load(); // 1 lần lúc server boot
setTypeChart(gameData.getTypeChart());
const species = gameData.getSpecies('bulbasaur');
const pkm = generatePokemon(
  species,
  16,
  gameData.getMovesForLevel.bind(gameData),
);
```

### 3.2 Field name chuẩn của project

| Không dùng (data gốc) | Dùng (project)     |
| --------------------- | ------------------ |
| `special_attack`      | `spAttack`         |
| `special_defense`     | `spDefense`        |
| `creatureId`          | `pokemonId` / `id` |
| `medium_slow`         | `mediumSlow`       |
| `base_exp`            | `baseExperience`   |

## 4. Lệnh dev & Quản lý tiến trình

Dự án dùng Process Manager [`./scripts/pm.sh`](file:///home/huynhat/AI-Agent/pixelmon/scripts/pm.sh) để chạy Server và Client ngầm:

```bash
./scripts/pm.sh status        # Xem trạng thái port 2567 & 5173
./scripts/pm.sh restart       # Khởi động lại cả client và server
./scripts/pm.sh logs          # Xem log mới nhất
pnpm run typecheck            # Kiểm tra TypeScript cả 4 packages
```

Trong **OpenCode**, có thể dùng trực tiếp các lệnh slash command đã cấu hình sẵn trong `opencode.json`:
- `/status` — Kiểm tra server & client
- `/dev-restart` — Restart server & client
- `/typecheck` — Typecheck toàn bộ dự án
- `/query <loại> <tên>` — Tra cứu data
- `/inspect-img <path>` — Kiểm tra kích thước ảnh/sprite

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
