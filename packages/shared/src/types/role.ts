export type Role = 'player' | 'moderator' | 'admin';

export const ROLES: Role[] = ['player', 'moderator', 'admin'];

export const ROLE_LEVEL: Record<Role, number> = {
  player: 0,
  moderator: 1,
  admin: 2,
};

export function roleAtLeast(actual: Role, min: Role): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[min];
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}
