import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import TrustScore from '../../src/models/TrustScore.js';

describe('TrustScore schema', () => {
  it('validates a well-formed TrustScore', () => {
    const doc = new TrustScore({
      profileId: new mongoose.Types.ObjectId(),
      score: 82,
      level: 'high',
      generatedAt: new Date(),
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a score above 100', () => {
    const doc = new TrustScore({
      profileId: new mongoose.Types.ObjectId(),
      score: 150,
      level: 'high',
      generatedAt: new Date(),
    });
    const err = doc.validateSync();
    expect(err.errors.score).toBeDefined();
  });
});
