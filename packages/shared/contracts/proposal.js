import { z } from 'zod';

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
