import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import BriefingFeedback from '../../src/models/BriefingFeedback.js';

describe('BriefingFeedback schema', () => {
  it('validates a well-formed vote', () => {
    const doc = new BriefingFeedback({
      briefingId: new mongoose.Types.ObjectId(),
      raterProfileId: new mongoose.Types.ObjectId(),
      vote: 'up',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid vote', () => {
    const doc = new BriefingFeedback({
      briefingId: new mongoose.Types.ObjectId(),
      raterProfileId: new mongoose.Types.ObjectId(),
      vote: 'meh',
    });
    const err = doc.validateSync();
    expect(err.errors.vote).toBeDefined();
  });
});
