import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Payment from '../../src/models/Payment.js';

describe('Payment schema', () => {
  it('validates a Payment with no linked Engagement', () => {
    const doc = new Payment({
      freelancerProfileId: new mongoose.Types.ObjectId(),
      amount: 500,
      receivedAt: new Date(),
      importSource: 'csv',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a Payment missing freelancerProfileId', () => {
    const doc = new Payment({ amount: 500, receivedAt: new Date(), importSource: 'manual' });
    const err = doc.validateSync();
    expect(err.errors.freelancerProfileId).toBeDefined();
  });
});
