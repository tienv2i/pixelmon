import { z } from 'zod';
import type { Role } from '@pixelmon/shared';
import type { AsyncHandler } from '../../types/index.js';
import type { UserRepository } from '../../repositories/user.repository.js';

const SetRoleSchema = z.object({ role: z.enum(['player', 'moderator', 'admin']) });
const SetActiveSchema = z.object({ isActive: z.boolean() });

export function makeListUsersHandler(users: UserRepository): AsyncHandler {
  return (_req, res) => {
    res.json({ users: users.listAll() });
  };
}

export function makeSetRoleHandler(users: UserRepository): AsyncHandler {
  return (req, res) => {
    const parsed = SetRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const id = Number(req.params.id);
    if (!users.getRowById(id)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    users.setRole(id, parsed.data.role as Role);
    const updated = users.getById(id);
    if (!updated) {
      res.status(500).json({ error: 'Failed to reload user after role change' });
      return;
    }
    res.json({ user: updated });
  };
}

export function makeSetActiveHandler(users: UserRepository): AsyncHandler {
  return (req, res) => {
    const parsed = SetActiveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const id = Number(req.params.id);
    if (!users.getRowById(id)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    users.setActive(id, parsed.data.isActive);
    const updated = users.getById(id);
    if (!updated) {
      res.status(500).json({ error: 'Failed to reload user after active change' });
      return;
    }
    res.json({ user: updated });
  };
}
