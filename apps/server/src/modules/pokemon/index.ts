import type { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { pool } from '../../config/index.js';
import { generatePokemon } from '@pixelmon/shared';
import { gameData } from '@pixelmon/shared/data';

interface AuthRequest extends Request {
  user?: { userId: string; username: string; role: string };
}

// 6 Pokemon Party chuẩn Gen 1
const DEFAULT_PARTY_GEN1 = [
  { speciesId: 'pikachu', level: 25 },
  { speciesId: 'charizard', level: 36 },
  { speciesId: 'blastoise', level: 36 },
  { speciesId: 'venusaur', level: 32 },
  { speciesId: 'snorlax', level: 30 },
  { speciesId: 'gengar', level: 32 },
];

/** Tự động seed 6 Pokémon Party + 10 Pokémon Gen 1 ngẫu nhiên vào PC Box */
export async function autoSeedStarters(userId: string): Promise<void> {
  await gameData.load();
  const allSpecies = gameData.getAllSpecies();
  // 151 loài đầu tiên là Gen 1 (Bulbasaur -> Mew)
  const gen1Species = allSpecies.slice(0, 151);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Tạo 6 Pokemon Party
    for (let i = 0; i < DEFAULT_PARTY_GEN1.length; i++) {
      const def = DEFAULT_PARTY_GEN1[i];
      const species = gameData.getSpecies(def.speciesId);
      if (!species) continue;

      const pkm = generatePokemon(species, def.level, gameData.getMovesForLevel.bind(gameData));
      await client.query(
        `INSERT INTO pokemon (
          id, owner_id, species_id, nickname, level, exp, ivs, evs, stats, current_hp, moves, status, shiny, party_slot, nature, gender
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          pkm.id,
          userId,
          pkm.speciesId,
          species.name,
          pkm.level,
          pkm.exp,
          JSON.stringify(pkm.ivs),
          JSON.stringify(pkm.evs),
          JSON.stringify(pkm.stats),
          pkm.currentHp,
          JSON.stringify(pkm.moves),
          pkm.status === 'none' ? null : pkm.status,
          pkm.shiny,
          i, // party_slot 0..5
          JSON.stringify(pkm.nature),
          pkm.gender,
        ],
      );
    }

    // 2. Tạo 10 Pokemon Gen 1 ngẫu nhiên trong PC Box (party_slot = null)
    const partySpeciesIds = new Set(DEFAULT_PARTY_GEN1.map((p) => p.speciesId));
    const availableBoxSpecies = gen1Species.filter((s: any) => !partySpeciesIds.has(s.id));
    const shuffled = [...availableBoxSpecies].sort(() => 0.5 - Math.random());
    const selectedBoxSpecies = shuffled.slice(0, 10);

    for (const species of selectedBoxSpecies) {
      const randomLevel = Math.floor(Math.random() * 15) + 18; // level 18 -> 32
      const pkm = generatePokemon(species, randomLevel, gameData.getMovesForLevel.bind(gameData));
      await client.query(
        `INSERT INTO pokemon (
          id, owner_id, species_id, nickname, level, exp, ivs, evs, stats, current_hp, moves, status, shiny, party_slot, nature, gender
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          pkm.id,
          userId,
          pkm.speciesId,
          species.name,
          pkm.level,
          pkm.exp,
          JSON.stringify(pkm.ivs),
          JSON.stringify(pkm.evs),
          JSON.stringify(pkm.stats),
          pkm.currentHp,
          JSON.stringify(pkm.moves),
          pkm.status === 'none' ? null : pkm.status,
          pkm.shiny,
          null, // PC Box
          JSON.stringify(pkm.nature),
          pkm.gender,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[pokemon:autoSeed]', err);
  } finally {
    client.release();
  }
}

/** GET /api/pokemon — Lấy danh sách Pokemon của user (phân tách party và box) */
export async function getPokemonList(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.params.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }

    let { rows } = await pool.query(
      `SELECT * FROM pokemon WHERE owner_id = $1 ORDER BY party_slot NULLS LAST, caught_at ASC`,
      [userId],
    );

    // Nếu người chơi chưa có pokemon nào -> auto seed starter
    if (rows.length === 0) {
      await autoSeedStarters(userId);
      const reload = await pool.query(
        `SELECT * FROM pokemon WHERE owner_id = $1 ORDER BY party_slot NULLS LAST, caught_at ASC`,
        [userId],
      );
      rows = reload.rows;
    }

    const party = rows.filter((p) => p.party_slot !== null && p.party_slot !== undefined);
    // Sắp xếp party theo đúng thứ tự 0..5
    party.sort((a, b) => a.party_slot - b.party_slot);

    const box = rows.filter((p) => p.party_slot === null || p.party_slot === undefined);

    res.json({
      ok: true,
      pokemon: rows,
      party,
      box,
    });
  } catch (err) {
    console.error('[pokemon:list]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** POST /api/pokemon/swap — Hoán đổi vị trí giữa 2 pokemon */
export async function swapPokemon(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }

    const { sourceId, targetId, targetSlot } = req.body;
    if (!sourceId) {
      res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: 'Missing sourceId' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const srcRes = await client.query('SELECT * FROM pokemon WHERE id = $1 AND owner_id = $2', [
        sourceId,
        userId,
      ]);
      if (srcRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Pokemon source not found' });
        return;
      }
      const src = srcRes.rows[0];

      if (targetId) {
        const tgtRes = await client.query('SELECT * FROM pokemon WHERE id = $1 AND owner_id = $2', [
          targetId,
          userId,
        ]);
        if (tgtRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Pokemon target not found' });
          return;
        }
        const tgt = tgtRes.rows[0];

        // Hoán đổi party_slot
        await client.query('UPDATE pokemon SET party_slot = $1 WHERE id = $2', [tgt.party_slot, src.id]);
        await client.query('UPDATE pokemon SET party_slot = $1 WHERE id = $2', [src.party_slot, tgt.id]);
      } else if (targetSlot !== undefined) {
        // Gán vào slot cụ thể (0-5 hoặc null)
        await client.query('UPDATE pokemon SET party_slot = $1 WHERE id = $2', [targetSlot, src.id]);
      }

      await client.query('COMMIT');
      res.json({ ok: true, message: 'Swapped successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[pokemon:swap]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** POST /api/pokemon/deposit — Gửi Pokémon từ Party vào PC Box */
export async function depositPokemon(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }

    const { pokemonId } = req.body;
    if (!pokemonId) {
      res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: 'Missing pokemonId' });
      return;
    }

    // Đếm số lượng Pokémon trong Party
    const partyCountRes = await pool.query(
      'SELECT count(*) FROM pokemon WHERE owner_id = $1 AND party_slot IS NOT NULL',
      [userId],
    );
    const count = parseInt(partyCountRes.rows[0].count, 10);
    if (count <= 1) {
      res.status(400).json({
        ok: false,
        code: 'LAST_POKEMON',
        message: 'Không thể gửi Pokémon cuối cùng trong đội hình vào Box!',
      });
      return;
    }

    await pool.query('UPDATE pokemon SET party_slot = NULL WHERE id = $1 AND owner_id = $2', [
      pokemonId,
      userId,
    ]);

    res.json({ ok: true, message: 'Đã chuyển Pokémon vào Box' });
  } catch (err) {
    console.error('[pokemon:deposit]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** POST /api/pokemon/withdraw — Rút Pokémon từ PC Box vào Party */
export async function withdrawPokemon(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }

    const { pokemonId } = req.body;
    if (!pokemonId) {
      res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: 'Missing pokemonId' });
      return;
    }

    // Lấy các slot đang dùng trong party (0..5)
    const partyRes = await pool.query(
      'SELECT party_slot FROM pokemon WHERE owner_id = $1 AND party_slot IS NOT NULL ORDER BY party_slot ASC',
      [userId],
    );

    if (partyRes.rows.length >= 6) {
      res.status(400).json({
        ok: false,
        code: 'PARTY_FULL',
        message: 'Đội hình đã đủ 6 Pokémon! Hãy gửi bớt vào Box trước.',
      });
      return;
    }

    const usedSlots = new Set(partyRes.rows.map((r) => r.party_slot));
    let nextSlot = 0;
    while (usedSlots.has(nextSlot) && nextSlot < 6) {
      nextSlot++;
    }

    await pool.query('UPDATE pokemon SET party_slot = $1 WHERE id = $2 AND owner_id = $3', [
      nextSlot,
      pokemonId,
      userId,
    ]);

    res.json({ ok: true, partySlot: nextSlot, message: 'Đã rút Pokémon vào đội hình' });
  } catch (err) {
    console.error('[pokemon:withdraw]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** POST /api/pokemon/release — Thả Pokémon */
export async function releasePokemon(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }

    const { pokemonId } = req.body;
    if (!pokemonId) {
      res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: 'Missing pokemonId' });
      return;
    }

    // Kiểm tra xem có phải con duy nhất trong party không
    const checkRes = await pool.query('SELECT party_slot FROM pokemon WHERE id = $1 AND owner_id = $2', [
      pokemonId,
      userId,
    ]);
    if (checkRes.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Pokemon not found' });
      return;
    }

    if (checkRes.rows[0].party_slot !== null) {
      const partyCountRes = await pool.query(
        'SELECT count(*) FROM pokemon WHERE owner_id = $1 AND party_slot IS NOT NULL',
        [userId],
      );
      if (parseInt(partyCountRes.rows[0].count, 10) <= 1) {
        res.status(400).json({
          ok: false,
          code: 'LAST_POKEMON',
          message: 'Không thể thả Pokémon duy nhất còn lại trong đội!',
        });
        return;
      }
    }

    await pool.query('DELETE FROM pokemon WHERE id = $1 AND owner_id = $2', [pokemonId, userId]);
    res.json({ ok: true, message: 'Đã thả Pokémon về tự nhiên' });
  } catch (err) {
    console.error('[pokemon:release]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

/** POST /api/pokemon/rename — Đổi tên / đặt biệt danh cho Pokémon */
export async function renamePokemon(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
      return;
    }

    const { pokemonId, nickname } = req.body;
    if (!pokemonId) {
      res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: 'Missing pokemonId' });
      return;
    }

    const cleanNick = String(nickname ?? '').trim().slice(0, 20);
    const updateRes = await pool.query(
      `UPDATE pokemon SET nickname = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, nickname, species_id`,
      [cleanNick || null, pokemonId, userId],
    );

    if (updateRes.rows.length === 0) {
      res.status(404).json({ ok: false, code: 'NOT_FOUND', message: 'Pokemon not found' });
      return;
    }

    res.json({ ok: true, pokemon: updateRes.rows[0] });
  } catch (err) {
    console.error('[pokemon:rename]', err);
    res.status(500).json({ ok: false, code: 'INTERNAL', message: String(err) });
  }
}

export * from './pokedex.js';
