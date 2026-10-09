// ── typechart ──
export {
  typeEffectiveness,
  effectivenessLabel,
  stabMultiplier,
  setTypeChart,
  getTypeChart,
  FALLBACK_TYPE_CHART,
} from './typechart.js';

// ── combat ──
export {
  stageMultiplier,
  accuracyCheck,
  isCriticalHit,
  randomDamageFactor,
  calcDamage,
  getEffectiveStatForCategory,
  paralyzeCheck,
  thawCheck,
  poisonDamage,
  burnDamage,
  canEscape,
  paralyzedSpeedMultiplier,
  calcExpGain,
  expForLevel,
  type DamageInput,
  type DamageResult,
  type Rng,
  type StatType,
} from './combat.js';

// ── stats ──
export {
  calcAllStats,
  computeOwnedPokemonStats,
  expToLevel,
  rollIVs,
  rollNature,
  rollGender,
  rollShiny,
  getNatureMod,
  getNatureByName,
  NATURES,
  type NatureMod,
} from './stats.js';

// ── spawn command ──
export {
  parseSpawnCommand,
  formatSpawnHelp,
  type ParsedSpawnOptions,
} from './spawnCommand.js';

// ── friendship (SSOT bậc hạnh phúc) ──
export {
  FRIENDSHIP_TIERS,
  clampFriendship,
  friendshipTier,
  type FriendshipTier,
} from './friendship.js';

// ── encounter ──
export {
  rollEncounter,
  rollWildEncounter,
  attemptCatch,
  calculateCatchChance,
  ballMultiplierFor,
  randomInt,
  type CatchResult,
  type CatchContext,
  type EncounterContext,
} from './encounter.js';

// ── world clock + weather (SSOT ngày/đêm + thời tiết) ──
export {
  TIME_SCALE,
  WEATHER_IDS,
  WEATHER_BLOCKS,
  phaseAt,
  worldClockAt,
  worldClockNow,
  msUntilNextPhase,
  weatherBlock,
  weatherPoolFor,
  weatherFor,
  type TimeOfDay,
  type WeatherId,
  type WorldClock,
} from './worldClock.js';

// ── moveset ──
export { hasPp, consumePp, restorePp, type MoveSlot } from './moveset.js';

// ── generator ──
export {
  generatePokemon,
  levelUp,
  addExp,
  applyEvYields,
  type OwnedPokemon,
  type Gender,
  type EvYield,
  MAX_EV_PER_STAT,
  MAX_EV_TOTAL,
} from './generator.js';

// ── learnset ──
export { learnsetAtLevel, movesLearnedAt } from './learnset.js';

// ── evolution (SSOT) ──
export {
  EVOLUTION_STONE_IDS,
  isEvolutionStone,
  FRIENDSHIP_EVO_THRESHOLD,
  resolveEvolution,
  evolutionTargetForMethod,
  nextLevelEvolution,
  type EvolutionContext,
  type EvolutionResolution,
  type EvolutionMethod,
  type EvolutionSkipMethod,
  type EvolutionStoneId,
} from './evolution.js';

// ── learnset legacy wrappers (deprecated) ──
export {
  checkLevelEvolution,
  evolutionTargetId,
  evolveSpecies,
} from './learnset.js';

// ── items (registry SSOT hiệu quả item) ──
export {
  resolveItemEffect,
  isUsableItem,
  speciesAcceptsStone,
  type ItemEffect,
} from './items.js';

// ── PvP (luật đấu người chơi) ──
export {
  PVP_MAX_LEVEL,
  PVP_LEVEL_DIFF,
  PVP_WIN_MONEY,
  PVP_LOSE_MONEY,
  PVP_CHALLENGE_TTL_MS,
  PVP_CHALLENGE_COOLDOWN_MS,
  PVP_ROOM_CREATE_TIMEOUT_MS,
  PVP_TEAM_SIZE,
  canChallengePvp,
  pvpRejectMessage,
  selectPvpTeam,
  type PvpRejectReason,
  type PvpEligibility,
} from './pvp.js';

// ── map runtime ──
export {
  isWalkable,
  isGrass,
  isWater,
  isLedge,
  getLedgeDirection,
  canJumpLedge,
  isDirBlocked,
  canStep,
  isPassageAll,
  getCollisionFlag,
  getObjectsOfType,
  getWarpAt,
  getAllWarps,
  getNpcSpawns,
  getGrassZones,
  getItemBalls,
  getBattleTriggers,
  isInGrassZone,
  pixelToTile,
  tileToPixel,
  clampToMap,
  resolveSpawnTile,
  type MapObjectNpc,
  type MapObjectType,
  type WalkableOptions,
  type MoveDir,
} from './mapruntime.js';
