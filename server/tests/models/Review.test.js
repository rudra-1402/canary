import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Review from '../../src/models/Review.js';

describe('Review schema', () => {
  it('validates a well-formed Review', () => {
    const doc = new Review({
      engagementId: new mongoose.Types.ObjectId(),
      authorProfileId: new mongoose.Types.ObjectId(),
      subjectProfileId: new mongoose.Types.ObjectId(),
      rating: 5,
      text: 'Great to work with.',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a rating outside 1-5', () => {
    const doc = new Review({
      engagementId: new mongoose.Types.ObjectId(),
      authorProfileId: new mongoose.Types.ObjectId(),
      subjectProfileId: new mongoose.Types.ObjectId(),
      rating: 7,
      text: 'x',
    });
    const err = doc.validateSync();
    expect(err.errors.rating).toBeDefined();
  });
});
