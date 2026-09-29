import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware.js';
import { getPlayerHandler, updatePlayerHandler } from './player.handlers.js';

const router: Router = Router();

router.use(authMiddleware);
router.get('/me', getPlayerHandler);
router.patch('/me', updatePlayerHandler);

export default router;
