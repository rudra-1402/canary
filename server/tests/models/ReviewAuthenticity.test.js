import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import ReviewAuthenticity from '../../src/models/ReviewAuthenticity.js';

describe('ReviewAuthenticity schema', () => {
  it('validates a suspected-collusion verdict with a cluster link', () => {
    const doc = new ReviewAuthenticity({
      reviewId: new mongoose.Types.ObjectId(),
      status: 'suspected-collusion',
      collusionScore: 0.88,
      rationale: 'Reciprocal glowing reviews with no matching Outcome.',
      collusionClusterId: new mongoose.Types.ObjectId(),
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid status', () => {
    const doc = new ReviewAuthenticity({
      reviewId: new mongoose.Types.ObjectId(),
      status: 'fake',
      collusionScore: 0.1,
    });
    const err = doc.validateSync();
    expect(err.errors.status).toBeDefined();
  });
});
