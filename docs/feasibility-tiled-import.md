# Feasibility: Import map từ Tiled Map Editor

> Ngày: **2026-10-02** — Trả lời câu hỏi: *"Có thể import map tạo từ Tiled Map Editor không?"*

---

## ✅ **ĐƯỢC** — pipeline hiện tại **đã hỗ trợ**, nhưng **cần fix 3 điểm**

---

## 1. Pipeline hiện tại

```
Tiled Map Editor (.tmj)
        │
        ▼
packages/shared/data/maps/tiled/*.tmj   ← Client render từ đây
        │
        ├─► apps/client/src/world/TiledMapLoader.ts  (import tĩnh)
        │
        ▼ (cần generate riêng)
packages/shared/data/maps/server/*.json ← Server collision + objects
        │
        ▼
apps/server/src/modules/world/mapLoader  (fs.readFile → ServerMapSchema)
```

**Hai nguồn riêng biệt:**
- **TMJ** = tile graphics + layer (chỉ client render)
- **Server JSON** = collision bitmask + warp/event objects (chỉ server dùng)

---

## 2. Vấn đề blocker #1: **Client dùng static import**

### `apps/client/src/world/TiledMapLoader.ts:5-13`
```typescript
import lappetTownMap from '@pixelmon/shared/data/maps/tiled/lappet-town.tmj';
import route1Map from '@pixelmon/shared/data/maps/tiled/route-1.tmj';
// ...
export const TILED_MAPS = {
  'lappet-town': lappetTownMap,
  'route-1': route1Map,
  // ...
};
```

**Vấn đề:**
- Thêm map mới → phải **sửa source code** (`import` + `TILED_MAPS` entry) → **rebuild**
- Không thể import runtime (upload qua admin)
- Tách biệt khỏi `server/index.json` (dual source of truth)

**Fix:** 
```typescript
// Option A: Runtime fetch (tốn 1 network call, OK với cache)
async function loadMapTmj(mapId: string): Promise<TiledMapJSON> {
  const res = await fetch(`/maps/tiled/${mapId}.tmj`);
  return res.json();
}

// Option B: Build-time glob (static nhưng tự động)
const mapModules = import.meta.glob('@pixelmon/shared/data/maps/tiled/*.tmj', { eager: true });
```

---

## 3. Vấn đề blocker #2: **Server JSON phải generate riêng**

**Hiện tại:** Converter sinh **2 files song song**:
- `convert_essentials_map.py` → `lappet-town.tmj` + `lappet-town.json`
- Hai file **không sync** (manual edit1 cái → lệch cái kia)

**Với map từ Tiled:**
- Tiled chỉ export `.tmj` (chứa tiles + objectgroup `warp`)
- **Không có** `collision.flags` (bitmask 0x01 walkable, 0x04 blocked, ...)
- **Không có** server `objects[]` (format `{type:"warp", toMap, toX, toY}`)

**Fix (2 option):**

### Option A: Tiled → tự derive server JSON từ TMJ
```typescript
// scripts/build-server-map.ts
import { readFileSync, writeFileSync } from 'fs';
import { parse } from './tiled-parser';

const tmj = JSON.parse(readFileSync(`${id}.tmj`));
const serverMap = {
  mapId: id,
  width: tmj.width,
  height: tmj.height,
  collision: deriveCollisionFromLayers(tmj),  // ← heuristic
  objects: deriveObjectsFromTiled(tmj.objects),  // ← warp conversion
  ...
};
writeFileSync(`server/${id}.json`, JSON.stringify(serverMap, null, 2));
```

**Heuristic `deriveCollisionFromLayers`:**
```typescript
function deriveCollisionFromLayers(tmj): Uint8Array {
  const flags = new Uint8Array(tmj.width * tmj.height);
  for (let i = 0; i < flags.length; i++) {
    // Ground layer có tile → walkable (0x01)
    if (tmj.layers.ground[i] > 0) {
      flags[i] |= WALKABLE;
    }
    // Decoration/Overhead layer có tile → blocked (0x04)
    if (tmj.layers.decoration[i] > 0 || tmj.layers.overhead[i] > 0) {
      flags[i] &= ~WALKABLE;
      flags[i] |= BLOCKED;
    }
    // Terrain tag qua tile ID (nếu Tiled có custom property)
    // ...
  }
  return flags;
}
```

