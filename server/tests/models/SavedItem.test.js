import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import SavedItem from '../../src/models/SavedItem.js';

describe('SavedItem schema', () => {
  it('validates a saved JobPost', () => {
    const doc = new SavedItem({
      ownerProfileId: new mongoose.Types.ObjectId(),
      targetType: 'job',
      targetId: new mongoose.Types.ObjectId(),
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid targetType', () => {
    const doc = new SavedItem({
      ownerProfileId: new mongoose.Types.ObjectId(),
      targetType: 'gig',
      targetId: new mongoose.Types.ObjectId(),
    });
    const err = doc.validateSync();
    expect(err.errors.targetType).toBeDefined();
  });
});
