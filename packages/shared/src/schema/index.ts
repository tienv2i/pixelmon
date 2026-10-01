import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

// ===== Player Schemas =====
export class BattlePokemon extends Schema {
  @type('string') speciesId: string = '';
  @type('string') pokemonId: string = '';
  @type('uint8') level: number = 1;
  @type('uint16') maxHp: number = 0;
  @type('uint16') currentHp: number = 0;
  @type('uint16') attack: number = 0;
  @type('uint16') defense: number = 0;
  @type('uint16') spAttack: number = 0;
  @type('uint16') spDefense: number = 0;
  @type('uint16') speed: number = 0;
  @type('string') status: string = ''; // "", "brn", "par", etc.
  @type(['string']) moves: string[] = [];
}

export class PlayerState extends Schema {
  @type('string') id: string = '';
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
}

// ===== World State =====
export class WorldState extends Schema {
  @type('string') mapId: string = 'lappet-town';
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
