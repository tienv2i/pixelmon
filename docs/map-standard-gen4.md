# Chuẩn Maps — Pokémon Gen 4 (Tiled-first)

> Tài liệu chuẩn duy nhất cho mọi map trong dự án (cả `essen-classic` lẫn `vibe-world`).
> Mọi map mới (đặc biệt vibe-world) PHẢI tuân thủ trước khi `build:map` + merge.
> Engine hiện tại ≈ Gen 4 ở mức tile/collision/encounter; các cơ chế chưa có liệt kê ở §10.

## 1. Tileset & canvas

| Quy tắc | Giá trị |
|---|---|
| Kích thước tile | **32×32 px**, tileset rộng **256px = 8 cột** |
| Tile size logic | 32px (`TILE_SIZE`), `tileWidth/tileHeight` default 16 chỉ là fallback legacy — map mới để 32 |
| Autotile (Essentials) | Được phép: `Sand`, `lake`… khai báo trong `tilesets.json` |
| Tileset ngoài trời | `Outdoor*.png`; trong nhà/hang | `Interior*.png` (riêng từng theme) |
| Không trộn > 1 tileset đồ hoạ khác phong cách trong cùng map (lý do world cũ "loạn") |

## 2. Layers (tên cố định, đúng thứ tự)

| # | Tên | Loại | Render depth | Va chạm |
|---|---|---|---|---|
| 1 | `Ground` | tilelayer | 10 (base) | Nguồn walkable mặc định |
| 2 | `Decoration` | tilelayer | 20 | Ô có tile → BLOCKED (trừ khi property nói khác) |
| 3 | `Overhead` | tilelayer | 30 (che nhân vật) | Không chặn |
| 4 | `Objects` | objectgroup | — | Chứa warp/npc/event (xem §5) |

- Không thêm/bớt/đổi tên layer — client + build script đọc theo tên.
- Mọi tile trang trí cao hơn đầu người (cây, mái nhà, cầu) vẽ ở `Overhead`.

## 3. Tile properties (đặt trong tileset Tiled, áp dụng mọi map dùng tileset)

### 3.1 `terrain_tag` — bảng Gen 4 chuẩn (Essentials v21)

| Tag | Nghĩa Gen 4 | Engine dùng |
|---|---|---|
| 0 / thiếu | None — đất thường | Đi được, không encounter |
| 1 | Ledge (bờ dốc nhảy 1 chiều) | Kết hợp `ledge_dir` (§3.3) |
| 2 | Grass (cỏ thường) | Gây encounter theo bảng Land |
| 3 | Sand | Đi được; encounter nếu bảng Land định nghĩa |
| 4 | Rock | Như đất (hang/núi) |
| 5 | DeepWater | Surf (chưa có — hiện coi như water, §10) |
| 6 | StillWater | Như trên |
| 7 | Water | Surf (chưa có — hiện chặn nếu không có flag đi) |
| 8 | Waterfall | Chặn (cần Waterfall — chưa có) |
| 9 | WaterfallCrest | Chặn |
| 10 | TallGrass (cỏ cao) | Encounter bảng Land, rate cao hơn tag 2 |
| 11 | UnderwaterGrass | Chưa dùng |
| 12 | Ice (băng trượt) | Chưa dùng (hiện như đất) |
| 13 | Neutral | Như đất |
| 14 | SootGrass | Như cỏ (ngoại hình khác) |
| 15 | Bridge (cầu — đi trên water) | Đi được, không encounter |
| 16 | Puddle (vũng nước) | Đi được |
| 17–31 | Custom từng world | Đăng ký ý nghĩa trong file world (không tự bịa) |

### 3.2 `passage` (RMXP 4-bit, theo hướng)

- `0x00` = đi được mọi hướng; `0x0f` = chặn hoàn toàn.
- Bit lẻ từng hướng (cửa 1 chiều, lan can): down `0x01`, left `0x02`, right `0x04`, up `0x08`.
- Engine map bit → `PASS_*` trong collision flags (đi xuyên tường noclip bỏ qua để debug).

### 3.3 `ledge_dir` — bờ dốc Gen 4

- Giá trị: `down` | `up` | `left` | `right` = hướng NHẢY XUỐNG được (1 chiều).
- Đặt ở **bất kỳ layer nào** (build script quét cả 3 — không đặt 2 `ledge_dir` khác nhau cùng ô).
- Ô đích bên dưới phải đi được, nếu không người chơi kẹt (admin báo đỏ khi validate).

### 3.4 `water` & `spawn_zone`

- `water=1`: ô nước (kênh surf sau này; hiện tại chặn di chuyển bộ).
- `spawn_zone=1`: **chỉ đọc ở Ground** — ô cỏ encounter THẬT (tall grass visual). Quy tắc:
  tile visual cỏ cao PHẢI có `spawn_zone=1`, và ngược lại. Không còn rect `spawnZones` tay
  (field cũ trong `MAPS` chỉ là mốc đối chiếu, không inject collision).

## 4. Collision — thứ tự derive (build-server-map.ts, không sửa tay JSON)

