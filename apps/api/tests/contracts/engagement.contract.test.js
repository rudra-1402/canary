import { describe, it, expect } from 'vitest';
import { EngagementSchema } from '@canary/shared';

describe('Engagement contracts', () => {
  const engagement = {
    freelancerProfileId: 'a'.repeat(24),
    clientProfileId: 'b'.repeat(24),
    jobPostId: null,
    proposalId: null,
    status: 'active',
    agreedTerms: {
      scope: 'Build a site',
      price: 1200,
      paymentTerms: 'net-30',
      timeline: '4 weeks',
      dueAt: new Date('2026-08-31T00:00:00.000Z'),
    },
  };

  it('defaults revisionsIncluded to 0 when omitted', () => {
    expect(EngagementSchema.parse(engagement).agreedTerms.revisionsIncluded).toBe(0);
  });

  it('rejects a negative revisionsIncluded value', () => {
    expect(() =>
      EngagementSchema.parse({
        ...engagement,
        agreedTerms: { ...engagement.agreedTerms, revisionsIncluded: -1 },
      }),
    ).toThrow();
  });

  it('rejects a fractional revisionsIncluded value', () => {
    expect(() =>
      EngagementSchema.parse({
        ...engagement,
        agreedTerms: { ...engagement.agreedTerms, revisionsIncluded: 1.5 },
      }),
    ).toThrow();
  });
});
