/**
 * DataLoader — in-memory index of all static game content.
 *
 * Two loaders:
 *   - `GameData`  : species / moves / items / abilities / types / encounters / trainers / quests
 *   - `MapLoader` : server maps (collision bitmask + objects only, no tile graphics)
 *
 * Server-only (fs access). Client nên dùng các module đã export (typechart, formulas, schemas).
 */
import { readFile, readdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  SpeciesSchema,
  MoveSchema,
  ItemSchema,
  AbilitySchema,
  TypeChartSchema,
  EncounterSetSchema,
  TrainerTemplateSchema,
  ServerMapSchema,
  ServerMapIndexEntrySchema,
  type Species,
  type Move,
  type Item,
  type Ability,
  type TypeChart,
  type SpawnEntry,
  type TrainerTemplate,
  type ServerMap,
  type ServerMapIndexEntry,
} from './contracts.js';
import { normalizeSpecies, normalizeMove, normalizeItem } from './normalize.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(PACKAGE_ROOT, 'data');
const MAPS_DIR = join(DATA_DIR, 'maps');
const SERVER_MAPS_DIR = join(MAPS_DIR, 'server');

export interface QuestData {
  questId: string;
  title: string;
  description: string;
  objectives: unknown[];
  rewards: Record<string, unknown>;
  prerequisites: string[];
}

export class GameData {
  private species = new Map<string, Species>();
  private moves = new Map<string, Move>();
  private items = new Map<string, Item>();
  private abilities = new Map<string, Ability>();
  private trainers: TrainerTemplate[] = [];
  private quests = new Map<string, QuestData>();
  private mapEncounters = new Map<string, SpawnEntry[]>();
  private typeChart: TypeChart = {};

  private loadPromise: Promise<void> | null = null;

  /** Idempotent — concurrent callers share one load. */
  load(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.loadAll();
    return this.loadPromise;
  }

  private async loadAll(): Promise<void> {
    const [rawSpecies, rawMoves, rawItems, rawAbilities, rawTypes, rawTrainers, rawEncounters] =
      await Promise.all([
        readJson(join(DATA_DIR, 'species.json')),
        readJson(join(DATA_DIR, 'moves.json')),
        readJson(join(DATA_DIR, 'items.json')),
        readJson(join(DATA_DIR, 'abilities.json')),
        readJson(join(DATA_DIR, 'types.json')),
        readJson(join(DATA_DIR, 'trainers.json')),
        readJson(join(DATA_DIR, 'encounters.json')),
      ]);

    for (const raw of rawSpecies as unknown[]) {
      const normalized = normalizeSpecies(raw);
      this.species.set(normalized.id, SpeciesSchema.parse(normalized));
    }
    for (const raw of rawMoves as unknown[]) {
      const m = normalizeMove(raw);
      this.moves.set(m.id, MoveSchema.parse(m));
    }
    for (const raw of rawItems as unknown[]) {
      const i = normalizeItem(raw);
      this.items.set(i.id, ItemSchema.parse(i));
    }
    for (const a of rawAbilities as Ability[]) {
      this.abilities.set(a.id, AbilitySchema.parse(a));
    }
    this.typeChart = TypeChartSchema.parse((rawTypes as { chart: TypeChart }).chart);
    for (const t of rawTrainers as unknown[]) {
      this.trainers.push(TrainerTemplateSchema.parse(t));
    }
    for (const enc of EncounterSetSchema.array().parse(rawEncounters)) {
      this.mapEncounters.set(enc.mapId, enc.spawns);
    }
    await this.loadQuests();
  }

  private async loadQuests(): Promise<void> {
    const dir = join(DATA_DIR, 'quests');
    try {
      const files = ((await readdir(dir)) as string[]).filter((f: string) => f.endsWith('.json'));
      for (const f of files) {
        const arr = (await readJson(join(dir, f))) as QuestData[];
        for (const q of arr) this.quests.set(q.questId, q);
      }
    } catch {
      // quests optional
    }
  }

  // ── Species ──
  getSpecies(id: string): Species | undefined {
    return this.species.get(id);
  }
  getAllSpecies(): Species[] {
    return [...this.species.values()];
  }
  getSpeciesByType(type: string): Species[] {
    return this.getAllSpecies().filter((s) => s.types.includes(type as never));
  }
  getSpeciesByRarity(rarity: string): Species[] {
    return this.getAllSpecies().filter((s) => s.rarity === rarity);
  }
  getPreEvolutionOf(speciesId: string): Species[] {
    return this.getAllSpecies().filter((s) => s.evolutions.some((e) => e.to === speciesId));
  }
  getEvolutionTargets(speciesId: string): string[] {
    return this.species.get(speciesId)?.evolutions.map((e) => e.to) ?? [];
  }

