# Scripts — Quản lý tiến trình

## `pm.sh` — Process Manager cho server & client

Script quản lý tiến trình game, thay cho việc start/stop thủ công bằng `pnpm dev` + `pkill`.
Quản lý PID, log, port — tự free port cũ trước khi start/restart, tránh xung đột.

### Cấu hình

Chỉnh sửa `scripts/pm.config`:

| Biến               | Mặc định                   | Mô tả                                            |
| ------------------ | -------------------------- | ------------------------------------------------ |
| `PM_NODE_VERSION`  | `20`                       | Node version (dùng fnm nếu chưa có pnpm)         |
| `PM_SERVER_PORT`   | `2567`                     | Cổng server Colyseus/Express                     |
| `PM_CLIENT_PORT`   | `5173`                     | Cổng Vite client                                 |
| `PM_SERVER_CMD`    | `pnpm --filter server dev` | Lệnh start server                                |
| `PM_CLIENT_CMD`    | `pnpm --filter client dev` | Lệnh start client                                |
| `PM_READY_TIMEOUT` | `60`                       | Thời gian chờ port mở (giây)                     |
| `PM_STOP_TIMEOUT`  | `8`                        | Thời gian chờ process thoát trước SIGKILL (giây) |

### Cách dùng

```bash
# Khởi động (tự free port cũ trước)
./scripts/pm.sh start              # cả server + client
./scripts/pm.sh start server       # chỉ server
./scripts/pm.sh start client       # chỉ client

# Dừng sạch (SIGTERM → đợi → SIGKILL)
./scripts/pm.sh stop               # cả hai
./scripts/pm.sh stop server

# Restart (stop + start, tự dọn port)
./scripts/pm.sh restart            # cả hai
./scripts/pm.sh reload             # alias của restart

# Trạng thái
./scripts/pm.sh status             # PID, port, log mới nhất

# Xem log
./scripts/pm.sh logs server        # 200 dòng cuối
./scripts/pm.sh logs server -f     # theo dõi realtime (Ctrl+C để thoát)
./scripts/pm.sh tail client        # alias của logs <svc> -f

# Tự reload khi sửa file (watch mode)
./scripts/pm.sh watch server       # restart server khi có thay đổi trong src/
./scripts/pm.sh watch client       # restart client khi có thay đổi trong src/

# Force free port (khi gặp "port in use" ngoài ý muốn)
./scripts/pm.sh kill-port 2567

# Dọn dẹp (stop + xoá .pm/)
./scripts/pm.sh clean
```

### Qua npm scripts (không cần nhớ đường dẫn)

```bash
pnpm pm:start        # = ./scripts/pm.sh start
pnpm pm:stop         # = ./scripts/pm.sh stop
pnpm pm:restart      # = ./scripts/pm.sh restart
pnpm pm:status       # = ./scripts/pm.sh status
pnpm pm:logs         # = ./scripts/pm.sh logs
pnpm pm:watch        # = ./scripts/pm.sh watch
pnpm pm -- <args>    # pass mọi lệnh khác: pnpm pm -- kill-port 2567
```

### Thư mục runtime

```
.pm/
├── server.pid       # PID của server
├── client.pid       # PID của client
└── logs/
    ├── server.log   # log server (append, có timestamp mỗi lần start)
    └── client.log   # log client
```

`.pm/` đã có trong `.gitignore`.

### Hành vi quan trọng

- **Start an toàn:** luôn kiểm tra & kill process đang giữ port trước khi start → không còn lỗi `EADDRINUSE`.
- **Stop sạch:** kill theo process group (`kill -- -PID`) để không sót `tsx watch` / `vite` con; nếu quá `PM_STOP_TIMEOUT` → `SIGKILL`.
- **Không kill nhầm:** PID file riêng theo service; PID đã chết sẽ tự dọn khỏi `.pid`.
- **Watch mode:** dùng `inotifywait` nếu có, ngược lại `fswatch`, cuối cùng fallback polling 3s. Debounce 0.5s sau mỗi lần phát hiện để tránh restart liên tiếp.
- **Log:** ghi append vào `.pm/logs/<svc>.log`, có header `=== start <timestamp> ===` mỗi lần start để dễ phân biệt phiên.
