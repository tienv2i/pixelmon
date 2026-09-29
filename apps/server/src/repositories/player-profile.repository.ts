import type { DatabaseSync } from 'node:sqlite';
import type { Direction, Position } from '@pixelmon/shared';

export interface PlayerProfileRow {
  id: number;
  user_id: number;
  map_id: string;
  position_x: number;
  position_y: number;
  direction: Direction;
  level: number;
  experience: number;
  money: number;
}

export interface PlayerProfile {
  userId: number;
  mapId: string;
  position: Position;
  level: number;
  experience: number;
  money: number;
}

const DEFAULT_MAP = 'map_pallet_town';

function toProfile(row: PlayerProfileRow): PlayerProfile {
  return {
    userId: row.user_id,
    mapId: row.map_id,
    position: { x: row.position_x, y: row.position_y, direction: row.direction },
    level: row.level,
    experience: row.experience,
    money: row.money,
  };
}

export class PlayerProfileRepository {
  constructor(private readonly db: DatabaseSync) {}

  ensureExists(userId: number): void {
    const existing = this.db
      .prepare(`SELECT id FROM player_profiles WHERE user_id = ?`)
      .get(userId);
    if (existing) return;
    this.db
      .prepare(
        `INSERT INTO player_profiles(user_id, map_id, position_x, position_y, direction)
         VALUES(?, ?, 0, 0, 'down')`
      )
      .run(userId, DEFAULT_MAP);
  }

  getByUserId(userId: number): PlayerProfile | undefined {
    const row = this.db
      .prepare(`SELECT * FROM player_profiles WHERE user_id = ?`)
      .get(userId);
    return row ? toProfile(row as unknown as PlayerProfileRow) : undefined;
  }

  savePosition(userId: number, pos: Position): void {
    this.db
      .prepare(
        `UPDATE player_profiles
         SET position_x = ?, position_y = ?, direction = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(pos.x, pos.y, pos.direction, userId);
  }

  listAll(): PlayerProfile[] {
    const rows = this.db
      .prepare(`SELECT * FROM player_profiles`)
      .all() as unknown as PlayerProfileRow[];
    return rows.map(toProfile);
  }
}
