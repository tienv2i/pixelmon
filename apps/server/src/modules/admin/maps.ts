import type { Request, Response } from 'express';
import { existsSync, readFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { MAPS } from '@pixelmon/shared';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDataDir(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', '..', '..', 'packages', 'shared', 'data'),
    join(__dirname, '..', '..', '..', '..', 'packages', 'shared', 'data'),
    join(process.cwd(), 'packages', 'shared', 'data'),
    join(process.cwd(), '..', 'packages', 'shared', 'data'),
    join(process.cwd(), '..', '..', 'packages', 'shared', 'data'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

const DATA_DIR = resolveDataDir();
const WORLDS_DIR = join(DATA_DIR, 'maps', 'worlds');
const MAP_INDEX_PATH = join(DATA_DIR, 'maps', 'map-index.json');
const PROJECT_ROOT = join(DATA_DIR, '..', '..');

/** World chứa map (đọc `map-index.json`; không có → essen-classic). */
function worldOfMap(mapId: string): string {
  try {
    const idx = JSON.parse(readFileSync(MAP_INDEX_PATH, 'utf-8')) as Record<string, string>;
    return idx[mapId] ?? 'essen-classic';
  } catch {
    return 'essen-classic';
  }
}

const serverPathFor = (mapId: string, world?: string) =>
  join(WORLDS_DIR, world ?? worldOfMap(mapId), 'server', `${mapId}.json`);
const tiledPathFor = (mapId: string, world?: string) =>
  join(WORLDS_DIR, world ?? worldOfMap(mapId), 'tiled', `${mapId}.tmj`);

export async function listAdminMaps(req: Request, res: Response): Promise<void> {
  try {
    // Gộp index mọi world (mỗi world 1 bộ riêng); `?world=` để lọc.
    const filterWorld = typeof req.query.world === 'string' ? req.query.world : '';
    const worldsRaw = await readFile(join(DATA_DIR, 'maps', 'worlds.json'), 'utf-8').catch(() => '[]');
    const worlds = JSON.parse(worldsRaw) as { id: string }[];
    const entries: { mapId: string; file: string; width: number; height: number; world: string }[] = [];
    for (const w of worlds.length > 0 ? worlds : [{ id: 'essen-classic' }]) {
      if (filterWorld && w.id !== filterWorld) continue;
      const indexPath = join(WORLDS_DIR, w.id, 'server', 'index.json');
      if (!existsSync(indexPath)) continue;
      const indexRaw = await readFile(indexPath, 'utf-8');
      const indexList: { mapId: string; file: string; width: number; height: number }[] = JSON.parse(indexRaw);
      for (const e of indexList) entries.push({ ...e, world: w.id });
    }

    const maps = await Promise.all(
      entries.map(async (entry) => {
        const filePath = join(WORLDS_DIR, entry.world, 'server', entry.file);
        let detail: any = {};
        if (existsSync(filePath)) {
          try {
            const raw = await readFile(filePath, 'utf-8');
            detail = JSON.parse(raw);
          } catch {
            // Ignore parse error
          }
        }

        const sharedConfig = (MAPS as any)[entry.mapId];

        return {
          mapId: entry.mapId,
          world: entry.world,
          name: detail.name || entry.mapId,
          width: detail.width || entry.width,
          height: detail.height || entry.height,
          tileWidth: detail.tileWidth || 32,
          tileHeight: detail.tileHeight || 32,
          mapType: detail.mapType || 'town',
          music: detail.music || '',
          weather: detail.weather || 'sunny',
          objectsCount: Array.isArray(detail.objects) ? detail.objects.length : 0,
          warpsCount: Array.isArray(detail.objects)
            ? detail.objects.filter((o: any) => o.type === 'warp').length
            : 0,
          encountersCount: Array.isArray(detail.encounters) ? detail.encounters.length : 0,
          pvp: sharedConfig ? sharedConfig.pvp : false,
          encounterRate: sharedConfig ? sharedConfig.encounterRate : 0,
          spawn: sharedConfig ? sharedConfig.spawn : { x: 0, y: 0 },
        };
      })
    );

    res.json({ maps });
  } catch (err: any) {
    console.error('[Admin Maps] list error:', err);
    res.status(500).json({ error: 'Failed to list maps', details: err.message });
  }
}

export async function getAdminMapDetail(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const world = typeof req.query.world === 'string' && req.query.world ? req.query.world : worldOfMap(String(id));
    const serverPath = serverPathFor(String(id), world);
    const tiledPath = tiledPathFor(String(id), world);

    if (!existsSync(serverPath)) {
      res.status(404).json({ error: 'MAP_NOT_FOUND', message: `Map ${id} not found` });
      return;
    }

    const serverRaw = await readFile(serverPath, 'utf-8');
    const serverMap = JSON.parse(serverRaw);

    let tiledMap: any = null;
    if (existsSync(tiledPath)) {
      try {
        const tiledRaw = await readFile(tiledPath, 'utf-8');
        tiledMap = JSON.parse(tiledRaw);
      } catch {
        // Ignore
      }
    }

    const sharedConfig = (MAPS as any)[id];

    res.json({
      map: serverMap,
      tiled: tiledMap,
      sharedConfig: sharedConfig || null,
      stats: computeMapStats(serverMap, tiledMap),
    });
  } catch (err: any) {
    console.error('[Admin Maps] detail error:', err);
    res.status(500).json({ error: 'Failed to get map details', details: err.message });
  }
}

/**
 * Thống kê map (plan 41 Phase 5.5): số cell mỗi layer, số warp, phân bố collision flag.
 * Dùng cho card "Thống kê Map" trong Admin Maps tab.
 */
function computeMapStats(serverMap: any, tiledMap: any) {
  const layers: { name: string; cells: number }[] = [];
  let tilePropsCount = 0;

  if (tiledMap && Array.isArray(tiledMap.layers)) {
    for (const l of tiledMap.layers) {
      if (l.type === 'tilelayer' && Array.isArray(l.data)) {
        // Số ô THỰC SỰ có tile (không tính ô trống gid=0)
        const cells = l.data.filter((g: number) => g && g > 0).length;
        layers.push({ name: l.name, cells });
      }
    }
  }

  // Đếm tile có properties (passage/terrain_tag) trong tileset
  const ts = tiledMap && tiledMap.tilesets && tiledMap.tilesets[0];
  if (ts && Array.isArray(ts.tiles)) {
    tilePropsCount = ts.tiles.filter((t: any) => Array.isArray(t.properties) && t.properties.length > 0)
      .length;
  }

  // Phân bố collision flag
  const flags: number[] =
    serverMap && serverMap.collision && Array.isArray(serverMap.collision.flags)
      ? serverMap.collision.flags
      : [];
  const total = flags.length;
  let walkable = 0;
  let blocked = 0;
  let water = 0;
  let grass = 0;
  let ledge = 0;
  let warp = 0;
  for (const f of flags) {
    if (f & 0x01) walkable++;
    if (f & 0x04) blocked++;
    if (f & 0x02) water++;
    if (f & 0x08) grass++;
    if (f & 0x10) ledge++;
    if (f & 0x80) warp++;
  }

  const objects = Array.isArray(serverMap?.objects) ? serverMap.objects : [];
  const warps = objects.filter((o: any) => o.type === 'warp').length;

  return {
    layers,
    tilePropsCount,
    collision: {
      total,
      walkable,
      blocked,
      water,
      grass,
      ledge,
      warp,
    },
    objects: {
      total: objects.length,
      warps,
      events: objects.length - warps,
    },
    encounters: Array.isArray(serverMap?.encounters) ? serverMap.encounters.length : 0,
  };
}

export async function updateAdminMap(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const serverPath = serverPathFor(String(id));

    if (!existsSync(serverPath)) {
      res.status(404).json({ error: 'MAP_NOT_FOUND', message: `Map ${id} not found` });
      return;
    }

    const serverRaw = await readFile(serverPath, 'utf-8');
    const serverMap = JSON.parse(serverRaw);

    const { name, description, weather, music, mapType, objects, encounters, worldId } = req.body;

    if (name !== undefined) serverMap.name = String(name);
    if (description !== undefined) serverMap.description = String(description);
    if (weather !== undefined) serverMap.weather = String(weather);
    if (music !== undefined) serverMap.music = String(music);
    if (mapType !== undefined) serverMap.mapType = String(mapType);
    if (Array.isArray(objects)) serverMap.objects = objects;
    if (Array.isArray(encounters)) serverMap.encounters = encounters;

    // Chuyển map sang world khác: dời cả server JSON + TMJ, cập nhật map-index.
    if (typeof worldId === 'string' && worldId && worldId !== serverMap.worldId) {
      const worldsRaw = await readFile(join(DATA_DIR, 'maps', 'worlds.json'), 'utf-8').catch(() => '[]');
      const worlds = JSON.parse(worldsRaw) as { id: string }[];
      if (!worlds.some((w) => w.id === worldId)) {
        res.status(400).json({ error: 'UNKNOWN_WORLD', message: `World ${worldId} không tồn tại` });
        return;
      }
      const { rename, mkdir } = await import('fs/promises');
      const fromWorld = serverMap.worldId || worldOfMap(String(id));
      await mkdir(join(WORLDS_DIR, worldId, 'server'), { recursive: true });
      await mkdir(join(WORLDS_DIR, worldId, 'tiled'), { recursive: true });
      const fromServer = serverPathFor(String(id), fromWorld);
      const fromTiled = tiledPathFor(String(id), fromWorld);
      serverMap.worldId = worldId;
      await writeFile(fromServer, JSON.stringify(serverMap, null, 2), 'utf-8');
      await rename(fromServer, serverPathFor(String(id), worldId));
      if (existsSync(fromTiled)) await rename(fromTiled, tiledPathFor(String(id), worldId));
      // Cập nhật map-index.json (giữ thứ tự).
      try {
        const idx = JSON.parse(await readFile(MAP_INDEX_PATH, 'utf-8')) as Record<string, string>;
        idx[String(id)] = worldId;
        const sorted: Record<string, string> = {};
        for (const k of Object.keys(idx).sort()) sorted[k] = idx[k];
        await writeFile(MAP_INDEX_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
      } catch {
        // map-index sẽ được sinh lại ở lần build:map kế tiếp.
      }
      // Rebuild index từng world (bỏ entry cũ, thêm entry mới).
      await rebuildWorldIndexes();
    } else {
      await writeFile(serverPath, JSON.stringify(serverMap, null, 2), 'utf-8');
    }

    res.json({ success: true, map: serverMap });
  } catch (err: any) {
    console.error('[Admin Maps] update error:', err);
    res.status(500).json({ error: 'Failed to update map', details: err.message });
  }
}

/** Viết lại `server/index.json` mọi world từ file hiện có (sau khi chuyển world). */
async function rebuildWorldIndexes(): Promise<void> {
  const { readdir, mkdir } = await import('fs/promises');
  const worlds = await readdir(WORLDS_DIR, { withFileTypes: true });
  for (const w of worlds) {
    if (!w.isDirectory()) continue;
    const serverDir = join(WORLDS_DIR, w.name, 'server');
    await mkdir(serverDir, { recursive: true });
    const entries: { mapId: string; file: string; width: number; height: number }[] = [];
    for (const f of await readdir(serverDir)) {
      if (!f.endsWith('.json') || f === 'index.json') continue;
      if (/^\d+$/.test(f.replace(/\.json$/, ''))) continue;
      try {
        const s = JSON.parse(await readFile(join(serverDir, f), 'utf-8'));
        entries.push({ mapId: s.mapId, file: `${s.mapId}.json`, width: s.width, height: s.height });
      } catch {
        // Bỏ file lỗi.
      }
    }
    entries.sort((a, b) => a.mapId.localeCompare(b.mapId));
    await writeFile(join(serverDir, 'index.json'), JSON.stringify(entries, null, 2) + '\n', 'utf-8');
  }
}

export async function importEssentialsMap(req: Request, res: Response): Promise<void> {
  try {
    const { mapId, slug, name, mapType, worldId } = req.body;
    if (!mapId || !slug || !name) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'mapId, slug, name are required' });
      return;
    }
    // World đích (mặc định essen-classic để không vỡ flow cũ).
    const targetWorld = typeof worldId === 'string' && worldId ? worldId : 'essen-classic';

    const scriptPath = join(PROJECT_ROOT, 'scripts', 'tools', 'convert_essentials_map.py');
    const pythonBin = join(PROJECT_ROOT, '.venv', 'bin', 'python3');
    const pythonExe = existsSync(pythonBin) ? pythonBin : 'python3';

    const args = [
      scriptPath,
      String(mapId),
      String(slug),
      String(name),
      '--type',
      String(mapType || 'town'),
      '--world',
      String(targetWorld),
    ];

    await execFileAsync(pythonExe, args, { cwd: PROJECT_ROOT });

    // Update per-world server index.json + root map-index.json.
    const worldServerDir = join(WORLDS_DIR, String(targetWorld), 'server');
    const indexPath = join(worldServerDir, 'index.json');
    if (existsSync(indexPath)) {
      const indexRaw = await readFile(indexPath, 'utf-8');
      const indexList: any[] = JSON.parse(indexRaw);
      if (!indexList.some((e) => e.mapId === slug)) {
        const mapFilePath = join(worldServerDir, `${slug}.json`);
        let w = 20;
        let h = 18;
        if (existsSync(mapFilePath)) {
          const m = JSON.parse(await readFile(mapFilePath, 'utf-8'));
          w = m.width;
          h = m.height;
        }
        indexList.push({
          mapId: slug,
          file: `${slug}.json`,
          width: w,
          height: h,
        });
        await writeFile(indexPath, JSON.stringify(indexList, null, 2), 'utf-8');
      }
    }
    try {
      const idx = JSON.parse(await readFile(MAP_INDEX_PATH, 'utf-8')) as Record<string, string>;
      idx[String(slug)] = String(targetWorld);
      const sorted: Record<string, string> = {};
      for (const k of Object.keys(idx).sort()) sorted[k] = idx[k];
      await writeFile(MAP_INDEX_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    } catch {
      // map-index sẽ được sinh lại ở lần build:map kế tiếp.
    }

    res.json({ success: true, message: `Map ${name} (${slug}) imported successfully` });
  } catch (err: any) {
    console.error('[Admin Maps] import error:', err);
    res.status(500).json({ error: 'Failed to import Essentials map', details: err.message });
  }
}