### Option B: Server đọc trực tiếp `.tmj` (gộp nguồn)
```typescript
class MapLoader {
  async load(mapId: string): Promise<ServerMap> {
    const tmj = await readJson(join(TILED_DIR, `${mapId}.tmj`));
    return this.fromTiled(tmj);  // parse → ServerMap format
  }
}
```
- ✅ Đơn giản hơn, không cần sync 2 file
- ❌ Phải parse TMJ mỗi lần (tốn hơn, nhưng cache OK)

---

## 4. Vấn đề blocker #3: **Layer format phải đúng chuẩn**

**Hiện tại converter emit:**
```json
"layers": [
  { "name": "Ground",     "type": "tilelayer", "data": [...] },
  { "name": "Decoration", "type": "tilelayer", "data": [...] },
  { "name": "Overhead",   "type": "tilelayer", "data": [...] }
]
```

**Tiled mặc định:**
```json
"layers": [
  { "name": "Background", "type": "tilelayer", "data": [...] },  // ← tên khác!
  { "name": "Walls",      "type": "tilelayer", "data": [...] },
  { "name": "Objects",    "type": "objectgroup", "objects": [...] }
]
```

**Fix:** 
- **Option 1:** Đổi tên layer trong Tiled (`Ground/Decoration/Overhead`) → match code
- **Option 2:** Map tên layer trong `TiledMapLoader`:
  ```typescript
  const layerAlias = {
    'background': 'ground',
    'floor': 'ground',
    'base': 'ground',
    'decoration': 'decoration',
    'mid': 'decoration',
    'walls': 'decoration',
    'overhead': 'overhead',
    'top': 'overhead',
    'roof': 'overhead',
  };
  ```

---

## 5. Implementation checklist

### Phase 1: Unblock static import (Ưu tiên #1)

- [ ] **1.1** `TiledMapLoader.ts` — chuyển sang **runtime fetch**
  - `fetch('/maps/tiled/${mapId}.tmj')` thay vì static import
  - Server Express serve static file từ `packages/shared/data/maps/tiled/`
  - Cache đã load (Map<string, Promise<TiledMapJSON>>)

- [ ] **1.2** Hoặc **build-time glob**:
  ```typescript
  const modules = import.meta.glob('@pixelmon/shared/data/maps/tiled/*.tmj', { eager: true });
  for (const [path, mod] of Object.entries(modules)) {
    const id = path.split('/').pop().replace('.tmj', '');
    TILED_MAPS[id] = (mod as any).default;
  }
  ```

- [ ] **1.3** `vite.config.ts` — nếu dùng glob thì ensure `.tmj` được transform (đã có plugin)

### Phase 2: Tiled → Server JSON auto-gen

- [ ] **2.1** Script `scripts/build-server-map.ts`:
  ```bash
  ts-node scripts/build-server-map.ts <mapId>
  # Hoặc watch mode: --watch để auto-gen khi Tiled save
  ```

- [ ] **2.2** Function `deriveCollisionFromTiled(tmj)`:
  - Dựa trên layer content (ground = walkable, decoration = blocked)
  - Optional: đọc Tiled custom properties (`terrain_tag`, `passage`)

- [ ] **2.3** Function `deriveObjectsFromTiled(tmj.objects)`:
  ```typescript
  function deriveObjects(tmjObjects) {
    return tmjObjects.map(obj => ({
      id: obj.id,
      name: obj.name,
      type: obj.type === 'warp' ? 'warp' : 'event',
      x: obj.x / 32,  // pixel → tile
      y: obj.y / 32,
      width: 1,
      height: 1,
      // Đọc từ Tiled custom properties
      toMap: obj.properties?.find(p => p.name === 'toMap')?.value,
      toX: obj.properties?.find(p => p.name === 'toX')?.value,
      toY: obj.properties?.find(p => p.name === 'toY')?.value,
      direction: obj.properties?.find(p => p.name === 'direction')?.value,
    }));
  }
  ```

- [ ] **2.4** `admin.js` — button **"Regenerate Server Map"** sau khi edit Tiled

### Phase 3: Tiled workflow (tạo map mới)

- [ ] **3.1** Tạo map trong Tiled với template:
  - Layer 1: `Ground` (tile layer)
  - Layer 2: `Decoration` (tile layer)
  - Layer 3: `Overhead` (tile layer)
  - Layer 4: `Objects` (object layer) — `type: "warp"` với properties `{toMap, toX, toY}`

