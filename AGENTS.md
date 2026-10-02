# AGENTS.md — Hướng dẫn cho AI Agent / Developer (OpenCode & IDE)

Dự án: **Pixelmon** — Pokemon MMORPG trên web (Phaser 3 Client + Colyseus Server), Monorepo pnpm + Turborepo.

---

## 1. Nguyên tắc làm việc & Tối ưu Token (QUAN TRỌNG)

> **VAI TRÒ:** Đóng vai một **Developer thuần túy** — Yêu cầu **làm việc nhanh, hiệu suất cao và nhanh ra kết quả**:
> - **Quy trình chuẩn:** Nhận yêu cầu -> Đọc file trọng tâm -> Tạo/sửa code chuẩn xác -> Chạy `pnpm run typecheck` xác nhận cú pháp -> Báo cáo hoàn thành.
> - **Tập trung:** Tối ưu hóa thời gian xử lý, không lan man, không dài dòng, không tự tiện làm tester.

1. **Phạm vi thư mục:**
   - Thư mục gốc: `/mnt/data/AI-Agent/pixelmon`. Mọi đường dẫn, import, lệnh đều tính từ đây.
   - **Hạn chế tối đa** việc truy cập hay đọc file ngoài thư mục dự án. Nếu bắt buộc cần đọc tài nguyên bên ngoài, **PHẢI hỏi và được user xác nhận trước**.
2. **Kiểm thử (Testing):**
   - **Hạn chế tối đa** việc chạy test (unit test, jest, vitest, pnpm test, e2e test). Ưu tiên tạo/sửa code và dùng `pnpm run typecheck` để kiểm tra lỗi cú pháp.
   - Nếu thực sự cần chạy test chức năng để xác minh logic, **PHẢI hỏi và được user xác nhận trước**.
3. **Trình duyệt & Vision AI (Playwright / Screenshot):**
   - **Hạn chế tối đa** việc mở trình duyệt (Playwright), chụp ảnh màn hình (screenshot) và dùng Vision AI để tránh gây chậm tiến trình và lãng phí token.
   - Chỉ được mở browser hoặc chụp ảnh màn hình khi user yêu cầu rõ ràng, hoặc **PHẢI hỏi và được user xác nhận trước**.
4. **Dữ liệu lớn & Hình ảnh:**
   - **TUYỆT ĐỐI KHÔNG đọc toàn bộ file JSON lớn** (`data/species.json` 1.2MB, `moves.json`, `items.json`, `.tmj`).
     - Tra cứu siêu tốc bằng CLI: `python3 scripts/tools/query_data.py <species|move|item|map> <tên>` (hoặc `pnpm query ...`).
   - **Không đọc binary ảnh thành chuỗi base64**: Môi trường có sẵn Pillow 12.3.0 (`.venv/bin/python3`). Dùng CLI: `python3 scripts/tools/inspect_image.py <path> [tile_size]`.
5. **Chặn quét thư mục thừa:**
   - Không quét log/temp: `.playwright-mcp/`, `temp/`, `.venv/`, `.turbo/`, `.pm/logs/`.
   - Không quét asset lớn: `packages/shared/assets/`, `packages/shared/data/pbs/`.
6. Cập nhật `project_status.md` sau khi hoàn thành mỗi plan/phase.

---

## 2. Cấu trúc Monorepo & Quy ước kỹ thuật

```
├── packages/shared/       # Chung: types, constants, formulas, Colyseus schemas
├── apps/client/           # Phaser 3 + Vite (vanilla TS, không React/Vue)
├── apps/server/           # Colyseus Game Server + Express API + PostgreSQL/Redis
└── scripts/tools/         # query_data.py, inspect_image.py, pm.sh
```

- **Ngôn ngữ:** TypeScript strict, ESM. Client & Server đều import từ `@pixelmon/shared`.
- **Field name chuẩn:** `spAttack`, `spDefense`, `pokemonId` / `id`, `mediumSlow`, `baseExperience`.
- **Tileset chuẩn:** `Outdoor.png` chuẩn **32×32 pixels, 8 cột tiles** (chiều rộng 256px).

---

## 3. Lệnh dev & Quản lý tiến trình

Dự án dùng Process Manager [`./scripts/pm.sh`](./scripts/pm.sh) để chạy Server và Client ngầm:

```bash
./scripts/pm.sh status     # Xem trạng thái port 2567 & 5173
./scripts/pm.sh restart    # Khởi động lại cả client và server
./scripts/pm.sh logs       # Xem log mới nhất
pnpm run typecheck         # Kiểm tra TypeScript cả 4 packages
```

Trong **OpenCode**, có thể dùng các slash commands:
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
