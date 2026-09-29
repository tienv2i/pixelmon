import { ROLE_LEVEL } from '@pixelmon/shared';
import type { Role } from '@pixelmon/shared';
import type { AsyncHandler } from '../../types/index.js';

export function requireRole(min: Role): AsyncHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[min]) {
      res.status(403).json({ error: `Requires role >= ${min}` });
      return;
    }
    next();
  };
}
