import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
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
});
