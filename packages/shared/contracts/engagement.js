import { z } from 'zod';
import { RiskAssessmentSummarySchema } from './riskAssessment.js';

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

const PartySummarySchema = z
  .object({ id: objectId, role: z.enum(['freelancer', 'client']), displayName: z.string() })
  .strict();

export const EngagementDetailSchema = EngagementCommandSchema.extend({
  jobPost: z.object({ id: objectId, title: z.string() }).strict(),
  proposal: z.object({ id: objectId, status: z.string(), bid: z.number() }).strict(),
  parties: z.object({ freelancer: PartySummarySchema, client: PartySummarySchema }).strict(),
  riskAssessment: RiskAssessmentSummarySchema.nullable(),
  outcomeEligibility: z.boolean(),
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
