import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import Profile from '../src/models/Profile.js';
import Engagement from '../src/models/Engagement.js';
import Outcome from '../src/models/Outcome.js';
import TrustScore from '../src/models/TrustScore.js';
import RiskSignal from '../src/models/RiskSignal.js';
import {
  getTrustScore,
  getTrustScoreBatch,
  outcomeRows,
} from '../src/trustScore/trustScore.service.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';

const identity = () => new mongoose.Types.ObjectId();
async function profile(overrides = {}) {
  return Profile.create({
    identityId: identity(),
    role: 'freelancer',
    origin: 'user-registered',
    displayName: 'P',
    discoverable: true,
    ...overrides,
  });
}
async function concludedOutcome(p, recordedAt) {
  const engagement = await Engagement.create({
    freelancerProfileId: p._id,
    clientProfileId: new mongoose.Types.ObjectId(),
    status: 'concluded',
    agreedTerms: {
      scope: 'x',
      price: 1,
      paymentTerms: 'x',
      timeline: 'x',
      dueAt: new Date('2026-01-01'),
    },
  });
  return Outcome.create({
    engagementId: engagement._id,
    subjectProfileId: p._id,
    counterpartyProfileId: engagement.clientProfileId,
    subjectRole: 'freelancer',
    observed: true,
    paidInFull: null,
    endedAs: 'completed',
    labelSource: 'synthetic',
    recordedAt,
  });
}
async function snapshot(p, generatedAt, score = 50) {
  return TrustScore.create({
    profileId: p._id,
    status: 'scored',
    score,
    level: 'low',
    generatedAt,
  });
}
// A cold-start snapshot as TS-A now writes them: states its status, carries no score.
async function unscoredSnapshot(p, generatedAt) {
  return TrustScore.create({ profileId: p._id, status: 'insufficient-history', generatedAt });
}
async function signal(s) {
  return RiskSignal.create({
    parentType: 'TrustScore',
    parentId: s._id,
    name: 'on-time-rate',
    value: 1,
    direction: 'favorable',
    source: 'structured-data',
  });
}

