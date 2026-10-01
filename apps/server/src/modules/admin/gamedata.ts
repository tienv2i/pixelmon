import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// Path to packages/shared/data
const DATA_DIR = resolveDataDir();

interface Cache {
  summary: any;
  species: any[];
  moves: any[];
  items: any[];
  abilities: any[];
  types: any;
  loadedAt: number;
}

let cache: Cache | null = null;

async function loadData(): Promise<Cache> {
  // Cache for 60 seconds
  if (cache && Date.now() - cache.loadedAt < 60000) {
    return cache;
  }

  const [summaryRaw, speciesRaw, movesRaw, itemsRaw, abilitiesRaw, typesRaw] = await Promise.all([
    readFile(join(DATA_DIR, 'essentials_summary.json'), 'utf-8').catch(() => '{}'),
    readFile(join(DATA_DIR, 'species.json'), 'utf-8'),
    readFile(join(DATA_DIR, 'moves.json'), 'utf-8'),
    readFile(join(DATA_DIR, 'items.json'), 'utf-8'),
    readFile(join(DATA_DIR, 'abilities.json'), 'utf-8'),
    readFile(join(DATA_DIR, 'types.json'), 'utf-8'),
  ]);

  const rawSpecies = JSON.parse(speciesRaw);
  const enrichedSpecies = rawSpecies.map((s: any, idx: number) => {
    const dexNum = s.dexNum ?? s.dexNumber ?? idx + 1;
    let gen = 1;
    if (dexNum > 809) gen = 8;
    else if (dexNum > 721) gen = 7;
    else if (dexNum > 649) gen = 6;
    else if (dexNum > 493) gen = 5;
    else if (dexNum > 386) gen = 4;
    else if (dexNum > 251) gen = 3;
    else if (dexNum > 151) gen = 2;
    return {
      ...s,
      dexNum,
      generation: s.generation ?? gen,
    };
  });

  cache = {
    summary: JSON.parse(summaryRaw),
    species: enrichedSpecies,
    moves: JSON.parse(movesRaw),
    items: JSON.parse(itemsRaw),
    abilities: JSON.parse(abilitiesRaw),
    types: JSON.parse(typesRaw),
    loadedAt: Date.now(),
  };

  return cache;
}

/** GET /api/admin/gamedata/summary — tổng hợp số lượng và phân loại dữ liệu Essentials */
export async function getGameDataSummary(_req: Request, res: Response): Promise<void> {
  try {
    const data = await loadData();
    res.json({
      ok: true,
      summary: data.summary,
    });
  } catch (err) {
    console.error('[admin:gamedata:summary]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** GET /api/admin/gamedata/species — danh sách species có tìm kiếm, lọc theo gen, hệ, phân trang */
export async function listGameDataSpecies(req: Request, res: Response): Promise<void> {
  try {
    const data = await loadData();
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const gen = req.query.gen ? Number(req.query.gen) : undefined;
    const type = req.query.type ? String(req.query.type).toLowerCase() : undefined;
    const rarity = req.query.rarity ? String(req.query.rarity).toLowerCase() : undefined;

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));

    let filtered = data.species;

    if (q) {
      filtered = filtered.filter(
        (s) =>
          s.id.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          String(s.dexNum).includes(q) ||
          (s.category && s.category.toLowerCase().includes(q)),
      );
    }

    if (gen) {
      filtered = filtered.filter((s) => s.generation === gen);
    }

    if (type) {
      filtered = filtered.filter((s) => s.types && s.types.includes(type));
    }

    if (rarity) {
      filtered = filtered.filter((s) => s.rarity === rarity);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    res.json({
      ok: true,
      total,
      page,
      limit,
      totalPages,
      species: items,
    });
  } catch (err) {
    console.error('[admin:gamedata:species]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** GET /api/admin/gamedata/species/:id — chi tiết 1 loài Pokémon */
export async function getGameDataSpeciesDetail(req: Request, res: Response): Promise<void> {
  try {
    const data = await loadData();
    const id = req.params.id?.toLowerCase();
    const species = data.species.find((s) => s.id.toLowerCase() === id);

    if (!species) {
      res.status(404).json({ ok: false, code: 'SPECIES_NOT_FOUND', message: 'Không tìm thấy loài' });
      return;
    }

    res.json({
      ok: true,
      species,
    });
  } catch (err) {
    console.error('[admin:gamedata:species:detail]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** GET /api/admin/gamedata/moves — danh sách chiêu thức có phân trang, lọc hệ và phân loại */
export async function listGameDataMoves(req: Request, res: Response): Promise<void> {
  try {
    const data = await loadData();
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const type = req.query.type ? String(req.query.type).toLowerCase() : undefined;
    const category = req.query.category ? String(req.query.category).toLowerCase() : undefined;

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));

    let filtered = data.moves;

    if (q) {
      filtered = filtered.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)),
      );
    }

    if (type) {
      filtered = filtered.filter((m) => m.type === type);
    }

    if (category) {
      filtered = filtered.filter((m) => m.category === category);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    res.json({
      ok: true,
      total,
      page,
      limit,
      totalPages,
      moves: items,
    });
  } catch (err) {
    console.error('[admin:gamedata:moves]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** GET /api/admin/gamedata/items — danh sách vật phẩm có phân trang, lọc category */
export async function listGameDataItems(req: Request, res: Response): Promise<void> {
  try {
    const data = await loadData();
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const category = req.query.category ? String(req.query.category).toLowerCase() : undefined;

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));

    let filtered = data.items;

    if (q) {
      filtered = filtered.filter(
        (it) =>
          it.id.toLowerCase().includes(q) ||
          it.name.toLowerCase().includes(q) ||
          (it.description && it.description.toLowerCase().includes(q)),
      );
    }

    if (category) {
      filtered = filtered.filter((it) => it.category === category);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    res.json({
      ok: true,
      total,
      page,
      limit,
      totalPages,
      items,
    });
  } catch (err) {
    console.error('[admin:gamedata:items]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** GET /api/admin/gamedata/abilities — danh sách đặc tính */
export async function listGameDataAbilities(req: Request, res: Response): Promise<void> {
  try {
    const data = await loadData();
    const q = String(req.query.q ?? '').trim().toLowerCase();

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));

    let filtered = data.abilities;

    if (q) {
      filtered = filtered.filter(
        (ab) =>
          ab.id.toLowerCase().includes(q) ||
          ab.name.toLowerCase().includes(q) ||
          (ab.description && ab.description.toLowerCase().includes(q)),
      );
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    res.json({
      ok: true,
      total,
      page,
      limit,
      totalPages,
      abilities: items,
    });
  } catch (err) {
    console.error('[admin:gamedata:abilities]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** GET /api/admin/gamedata/types — danh sách hệ và biểu đồ tương khắc */
export async function getGameDataTypes(_req: Request, res: Response): Promise<void> {
  try {
    const data = await loadData();
    res.json({
      ok: true,
      types: data.types.types ?? [],
      chart: data.types.chart ?? {},
    });
  } catch (err) {
    console.error('[admin:gamedata:types]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}
