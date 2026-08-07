import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { toEngagementCommandContract } from '../src/engagement/engagement.serializer.js';

describe('Engagement command serialization', () => {
  it('is owned by the Engagement component and preserves the command contract', () => {
    const engagement = {
      _id: new mongoose.Types.ObjectId('1'.repeat(24)),
      status: 'active',
      freelancerProfileId: new mongoose.Types.ObjectId('2'.repeat(24)),
      clientProfileId: new mongoose.Types.ObjectId('3'.repeat(24)),
      jobPostId: new mongoose.Types.ObjectId('4'.repeat(24)),
      proposalId: new mongoose.Types.ObjectId('5'.repeat(24)),
      agreedTerms: {
        scope: 'Build the approved dashboard.',
        price: 1200,
        paymentTerms: 'project',
        timeline: '14 days',
        dueAt: new Date('2026-08-20T00:00:00.000Z'),
        revisionsIncluded: 2,
      },
      createdAt: new Date('2026-08-06T00:00:00.000Z'),
      acceptedAt: new Date('2026-08-06T01:00:00.000Z'),
    };

    expect(toEngagementCommandContract(engagement)).toEqual({
      id: '1'.repeat(24),
      status: 'active',
      freelancerProfileId: '2'.repeat(24),
      clientProfileId: '3'.repeat(24),
      jobPostId: '4'.repeat(24),
      proposalId: '5'.repeat(24),
      agreedTerms: {
        scope: 'Build the approved dashboard.',
        price: 1200,
        paymentTerms: 'project',
        timeline: '14 days',
        dueAt: '2026-08-20T00:00:00.000Z',
        revisionsIncluded: 2,
      },
      createdAt: '2026-08-06T00:00:00.000Z',
      acceptedAt: '2026-08-06T01:00:00.000Z',
    });
  });
});
