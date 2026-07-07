import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import RiskSignal from '../../src/models/RiskSignal.js';

describe('RiskSignal schema', () => {
  it('validates a well-formed structured-data RiskSignal', () => {
    const doc = new RiskSignal({
      parentType: 'TrustScore',
      parentId: new mongoose.Types.ObjectId(),
      name: 'on-time-payment-rate',
      value: 0.95,
      direction: 'favorable',
      source: 'structured-data',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an unknown source', () => {
    const doc = new RiskSignal({
      parentType: 'TrustScore',
      parentId: new mongoose.Types.ObjectId(),
      name: 'x',
      value: 1,
      direction: 'favorable',
      source: 'gut-feeling',
    });
    const err = doc.validateSync();
    expect(err.errors.source).toBeDefined();
  });
});
