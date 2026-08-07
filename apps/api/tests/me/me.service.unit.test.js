import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  buildMyJobPostFilter,
  toMyEngagementContract,
  toMyProposalContract,
} from '../../src/me/me.service.js';

describe('My Work response mappers', () => {
  it('includes the populated JobPost summary with a Proposal', () => {
    const jobPostId = new mongoose.Types.ObjectId();
    const result = toMyProposalContract({
      _id: new mongoose.Types.ObjectId(),
      bid: 1200,
      payModel: 'project',
      proposedDurationDays: 10,
      status: 'submitted',
      jobPostId: { _id: jobPostId, title: 'Build a site', status: 'open' },
    });

    expect(result.jobPost).toEqual({
      id: jobPostId.toString(),
      title: 'Build a site',
      status: 'open',
    });
  });

  it('selects the opposite Profile as the engagement counterparty', () => {
    const freelancerProfileId = new mongoose.Types.ObjectId();
    const clientProfileId = new mongoose.Types.ObjectId();
    const result = toMyEngagementContract(
      {
        _id: new mongoose.Types.ObjectId(),
        freelancerProfileId,
        clientProfileId,
        status: 'active',
        agreedTerms: {
          scope: 'Build a site',
          price: 1200,
          paymentTerms: 'net-30',
          timeline: '10 days',
          dueAt: new Date('2026-08-31T00:00:00.000Z'),
        },
      },
      clientProfileId,
    );

    expect(result.counterpartyProfileId).toBe(freelancerProfileId.toString());
    expect(result.agreedTerms.dueAt).toBe('2026-08-31T00:00:00.000Z');
  });
});

describe('buildMyJobPostFilter', () => {
  it('always scopes ownership and escapes literal search metacharacters', () => {
    const profileId = new mongoose.Types.ObjectId();
    const filter = buildMyJobPostFilter(profileId, { status: 'open', q: '[React]' });
    expect(String(filter.clientProfileId)).toBe(profileId.toString());
    expect(filter.status).toBe('open');
    expect(filter.$or[0].title.$regex).toBe('\\[React\\]');
  });
});
