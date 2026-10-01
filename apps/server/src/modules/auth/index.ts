import { Router, type Router as ExpressRouter } from 'express';
import { registerHandler } from './register.js';
import { loginHandler } from './login.js';
import { meHandler } from './me.js';

const router: ExpressRouter = Router();

router.post('/register', registerHandler);
router.post('/login', loginHandler);
router.get('/me', meHandler);

export { router as authRouter };
