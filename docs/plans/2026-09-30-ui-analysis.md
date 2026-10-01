# Phân tích giao diện điều khiển — Phong cách Pixelmon MMORPG

## 1. Vấn đề hiện tại

Giao diện hiện tại **không giống game Pokemon MMORPG**, mà giống **game bắn súng / MOBA**. Lý do:

| Đặc điểm hiện tại | Với game MMORPG (Pokemon) | Với game bắn sungs / FPS |
|---|---|---|
| Floating panels | ❌ Không có | ✅ Đúng phong cách |
| Toolbar ở giữa | ❌ Không có | ✅ HUD luôn trung tâm |
| Drag để tự do | ❌ Không có | ✅ Đúng |
| Bố cục theo góc | ❌ Không có | ✅ Đúng |
| Kích thước cố định, neo theo góc | ✅ Đúng | ❌ Không có |

**Kết luận:** Giao diện hiện tại tạo cảm giác **khoảng cách giữa player và world** — như đang nhìn qua "kính ngắm". Trong khi đó, Pokemon MMORPG muốn **player cảm nhận là nhân vật trong game** — UI phải **phía trước**, **gắn với nhân vật**, **thực tế** (như bảng điều khiển trên 1 chiếc xe hơi hay 1 tàu).

## 2. Phân tích ảnh tham khảo (Pokemon Revolution)

### 2.1 Yếu tố chính

| Yếu tố | Mô tả | Ý nghĩa |
|---|---|---|
| **Party sidebar (trái)** | Panel dọc bên trái, liệt kê 6 pokemon với **icon + tên + level + HP bar** | **Luôn hiển thị**, neo cố định ở góc trái-trên |
| **Menu dọc (trái-dưới)** | Stack các icon: **Map, Pokémon, Pouch, Town Map, Trainer, Guild** | Menu điều hướng chính, neo cố định ở trái |
| **Money bar (dưới-trái)** | Panel nhỏ hiện **$193,380** | Neo cố định ở trái-dưới |
| **Hotbar số (dưới-phải)** | **1-4 slot** hiển thị số thứ tự | Neo cố định ở phải-dưới |
| **Chat (dưới-phải)** | Khung chat lớn | Neo cố định ở phải-dưới |
| **Minimap (trên-phải)** | Bản đồ nhỏ | Neo cố định ở phải-trên |
| **Server info (trên-phải)** | "Server Time: 12:35" + đồng hồ | Neo cố định ở phải-trên |
| **Chat tabs (dưới-trung tâm)** | **Global, Other, Battle, Trade, All, Local** | Tab chuyển kênh chat |

### 2.2 Bố cục tổng thể

