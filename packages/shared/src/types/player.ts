import type { OwnedPokemon } from '../formulas/generator.js';
import type { InventorySlot } from './item.js';

export type PlayerId = string;

export interface PlayerStatsSummary {
  battlesWon: number;
  battlesLost: number;
  pokemonCaught: number;
  badges: string[];
  playTimeSec: number;
}

export interface Player {
  id: PlayerId;
  username: string;
  displayName: string;
  x: number;
  y: number;
  mapId: string;
  direction: 'up' | 'down' | 'left' | 'right';
  level: number;
  exp: number;
  money: number;
  pokemonParty: OwnedPokemon[]; // max 6
  pcBox: OwnedPokemon[];
  inventory: InventorySlot[];
  stats: PlayerStatsSummary;
  lastLoginAt: number;
  createdAt: number;
}

export type RoomType = 'world' | 'battle';

export interface Position {
  x: number;
  y: number;
}
