/**
 * Bộ giải mã (parser) lệnh /spawn — hỗ trợ cả cú pháp ngắn gọn và chi tiết.
 * Dùng chung cho Client (hiển thị / trợ giúp) và Server (triệu hồi thật).
 */

export interface ParsedSpawnOptions {
  /** Tên, ID, Pokédex number hoặc 'random' */
  speciesQuery?: string;
  /** Dex number nếu người dùng truyền trực tiếp số */
  dexNum?: number;
  /** Level Pokémon (1 - 100) */
  level?: number;
  /** Có phải Shiny không */
  shiny?: boolean;
  /** Giới tính */
  gender?: 'male' | 'female' | 'genderless';
  /** Bản tính / Nature */
  nature?: string;
  /** Vật phẩm cầm theo (Item ID) */
  heldItem?: string;
  /** Điểm cá thể IVs đồng loạt (0 - 31) */
  ivs?: number;
  /** Danh sách chiêu thức tùy biến */
  moves?: string[];
  /** Máu HP ban đầu (cố định số hoặc %) để test bắt / giao tranh */
  currentHp?: number;
  /** Người dùng yêu cầu xem trợ giúp */
  isHelp?: boolean;
}

const NATURE_NAMES = new Set([
  'hardy', 'lonely', 'brave', 'adamant', 'naughty',
  'bold', 'docile', 'relaxed', 'impish', 'lax',
  'timid', 'hasty', 'serious', 'jolly', 'naive',
  'modest', 'mild', 'quiet', 'bashful', 'rash',
  'calm', 'gentle', 'sassy', 'careful', 'quirky',
]);

/**
 * Phân tích chuỗi lệnh hoặc danh sách tham số của `/spawn`.
 *
 * Cú pháp hỗ trợ:
 * 1. Ngắn gọn (Positional):
 *    - `/spawn` -> random theo map
 *    - `/spawn <tên|dex>` -> vd: `/spawn pikachu`, `/spawn 25`
 *    - `/spawn <tên|dex> <level>` -> vd: `/spawn pikachu 50`, `/spawn 25 100`
 *    - `/spawn <tên|dex> <level> <shiny>` -> vd: `/spawn pikachu 50 shiny`, `/spawn mew 100 s`
 * 2. Chi tiết (Key=Value Flags):
 *    - `level=<1-100>` hoặc `lv=<n>`
 *    - `shiny=<true|false|1|0>` hoặc cờ `shiny` / `s`
 *    - `gender=<male|female|none>` hoặc `g=<m|f>`
 *    - `nature=<tên>` hoặc `n=<tên>`
 *    - `held=<item>` hoặc `item=<item>`
 *    - `iv=<0-31|max|min>`
 *    - `moves=<m1,m2...>`
 *    - `hp=<1..max>`
 */
