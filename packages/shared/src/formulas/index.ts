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
  type NatureMod,
} from './stats.js';

// ── encounter ──
export {
  rollEncounter,
  rollWildEncounter,
  attemptCatch,
  calculateCatchChance,
  ballMultiplierFor,
  randomInt,
  type CatchResult,
  type EncounterContext,
} from './encounter.js';

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

// ── learnset / evolution ──
export {
  learnsetAtLevel,
  movesLearnedAt,
  checkLevelEvolution,
  evolutionTargetId,
  evolveSpecies,
} from './learnset.js';

// ── map runtime ──
export {
  isWalkable,
  isGrass,
  isWater,
  isLedge,
  getLedgeDirection,
  canJumpLedge,
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
  type MapObjectType,
  type WalkableOptions,
} from './mapruntime.js';
