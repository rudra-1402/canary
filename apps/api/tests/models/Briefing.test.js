import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Briefing from '../../src/models/Briefing.js';

describe('Briefing schema', () => {
  it('validates a Briefing scoped to an engagement', () => {
    const doc = new Briefing({
      engagementId: new mongoose.Types.ObjectId(),
      verdict: 'proceed',
      confidence: 0.82,
      citations: [{ type: 'Review', id: new mongoose.Types.ObjectId().toString() }],
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a Briefing with neither engagementId nor subjectProfileId', () => {
    const doc = new Briefing({ verdict: 'proceed', confidence: 0.5 });
    const err = doc.validateSync();
    expect(err.errors.engagementId).toBeDefined();
  });
});
