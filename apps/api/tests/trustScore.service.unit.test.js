import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { bandForScore, strengthForSignal } from '../src/trustScore/bands.js';
import {
  projectSignals,
  projectTrustScore,
  viewerRelation,
} from '../src/trustScore/trustScore.service.js';

describe('TrustScore pure helpers', () => {
  it('derives bands from score, not stored level, and rejects out of range values', () => {
    expect(bandForScore(24)).toBe('BAND_LOW');
    expect(bandForScore(25)).toBe('BAND_MED');
    expect(bandForScore(75)).toBe('BAND_HIGH');
    expect(() => bandForScore(101)).toThrow();
    const profile = {
      _id: new mongoose.Types.ObjectId(),
      identityId: new mongoose.Types.ObjectId(),
    };
    const response = projectTrustScore({
      profile,
      identityId: profile.identityId,
      snapshot: { status: 'scored', score: 80, level: 'low', generatedAt: new Date() },
      counts: { currentOutcomeCount: 3, snapshotOutcomeCount: 3, outcomesSince: 0 },
      signals: [],
    });
    expect(response.band).toBe('BAND_HIGH');
  });

  it('projects structured signals without numeric values and deterministically normalizes strength', () => {
    const signals = [
      { name: 'z', value: 1, direction: 'favorable', source: 'structured-data' },
      { name: 'a', value: -1, direction: 'unfavorable', source: 'structured-data' },
      { name: 'brief', value: 99, direction: 'favorable', source: 'brief-analysis' },
    ];
    expect(projectSignals(signals)).toEqual([
      { name: 'a', direction: 'unfavorable', strength: 'STRENGTH_STRONG' },
      { name: 'z', direction: 'favorable', strength: 'STRENGTH_STRONG' },
    ]);
    expect(
      projectSignals([
        { name: 'zero', value: 0, direction: 'favorable', source: 'structured-data' },
      ])[0].strength,
    ).toBe('STRENGTH_WEAK');
    expect(strengthForSignal(1, 10)).toBe('STRENGTH_WEAK');
  });

  it('keeps signals for self only and resolves ownership independently of active Profile', () => {
    const identityId = new mongoose.Types.ObjectId();
    const profile = { _id: new mongoose.Types.ObjectId(), identityId };
    expect(viewerRelation(profile, identityId)).toBe('self');
    expect(viewerRelation(profile, null)).toBe('anonymous');
    const base = {
      profile,
      snapshot: { status: 'scored', score: 50, generatedAt: new Date('2026-01-01') },
      counts: { currentOutcomeCount: 3, snapshotOutcomeCount: 3, outcomesSince: 0 },
      signals: [{ name: 'x', value: 1, direction: 'favorable', source: 'structured-data' }],
    };
    expect(projectTrustScore({ ...base, identityId }).signals).toHaveLength(1);
    expect(
      projectTrustScore({ ...base, identityId: new mongoose.Types.ObjectId() }),
    ).not.toHaveProperty('signals');
  });

  // Reachable whenever outcomes are recorded AFTER the last batch run: the live recount
  // clears the threshold while the stored snapshot is still the cold-start one. Before
  // TS-A every snapshot carried a number, so this combination could not occur.
  it('treats an unscored snapshot as pending, even when the live outcome recount qualifies', () => {
    const profile = {
      _id: new mongoose.Types.ObjectId(),
      identityId: new mongoose.Types.ObjectId(),
    };
    const result = projectTrustScore({
      profile,
      identityId: profile.identityId,
      snapshot: { status: 'insufficient-history', generatedAt: new Date('2026-01-01') },
      counts: { currentOutcomeCount: 5, snapshotOutcomeCount: 5, outcomesSince: 0 },
      signals: [],
    });
    expect(result).toEqual({
      status: 'pending-score',
      profileId: String(profile._id),
      outcomeCount: 5,
    });
  });

  it('still scores normally when the snapshot itself is scored', () => {
    const profile = {
      _id: new mongoose.Types.ObjectId(),
      identityId: new mongoose.Types.ObjectId(),
    };
    const result = projectTrustScore({
      profile,
      identityId: profile.identityId,
      snapshot: { status: 'scored', score: 80, level: 'high', generatedAt: new Date('2026-01-01') },
      counts: { currentOutcomeCount: 5, snapshotOutcomeCount: 5, outcomesSince: 0 },
      signals: [],
    });
    expect(result.status).toBe('scored');
    expect(result.band).toBe('BAND_HIGH');
  });
});
