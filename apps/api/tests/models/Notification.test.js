import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Notification from '../../src/models/Notification.js';

describe('Notification schema', () => {
  it('validates a well-formed Notification', () => {
    const doc = new Notification({
      recipientProfileId: new mongoose.Types.ObjectId(),
      type: 'low-risk-match',
      targetRef: { collection: 'JobPost', id: new mongoose.Types.ObjectId().toString() },
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid type', () => {
    const doc = new Notification({
      recipientProfileId: new mongoose.Types.ObjectId(),
      type: 'spam',
      targetRef: {},
    });
    const err = doc.validateSync();
    expect(err.errors.type).toBeDefined();
  });
});
