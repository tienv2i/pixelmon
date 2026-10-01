/**
 * Contract types (Zod schemas) — port từ pixmon/contracts, chuẩn hóa field theo project.
 * Key normalization: spAttack/spDefense (không phải special_attack/special_defense),
 * pokemonId (không phải creatureId), GrowthRate đầy đủ.
 */
import { z } from 'zod';

// ===== Domain enums =====
export const ELEMENT_TYPES = [
  'normal',
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const;
export const ElementTypeSchema = z.enum(ELEMENT_TYPES);
export type ElementType = z.infer<typeof ElementTypeSchema>;

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'mythical'] as const;
export const RaritySchema = z.enum(RARITIES);
export type Rarity = z.infer<typeof RaritySchema>;

export const GrowthRateSchema = z.enum([
  'fast',
  'mediumFast',
  'mediumSlow',
  'slow',
  'fluctuating',
  'erratic',
]);
export type GrowthRate = z.infer<typeof GrowthRateSchema>;

// ===== Base Stats (project field names) =====
export const BaseStatsSchema = z.object({
  hp: z.number().int().min(1).max(999),
  attack: z.number().int().min(1).max(999),
  defense: z.number().int().min(1).max(999),
  spAttack: z.number().int().min(1).max(999),
  spDefense: z.number().int().min(1).max(999),
  speed: z.number().int().min(1).max(999),
});
export type BaseStats = z.infer<typeof BaseStatsSchema>;

// ===== Evolution / LearnSet =====
export const EvolutionEntrySchema = z.object({
  to: z.string().min(1),
  method: z.enum(['level', 'item', 'trade', 'move', 'friendship']),
  level: z.number().int().min(1).optional(),
  item: z.string().optional(),
  move: z.string().optional(),
  condition: z.record(z.unknown()).optional(),
});
export type EvolutionEntry = z.infer<typeof EvolutionEntrySchema>;

export const LearnSetEntrySchema = z.object({
  move: z.string().min(1),
  level: z.number().int().min(1).max(100),
});
export type LearnSetEntry = z.infer<typeof LearnSetEntrySchema>;

// ===== Species =====
export const SpeciesSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(32),
  category: z.string().min(1).max(64),
  types: z.array(ElementTypeSchema).min(1).max(2),
  baseStats: BaseStatsSchema,
  baseExperience: z.number().int().min(1),
  rarity: RaritySchema,
  genderRatio: z.number().min(0).max(1),
  catchRate: z.number().int().min(1).max(255),
  growthRate: GrowthRateSchema,
  evolutions: z.array(EvolutionEntrySchema).default([]),
  learnSet: z.array(LearnSetEntrySchema).default([]),
  abilities: z.array(z.string()).default([]),
  baseStatTotal: z.number().int().optional(),
  iconUrl: z.string().min(1).optional(),
  spriteUrl: z.string().min(1).optional(),
});
export type Species = z.infer<typeof SpeciesSchema>;

// ===== Move =====
export const MoveCategorySchema = z.enum(['physical', 'special', 'status']);
export type MoveCategory = z.infer<typeof MoveCategorySchema>;
export const MoveTargetSchema = z.enum([
  'one_opponent',
  'all_opponents',
  'all_except_user',
  'user',
  'user_side',
  'enemy_side',
  'everyone',
]);
export const StatusEffectSchema = z.enum([
  'none',
  'paralysis',
  'poison',
  'badly_poisoned',
  'burn',
  'sleep',
  'freeze',
  'faint',
  'flinch',
]);
export type StatusEffect = z.infer<typeof StatusEffectSchema>;

export const MoveEffectSchema = z.object({
  chance: z.number().min(0).max(100).optional(),
  effect: StatusEffectSchema,
  magnitude: z.number().int().optional(),
});
export type MoveEffect = z.infer<typeof MoveEffectSchema>;

export const MoveSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(32),
  type: ElementTypeSchema,
  category: MoveCategorySchema,
  power: z.number().int().min(-1).max(250).nullable(),
  accuracy: z.number().int().min(1).max(100),
  pp: z.number().int().min(1).max(64),
  priority: z.number().int().min(-8).max(8).default(0),
  target: MoveTargetSchema.default('one_opponent'),
  description: z.string().optional(),
  effects: z.array(MoveEffectSchema).default([]),
  selfEffects: z.array(MoveEffectSchema).default([]),
  isContact: z.boolean().default(false),
  soundBased: z.boolean().default(false),
});
export type Move = z.infer<typeof MoveSchema>;

// ===== Item =====
export const ItemCategorySchema = z.enum([
  'pokeball',
  'medicine',
  'berry',
  'evolution',
  'key',
  'misc',
]);
export const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(32),
  category: ItemCategorySchema,
  description: z.string().optional(),
  stackable: z.boolean().default(true),
  maxStack: z.number().int().default(99),
  sellPrice: z.number().int().default(0),
  buyPrice: z.number().int().default(0),
  effect: z
    .object({
      stat: z.string().optional(),
      amount: z.number().int().optional(),
      effect: z.string().optional(),
    })
    .optional(),
  iconUrl: z.string().min(1).optional(),
});
export type Item = z.infer<typeof ItemSchema>;

