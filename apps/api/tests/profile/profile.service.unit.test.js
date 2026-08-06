import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  getOnboardingState,
  toOwnerProfileContract,
  toPublicProfileContract,
  toPublicReviewContract,
} from '../../src/profile/profile.service.js';

describe('Profile response mappers', () => {
  it('maps only public Profile fields', () => {
    const identityId = new mongoose.Types.ObjectId();
    const result = toPublicProfileContract({
      _id: new mongoose.Types.ObjectId(),
      identityId,
      role: 'freelancer',
      displayName: 'Avery',
      verificationStatus: 'none',
      skills: [],
      taxRatePct: 30,
      origin: 'synthetic-seeded',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(result).toMatchObject({ role: 'freelancer', displayName: 'Avery', skills: [] });
    expect(result).not.toHaveProperty('identityId');
    expect(result).not.toHaveProperty('taxRatePct');
    expect(result).not.toHaveProperty('origin');
  });

  it('excludes planted provenance when mapping public Reviews', () => {
    const result = toPublicReviewContract({
      _id: new mongoose.Types.ObjectId(),
      engagementId: new mongoose.Types.ObjectId(),
      authorProfileId: new mongoose.Types.ObjectId(),
      subjectProfileId: new mongoose.Types.ObjectId(),
      rating: 5,
      visibleAt: new Date('2026-01-01T00:00:00.000Z'),
      isPlantedCollusion: true,
      isPlantedSabotage: true,
    });

    expect(result).not.toHaveProperty('isPlantedCollusion');
    expect(result).not.toHaveProperty('isPlantedSabotage');
  });

  it('reports exact missing Freelancer onboarding fields', () => {
    expect(getOnboardingState({ role: 'freelancer', displayName: 'Asha', skills: [] })).toEqual({
      complete: false,
      missingFields: [
        'headline',
        'bio',
        'country',
        'skills',
        'hourlyRate',
        'languages',
        'availableForWork',
      ],
    });
  });

  it('accepts false availability as a completed explicit choice', () => {
    expect(
      getOnboardingState({
        role: 'freelancer',
        displayName: 'Asha',
        headline: 'Designer',
        bio: 'Design specialist',
        country: 'IN',
        skills: ['Figma'],
        hourlyRate: 55,
        languages: ['English'],
        availableForWork: false,
      }).complete,
    ).toBe(true);
  });

  it('reports exact missing Client onboarding fields', () => {
    expect(getOnboardingState({ role: 'client', displayName: 'Acme' }).missingFields).toEqual([
      'businessName',
      'headline',
      'bio',
      'country',
      'industry',
      'typicalBudget',
      'paymentTermsNorm',
    ]);
  });

  it('maps owner fields without leaking Identity or operational fields', () => {
    const result = toOwnerProfileContract({
      _id: new mongoose.Types.ObjectId(),
      identityId: new mongoose.Types.ObjectId(),
      role: 'freelancer',
      origin: 'user-registered',
      displayName: 'Asha',
      verificationStatus: 'none',
      discoverable: false,
      onboardingCompletedAt: null,
      skills: [],
    });

    expect(result).toMatchObject({ discoverable: false, onboardingCompletedAt: null });
    expect(result).not.toHaveProperty('identityId');
    expect(result).not.toHaveProperty('origin');
  });
});