  // ── Moves ──
  getMove(id: string): Move | undefined {
    return this.moves.get(id);
  }
  getAllMoves(): Move[] {
    return [...this.moves.values()];
  }
  getMovesByType(type: string): Move[] {
    return this.getAllMoves().filter((m) => m.type === type);
  }
  getMovesByCategory(category: string): Move[] {
    return this.getAllMoves().filter((m) => m.category === category);
  }
  /** Last 4 moves a species knows at or below `level`. */
  getMovesForLevel(speciesId: string, level: number): Move[] {
    const species = this.species.get(speciesId);
    if (!species) return [];
    return species.learnSet
      .filter((e: { move: string; level: number }) => e.level <= level)
      .slice(-4)
      .map((e: { move: string; level: number }) => this.moves.get(e.move))
      .filter((m): m is Move => m !== undefined);
  }

  // ── Items ──
  getItem(id: string): Item | undefined {
    return this.items.get(id);
  }
  getAllItems(): Item[] {
    return [...this.items.values()];
  }
  getItemsByCategory(category: string): Item[] {
    return this.getAllItems().filter((i) => i.category === category);
  }

  // ── Abilities / Types / Trainers ──
  getAbility(id: string): Ability | undefined {
    return this.abilities.get(id);
  }
  getAllAbilities(): Ability[] {
    return [...this.abilities.values()];
  }
  getTypeChart(): TypeChart {
    return this.typeChart;
  }

  getTrainers(): TrainerTemplate[] {
    return this.trainers;
  }
  getTrainer(name: string): TrainerTemplate | undefined {
    return this.trainers.find((t) => t.name === name);
  }

  // ── Encounters / Quests ──
  getEncounters(mapId: string): SpawnEntry[] {
    return this.mapEncounters.get(mapId) ?? [];
  }
  getAllEncounterMaps(): string[] {
    return [...this.mapEncounters.keys()];
  }
  getQuest(id: string): QuestData | undefined {
    return this.quests.get(id);
  }
  getAllQuests(): QuestData[] {
    return [...this.quests.values()];
  }
  getAvailableQuests(completed: string[]): QuestData[] {
    return this.getAllQuests().filter((q) => q.prerequisites.every((p) => completed.includes(p)));
  }

  stats() {
    return {
      speciesCount: this.species.size,
      moveCount: this.moves.size,
      itemCount: this.items.size,
      abilityCount: this.abilities.size,
      trainerCount: this.trainers.length,
      questCount: this.quests.size,
      encounterMapCount: this.mapEncounters.size,
    };
  }
}

/**
 * MapLoader — slim server maps. Only collision bitmask + object layer,
 * so a map costs ~1KB instead of ~50KB.
 */
export class MapLoader {
  private cache = new Map<string, ServerMap>();

  async load(mapId: string): Promise<ServerMap> {
    const cached = this.cache.get(mapId);
    if (cached) return cached;
    const raw = await readJson(join(SERVER_MAPS_DIR, `${mapId}.json`));
    const parsed = ServerMapSchema.parse(raw);
    this.cache.set(mapId, parsed);
    return parsed;
  }

  async loadAll(): Promise<ServerMap[]> {
    const entries = await this.listIndex();
    return Promise.all(entries.map((e) => this.load(e.mapId)));
  }

  async listIndex(): Promise<ServerMapIndexEntry[]> {
    const raw = await readJson(join(SERVER_MAPS_DIR, 'index.json'));
    return ServerMapIndexEntrySchema.array().parse(raw);
  }

  async listIds(): Promise<string[]> {
    return (await this.listIndex()).map((e: ServerMapIndexEntry) => e.mapId);
  }

  has(mapId: string): boolean {
    return this.cache.has(mapId);
  }
  clear(): void {
    this.cache.clear();
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load ${path}: ${message}`, {
      cause: err,
    });
  }
}

/** Process-wide singleton. Call `await gameData.load()` once at server boot. */
export const gameData = new GameData();
export const mapLoader = new MapLoader();
