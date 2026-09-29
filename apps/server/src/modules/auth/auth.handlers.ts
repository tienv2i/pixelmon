import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { RegisterSchema, LoginSchema, type RegisterDto, type LoginDto } from '../../config/validation.js';
import type { AsyncHandler } from '../../types/index.js';

export const registerHandler: AsyncHandler = async (req, res) => {
  const data = RegisterSchema.parse(req.body) as RegisterDto;
  res.status(201).json({ message: 'OK', username: data.username });
};

export const loginHandler: AsyncHandler = async (req, res) => {
  const data = LoginSchema.parse(req.body) as LoginDto;
  const token = jwt.sign({ sub: 'user-id', username: data.email }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
  res.json({ access_token: token });
};