// ===== Ability =====
export const AbilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
});
export type Ability = z.infer<typeof AbilitySchema>;

// ===== Type chart =====
export const TypeChartSchema = z.record(z.record(z.number().min(0).max(4)));
export type TypeChart = z.infer<typeof TypeChartSchema>;

// ===== Encounters =====
export const SpawnEntrySchema = z.object({
  species: z.string().min(1),
  minLevel: z.number().int().min(1),
  maxLevel: z.number().int().min(1),
  weight: z.number().int().min(1),
  rarity: z.string().min(1),
  conditions: z
    .object({
      timeOfDay: z.array(z.enum(['day', 'night', 'dawn', 'dusk'])).optional(),
      weather: z.array(z.string()).optional(),
      requiredBadges: z.array(z.string()).optional(),
    })
    .default({}),
});
export type SpawnEntry = z.infer<typeof SpawnEntrySchema>;

export const EncounterSetSchema = z.object({
  mapId: z.string().min(1),
  mapName: z.string().min(1),
  terrain: z.string().min(1),
  spawns: z.array(SpawnEntrySchema),
});
export type EncounterSet = z.infer<typeof EncounterSetSchema>;

// ===== Trainers =====
export const TrainerTemplateSchema = z.object({
  trainerType: z.string().min(1),
  name: z.string().min(1),
  items: z.array(z.string()).default([]),
  party: z.array(z.object({ species: z.string(), level: z.number().int() })).min(1),
});
export type TrainerTemplate = z.infer<typeof TrainerTemplateSchema>;

// ===== Server Map (slim, collision bitmask) =====
export const CollisionFlag = {
  WALKABLE: 0x01,
  WATER: 0x02,
  BLOCKED: 0x04,
  GRASS: 0x08,
  /** Ledge huong duoc encode bang 2-bit field (bit 5-6) thay vi one-hot.
   *  Mot o chi roi duoc 1 huong nen 2 bit la du, va giai phong 0x80 cho WARP.
   *  LEDGE_ANY da duoc thay bang LEDGE (chi can kiem tra 1 bit de biet co phai ledge).
   */
  LEDGE: 0x10,
  LEDGE_DIR_MASK: 0x60,
  LEDGE_SOUTH: 0x10 | 0x00,
  LEDGE_NORTH: 0x10 | 0x20,
  LEDGE_WEST: 0x10 | 0x40,
  LEDGE_EAST: 0x10 | 0x60,
  /** O warp (trigger portal). Giu nguyen de tuong thich nguoc.
   *  Du dung cho object loai "warp" trong ServerMap.objects.
   */
  WARP: 0x80,
} as const;

export const CollisionLayerSchema = z.object({
  name: z.string().default('collision'),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  flags: z.array(z.number().int().min(0).max(255)),
});
export type CollisionLayer = z.infer<typeof CollisionLayerSchema>;

const MapObjectBase = z.object({
  id: z.number().int(),
  name: z.string().default(''),
  x: z.number(),
  y: z.number(),
  width: z.number().default(0),
  height: z.number().default(0),
  visible: z.boolean().default(true),
});

export const MapObjectSchema = z.discriminatedUnion('type', [
  MapObjectBase.extend({
    type: z.literal('warp'),
    toMap: z.string(),
    toX: z.number().int(),
    toY: z.number().int(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  }),
  MapObjectBase.extend({
    type: z.literal('npc_spawn'),
    npcId: z.string(),
    sprite: z.string().optional(),
    trainer: z.boolean().default(false),
    dialog: z.array(z.string()).default([]),
    team: z.array(z.string()).default([]),
  }),
  MapObjectBase.extend({
    type: z.literal('grass_zone'),
    encounterTableId: z.string(),
  }),
  MapObjectBase.extend({
    type: z.literal('item_ball'),
    itemId: z.string(),
    quantity: z.number().int().min(1).default(1),
    consumed: z.boolean().default(true),
  }),
  MapObjectBase.extend({
    type: z.literal('battle_trigger'),
    trainerId: z.string(),
  }),
  MapObjectBase.extend({
    type: z.literal('sign'),
    text: z.string().default(''),
  }),
  MapObjectBase.extend({
    type: z.literal('event'),
    properties: z.array(z.record(z.unknown())).optional(),
  }).passthrough(),
]);
export type MapObject = z.infer<typeof MapObjectSchema>;

export const ServerMapSchema = z.object({
  mapId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mapType: z.enum(['town', 'route', 'dungeon', 'gym', 'interior', 'battle']),
  music: z.string().optional(),
  weather: z.string().optional(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  tileWidth: z.number().int().positive().default(16),
  tileHeight: z.number().int().positive().default(16),
  collision: CollisionLayerSchema,
  objects: z.array(MapObjectSchema).default([]),
  encounters: z.array(SpawnEntrySchema).default([]),
  requiredBadges: z.array(z.string()).default([]),
});
export type ServerMap = z.infer<typeof ServerMapSchema>;

export const ServerMapIndexEntrySchema = z.object({
  mapId: z.string(),
  file: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type ServerMapIndexEntry = z.infer<typeof ServerMapIndexEntrySchema>;
