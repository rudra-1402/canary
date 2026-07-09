import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import TaxReserve from '../../src/models/TaxReserve.js';

describe('TaxReserve schema', () => {
  it('validates a well-formed TaxReserve', () => {
    const doc = new TaxReserve({
      incomeForecastId: new mongoose.Types.ObjectId(),
      suggestedAmount: 640,
      taxRateAssumption: 0.2,
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a missing suggestedAmount', () => {
    const doc = new TaxReserve({
      incomeForecastId: new mongoose.Types.ObjectId(),
      taxRateAssumption: 0.2,
    });
    const err = doc.validateSync();
    expect(err.errors.suggestedAmount).toBeDefined();
  });
});
