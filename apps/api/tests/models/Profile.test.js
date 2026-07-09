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
});