```
┌─────────────────────────────────────────────────────────────────┐
│ Party      │ Map + Server                                    │
│ (cột 6)    │ (minimap + time)                                 │
│            │                                                  │
│            │        WORLD (nhân vật ở giữa)                   │
│            │                                                  │
│ Menu (6)   │                                                  │
│ + Money    │ Chat                                             │
│            │ + Hotbar                                         │
│ + Hotbar   │ + Tabs                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Đặc điểm:** Bố cục **trục Y** (vertical stack) ở 2 bên, **trục X** (horizontal) ở dưới. Không có panel "trôi nổi" ở giữa.

## 3. Cao kiến đề xuất

### 3.1 Nguyên tắc thiết kế

1. **Neo cố định vào góc màn hình** — các panel không kéo thả (hoặc chỉ cho phép thay đổi vị trí trong khu vực neo).
2. **Stack theo trục** — panel bên trái xếp dọc, panel dưới xếp ngang.
3. **Kích thước ổn định** — panel không thay đổi kích thước khi resize (hoặc thay đổi rất nhỏ).
4. **Tương tác trực tiếp** — click vào icon/menu mở panel tương ứng.
5. **Không có toolbar trung tâm** — mọi nút điều khiển nằm trong menu hoặc hotbar.

### 3.2 Bố cục mới

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐                                            ┌──────────┐│
│ │ PARTY    │        WORLD (map 60×45 tile)              │ MAP      ││
│ │ (6 ô)    │                                            │ + time   ││
│ │          │                                            │          ││
│ └──────────┘                                            └──────────┘│
│                                                                     │
│ ┌──────────┐                                            ┌──────────┐│
│ │ MENU     │                                            │ CHAT     ││
│ │ Map      │                                            │ (tabs)   ││
│ │ Pokémon  │                                            │ + input  ││
│ │ Pouch    │                                            │          ││
│ │ Town Map │                                            │          ││
│ │ Trainer  │                                            │          ││
│ │ Guild    │                                            │          ││
│ │ $ Money  │                                            │          ││
│ └──────────┘                                            └──────────┘│
│                                                                     │
│                                    ┌────┬────┬────┬────┐           │
│                                    │ 1  │ 2  │ 3  │ 4  │           │
│                                    └────┴────┴────┴────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Chi tiết từng panel

#### A. **PartySidebar** (trái-trên)

```
┌────────────────────────┐
│ ● Pikachu   Lv. 25     │
│   ████████░░░░  80/100 │
├────────────────────────┤
│ ● Charmander Lv. 22    │
│   ██████░░░░░░  60/100 │
├────────────────────────┤
│ ● Bulbasaur  Lv. 18    │
│   ████████████ 100/100 │
├────────────────────────┤
│ ● Squirtle   Lv. 15    │
│   ████░░░░░░░░  40/100 │
├────────────────────────┤
│ ● Eevee      Lv. 10    │
│   ████████░░░░  75/100 │
├────────────────────────┤
│ ● Empty      ─────────│
│                        │
└────────────────────────┘
```

- **Kích thước:** 240px × ~300px
- **Vị trí:** Góc trái-trên, cách mép 8px
- **Nội dung:** 6 pokemon (party), mỗi ô có:
  - Icon (32×32)
  - Tên + level
  - HP bar (màu theo % HP)
- **Tương tác:** Click pokemon → mở thông tin chi tiết
- **Neo:** Cố định, không kéo thả

#### B. **MenuPanel** (trái-dưới)

```
┌──────────────────┐
│ 🗺  Map          │
│ 🎒  Pouch        │
│ 🏪  Town Map     │
│ 🎓  Trainer      │
│ 👥  Guild        │
│ 💰  $ 193,380    │
└──────────────────┘
```

- **Kích thước:** 180px × ~200px
- **Vị trí:** Góc trái-dưới, cách mép 8px
- **Nội dung:** 6 icon menu + tiền
- **Tương tác:** Click icon → mở panel tương ứng
- **Neo:** Cố định, không kéo thả

#### C. **Minimap** (phải-trên)

```
┌──────────────────┐
│ Server Time      │
│    12:35         │
├──────────────────┤
│                  │
│   [bản đồ nhỏ]   │
│   (64×48 tile)   │
│                  │
└──────────────────┘
```

- **Kích thước:** 220px × ~180px
- **Vị trí:** Góc phải-trên, cách mép 8px
- **Nội dung:**
  - Đồng hồ server
  - Minimap (64×48 tile, hiển thị player + NPC + warp)
- **Tương tác:** Click minimap → mở bản đồ lớn
- **Neo:** Cố định, không kéo thả

#### D. **ChatPanel** (phải-dưới)

```
┌─────────────────────────────────────┐
│ Global │ Other │ Battle │ Trade │ ...│
├─────────────────────────────────────┤
│ [Player]: Hello world!               │
│ [System]: You received 100 coins     │
│ [NPC]: Welcome to the Pokemon World  │
│ ...                                  │
│                                      │
├─────────────────────────────────────┤
│ Nhập tin nhắn...                [Gửi]│
└─────────────────────────────────────┘
```

- **Kích thước:** 420px × ~220px
- **Vị trí:** Góc phải-dưới, cách mép 8px
- **Nội dung:**
  - Tabs (Global, Other, Battle, Trade, All, Local)
  - Chat log (scroll được)
  - Input + nút Gửi
- **Tương tác:** Click tab → chuyển kênh; Enter → gửi tin nhắn
- **Neo:** Cố định, không kéo thả

#### E. **Hotbar** (phải-dưới, dưới Chat)

```
┌────┬────┬────┬────┐
│  1 │  2 │  3 │  4 │
└────┴────┴────┴────┘
```

- **Kích thước:** 180px × ~44px
- **Vị trí:** Góc phải-dưới, dưới ChatPanel
- **Nội dung:** 4 slot hiển thị số thứ tự (1-4)
- **Tương tác:** Click slot → chọn item/skill
- **Neo:** Cố định, không kéo thả

### 3.4 Thao tác với panel

| Thao tác | Cách làm | Kết quả |
|---|---|---|
| **Xem party** | Panel PartySidebar luôn hiển thị | 6 pokemon với HP bar |
| **Mở menu** | Click icon trong MenuPanel | Panel tương ứng mở ra |
| **Chat** | Nhập tin nhắn + Enter | Tin nhắn hiển thị trong ChatPanel |
| **Chọn item** | Click slot trong Hotbar | Item được chọn |
| **Xem bản đồ** | Click Minimap | Bản đồ lớn mở ra |
| **Đổi zoom** | **Không có nút +/-** — dùng **scroll wheel** để zoom camera | Camera zoom |

### 3.5 Phím tắt (không có toolbar)

| Phím | Chức năng |
|---|---|
| **WASD / Arrow** | Di chuyển nhân vật |
| **1-4** | Chọn item/skill trong Hotbar |
| **Enter** | Mở chat input |
| **Esc** | Mở menu chính (nếu có) |
| **M** | Toggle minimap |
| **Scroll wheel** | Zoom camera (world) |

## 4. Lợi ích

| Lợi ích | Giải thích |
|---|---|
| **Phong cách Pokemon MMORPG** | Bố cục cố định, neo theo góc, stack theo trục — giống các game MMORPG thực sự |
| **Player cảm nhận "trong game"** | UI gắn liền với nhân vật, không tạo khoảng cách |
| **Tương tác trực tiếp** | Click icon → mở panel, không cần toolbar trung tâm |
| **Đơn giản, dễ hiểu** | Không có panel "trôi nổi", không cần kéo thả |
| **Responsive** | Kích thước cố định, không thay đổi khi resize (hoặc thay đổi rất nhỏ) |
| **Tương lai mở rộng** | Dễ thêm menu mới (nếu cần), dễ thay đổi layout |

## 5. Implement đề xuất

### 5.1 Panel mới

| Panel | Vị trí | Kích thước | Nội dung |
|---|---|---|---|
| **PartySidebar** | Trái-trên | 240×300 | 6 pokemon (icon + tên + level + HP) |
| **MenuPanel** | Trái-dưới | 180×200 | 6 icon menu + money |
| **MinimapPanel** | Phải-trên | 220×180 | Đồng hồ + minimap |
| **ChatPanel** | Phải-dưới | 420×220 | Tabs + chat log + input |
| **HotbarPanel** | Phải-dưới (dưới Chat) | 180×44 | 4 slot item |

### 5.2 Panel bỏ

| Panel | Lý do |
|---|---|
| **Toolbar (trung tâm)** | Không có toolbar trung tâm — mọi nút nằm trong menu/hotbar |
| **PlayerHud (trái-trên)** | Thông tin player đã có trong PartySidebar (hoặc overlay trên nhân vật) |
| **Hotbar cũ (8 slot)** | Thay bằng HotbarPanel mới (4 slot) |

### 5.3 Tương tác

- **Neo cố định:** Các panel không kéo thả
- **Click để mở panel:** Click icon trong MenuPanel → mở panel tương ứng
- **Zoom bằng scroll wheel:** Không có nút +/- — dùng scroll wheel để zoom camera
- **Chat bằng Enter:** Nhập Enter → mở chat input

### 5.4 Files cần sửa/xóa

| File | Action | Mô tả |
|---|---|---|
| `src/ui/PartySidebar.ts` | **MỚI** | Panel party dọc (trái-trên) |
| `src/ui/MenuPanel.ts` | **SỬA** | Panel menu icon (trái-dưới) |
| `src/ui/MinimapPanel.ts` | **MỚI** | Panel minimap + đồng hồ (phải-trên) |
| `src/ui/ChatPanel.ts` | **MỚI** | Panel chat với tabs (phải-dưới) |
| `src/ui/HotbarPanel.ts` | **MỚI** | Panel hotbar 4 slot (phải-dưới) |
| `src/ui/Toolbar.ts` | **XÓA** | Không cần toolbar trung tâm |
| `src/ui/PlayerHud.ts` | **XÓA** | Thông tin player trong PartySidebar |
| `src/ui/Hotbar.ts` (cũ) | **XÓA** | Thay bằng HotbarPanel mới |
| `src/scenes/WorldScene.ts` | **SỬA** | Wire panel mới, bỏ panel cũ |

## 6. Kết luận

Để giao diện **đúng phong cách Pokemon MMORPG**, cần:

1. **Bỏ floating panel + toolbar trung tâm** — tạo cảm giác game bắn súng
2. **Thay bằng panel neo cố định vào góc màn hình** — giống các game MMORPG thực sự
3. **Stack theo trục** — panel trái xếp dọc, panel dưới xếp ngang
4. **Kích thước ổn định** — không thay đổi khi resize
5. **Tương tác trực tiếp** — click icon → mở panel, không cần toolbar

Đây là cách tiếp cận **chỉ có cao kiến** (chưa implement), để bạn review và xác nhận trước khi code.
