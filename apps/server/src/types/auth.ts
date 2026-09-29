import type { Role } from '@pixelmon/shared';

export interface AuthUser {
  sub: string;
  userId: number;
  username: string;
  role: Role;
}
