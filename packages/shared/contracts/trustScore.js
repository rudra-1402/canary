import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const band = z.enum(['BAND_LOW', 'BAND_MED', 'BAND_HIGH']);
const direction = z.enum(['favorable', 'unfavorable']);
const strength = z.enum(['STRENGTH_WEAK', 'STRENGTH_MEDIUM', 'STRENGTH_STRONG']);
const signal = z.object({ name: z.string(), direction, strength }).strict();

export const TrustScoreIdParamSchema = z.object({ profileId: objectId }).strict();
export const TrustScoreBatchQuerySchema = z
  .object({
    profileIds: z
      .string()
      .transform((value) => value.split(','))
      .pipe(z.array(objectId).min(1).max(50))
      .refine((ids) => new Set(ids).size === ids.length, 'profileIds must be distinct'),
  })
  .strict();

export const TrustScoreResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('scored'),
      profileId: objectId,
      band,
      score: z.number().min(0).max(100),
      generatedAt: z.string().datetime(),
      signals: z.array(signal).optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal('stale'),
      profileId: objectId,
      band,
      score: z.number().min(0).max(100),
      generatedAt: z.string().datetime(),
      signals: z.array(signal).optional(),
      outcomesSince: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      status: z.literal('pending-score'),
      profileId: objectId,
      outcomeCount: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal('insufficient-history'),
      profileId: objectId,
      outcomeCount: z.number().int().nonnegative(),
      outcomesNeeded: z.number().int().positive(),
    })
    .strict(),
]);

export const TrustScoreBatchResponseSchema = z
  .object({
    data: z.array(
      z.union([
        TrustScoreResponseSchema,
        z.object({ status: z.literal('not-found'), profileId: objectId }).strict(),
      ]),
    ),
  })
  .strict();
