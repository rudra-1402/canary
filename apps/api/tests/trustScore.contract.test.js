import { describe, expect, it } from 'vitest';
import {
  TrustScoreResponseSchema,
  TrustScoreBatchQuerySchema,
  TrustScoreBatchResponseSchema,
} from '@canary/shared';

const id = 'a'.repeat(24);

describe('TrustScore contracts', () => {
  it('accepts each discriminated response state', () => {
    expect(() =>
      TrustScoreResponseSchema.parse({
        status: 'scored',
        profileId: id,
        band: 'BAND_MED',
        score: 47,
        generatedAt: '2026-01-01T00:00:00.000Z',
        signals: [],
      }),
    ).not.toThrow();
    expect(() =>
      TrustScoreResponseSchema.parse({
        status: 'stale',
        profileId: id,
        band: 'BAND_MED',
        score: 47,
        generatedAt: '2026-01-01T00:00:00.000Z',
        signals: [],
        outcomesSince: 1,
      }),
    ).not.toThrow();
    expect(() =>
      TrustScoreResponseSchema.parse({ status: 'pending-score', profileId: id, outcomeCount: 3 }),
    ).not.toThrow();
    expect(() =>
      TrustScoreResponseSchema.parse({
        status: 'insufficient-history',
        profileId: id,
        outcomeCount: 2,
        outcomesNeeded: 3,
      }),
    ).not.toThrow();
  });

  it('does not admit score on insufficient history or a numeric signal value', () => {
    expect(() =>
      TrustScoreResponseSchema.parse({
        status: 'insufficient-history',
        profileId: id,
        outcomeCount: 2,
        outcomesNeeded: 3,
        score: 0,
      }),
    ).toThrow();
    expect(() =>
      TrustScoreResponseSchema.parse({
        status: 'scored',
        profileId: id,
        band: 'BAND_MED',
        score: 47,
        generatedAt: '2026-01-01T00:00:00.000Z',
        signals: [{ name: 'x', direction: 'favorable', strength: 'STRENGTH_WEAK', value: 1 }],
      }),
    ).toThrow();
  });

  it('requires 1-50 distinct 24-hex ids for batch', () => {
    expect(
      TrustScoreBatchQuerySchema.parse({ profileIds: `${id},${'b'.repeat(24)}` }).profileIds,
    ).toHaveLength(2);
    expect(() =>
      TrustScoreBatchQuerySchema.parse({ profileIds: Array(51).fill(id).join(',') }),
    ).toThrow();
    expect(() => TrustScoreBatchQuerySchema.parse({ profileIds: `${id},${id}` })).toThrow();
    expect(() =>
      TrustScoreBatchResponseSchema.parse({ data: [{ status: 'not-found', profileId: id }] }),
    ).not.toThrow();
  });
});
