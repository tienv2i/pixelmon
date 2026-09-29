import { z } from 'zod';
import type { AsyncHandler } from '../../types/index.js';
import type { UserRepository } from '../../repositories/user.repository.js';

const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function makeRegisterHandler(users: UserRepository): AsyncHandler {
  return async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (users.getByEmail(parsed.data.email)) {
      res.status(409).json({ error: 'email already registered' });
      return;
    }
    if (users.getRowByUsername(parsed.data.username)) {
      res.status(409).json({ error: 'username already registered' });
      return;
    }
    try {
      const user = await users.register(
        parsed.data.email,
        parsed.data.username,
        parsed.data.password
      );
      const token = users.generateToken(user);
      res.status(201).json({ user, token });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      res.status(409).json({ error: message });
    }
  };
}

export function makeLoginHandler(users: UserRepository): AsyncHandler {
  return async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await users.login(parsed.data.email, parsed.data.password);
    if (!result) {
      res.status(401).json({ error: 'Invalid credentials or inactive account' });
      return;
    }
    res.json({ user: result.user, token: result.token });
  };
}

export function makeMeHandler(users: UserRepository): AsyncHandler {
  return (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = users.getById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  };
}
