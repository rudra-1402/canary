import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const payModel = z.enum(['project', 'milestone']);
const status = z.enum(['submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn']);

const MilestoneSchema = z.object({
  description: z.string(),
  amount: z.number(),
});

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
