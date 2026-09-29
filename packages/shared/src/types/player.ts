import type { Position } from './position.js';

export interface IPlayer {
  id: string;
  username: string;
  level: number;
  experience: number;
  money: number;
  currentMapId: string;
  position: Position;
  inventory: IItem[];
  team: IPokemon[];
}

export interface IItem {
  id: string;
  itemId: string;
  quantity: number;
}

export interface IPokemon {
  id: string;
  speciesId: string;
  level: number;
  experience: number;
  ivs: IIVs;
  evs: IEVs;
  nickname?: string;
  skills: ISkill[];
  stats: IStats;
  status?: IPokemonStatus;
}

export type IPokemonStatus = 'sleep' | 'poison' | 'paralysis' | 'burn' | 'freeze' | null;

export interface IIVs {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export interface IEVs {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export interface ISkill {
  id: string;
  name: string;
  power?: number;
  accuracy?: number;
  pp: number;
  maxPp: number;
  type: string;
  category: 'physical' | 'special' | 'status';
}

export interface IStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}
