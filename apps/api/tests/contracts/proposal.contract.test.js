import { describe, it, expect } from 'vitest';
import {
  CreateProposalRequestSchema,
  ProposalSchema,
  JobPostProposalListQuerySchema,
  JobPostProposalListResponseSchema,
} from '@canary/shared';

describe('Proposal contracts', () => {
  const proposal = {
    jobPostId: 'a'.repeat(24),
    freelancerProfileId: 'b'.repeat(24),
    bid: 1200,
    payModel: 'milestone',
    proposedMilestones: [{ description: 'Design', amount: 400 }],
    proposedDurationDays: 21,
    durationEstimate: '3 weeks',
    coverLetter: 'I can do this.',
    screeningAnswers: [],
    status: 'submitted',
  };

  it('accepts a positive integer proposedDurationDays value', () => {
    expect(ProposalSchema.parse(proposal).proposedDurationDays).toBe(21);
  });

  it('rejects a zero proposedDurationDays value', () => {
    expect(() => ProposalSchema.parse({ ...proposal, proposedDurationDays: 0 })).toThrow();
  });

  it('rejects a negative proposedDurationDays value', () => {
    expect(() => ProposalSchema.parse({ ...proposal, proposedDurationDays: -1 })).toThrow();
  });

  it('rejects a fractional proposedDurationDays value', () => {
    expect(() => ProposalSchema.parse({ ...proposal, proposedDurationDays: 2.5 })).toThrow();
  });

  it('does not accept server-owned freelancer identity or status on the create request', () => {
    const { freelancerProfileId, status, ...request } = proposal;
    expect(CreateProposalRequestSchema.parse(request)).not.toHaveProperty('freelancerProfileId');
    expect(() => CreateProposalRequestSchema.parse(proposal)).toThrow();
  });

  it('parses Client inbox filters and applicant public data with TrustScore', () => {
    expect(
      JobPostProposalListQuerySchema.parse({ status: 'submitted', sort: 'bid_low', page: '2' }),
    ).toMatchObject({ status: 'submitted', sort: 'bid_low', page: 2, pageSize: 20 });

    expect(() =>
      JobPostProposalListResponseSchema.parse({
        data: [
          {
            id: 'c'.repeat(24),
            jobPostId: proposal.jobPostId,
            bid: proposal.bid,
            payModel: proposal.payModel,
            proposedMilestones: proposal.proposedMilestones,
            proposedDurationDays: proposal.proposedDurationDays,
            durationEstimate: proposal.durationEstimate,
            coverLetter: proposal.coverLetter,
            screeningAnswers: proposal.screeningAnswers,
            status: proposal.status,
            createdAt: null,
            freelancer: {
              id: proposal.freelancerProfileId,
              role: 'freelancer',
              displayName: 'Ava Freelancer',
              paymentVerified: true,
              verificationStatus: 'id-verified',
              skills: ['react'],
              portfolio: [],
              workHistory: [],
              certifications: [],
              languages: ['English'],
              createdAt: null,
            },
            trustScore: {
              status: 'insufficient-history',
              profileId: proposal.freelancerProfileId,
              outcomeCount: 1,
              outcomesNeeded: 3,
            },
            prospectiveEngagementId: null,
            riskAssessment: null,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      }),
    ).not.toThrow();
  });
});
