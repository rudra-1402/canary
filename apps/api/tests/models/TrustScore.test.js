import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import TrustScore from '../../src/models/TrustScore.js';

const base = () => ({ profileId: new mongoose.Types.ObjectId(), generatedAt: new Date() });

describe('TrustScore schema', () => {
  it('validates a well-formed scored TrustScore', () => {
    const doc = new TrustScore({ ...base(), status: 'scored', score: 82, level: 'high' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a score above 100', () => {
    const doc = new TrustScore({ ...base(), status: 'scored', score: 150, level: 'high' });
    expect(doc.validateSync().errors.score).toBeDefined();
  });

  it('rejects an unrecognised level', () => {
    const doc = new TrustScore({ ...base(), status: 'scored', score: 50, level: 'medium' });
    expect(doc.validateSync().errors.level).toBeDefined();
  });

  it('rejects a document with no status — absent must be an error, never silently "scored"', () => {
    const doc = new TrustScore({ ...base(), score: 82, level: 'high' });
    expect(doc.validateSync().errors.status).toBeDefined();
  });

  it('rejects a scored TrustScore with no score', () => {
    const doc = new TrustScore({ ...base(), status: 'scored', level: 'high' });
    expect(doc.validateSync().errors.score).toBeDefined();
  });

  it('rejects a scored TrustScore with no level', () => {
    const doc = new TrustScore({ ...base(), status: 'scored', score: 82 });
    expect(doc.validateSync().errors.level).toBeDefined();
  });

  it('accepts an insufficient-history TrustScore with no score and no level', () => {
    const doc = new TrustScore({ ...base(), status: 'insufficient-history' });
    expect(doc.validateSync()).toBeUndefined();
  });

  // The rule has to bite in both directions, or a future writer reintroduces the exact
  // defect this schema change removes: a real-looking number on a row nothing scored.
  it('rejects an insufficient-history TrustScore carrying a score', () => {
    const doc = new TrustScore({ ...base(), status: 'insufficient-history', score: 50 });
    expect(doc.validateSync().errors.score).toBeDefined();
  });

  it('rejects an insufficient-history TrustScore carrying a level', () => {
    const doc = new TrustScore({ ...base(), status: 'insufficient-history', level: 'med' });
    expect(doc.validateSync().errors.level).toBeDefined();
  });
});
