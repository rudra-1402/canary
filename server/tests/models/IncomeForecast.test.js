import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import IncomeForecast from '../../src/models/IncomeForecast.js';

describe('IncomeForecast schema', () => {
  it('validates a well-formed forecast', () => {
    const doc = new IncomeForecast({
      freelancerProfileId: new mongoose.Types.ObjectId(),
      period: '2026-08',
      projectedAmount: 3200,
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a missing period', () => {
    const doc = new IncomeForecast({
      freelancerProfileId: new mongoose.Types.ObjectId(),
      projectedAmount: 3200,
    });
    const err = doc.validateSync();
    expect(err.errors.period).toBeDefined();
  });
});
