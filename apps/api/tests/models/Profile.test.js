import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Profile from '../../src/models/Profile.js';

describe('Profile schema', () => {
  const identityId = new mongoose.Types.ObjectId();

  it('validates a well-formed freelancer Profile', () => {
    const doc = new Profile({
      identityId,
      role: 'freelancer',
      origin: 'synthetic-seeded',
      displayName: 'Jordan Lee',
      skills: ['react', 'node'],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid role', () => {
    const doc = new Profile({
      identityId,
      role: 'admin',
      origin: 'synthetic-seeded',
      displayName: 'Bad Role',
    });
    const err = doc.validateSync();
    expect(err.errors.role).toBeDefined();
  });

  it('rejects more than 15 skills', () => {
    const doc = new Profile({
      identityId,
      role: 'freelancer',
      origin: 'synthetic-seeded',
      displayName: 'Too Many Skills',
      skills: Array.from({ length: 16 }, (_, i) => `skill-${i}`),
    });
    const err = doc.validateSync();
    expect(err.errors.skills).toBeDefined();
  });

  it('persists bounded presentation and availability fields', async () => {
    const profile = new Profile({
      identityId,
      role: 'freelancer',
      origin: 'user-registered',
      displayName: 'Asha',
      headline: 'Product designer',
      bio: 'Evidence-led onboarding specialist.',
      availableForWork: true,
    });

    await expect(profile.validate()).resolves.toBeUndefined();
    expect(profile.headline).toBe('Product designer');
    expect(profile.bio).toBe('Evidence-led onboarding specialist.');
  });

  it('rejects overlong Profile presentation fields', async () => {
    const profile = new Profile({
      identityId,
      role: 'freelancer',
      origin: 'user-registered',
      displayName: 'Asha',
      headline: 'x'.repeat(161),
    });

    await expect(profile.validate()).rejects.toMatchObject({
      errors: { headline: expect.any(Object) },
    });
  });

  it('declares indexes for availability, name, and skills discovery', () => {
    const indexKeys = Profile.schema.indexes().map(([keys]) => keys);
    expect(indexKeys).toContainEqual({
      role: 1,
      discoverable: 1,
      availableForWork: 1,
      hourlyRate: 1,
    });
    expect(indexKeys).toContainEqual({
      role: 1,
      discoverable: 1,
      availableForWork: 1,
      displayName: 1,
    });
    expect(indexKeys).toContainEqual({ skills: 1 });
  });
});
