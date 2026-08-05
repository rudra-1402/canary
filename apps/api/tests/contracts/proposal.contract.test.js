import { describe, it, expect } from 'vitest';
import { CreateProposalRequestSchema, ProposalSchema } from '@canary/shared';

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
});
