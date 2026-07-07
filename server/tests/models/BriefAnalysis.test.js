import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import BriefAnalysis from '../../src/models/BriefAnalysis.js';

describe('BriefAnalysis schema', () => {
  it('validates a well-formed BriefAnalysis', () => {
    const doc = new BriefAnalysis({
      engagementId: new mongoose.Types.ObjectId(),
      flags: { vagueness: true, exposureForPayLanguage: false, urgencyPressure: true, missingTerms: false },
      rationale: 'Brief mentions "urgent" repeatedly with no fixed budget.',
      sourceSnippets: ['need this done ASAP'],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a missing engagementId', () => {
    const doc = new BriefAnalysis({
      flags: { vagueness: true, exposureForPayLanguage: false, urgencyPressure: false, missingTerms: false },
    });
    const err = doc.validateSync();
    expect(err.errors.engagementId).toBeDefined();
  });
});