beforeAll(startMemoryDb, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('TrustScore database reads', () => {
  it('serves each party only its own Outcome from a two-row Engagement', async () => {
    const freelancer = await profile({ role: 'freelancer' });
    const client = await profile({ role: 'client' });
    const engagement = await Engagement.create({
      freelancerProfileId: freelancer._id,
      clientProfileId: client._id,
      status: 'concluded',
      agreedTerms: {
        scope: 'x',
        price: 1,
        paymentTerms: 'x',
        timeline: 'x',
        dueAt: new Date('2026-01-01'),
      },
    });
    const freelancerOutcome = await Outcome.create({
      engagementId: engagement._id,
      subjectProfileId: freelancer._id,
      counterpartyProfileId: client._id,
      subjectRole: 'freelancer',
      observed: true,
      paidInFull: null,
      endedAs: 'completed',
      labelSource: 'synthetic',
      recordedAt: new Date('2026-01-02'),
    });
    const clientOutcome = await Outcome.create({
      engagementId: engagement._id,
      subjectProfileId: client._id,
      counterpartyProfileId: freelancer._id,
      subjectRole: 'client',
      observed: true,
      paidInFull: true,
      endedAs: 'completed',
      labelSource: 'synthetic',
      recordedAt: new Date('2026-01-03'),
    });

    const rowsByProfile = await outcomeRows([String(freelancer._id), String(client._id)]);
    const freelancerRows = rowsByProfile.get(String(freelancer._id));
    const clientRows = rowsByProfile.get(String(client._id));

    expect(freelancerRows).toHaveLength(1);
    expect(clientRows).toHaveLength(1);
    expect(String(freelancerRows[0].outcomeId)).toBe(String(freelancerOutcome._id));
    expect(String(freelancerRows[0].subjectProfileId)).toBe(String(freelancer._id));
    expect(String(clientRows[0].outcomeId)).toBe(String(clientOutcome._id));
    expect(String(clientRows[0].subjectProfileId)).toBe(String(client._id));
  });

  it('enforces threshold precedence over an existing fabricated snapshot', async () => {
    const p = await profile();
    const s = await snapshot(p, new Date('2026-01-01'));
    await signal(s);
    await concludedOutcome(p, new Date('2026-01-02'));
    expect((await getTrustScore(String(p._id), p.identityId)).status).toBe('insufficient-history');
  });

  it('reports pending when enough outcomes landed after the last unscored snapshot', async () => {
    // The whole path end to end: cold-start snapshot on disk, three outcomes recorded
    // since, recount qualifies. Before this, bandForScore(undefined) threw a RangeError.
    const p = await profile();
    await unscoredSnapshot(p, new Date('2026-01-01'));
    for (const day of ['2026-02-01', '2026-02-02', '2026-02-03']) {
      await concludedOutcome(p, new Date(day));
    }
    const result = await getTrustScore(String(p._id), p.identityId);
    expect(result.status).toBe('pending-score');
    expect(result).not.toHaveProperty('score');
  });

  it('distinguishes pending, stale, and scored using the three counts', async () => {
    const pending = await profile();
    const ps = await snapshot(pending, new Date('2026-01-02'));
    await signal(ps);
    await concludedOutcome(pending, new Date('2026-01-01'));
    await concludedOutcome(pending, new Date('2026-01-01'));
    await concludedOutcome(pending, new Date('2026-01-03'));
    expect((await getTrustScore(String(pending._id), pending.identityId)).status).toBe(
      'pending-score',
    );
    const stale = await profile();
    const ss = await snapshot(stale, new Date('2026-01-02'));
    await signal(ss);
    for (const date of ['2026-01-01', '2026-01-01', '2026-01-01', '2026-01-03'])
      await concludedOutcome(stale, new Date(date));
    expect((await getTrustScore(String(stale._id), stale.identityId)).status).toBe('stale');
    const scored = await profile();
    const cs = await snapshot(scored, new Date('2026-01-02'), 80);
    await signal(cs);
    for (const date of ['2026-01-01', '2026-01-02', '2026-01-01'])
      await concludedOutcome(scored, new Date(date));
    expect(await getTrustScore(String(scored._id), scored.identityId)).toMatchObject({
      status: 'scored',
      band: 'BAND_HIGH',
    });
  });

  it('uses generatedAt then _id as deterministic latest snapshot ordering', async () => {
    const p = await profile();
    for (const date of ['2026-01-01', '2026-01-01', '2026-01-01'])
      await concludedOutcome(p, new Date(date));
    const a = await snapshot(p, new Date('2026-01-02'), 30);
    await signal(a);
    const b = await snapshot(p, new Date('2026-01-02'), 80);
    await signal(b);
    expect((await getTrustScore(String(p._id), p.identityId)).score).toBe(80);
  });

  // The reason O3-B exists: correctness alone passes with a per-id loop, and a waterfall would
  // only show up as slowness on Find Work. Assert round-trips do not grow with batch size.
  it('issues the same number of queries for 12 profiles as for 1 (no N+1)', async () => {
    const profiles = [];
    for (let i = 0; i < 12; i += 1) {
      const p = await profile();
      for (const date of ['2026-01-01', '2026-01-01', '2026-01-01'])
        await concludedOutcome(p, new Date(date));
      await signal(await snapshot(p, new Date('2026-01-02'), 80));
      profiles.push(p);
    }
    const spies = [
      vi.spyOn(Profile, 'find'),
      vi.spyOn(TrustScore, 'aggregate'),
      vi.spyOn(Engagement, 'aggregate'),
      vi.spyOn(RiskSignal, 'find'),
    ];
    const calls = () => spies.reduce((total, spy) => total + spy.mock.calls.length, 0);

    await getTrustScoreBatch([String(profiles[0]._id)], profiles[0].identityId);
    const forOne = calls();
    spies.forEach((spy) => spy.mockClear());
    await getTrustScoreBatch(
      profiles.map((p) => String(p._id)),
      profiles[0].identityId,
    );
    const forTwelve = calls();
    spies.forEach((spy) => spy.mockRestore());

    expect(forOne).toBeGreaterThan(0);
    expect(forTwelve).toBe(forOne);
  });

  it('batch preserves requested order, collapses duplicate work, and excludes wrong-parent signals', async () => {
    const p = await profile();
    for (const date of ['2026-01-01', '2026-01-01', '2026-01-01'])
      await concludedOutcome(p, new Date(date));
    const s = await snapshot(p, new Date('2026-01-02'));
    await signal(s);
    await RiskSignal.create({
      parentType: 'RiskAssessment',
      parentId: s._id,
      name: 'bad',
      value: 99,
      direction: 'favorable',
      source: 'structured-data',
    });
    const missing = new mongoose.Types.ObjectId().toString();
    const result = await getTrustScoreBatch([String(p._id), missing, String(p._id)], p.identityId);
    expect(result.data.map((r) => r.status)).toEqual(['scored', 'not-found']);
    expect(result.data[0].signals.map((s2) => s2.name)).toEqual(['on-time-rate']);
  });
});
