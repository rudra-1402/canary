import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Outcome from '../../src/models/Outcome.js';

describe('Outcome schema', () => {
  it('validates a well-formed Outcome', () => {
    const doc = new Outcome({
      engagementId: new mongoose.Types.ObjectId(),
      paidInFull: true,
      daysLate: 0,
      scopeCreepOccurred: false,
      ghosted: false,
      endedAs: 'completed',
      labelSource: 'synthetic',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid endedAs', () => {
    const doc = new Outcome({
      engagementId: new mongoose.Types.ObjectId(),
      paidInFull: false,
      endedAs: 'unknown',
      labelSource: 'synthetic',
    });
    const err = doc.validateSync();
    expect(err.errors.endedAs).toBeDefined();
  });
});
