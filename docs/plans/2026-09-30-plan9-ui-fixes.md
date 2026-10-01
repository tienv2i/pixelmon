# Plan 9 — Fix zoom với người chơi khác + Minimap kéo + Click-to-move + Nút bấm + Font sắc

## 1. Fix zoom sai vị trí khi có người chơi khác (CRITICAL)

**Nguyên nhân:** `WorldScene.setupUiCamera()` gọi `getWorldObjects()` **một lần duy nhất** lúc khởi tạo.
`remotePlayers` lúc đó còn rỗng. Khi `syncRemotePlayers()` tạo sprite người chơi mới **sau đó**,
sprite đó **không** nằm trong `uiCam.ignore(...)` → bị **cả 2 camera render**:
- `cameras.main` render đúng (zoom theo world)
- `uiCam` render sai (scroll 0,0 zoom 1) → nhân đôi, lệch vị trí

Tương tự `showChat()` tạo text ở world-space cũng không được ignore.

**Fix:** thêm `registerWorldObject()` / `registerHudObject()` gọi `uiCam.ignore()` khi object
được tạo động.

## 2. Fix font chữ quá mờ

**Nguyên nhân:** `pixelArt: true` trong `main.ts` buộc texture filter = NEAREST và tắt
antialiasing trên toàn canvas → **mọi text** (kể cả HUD) bị mờ/rỗ.

**Fix:** `pixelArt: false`, `antialias: true`. Tiles vẫn sắc vì chúng là Graphics 32×32
sinh bằng code, không phải pixel-art asset thật. Tăng font-size HUD cho dễ đọc.

## 3. Minimap kéo được (drag-to-view, thả → về vị trí chuẩn)

- Giữ chuột phải/trái lên minimap → kéo để xem vùng map khác
- Thả chuột → minimap **tween về vị trí neo** (top-right) sau 200ms
- Minimap hiển thị viewport rectangle (khung camera hiện tại)
- Minimap dùng `worldToMm()` nhưng cần thêm `mmToWorld()` để vẽ khung camera

## 4. Click phải → nhân vật tự chạy tới vị trí đó

- `pointerdown` với `rightButtonDown()` → lấy world point → tìm đường → di chuyển tự động
- Pathfinding: A* trên grid walkable (PlaceholderMap cần export `isWalkableTile(x,y)`)
- Di chuyển tự động: bám theo path, mỗi frame tiến 1 tile
- **Phím bàn phím huỷ lệnh:** nếu nhấn WASD/arrow → `clearPath()` dừng chạy tự động
- Vẽ path (đường mảnh) để người chơi thấy hướng đi

## 5. Nút bấm

Thêm `src/ui/Button.ts` — component nút bấm dùng chung:
- `new Button(scene, { x, y, label, onClick, variant })`
- Hỗ trợ `normal` / `primary` / `danger`
- Hover đổi màu, cursor pointer
- Scale theo uiZoom

Dùng cho: Toolbar (thêm nút Zoom +/-, Reset), MenuPanel (đã có).

## Files

| File | Thay đổi |
|------|---------|
| `src/main.ts` | `pixelArt: false`, `antialias: true` |
| `src/ui/theme.ts` | tăng font size helper, thêm `resolution` |
| `src/scenes/WorldScene.ts` | register động camera ignore, click-to-move, path draw, keyboard cancel |
| `src/world/PlaceholderMap.ts` | export `isWalkableTile()`, grid walkable |
| `src/world/Pathfinder.ts` | **MỚI** — A* trên grid |
| `src/ui/Minimap.ts` | drag-to-view + viewport rect + tween về neo |
| `src/ui/Button.ts` | **MỚI** — component nút bấm |
| `src/ui/Toolbar.ts` | dùng Button component |
| `src/ui/MenuPanel.ts` | dùng Button component |