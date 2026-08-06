import { z } from 'zod';
import { PublicProfileSchema } from './profile.js';
import { TrustScoreResponseSchema } from './trustScore.js';
import { EngagementCommandSchema } from './engagement.js';
import { RiskAssessmentSummarySchema } from './riskAssessment.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const payModel = z.enum(['project', 'milestone']);
const status = z.enum(['submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn']);

const MilestoneSchema = z.object({
  description: z.string(),
  amount: z.number(),
});

const jobPostStatus = z.enum(['draft', 'open', 'closed']);

export const ProposalSchema = z.object({
  jobPostId: objectId,
  freelancerProfileId: objectId,
  bid: z.number(),
  payModel,
  proposedMilestones: z.array(MilestoneSchema).default([]),
  durationEstimate: z.string().optional(),
  proposedDurationDays: z.number().int().min(1),
  coverLetter: z.string().max(5000).optional(),
  screeningAnswers: z.array(z.string()).default([]),
  status: status.default('submitted'),
});

// POST /api/proposals derives the submitting Profile and status on the server.  This
// request shape deliberately does not accept either field from a browser.
export const CreateProposalRequestSchema = z
  .object({
    jobPostId: objectId,
    bid: z.number(),
    payModel,
    proposedMilestones: z.array(MilestoneSchema).default([]),
    durationEstimate: z.string().optional(),
    proposedDurationDays: z.number().int().min(1),
    coverLetter: z.string().max(5000).optional(),
    screeningAnswers: z.array(z.string()).default([]),
  })
  .strict();

export const CreateProposalResponseSchema = z
  .object({ id: objectId, status: z.literal('submitted') })
  .strict();

export const MyProposalSchema = z
  .object({
    id: objectId,
    bid: z.number(),
    payModel,
    proposedMilestones: z.array(MilestoneSchema),
    durationEstimate: z.string().optional(),
    proposedDurationDays: z.number().int().min(1),
    coverLetter: z.string().max(5000).optional(),
    screeningAnswers: z.array(z.string()),
    status,
    createdAt: z.string().datetime().nullable(),
    jobPost: z.object({ id: objectId, title: z.string(), status: jobPostStatus }).strict(),
  })
  .strict();

export const MyProposalsResponseSchema = z.object({ data: z.array(MyProposalSchema) }).strict();

export const JobPostProposalListQuerySchema = z
  .object({
    status: status.optional(),
    sort: z.enum(['newest', 'bid_low', 'bid_high']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const JobPostProposalSchema = z
  .object({
    id: objectId,
    jobPostId: objectId,
    bid: z.number(),
    payModel,
    proposedMilestones: z.array(MilestoneSchema),
    durationEstimate: z.string().optional(),
    proposedDurationDays: z.number().int().min(1),
    coverLetter: z.string().max(5000).optional(),
    screeningAnswers: z.array(z.string()),
    status,
    createdAt: z.string().datetime().nullable(),
    freelancer: PublicProfileSchema,
    trustScore: TrustScoreResponseSchema,
  })
  .strict();

export const JobPostProposalListResponseSchema = z
  .object({
    data: z.array(JobPostProposalSchema),
    pagination: z
      .object({
        page: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int(),
      })
      .strict(),
  })
  .strict();

export const AcceptProposalRequestSchema = z.object({ confirm: z.literal(true) }).strict();

export const DeclineProposalRequestSchema = z
  .object({ reasonCode: z.string().trim().min(1).max(100).optional() })
  .strict();

export const ProposalCommandSummarySchema = z.object({ id: objectId, status }).strict();

export const ProposalDecisionResponseSchema = z
  .object({
    data: z
      .object({
        proposal: ProposalCommandSummarySchema,
        engagement: EngagementCommandSchema,
        riskAssessment: RiskAssessmentSummarySchema,
      })
      .strict(),
  })
  .strict();

export const ProposalDeclineResponseSchema = z
  .object({ data: z.object({ proposal: ProposalCommandSummarySchema }).strict() })
  .strict();
