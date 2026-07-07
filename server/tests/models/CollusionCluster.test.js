import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import CollusionCluster from '../../src/models/CollusionCluster.js';

describe('CollusionCluster schema', () => {
  it('validates a well-formed cluster', () => {
    const doc = new CollusionCluster({
      memberProfileIds: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
      edgeEvidence: 'Reciprocal 5-star reviews within a 48-hour window.',
      severity: 0.9,
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a cluster with fewer than 2 members', () => {
    const doc = new CollusionCluster({
      memberProfileIds: [new mongoose.Types.ObjectId()],
      edgeEvidence: 'x',
      severity: 0.5,
    });
    const err = doc.validateSync();
    expect(err.errors.memberProfileIds).toBeDefined();
  });
});