1. **A. Layer heuristic:** Decoration có tile → BLOCKED; Ground có tile → WALKABLE; Overhead bỏ qua.
2. **B. Tile property** (thắng A): `passage` → chặn/hở; `terrain_tag` → GRASS/WATER; `ledge_dir`, `water`.
3. **C. Object override** (thắng B): object `event` mang `passage`/`terrain_tag`/`ledge_dir`/`water` đè ô đó.
4. **D. Warp:** ô warp → clear BLOCKED, set WALKABLE|WARP (cửa luôn bước vào được).
5. **E. Landing:** ô đích warp (cùng/cross-map) → clear BLOCKED, set WALKABLE (không đáp vào tường).

## 5. Objects (`Objects` layer) — 3 loại + properties bắt buộc

| type | Bắt buộc | Tuỳ chọn | Ghi chú Gen 4 |
|---|---|---|---|
| `warp` | `targetMap`, `targetX`, `targetY` | `targetWorld` (cổng liên world), `sound` | Cửa/hang/cầu thang. Ô warp tự walkable (§4.D) |
| `npc_spawn` | `npcId`, `x`, `y` | `trainer: true` + `team`, `dialog`, `direction`, `cooldown` | Trainer có `team` + `winRewardMoney` + `loseText` |
| `event` | `eventId`, `script`/`action` | `passage`, `terrain_tag` (override §4.C), `once` | Biển báo, item ball, cắt cảnh quest |

- Toạ độ object = tile (snap lưới, không đặt lẻ pixel).
- NPC không đè lên ô warp/ledge-landing; 2 NPC không chung ô.
- `event` dùng cho quest (P1 quest engine đọc `eventId`).

## 6. Encounter — bảng theo địa hình + giờ + thời tiết

- 1 map có tối đa 2 bảng trong `encounters.json`: `terrain: "Land"` (ô GRASS) và `"Water"` (ô water, khi có surf).
- Entry: `{ species, minLevel, maxLevel, weight, rarity, conditions? }`.
- `conditions.timeOfDay`: `["day"]` vs `["night","dusk"]`… — Pokémon đêm (Hoothoot, Umbreon-line…) PHẢI gắn điều kiện, không thả cả ngày (đúng Gen 4: bảng sáng/tối khác nhau).
- `conditions.weather`: Pokémon mưa/tuyết gắn `["rain"]`/`["snow"]` (engine đã filter từ worldClock).
- `encounterRate` (0–100 trong `MAPS`): town/interior **0**, route thường **15–20**, hang/cỏ rậm **25–30**.
- Level hoang theo tiến trình world: route đầu Lv.2–5, mỗi route sau +2–4 (ghi vào cột design của world, không đoán mò).

## 7. Metadata map (ServerMap + MAPS)

Bắt buộc mỗi map: `mapId` (= tên file, kebab-case, prefix world: `vibe-pallet`), `name`,
`mapType` (town/route/dungeon/gym/interior/battle), `width/height` (= đúng TMJ),
`spawn {x,y}` (ô walkable, không phải grass), `worldId`, `weather` (mặc định map, vd `sunny`),
`music` (BGM theo map), `pvp` (chỉ route/arena chỉ định), `encounterRate`.

## 8. Workflow Tiled-first (bắt buộc)

1. Copy `templates/pixelmon-map-template.tmj` → `tiled/<world>/<mapId>.tmj` (đã có đúng 4 layers).
2. Vẽ map → gán tile property vào **tileset** (không gán lẻ từng ô trừ object override).
3. Đặt warp/npc/event ở `Objects`, điền đủ property §5.
4. Chạy `pnpm run build:map <mapId>` (hoặc `--all --dry-run` để review) → kiểm tra warn (warp gãy, ledge đáp tường, spawn_zone thiếu).
5. Mở trang admin → tab Maps → xem preview + card Thống kê → mới merge.

## 9. Checklist trước merge map mới

- [ ] Đúng 4 layers, đúng tên; tileset 32×32/8 cột, cùng phong cách world.
- [ ] Mọi ô cỏ visual có `spawn_zone=1` ở Ground (dùng `/debug terrain 2` ingame đối chiếu).
- [ ] Mọi warp có đích hợp lệ (ô đích walkable sau build); warp liên world có `targetWorld`.
- [ ] NPC không chồng ô nhau/warp/landing; trainer có team + reward.
- [ ] `spawn` đi được; `encounterRate` đúng loại map; bảng Land/Water + timeOfDay hợp lý.
- [ ] `pnpm run build:map` không warn; admin preview + stats khớp.

## 10. Parity Gen 4 — có / chưa (không hứa bừa)

| Có (engine corrido) | Chưa (lộ trình) |
|---|---|
| Tile/properties, ledge 1 chiều, warp (+liên world), encounter Land + filter giờ/thời tiết, day/night visual, BGM field | Surf/water travel, fishing (cần câu), map edge-connections (đi bộ xuyên biên map), bike, Fly, headbutt/honey trees, swarm, Ice trượt, Waterfall/Rock Climb HM |

## 11. Áp dụng cho vibe-world

- Asset pack `vibe-v1`: 1 Outdoor + 1 Interior vẽ mới (hoặc chọn 1 set Essentials đồng bộ — không trộn).
- Map đầu tiên: `vibe-pallet` (town, encounter 0) + `vibe-route-1` (Land 15–20, day/night split) + 1 interior (lab).
- Mọi map vibe-world review theo §9 trước khi ra khỏi `draft`.
