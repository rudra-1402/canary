import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const subjectRole = z.enum(['freelancer', 'client']);
const endedAs = z.enum(['completed', 'cancelled', 'ghosted']);
const labelSource = z.enum(['synthetic', 'heuristic', 'self-reported']);

export const OutcomeSchema = z
  .object({
    engagementId: objectId,
    subjectProfileId: objectId,
    counterpartyProfileId: objectId,
    subjectRole,
    observed: z.boolean(),
    deliveredAt: z.date().nullable().optional(),
    daysLate: z.number().nullable().optional(),
    paidInFull: z.boolean().nullable().optional(),
    revisionsRequested: z.number().nullable().optional(),
    scopeCreepOccurred: z.boolean().nullable().optional(),
    ghosted: z.boolean().default(false),
    endedAs,
    labelSource,
    recordedAt: z.date().optional(),
  })
  .superRefine((outcome, ctx) => {
    const freelancerConduct = ['deliveredAt', 'daysLate'];
    const clientConduct = ['paidInFull', 'revisionsRequested', 'scopeCreepOccurred'];
    const mustBeNull =
      !outcome.observed || outcome.ghosted
        ? [...freelancerConduct, ...clientConduct]
        : outcome.subjectRole === 'freelancer'
          ? clientConduct
          : freelancerConduct;

    for (const field of mustBeNull) {
      if (outcome[field] != null) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must be null for this Outcome row`,
        });
      }
    }
  });

const OutcomeConductSchema = z
  .object({
    observed: z.boolean(),
    deliveredAt: z.coerce.date().nullable().optional(),
    daysLate: z.number().nullable().optional(),
    paidInFull: z.boolean().nullable().optional(),
    revisionsRequested: z.number().nullable().optional(),
    scopeCreepOccurred: z.boolean().nullable().optional(),
    ghosted: z.boolean().default(false),
    endedAs,
  })
  .strict();

export const CreateOutcomeReviewRequestSchema = z
  .object({
    engagementId: objectId,
    outcome: OutcomeConductSchema,
    review: z
      .object({ rating: z.number().min(1).max(5), text: z.string().max(5000).optional() })
      .strict(),
  })
  .strict();

export const CreateOutcomeReviewResponseSchema = z
  .object({
    outcomeId: objectId,
    reviewId: objectId,
    engagementStatus: z.enum(['active', 'concluded']),
  })
  .strict();
