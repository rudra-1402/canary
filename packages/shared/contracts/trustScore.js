import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const band = z.enum(['BAND_LOW', 'BAND_MED', 'BAND_HIGH']);
const direction = z.enum(['favorable', 'unfavorable']);
const strength = z.enum(['STRENGTH_WEAK', 'STRENGTH_MEDIUM', 'STRENGTH_STRONG']);
// This is the deliberately safe public explanation: no raw values, metadata, IDs,
// counterparty details, or review provenance. Keep it small enough for inline UI.
const signal = z.object({ name: z.string(), direction, strength }).strict();
const publicExplanationSignals = z.array(signal).max(5);

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
      signals: publicExplanationSignals.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal('stale'),
      profileId: objectId,
      band,
      score: z.number().min(0).max(100),
      generatedAt: z.string().datetime(),
      signals: publicExplanationSignals.optional(),
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

// GET /api/trust-scores/:profileId/outcomes -- the outcome-history evidence behind a
// Trust Score. Same public-safety boundary as the score itself: no counterparty identity,
// no engagement id, only the conduct fields the score is actually built from.
export const TrustScoreOutcomeListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const outcomeSubjectRole = z.enum(['freelancer', 'client']);
const outcomeEndedAs = z.enum(['completed', 'cancelled', 'ghosted']);

export const TrustScoreOutcomeSchema = z
  .object({
    id: objectId,
    subjectRole: outcomeSubjectRole,
    endedAs: outcomeEndedAs,
    ghosted: z.boolean(),
    daysLate: z.number().nullable().optional(),
    paidInFull: z.boolean().nullable().optional(),
    scopeCreepOccurred: z.boolean().nullable().optional(),
    recordedAt: z.string().datetime(),
  })
  .strict();

export const TrustScoreOutcomeListResponseSchema = z
  .object({
    data: z.array(TrustScoreOutcomeSchema),
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .strict();
