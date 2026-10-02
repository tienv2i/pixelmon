import type { Request, Response } from 'express';
import { existsSync } from 'fs';
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
const MAPS_SERVER_DIR = join(DATA_DIR, 'maps', 'server');
const MAPS_TILED_DIR = join(DATA_DIR, 'maps', 'tiled');
const PROJECT_ROOT = join(DATA_DIR, '..', '..');

export async function listAdminMaps(_req: Request, res: Response): Promise<void> {
  try {
    const indexPath = join(MAPS_SERVER_DIR, 'index.json');
    if (!existsSync(indexPath)) {
      res.json({ maps: [] });
      return;
    }

    const indexRaw = await readFile(indexPath, 'utf-8');
    const indexList: { mapId: string; file: string; width: number; height: number }[] = JSON.parse(indexRaw);

    const maps = await Promise.all(
      indexList.map(async (entry) => {
        const filePath = join(MAPS_SERVER_DIR, entry.file);
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
    const serverPath = join(MAPS_SERVER_DIR, `${id}.json`);
    const tiledPath = join(MAPS_TILED_DIR, `${id}.tmj`);

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
    const serverPath = join(MAPS_SERVER_DIR, `${id}.json`);

    if (!existsSync(serverPath)) {
      res.status(404).json({ error: 'MAP_NOT_FOUND', message: `Map ${id} not found` });
      return;
    }

    const serverRaw = await readFile(serverPath, 'utf-8');
    const serverMap = JSON.parse(serverRaw);

    const { name, description, weather, music, mapType, objects, encounters } = req.body;

    if (name !== undefined) serverMap.name = String(name);
    if (description !== undefined) serverMap.description = String(description);
    if (weather !== undefined) serverMap.weather = String(weather);
    if (music !== undefined) serverMap.music = String(music);
    if (mapType !== undefined) serverMap.mapType = String(mapType);
    if (Array.isArray(objects)) serverMap.objects = objects;
    if (Array.isArray(encounters)) serverMap.encounters = encounters;

    await writeFile(serverPath, JSON.stringify(serverMap, null, 2), 'utf-8');

    res.json({ success: true, map: serverMap });
  } catch (err: any) {
    console.error('[Admin Maps] update error:', err);
    res.status(500).json({ error: 'Failed to update map', details: err.message });
  }
}

export async function importEssentialsMap(req: Request, res: Response): Promise<void> {
  try {
    const { mapId, slug, name, mapType } = req.body;
    if (!mapId || !slug || !name) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'mapId, slug, name are required' });
      return;
    }

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
    ];

    await execFileAsync(pythonExe, args, { cwd: PROJECT_ROOT });

    // Update server index.json if not already present
    const indexPath = join(MAPS_SERVER_DIR, 'index.json');
    if (existsSync(indexPath)) {
      const indexRaw = await readFile(indexPath, 'utf-8');
      const indexList: any[] = JSON.parse(indexRaw);
      if (!indexList.some((e) => e.mapId === slug)) {
        const mapFilePath = join(MAPS_SERVER_DIR, `${slug}.json`);
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

    const tmjPath = join(MAPS_TILED_DIR, `${id}.tmj`);
    if (!existsSync(tmjPath)) {
      res.status(404).json({
        error: 'TMJ_NOT_FOUND',
        message: `TMJ file not found for map ${id}. Save .tmj into packages/shared/data/maps/tiled/ first.`,
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
