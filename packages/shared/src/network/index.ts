import type { Position } from '../types/position.js';

export const MESSAGE_MOVE = 'msg:move' as const;
export const MESSAGE_CHAT = 'msg:chat' as const;
export const MESSAGE_START_BATTLE = 'msg:start_battle' as const;
export const MESSAGE_BATTLE_ACTION = 'msg:battle_action' as const;
export const MESSAGE_JOIN_WORLD = 'msg:join_world' as const;
export const MESSAGE_LEAVE_WORLD = 'msg:leave_world' as const;

export interface MessageMovePayload {
  position: Position;
  moving: boolean;
  timestamp: number;
}

export interface MessageChatPayload {
  senderId: string;
  username: string;
  message: string;
  timestamp: number;
}

export interface MessageJoinWorldPayload {
  playerId: string;
  mapId: string;
  position: Position;
}

export interface MessageLeaveWorldPayload {
  playerId: string;
  reason?: string;
}

export interface MessageStartBattlePayload {
  roomId: string;
  opponentId: string;
  wildPokemonId?: string;
}

export interface MessageBattleActionPayload {
  roomId: string;
  actionType: 'move' | 'switch' | 'item' | 'flee';
  moveId?: string;
  pokemonId?: string;
  itemId?: string;
}
