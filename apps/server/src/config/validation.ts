import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6).max(50),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const CreatePokemonSchema = z.object({
  speciesId: z.string(),
  level: z.number().int().min(1).max(100).default(5),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type CreatePokemonDto = z.infer<typeof CreatePokemonSchema>;
