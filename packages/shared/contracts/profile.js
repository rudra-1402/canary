import { z } from 'zod';
import { TrustScoreResponseSchema } from './trustScore.js';

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
    headline: z.string().optional(),
    bio: z.string().optional(),
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

const nonEmptyPatch = (schema) =>
  schema.refine((value) => Object.keys(value).length > 0, 'at least one field is required');

const commonPatchFields = {
  displayName: z.string().trim().min(1).max(120).optional(),
  headline: z.string().trim().min(1).max(160).optional(),
  bio: z.string().trim().min(1).max(2000).optional(),
  country: z.string().trim().min(2).max(100).optional(),
  discoverable: z.boolean().optional(),
};

export const FreelancerProfilePatchSchema = nonEmptyPatch(
  z
    .object({
      ...commonPatchFields,
      skills: z.array(z.string().trim().min(1).max(80)).max(15).optional(),
      hourlyRate: z.number().finite().min(0).max(10000).optional(),
      languages: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
      portfolio: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
      workHistory: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
      certifications: z.array(z.string().trim().min(1).max(250)).max(10).optional(),
      availableForWork: z.boolean().optional(),
    })
    .strict(),
);

export const ClientProfilePatchSchema = nonEmptyPatch(
  z
    .object({
      ...commonPatchFields,
      businessName: z.string().trim().min(1).max(160).optional(),
      industry: z.string().trim().min(1).max(120).optional(),
      typicalBudget: z.number().finite().min(0).max(1_000_000_000).optional(),
      paymentTermsNorm: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
);

export const OwnerProfileSchema = PublicProfileSchema.extend({
  discoverable: z.boolean(),
  onboardingCompletedAt: z.string().datetime().nullable(),
}).strict();

export const ProfileUpdateResponseSchema = z
  .object({
    profile: OwnerProfileSchema,
    onboarding: z.object({ complete: z.boolean(), missingFields: z.array(z.string()) }).strict(),
  })
  .strict();

const commaList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1).max(80)).max(15));

export const FreelancerGalleryQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
    skills: commaList.optional(),
    country: z.string().trim().min(2).max(100).optional(),
    minRate: z.coerce.number().finite().min(0).max(10000).optional(),
    maxRate: z.coerce.number().finite().min(0).max(10000).optional(),
    trustBand: z.enum(['BAND_LOW', 'BAND_MED', 'BAND_HIGH']).optional(),
    sort: z
      .enum(['relevance', 'trust-desc', 'rate-asc', 'rate-desc', 'name-asc'])
      .default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(24),
  })
  .strict()
  .refine(
    ({ minRate, maxRate }) => minRate === undefined || maxRate === undefined || minRate <= maxRate,
    { message: 'minRate must be less than or equal to maxRate', path: ['minRate'] },
  );

export const FreelancerGalleryItemSchema = PublicProfileSchema.extend({
  role: z.literal('freelancer'),
  availableForWork: z.literal(true),
  activeEngagementCount: z.number().int().nonnegative(),
  trust: TrustScoreResponseSchema,
}).strict();

export const FreelancerGalleryResponseSchema = z
  .object({
    data: z.array(FreelancerGalleryItemSchema),
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int().nonnegative(),
    }),
  })
  .strict();
