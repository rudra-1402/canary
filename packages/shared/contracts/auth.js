import { z } from 'zod';

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ForgotPasswordRequestSchema = z.object({ email: z.string().email() });
export const ResendVerificationRequestSchema = z.object({ email: z.string().email() });
export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

const ActiveProfileSchema = z.object({
  id: z.string(),
  role: z.enum(['freelancer', 'client']),
});

export const MeResponseSchema = z.object({
  identityId: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  activeProfile: ActiveProfileSchema.nullable(),
});

export const CreateProfileRequestSchema = z.object({
  role: z.enum(['freelancer', 'client']),
  displayName: z.string().min(1).max(120),
});

export const SwitchProfileRequestSchema = z.object({
  profileId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId'),
});
