import { Router } from 'express';
import { registerHandler, loginHandler } from './auth.handlers.js';

const router: Router = Router();

router.post('/register', registerHandler);
router.post('/login', loginHandler);

export default router;