- [ ] **3.2** Export → `.tmj` (không phải `.tmj` compressed, giữ JSON thô)

- [ ] **3.3** Copy vào `packages/shared/data/maps/tiled/`

- [ ] **3.4** Chạy `build-server-map` để generate `server/<id>.json`

- [ ] **3.5** Thêm vào `server/index.json`:
  ```json
  { "mapId": "new-map", "file": "new-map.json", "width": 20, "height": 15 }
  ```

- [ ] **3.6** Restart server (`./scripts/pm.sh restart`) → map sẵn sàng

---

## 6. So sánh 2 workflow

### Workflow hiện tại (RMXP → converter)
```
[RMXP .rxdata] → [converter] → [.tmj] + [server.json]
                     ↓
              Phải có Essentials source
              Phải chạy Python script
              Không editable sau khi convert
```

### Workflow Tiled (đề xuất)
```
[Tiled Editor] → [Save .tmj] → [build-server-map] → [server.json]
                     ↓
              Visual editing trực quan
              Không cần RMXP source
              Auto-gen collision (heuristic)
              Dễ maintain (1 nguồn: .tmj)
```

---

## 7. Rủi ro & Mitigation

| Rủi ro | Mitigation |
|---|---|
| **Static import không hoạt động với map mới** | Chuyển sang runtime fetch (Phase 1) |
| **Server JSON lệch TMJ** | Auto-gen từ TMJ (Phase 2), không edit tay |
| **Heuristic collision sai** | Admin Layer Editor (trong `plan-layers.md` Phase 2) cho phép chỉnh tay sau |
| **Tiled export format khác预期** | Document template rõ ràng (Phase 3.1), validate khi import |
| **Performance: runtime fetch 1 map** | Cache promise, prefetch khi có thể (chưa critical) |
| **Warp object format sai** | Tiled template với custom properties, validate trước khi save |

---

## 8. Kết luận

### ✅ **ĐƯỢC** — với điều kiện fix 3 điểm:

1. **Chuyển static import → runtime fetch/glob** (blocker lớn nhất)
2. **Auto-gen server JSON từ TMJ** (gộp nguồn, không cần 2 file song song)
3. **Quy ước layer name** (Ground/Decoration/Overhead) + warp custom properties

### Workflow sau khi fix:

```bash
# 1. Tạo map trong Tiled (visual editor, drag-drop)
# 2. Export → copy vào packages/shared/data/maps/tiled/
cp my-map.tmj packages/shared/data/maps/tiled/

# 3. Auto-gen server JSON
npm run build:map my-map

# 4. Thêm index.json (tự động nếu dùng watch mode)
echo '{"mapId":"my-map","file":"my-map.json","width":20,"height":15}' >> server/index.json

# 5. Restart
./scripts/pm.sh restart
```

**Không cần RMXP, không cần Python converter.**

---

## 9. Implementation Effort

| Phase | Task | Effort | Dependency |
|---|---|---|---|
| **Phase 1** | Runtime fetch (unblock static import) | **~2-3h** | None |
| **Phase 2** | Auto-gen server JSON từ TMJ | **~3-4h** | Phase 1 |
| **Phase 3** | Admin UI "Regenerate Map" | **~2h** | Phase 2 |
| **Phase 4** | Admin Layer Editor (từ `plan-layers.md`) | ~4-5h | Phase 2 |

**Total:** ~11-14h để có workflow hoàn chỉnh từ Tiled.

---

## 10. Recommendations

**Ưu tiên làm ngay:**
1. **Phase 1** (static import → fetch) — bỏ blocker lớn nhất
2. **Phase 2** (auto-gen server JSON) — gộp 2 nguồn thành 1

**Tích hợp với `plan-layers.md`:**
- Phase 2 trong `plan-layers.md` (Admin Layer Editor) có thể **thay thế** Phase 2 ở đây — editor không chỉ preview mà còn **generate server JSON**
- Kết hợp: Tiled (visual editing) + Admin Layer Editor (auto-gen + preview + edit collision)

**Long-term:**
- Cân nhắc **BỎ converter RMXP** nếu không cần import map cũ nữa
- Hoặc giữ converter như **one-time migration tool** (chạy 1 lần với 5 map hiện tại, sau đó chỉ dùng Tiled)
