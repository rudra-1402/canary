import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import RiskAssessment from '../../src/models/RiskAssessment.js';

describe('RiskAssessment schema', () => {
  it('validates a well-formed RiskAssessment', () => {
    const doc = new RiskAssessment({
      engagementId: new mongoose.Types.ObjectId(),
      score: 40,
      level: 'med',
      verdict: 'caution',
      confidence: 0.7,
      explanation: 'Net-90 terms on an otherwise reliable client.',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid verdict', () => {
    const doc = new RiskAssessment({
      engagementId: new mongoose.Types.ObjectId(),
      score: 40,
      level: 'med',
      verdict: 'maybe',
      confidence: 0.7,
    });
    const err = doc.validateSync();
    expect(err.errors.verdict).toBeDefined();
  });
});
