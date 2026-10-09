import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

// ===== Player Schemas =====
/** Log 1 dòng trận đấu (server push → client render). */
export class BattleLogEntry extends Schema {
  @type('string') text: string = '';
  /** kind: system | damage | heal | faint | levelup | result | fail */
  @type('string') kind: string = 'system';
}

export class BattlePokemon extends Schema {
  @type('string') speciesId: string = '';
  @type('string') pokemonId: string = '';
  @type('string') nickname: string = '';
  @type('uint8') level: number = 1;
  @type('uint16') maxHp: number = 0;
  @type('uint16') currentHp: number = 0;
  @type('uint16') attack: number = 0;
  @type('uint16') defense: number = 0;
  @type('uint16') spAttack: number = 0;
  @type('uint16') spDefense: number = 0;
  @type('uint16') speed: number = 0;
  @type('string') status: string = ''; // "", "brn", "par", etc.
  @type('boolean') shiny: boolean = false;
  /** Move id theo thứ tự nút trong menu. */
  @type(['string']) moves: string[] = [];
  /** PP hiện tại, song song với `moves`. */
  @type(['uint8']) pp: number[] = [];
  /** PP tối đa, song song với `moves`. */
  @type(['uint8']) maxPp: number[] = [];
  /** Hệ types (vd: "normal,flying") — tính STAB phía server. */
  @type('string') types: string = '';
  /** EXP đã kiếm trong level hiện tại (để vẽ thanh EXP). */
  @type('uint32') exp: number = 0;
  /** EXP cần để lên level tiếp theo. */
  @type('uint32') expToNext: number = 0;
  /** Đấu với Pokémon hoang (wild) hay huấn luyện viên. */
  @type('boolean') isWild: boolean = false;
  /** Giới tính: `male` | `female` | `genderless` — hiển thị ♂/♀ trên info plate. */
  @type('string') gender: string = '';
  /** Ô item đã cầm (hiển thị icon góc phải plate; trống = chưa cầm). */
  @type('string') heldItem: string = '';
}

export class PlayerState extends Schema {
  @type('string') id: string = '';
  /**
   * userId (bảng `players`) do server set lúc onJoin — client không gửi.
   * Dùng để load party & ghi kết quả battle từ DB (Plan 44).
   */
  @type('string') userId: string = '';
  @type('string') username: string = '';
  @type('string') displayName: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('string') direction: string = 'down';
  @type('string') mapId: string = 'lappet-town';
  @type('uint8') level: number = 1;
  @type('uint32') money: number = 0;
  @type('string') status: string = 'online';
  @type('float32') moving: number = 0; // 0=idle, 1=moving
  /**
   * Sprite nhân vật được gán trong thư viện admin (empty = sheet mặc định).
   * Client load sheet theo URL này và đăng ký frame theo `spriteFrameCount`.
   */
  @type('string') spriteUrl: string = '';
  @type('uint8') spriteFrame: number = 64; // kích thước 1 frame (px)
  @type('uint8') spriteFrameCount: number = 16; // 12 (3f/hướng) hoặc 16 (4f/hướng)
}

// ===== Battle State =====
export class BattleSide extends Schema {
  @type('string') playerId: string = '';
  @type([BattlePokemon]) team = new ArraySchema<BattlePokemon>();
  @type('uint8') activeIndex: number = 0;
  @type('uint8') phase: number = 0; // 0 = select, 1 = animating, 2 = ended
  @type('int16') selectedMove: number = -1;
}

export class BattleState extends Schema {
  @type('string') battleId: string = '';
  @type('uint16') turn: number = 0;
  @type(BattleSide) ally = new BattleSide();
  @type(BattleSide) foe = new BattleSide();
  @type('boolean') isPvp: boolean = false;
  @type('string') winner: string = ''; // "", "ally", "foe", "draw"
  @type('float32') timer: number = 0;
  /** Nhật ký trận đấu (server push từng dòng). */
  @type([BattleLogEntry]) log = new ArraySchema<BattleLogEntry>();
  /** Trạng thái chung: select | anim | switch | ended */
  @type('string') phase: string = 'select';
  /** Kết quả trận (chỉ có khi winner != ""). */
  @type('string') result: string = '';
  /** EXP nhận được (chỉ khi thắng). */
  @type('uint32') expGained: number = 0;
  /** speciesId nếu bắt được Pokémon hoang. */
  @type('string') caughtSpeciesId: string = '';

  // ── PvP (2 người chơi thật) ──────────────────────────────────────────────
  /**
   * Session id (WorldRoom) của 2 bên — cả 2 client thấy chung.
   *
   * Side (`ally`/`foe`) mà 1 client đang đứng KHÔNG nằm trong state (state là
   * shared, cả 2 client thấy giống nhau) mà server gửi riêng qua message
   * `battle_seat` khi client join BattleRoom.
   */
  @type('string') allySessionId: string = '';
  @type('string') foeSessionId: string = '';
  /** Tên hiển thị của bên `ally` (trainer name hoặc username khi PvP). */
  @type('string') allyName: string = '';
  @type('string') foeName: string = '';
  /** userId DB của 2 bên (chỉ PvP) — dùng khi kết thúc để ghi kết quả. */
  @type('string') allyUserId: string = '';
  @type('string') foeUserId: string = '';
  /** Tiền thưởng cho người thắng (0 = không thưởng). */
  @type('uint32') rewardMoney: number = 0;
}

// ===== World State =====
export class WorldState extends Schema {
  @type('string') mapId: string = 'lappet-town';
  /**
   * Giai đoạn trong ngày (server-authoritative, đổi ~mỗi giờ game). Client
   * dùng để: (a) hiện đúng icon thời tiết/đồng hồ ở InfoPanel, (b) filter
   * encounter/evolution theo `timeOfDay`, (c) vẽ overlay ánh sáng ngày/đêm.
   */
  @type('string') timeOfDay: string = 'day';
  /** Thời tiết hiện tại của map này (deterministic từ worldClock). */
  @type('string') weather: string = 'sunny';
  /** Phút game tính từ epoch — client hiện đồng hồ + nhận diện ngày mới. */
  @type('number') gameMinutes: number = 0;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
