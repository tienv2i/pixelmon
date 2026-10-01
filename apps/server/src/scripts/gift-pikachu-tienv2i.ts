import { pool } from '../config/index.js';
import { gameData } from '@pixelmon/shared/data';
import { generatePokemon, getNatureMod, computeOwnedPokemonStats } from '@pixelmon/shared';

async function main() {
  console.log('[gift] Dang nap GameData...');
  await gameData.load();

  // Tìm user tienv2i
  const userRes = await pool.query('SELECT id, username FROM users WHERE username = $1', ['tienv2i']);
  if (userRes.rows.length === 0) {
    console.error('[gift] Khong tim thay user tienv2i!');
    process.exit(1);
  }
  const user = userRes.rows[0];
  console.log(`[gift] Tim thay user: ${user.username} (${user.id})`);

  // Lấy species Pikachu
  const species = gameData.getSpecies('pikachu');
  if (!species) {
    console.error('[gift] Khong tim thay species pikachu!');
    process.exit(1);
  }

  // Tạo Pikachu level 25, Nature: Timid (+Speed, -Attack), Giới tính: female (cái)
  const level = 25;
  const pkm = generatePokemon(species, level, gameData.getMovesForLevel.bind(gameData));
  
  // Ép Nature Timid và Gender female
  const timidNature = getNatureMod('timid');
  pkm.nature = timidNature;
  pkm.gender = 'female';

  // Tính lại stats chính xác theo Nature Timid
  const { maxHp, stats } = computeOwnedPokemonStats(
    species.baseStats,
    pkm.ivs,
    pkm.evs,
    level,
    timidNature,
  );
  pkm.stats = stats;
  pkm.maxHp = maxHp;
  pkm.currentHp = maxHp;

  // Kiểm tra Party của tienv2i (nếu còn slot thì cho vào Party, nếu không thì vào PC Box)
  const partyRes = await pool.query(
    'SELECT party_slot FROM pokemon WHERE owner_id = $1 AND party_slot IS NOT NULL ORDER BY party_slot ASC',
    [user.id],
  );
  const usedSlots = new Set(partyRes.rows.map((r: any) => r.party_slot));
  let partySlot: number | null = null;
  for (let s = 0; s < 6; s++) {
    if (!usedSlots.has(s)) {
      partySlot = s;
      break;
    }
  }

  console.log(`[gift] Party slot cho Pikachu: ${partySlot !== null ? `Slot #${partySlot + 1}` : 'PC Box'}`);

  // Lưu vào database
  const insertRes = await pool.query(
    `INSERT INTO pokemon (
      id, owner_id, species_id, nickname, level, exp, ivs, evs, stats, current_hp, moves, status, shiny, party_slot, nature, gender
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id`,
    [
      pkm.id,
      user.id,
      pkm.speciesId,
      'Pikachu ♀',
      pkm.level,
      pkm.exp,
      JSON.stringify(pkm.ivs),
      JSON.stringify(pkm.evs),
      JSON.stringify(pkm.stats),
      pkm.currentHp,
      JSON.stringify(pkm.moves),
      null,
      pkm.shiny,
      partySlot,
      JSON.stringify(pkm.nature),
      pkm.gender,
    ],
  );

  console.log(`[gift] Da tang Pikachu thanh cong! ID: ${insertRes.rows[0].id}`);
  console.log(`[gift] Chi tiet:`);
  console.log(`  - Loai: ${species.name} (Lv.${level})`);
  console.log(`  - Gioi tinh: ${pkm.gender} (♀ - Duoi trai tim)`);
  console.log(`  - Ban tinh: ${pkm.nature.name.toUpperCase()} (+${pkm.nature.increases}, -${pkm.nature.decreases})`);
  console.log(`  - Chi so: HP=${pkm.stats.hp}, Atk=${pkm.stats.attack}, Def=${pkm.stats.defense}, SpA=${pkm.stats.spAttack}, SpD=${pkm.stats.spDefense}, Spe=${pkm.stats.speed}`);
  console.log(`  - Chieu thuc: ${pkm.moves.map((m: any) => m.name).join(', ')}`);
  console.log(`  - Vi tri: ${partySlot !== null ? `Party (#${partySlot + 1})` : 'PC Box'}`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('[gift] Loi:', err);
  process.exit(1);
});
