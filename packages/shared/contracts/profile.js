import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const role = z.enum(['freelancer', 'client']);
const verificationStatus = z.enum(['none', 'id-verified']);

export const ProfileIdParamSchema = z.object({ id: objectId }).strict();

// GET /api/profiles/:id response. This is deliberately an explicit public projection:
// Identity ownership, auth fields, operational origin, and private tax data are not public.
export const PublicProfileSchema = z
  .object({
    id: objectId,
    role,
    displayName: z.string(),
    businessName: z.string().optional(),
    paymentVerified: z.boolean(),
    verificationStatus,
    skills: z.array(z.string()),
    hourlyRate: z.number().optional(),
    portfolio: z.array(z.string()),
    workHistory: z.array(z.string()),
    certifications: z.array(z.string()),
    languages: z.array(z.string()),
    availableForWork: z.boolean().optional(),
    country: z.string().optional(),
    industry: z.string().optional(),
    typicalBudget: z.number().optional(),
    paymentTermsNorm: z.string().optional(),
    createdAt: z.string().datetime().nullable(),
  })
  .strict();
