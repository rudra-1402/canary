import { z } from 'zod';

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ActiveProfileSchema = z.object({
  id: z.string(),
  role: z.enum(['freelancer', 'client']),
});

export const MeResponseSchema = z.object({
  identityId: z.string(),
  email: z.string().email(),
  activeProfile: ActiveProfileSchema.nullable(),
});
