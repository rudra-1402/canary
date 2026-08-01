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
