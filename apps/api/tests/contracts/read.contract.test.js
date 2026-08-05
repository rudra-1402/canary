import { describe, expect, it } from 'vitest';
import {
  MyEngagementsResponseSchema,
  MyProposalsResponseSchema,
  ProfileReviewListResponseSchema,
  PublicProfileSchema,
} from '@canary/shared';

const id = (character) => character.repeat(24);

describe('read response contracts', () => {
  it('rejects non-public fields in a public Profile response', () => {
    expect(() =>
      PublicProfileSchema.parse({
        id: id('a'),
        role: 'freelancer',
        displayName: 'Avery',
        paymentVerified: false,
        verificationStatus: 'none',
        skills: [],
        portfolio: [],
        workHistory: [],
        certifications: [],
        languages: [],
        createdAt: null,
        identityId: id('b'),
      }),
    ).toThrow();
  });

  it('rejects planted flags in a public Review response', () => {
    expect(() =>
      ProfileReviewListResponseSchema.parse({
        data: [
          {
            id: id('a'),
            engagementId: id('b'),
            authorProfileId: id('c'),
            subjectProfileId: id('d'),
            rating: 5,
            visibleAt: '2026-08-01T00:00:00.000Z',
            createdAt: null,
            isPlantedCollusion: true,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      }),
    ).toThrow();
  });

  it('accepts the UI list response shapes for proposals and engagements', () => {
    expect(
      MyProposalsResponseSchema.parse({
        data: [
          {
            id: id('a'),
            bid: 1200,
            payModel: 'project',
            proposedMilestones: [],
            proposedDurationDays: 10,
            screeningAnswers: [],
            status: 'submitted',
            createdAt: null,
            jobPost: { id: id('b'), title: 'Build a site', status: 'open' },
          },
        ],
      }).data,
    ).toHaveLength(1);
    expect(
      MyEngagementsResponseSchema.parse({
        data: [
          {
            id: id('a'),
            counterpartyProfileId: id('b'),
            jobPostId: null,
            proposalId: null,
            status: 'prospective',
            agreedTerms: null,
            createdAt: null,
          },
        ],
      }).data,
    ).toHaveLength(1);
  });
});
