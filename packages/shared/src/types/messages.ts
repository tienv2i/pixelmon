// ===== Client -> Server messages =====
export interface C2SJoinWorld {
  type: 'join_world';
  mapId: string;
}

export interface C2SMove {
  type: 'move';
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
}

export interface C2SChat {
  type: 'chat';
  message: string;
}

export interface C2SStartBattle {
  type: 'start_battle';
  targetId?: string; // PvP, undefined = wild
}

export interface C2SMoveAction {
  type: 'battle_move';
  moveIndex: number;
}

export interface C2SItemAction {
  type: 'battle_item';
  itemId: string;
}

export interface C2SSwitchAction {
  type: 'battle_switch';
  pokemonIndex: number;
}

export interface C2SCatchAction {
  type: 'battle_catch';
  itemId: string;
}

export interface C2SForfeitAction {
  type: 'battle_forfeit';
}

export type C2SMessage =
  | C2SJoinWorld
  | C2SMove
  | C2SChat
  | C2SStartBattle
  | C2SMoveAction
  | C2SItemAction
  | C2SSwitchAction
  | C2SCatchAction
  | C2SForfeitAction;

// ===== Server -> Client messages =====
export interface S2CError {
  type: 'error';
  code: string;
  message: string;
}

export interface S2CBattleState {
  type: 'battle_state';
  battleId: string;
  turn: number;
  phase: 'select' | 'animating' | 'ended';
  activePokemon: { side: 'ally' | 'foe'; index: number }[];
}

export interface S2CBattleResult {
  type: 'battle_result';
  winner: 'ally' | 'foe' | 'draw' | null;
  expGained?: number;
  caught?: boolean;
}

export interface S2CChat {
  type: 'chat';
  from: string;
  message: string;
}

export type S2CMessage = S2CError | S2CBattleState | S2CBattleResult | S2CChat;
