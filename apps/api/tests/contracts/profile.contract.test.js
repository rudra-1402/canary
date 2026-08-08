import { describe, expect, it } from 'vitest';
import {
  ClientProfilePatchSchema,
  FreelancerGalleryQuerySchema,
  FreelancerGalleryResponseSchema,
  FreelancerProfilePatchSchema,
  ProfileUpdateResponseSchema,
} from '@canary/shared';

describe('Profile mutation and gallery contracts', () => {
  it('accepts an additive Freelancer patch using existing scalar field shapes', () => {
    expect(
      FreelancerProfilePatchSchema.parse({
        headline: 'Product designer',
        bio: 'Designs evidence-led onboarding flows.',
        country: 'IN',
        skills: ['Figma', 'User research'],
        hourlyRate: 55,
        languages: ['English — professional'],
        portfolio: ['Onboarding redesign — https://example.invalid/work'],
        workHistory: ['Product Designer · 2024–2026'],
        certifications: ['Accessibility Foundations'],
        discoverable: true,
        availableForWork: true,
      }),
    ).toMatchObject({ hourlyRate: 55, availableForWork: true });
  });

  it('rejects system-managed and wrong-role fields', () => {
    expect(FreelancerProfilePatchSchema).toBeDefined();
    expect(ClientProfilePatchSchema).toBeDefined();
    expect(() => FreelancerProfilePatchSchema.parse({ paymentVerified: true })).toThrow();
    expect(() => ClientProfilePatchSchema.parse({ availableForWork: true })).toThrow();
  });

  it('rejects an empty patch', () => {
    expect(FreelancerProfilePatchSchema).toBeDefined();
    expect(() => FreelancerProfilePatchSchema.parse({})).toThrow();
  });

  it('coerces and bounds gallery query values', () => {
    expect(
      FreelancerGalleryQuerySchema.parse({
        skills: 'Figma,User research',
        minRate: '25',
        maxRate: '100',
        page: '2',
        pageSize: '24',
        trustBand: 'BAND_HIGH',
        sort: 'trust-desc',
      }),
    ).toMatchObject({
      skills: ['Figma', 'User research'],
      minRate: 25,
      maxRate: 100,
      page: 2,
      pageSize: 24,
    });
  });

  it('accepts owner completion and honest insufficient-history gallery responses', () => {
    const id = '507f1f77bcf86cd799439011';
    const publicFields = {
      id,
      role: 'freelancer',
      displayName: 'Asha',
      paymentVerified: false,
      verificationStatus: 'none',
      skills: ['Figma'],
      portfolio: [],
      workHistory: [],
      certifications: [],
      languages: ['English'],
      availableForWork: true,
      createdAt: null,
    };

    expect(
      ProfileUpdateResponseSchema.parse({
        profile: { ...publicFields, discoverable: true, onboardingCompletedAt: null },
        onboarding: { complete: false, missingFields: ['country'] },
      }).onboarding.complete,
    ).toBe(false);

    expect(
      FreelancerGalleryResponseSchema.parse({
        data: [
          {
            ...publicFields,
            activeEngagementCount: 0,
            trust: {
              status: 'insufficient-history',
              profileId: id,
              outcomeCount: 0,
              outcomesNeeded: 3,
            },
          },
        ],
        pagination: { page: 1, pageSize: 24, total: 1 },
      }).data,
    ).toHaveLength(1);
  });
});