/**
 * POST /api/admin/maps/:id/regenerate — chạy `build:map <id>` để sinh lại server JSON từ TMJ.
 * Plan 41 Phase 5.4: nút "Regenerate Server JSON" trong Admin.
 */
export async function regenerateAdminMap(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const tmjPath = tiledPathFor(String(id));
    if (!existsSync(tmjPath)) {
      res.status(404).json({
        error: 'TMJ_NOT_FOUND',
        message: `TMJ file not found for map ${id}. Save .tmj into packages/shared/data/maps/worlds/<world>/tiled/ first.`,
      });
      return;
    }

    const scriptPath = join(PROJECT_ROOT, 'scripts', 'build-server-map.ts');
    if (!existsSync(scriptPath)) {
      res.status(500).json({ error: 'SCRIPT_NOT_FOUND', message: `build-server-map.ts not found` });
      return;
    }

    const nodeBin = process.execPath; // /usr/bin/node
    const args = [scriptPath, id];

    const { stdout, stderr } = await execFileAsync(nodeBin, args, {
      cwd: PROJECT_ROOT,
      timeout: 30_000,
    });

    // Parse log output để extract thống kê
    const log = stdout + stderr;
    const successMatch = log.match(/✅\s+(\S+):\s+(\d+)×(\d+),\s+(\d+)\s+warp,\s+(\d+)\s+obj,\s+(\d+)\s+spawn/);

    res.json({
      success: true,
      message: `Server JSON regenerated for ${id}`,
      stats: successMatch
        ? {
            width: parseInt(successMatch[2], 10),
            height: parseInt(successMatch[3], 10),
            warps: parseInt(successMatch[4], 10),
            objects: parseInt(successMatch[5], 10),
            spawns: parseInt(successMatch[6], 10),
          }
        : null,
      log: log.trim(),
    });
  } catch (err: any) {
    console.error('[Admin Maps] regenerate error:', err);
    const msg = err.stdout || err.stderr || err.message || 'Unknown error';
    res.status(500).json({ error: 'Failed to regenerate server JSON', details: msg });
  }
}