export function parseSpawnCommand(input: string | string[] | undefined): ParsedSpawnOptions {
  const result: ParsedSpawnOptions = {};

  if (!input) return result;

  const tokens: string[] = Array.isArray(input)
    ? input.map((t) => String(t).trim()).filter(Boolean)
    : input.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return result;

  const positionalTokens: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // Kiểm tra cờ xem trợ giúp
    if (lower === 'help' || lower === '?' || lower === '-h' || lower === '--help') {
      result.isHelp = true;
      return result;
    }

    // Kiểm tra cờ key=value
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      const key = lower.slice(0, eqIdx).trim();
      const val = token.slice(eqIdx + 1).trim();
      const valLower = val.toLowerCase();

      switch (key) {
        case 'species':
        case 'pokemon':
        case 'p':
        case 'id':
          result.speciesQuery = val;
          const parsedDex = parseInt(val, 10);
          if (Number.isInteger(parsedDex) && String(parsedDex) === val && parsedDex >= 1 && parsedDex <= 1025) {
            result.dexNum = parsedDex;
          }
          break;

        case 'level':
        case 'lv':
        case 'l': {
          const lv = parseInt(val, 10);
          if (Number.isInteger(lv)) {
            result.level = Math.max(1, Math.min(100, lv));
          }
          break;
        }

        case 'shiny':
        case 's':
          result.shiny = valLower === 'true' || valLower === '1' || valLower === 'yes' || valLower === 'y';
          break;

        case 'gender':
        case 'g':
          if (valLower === 'm' || valLower === 'male') result.gender = 'male';
          else if (valLower === 'f' || valLower === 'female') result.gender = 'female';
          else if (valLower === 'none' || valLower === 'genderless') result.gender = 'genderless';
          break;

        case 'nature':
        case 'nat':
        case 'n':
          result.nature = valLower;
          break;

        case 'held':
        case 'item':
        case 'held_item':
          result.heldItem = valLower;
          break;

        case 'iv':
        case 'ivs': {
          if (valLower === 'max') result.ivs = 31;
          else if (valLower === 'min') result.ivs = 0;
          else {
            const iv = parseInt(val, 10);
            if (Number.isInteger(iv)) result.ivs = Math.max(0, Math.min(31, iv));
          }
          break;
        }

        case 'moves':
        case 'move':
        case 'm':
          result.moves = val.split(',').map((s) => s.trim()).filter(Boolean);
          break;

        case 'hp': {
          const hpNum = parseInt(val, 10);
          if (Number.isInteger(hpNum)) {
            result.currentHp = Math.max(1, hpNum);
          }
          break;
        }
      }
      continue;
    }

    // Các cờ độc lập không có dấu '='
    if (lower === 'shiny' || lower === 's') {
      result.shiny = true;
      continue;
    }
    if (lower === 'noshiny' || lower === 'regular' || lower === 'normal') {
      result.shiny = false;
      continue;
    }
    if (lower === 'male' || lower === 'm') {
      result.gender = 'male';
      continue;
    }
    if (lower === 'female' || lower === 'f') {
      result.gender = 'female';
      continue;
    }
    if (lower === 'genderless') {
      result.gender = 'genderless';
      continue;
    }
    if (NATURE_NAMES.has(lower) && !result.nature) {
      result.nature = lower;
      continue;
    }

    // Token vị trí
    positionalTokens.push(token);
  }

  // Phân bổ các positional tokens
  for (let i = 0; i < positionalTokens.length; i++) {
    const tok = positionalTokens[i]!;
    const num = parseInt(tok, 10);
    const isNum = Number.isInteger(num) && String(num) === tok;

    if (!result.speciesQuery) {
      result.speciesQuery = tok;
      if (isNum && num >= 1 && num <= 1025) {
        result.dexNum = num;
      }
    } else if (result.level === undefined && isNum && num >= 1 && num <= 100) {
      result.level = num;
    } else if (result.shiny === undefined && (tok.toLowerCase() === 'shiny' || tok.toLowerCase() === 's')) {
      result.shiny = true;
    }
  }

  return result;
}

/** Hướng dẫn sử dụng lệnh /spawn */
export function formatSpawnHelp(): string {
  return [
    '=== HƯỚNG DẪN LỆNH /SPAWN ===',
    '• Cú pháp ngắn gọn:',
    '  /spawn                      (ngẫu nhiên theo bản đồ)',
    '  /spawn <tên|dex>            (vd: /spawn pikachu, /spawn 25)',
    '  /spawn <tên|dex> <level>    (vd: /spawn pikachu 50, /spawn 150 70)',
    '  /spawn <tên> <lv> shiny     (vd: /spawn charizard 50 shiny, /spawn mew 100 s)',
    '  /spawn random <level>       (vd: /spawn random 50)',
    '• Cú pháp chi tiết (Key=Value):',
    '  level=<1-100> | lv=<n>      (Cấp độ)',
    '  shiny=<true|false> | s      (Pokémon Shiny / Sắc khác)',
    '  nature=<tên>                (adamant, timid, modest, jolly...)',
    '  gender=<m|f|none>           (Giới tính)',
    '  held=<item_id>              (Vật phẩm mang theo: light-ball, leftovers...)',
    '  iv=<0-31|max|min>           (Chỉ số IVs)',
    '  moves=<m1,m2...>            (Chiêu thức tuỳ biến)',
    '  hp=<1..max>                 (Máu ban đầu, vd: hp=1 để test bắt)',
    '• Ví dụ mẫu:',
    '  /spawn pikachu 50 shiny nature=timid held=light-ball',
    '  /spawn mewtwo lv=70 iv=31 moves=psychic,aurasphere hp=1',
  ].join('\n');
}
