import { z } from 'zod';
import { RiskAssessmentSummarySchema } from './riskAssessment.js';
import { PublicProfileSchema } from './profile.js';
import { TrustScoreResponseSchema } from './trustScore.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const status = z.enum(['prospective', 'active', 'concluded']);

const AgreedTermsSchema = z.object({
  scope: z.string(),
  price: z.number(),
  paymentTerms: z.string(),
  timeline: z.string(),
  dueAt: z.date().optional(),
  revisionsIncluded: z.number().int().min(0).default(0),
});

const ResponseAgreedTermsSchema = z
  .object({
    scope: z.string(),
    price: z.number(),
    paymentTerms: z.string(),
    timeline: z.string(),
    dueAt: z.string().datetime().optional(),
    revisionsIncluded: z.number().int().min(0),
  })
  .strict();

export const EngagementSchema = z
  .object({
    freelancerProfileId: objectId,
    clientProfileId: objectId,
    jobPostId: objectId.nullable(),
    proposalId: objectId.nullable(),
    status,
    agreedTerms: AgreedTermsSchema.optional(),
  })
  .superRefine((engagement, ctx) => {
    if (engagement.status === 'prospective') return;

    if (!engagement.agreedTerms) {
      ctx.addIssue({ code: 'custom', path: ['agreedTerms'], message: 'agreedTerms is required' });
      return;
    }

    if (!engagement.agreedTerms.dueAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['agreedTerms', 'dueAt'],
        message: 'dueAt is required',
      });
    }
  });

export const MyEngagementSchema = z
  .object({
    id: objectId,
    counterpartyProfileId: objectId,
    jobPostId: objectId.nullable(),
    proposalId: objectId.nullable(),
    status,
    agreedTerms: ResponseAgreedTermsSchema.nullable(),
    createdAt: z.string().datetime().nullable(),
  })
  .superRefine((engagement, ctx) => {
    if (engagement.status === 'prospective') return;
    if (!engagement.agreedTerms?.dueAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['agreedTerms', 'dueAt'],
        message: 'agreedTerms with dueAt is required',
      });
    }
  });

export const MyEngagementsResponseSchema = z.object({ data: z.array(MyEngagementSchema) }).strict();

export const EngagementCommandSchema = z
  .object({
    id: objectId,
    status,
    freelancerProfileId: objectId,
    clientProfileId: objectId,
    jobPostId: objectId,
    proposalId: objectId,
    agreedTerms: z
      .object({
        scope: z.string(),
        price: z.number(),
        paymentTerms: z.string(),
        timeline: z.string(),
        dueAt: z.string().datetime().nullable(),
        revisionsIncluded: z.number().int().min(0),
      })
      .strict(),
    createdAt: z.string().datetime(),
    acceptedAt: z.string().datetime().nullable(),
  })
  .strict();

const CompleteTermsSchema = z
  .object({
    scope: z.string(),
    price: z.number(),
    paymentTerms: z.string(),
    timeline: z.string(),
    dueAt: z.string().datetime().nullable(),
    revisionsIncluded: z.number().int().min(0),
    jobPostBudgetOrRate: z.number().optional(),
    jobType: z.enum(['hourly', 'fixed']).optional(),
    skills: z.array(z.string()).optional(),
    projectLength: z
      .enum(['less-than-1-month', '1-to-3-months', '3-to-6-months', 'more-than-6-months'])
      .optional(),
    hoursPerWeek: z.number().min(1).max(168).nullable().optional(),
    proposedDurationDays: z.number().int().min(1).optional(),
    proposedMilestones: z
      .array(z.object({ description: z.string(), amount: z.number() }))
      .optional(),
    screeningQuestions: z.array(z.string()).optional(),
    screeningAnswers: z.array(z.string()).optional(),
  })
  .strict();

const allowedAction = z.enum([
  'request-risk-assessment',
  'accept-proposal',
  'decline-proposal',
  'submit-outcome-review',
]);

export const EngagementDetailSchema = EngagementCommandSchema.extend({
  agreedTerms: CompleteTermsSchema.nullable(),
  proposedTerms: CompleteTermsSchema,
  concludedAt: z.string().datetime().nullable(),
  jobPost: z.object({ id: objectId, title: z.string() }).strict(),
  proposal: z.object({ id: objectId, status: z.string(), bid: z.number() }).strict(),
  parties: z.object({ freelancer: PublicProfileSchema, client: PublicProfileSchema }).strict(),
  trustByParty: z
    .object({ freelancer: TrustScoreResponseSchema, client: TrustScoreResponseSchema })
    .strict(),
  riskAssessment: RiskAssessmentSummarySchema.nullable(),
  outcomeEligibility: z.boolean(),
  allowedActions: z.array(allowedAction),
  timeline: z.array(
    z
      .object({
        event: z.enum(['prospective-created', 'accepted', 'concluded']),
        at: z.string().datetime(),
      })
      .strict(),
  ),
}).strict();

export const EngagementDetailResponseSchema = z
  .object({ data: z.object({ engagement: EngagementDetailSchema }).strict() })
  .strict();

export const RiskAssessmentCommandResponseSchema = z
  .object({
    data: z
      .object({
        engagement: EngagementCommandSchema,
        riskAssessment: RiskAssessmentSummarySchema,
      })
      .strict(),
  })
  .strict();
