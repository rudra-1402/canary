import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import Profile from '../../src/models/Profile.js';
import Engagement from '../../src/models/Engagement.js';
import Outcome from '../../src/models/Outcome.js';
import TrustScore from '../../src/models/TrustScore.js';
import RiskSignal from '../../src/models/RiskSignal.js';
import { escapeRegex, listDiscoverableFreelancers } from '../../src/profile/profile.service.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

const identityId = () => new mongoose.Types.ObjectId();

async function freelancer(overrides = {}) {
  return Profile.create({
    identityId: identityId(),
    role: 'freelancer',
    origin: 'synthetic-seeded',
    displayName: 'Freelancer',
    discoverable: true,
    availableForWork: true,
    skills: [],
    ...overrides,
  });
}

async function concludedEvidence(profile, day) {
  const clientProfileId = new mongoose.Types.ObjectId();
  const engagement = await Engagement.create({
    freelancerProfileId: profile._id,
    clientProfileId,
    status: 'concluded',
    agreedTerms: {
      scope: 'Delivered work',
      price: 1000,
      paymentTerms: 'net-15',
      timeline: '2 weeks',
      dueAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  await Outcome.create({
    engagementId: engagement._id,
    subjectProfileId: profile._id,
    counterpartyProfileId: clientProfileId,
    subjectRole: 'freelancer',
    observed: true,
    paidInFull: null,
    endedAs: 'completed',
    labelSource: 'synthetic',
    recordedAt: new Date(`2026-01-0${day}T00:00:00.000Z`),
  });
}

async function scored(profile, score) {
  for (const day of [1, 2, 3]) await concludedEvidence(profile, day);
  const snapshot = await TrustScore.create({
    profileId: profile._id,
    status: 'scored',
    score,
    level: score >= 75 ? 'high' : score >= 25 ? 'med' : 'low',
    generatedAt: new Date('2026-01-04T00:00:00.000Z'),
  });
  await RiskSignal.create({
    parentType: 'TrustScore',
    parentId: snapshot._id,
    name: 'on-time-rate',
    value: 1,
    direction: 'favorable',
    source: 'structured-data',
  });
}

function query(overrides = {}) {
  return { sort: 'relevance', page: 1, pageSize: 24, ...overrides };
}

beforeAll(startMemoryDb, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('Freelancer Gallery database reads', () => {
  it('escapes regular-expression metacharacters in textual search', () => {
    expect(escapeRegex('[Lead].*')).toBe('\\[Lead\\]\\.\\*');
  });

  it('combines literal search, all-selected skills, country, and rate bounds', async () => {
    await freelancer({
      displayName: 'Asha [Lead]',
      headline: 'Product designer',
      skills: ['Figma', 'User research'],
      country: 'IN',
      hourlyRate: 80,
    });
    await freelancer({
      displayName: 'Bela',
      headline: 'Backend engineer',
      skills: ['Node'],
      country: 'DE',
      hourlyRate: 30,
    });

    const result = await listDiscoverableFreelancers(
      query({
        q: '[Lead]',
        skills: ['Figma', 'User research'],
        country: 'IN',
        minRate: 50,
        maxRate: 100,
      }),
      identityId(),
    );

    expect(result.data.map((item) => item.displayName)).toEqual(['Asha [Lead]']);
    expect(result.pagination.total).toBe(1);
  });

  it('filters and sorts on persisted TrustScore bands but returns service-projected trust', async () => {
    const high = await freelancer({ displayName: 'High', hourlyRate: 90 });
    const medium = await freelancer({ displayName: 'Medium', hourlyRate: 50 });
    await scored(high, 82);
    await scored(medium, 60);

    const highOnly = await listDiscoverableFreelancers(
      query({ trustBand: 'BAND_HIGH', sort: 'trust-desc' }),
      identityId(),
    );
    expect(highOnly.data.map((item) => item.displayName)).toEqual(['High']);
    expect(highOnly.data[0].trust).toMatchObject({
      status: 'scored',
      band: 'BAND_HIGH',
      score: 82,
    });

    const all = await listDiscoverableFreelancers(query({ sort: 'trust-desc' }), identityId());
    expect(all.data.map((item) => item.displayName)).toEqual(['High', 'Medium']);
  });

  it('derives active Engagement counts and calculates total after filters', async () => {
    const selected = await freelancer({ displayName: 'Selected', country: 'IN', hourlyRate: 70 });
    await freelancer({ displayName: 'Other', country: 'DE', hourlyRate: 20 });
    for (let index = 0; index < 2; index += 1) {
      await Engagement.create({
        freelancerProfileId: selected._id,
        clientProfileId: new mongoose.Types.ObjectId(),
        status: 'active',
        agreedTerms: {
          scope: 'Active work',
          price: 1000,
          paymentTerms: 'net-15',
          timeline: '2 weeks',
          dueAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      });
    }

    const result = await listDiscoverableFreelancers(
      query({ country: 'IN', sort: 'rate-desc', pageSize: 1 }),
      identityId(),
    );
    expect(result.pagination).toEqual({ page: 1, pageSize: 1, total: 1 });
    expect(result.data[0].activeEngagementCount).toBe(2);
  });

  it('keeps database round trips constant as the page grows', async () => {
    for (const [displayName, hourlyRate] of [
      ['A', 10],
      ['B', 20],
      ['C', 30],
    ]) {
      await freelancer({ displayName, hourlyRate });
    }
    const spies = [
      vi.spyOn(Profile, 'aggregate'),
      vi.spyOn(Profile, 'find'),
      vi.spyOn(TrustScore, 'aggregate'),
      vi.spyOn(Engagement, 'aggregate'),
      vi.spyOn(RiskSignal, 'find'),
    ];
    const calls = () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);

    await listDiscoverableFreelancers(query({ pageSize: 1 }), identityId());
    const one = calls();
    spies.forEach((spy) => spy.mockClear());
    await listDiscoverableFreelancers(query({ pageSize: 3 }), identityId());
    const three = calls();
    spies.forEach((spy) => spy.mockRestore());

    expect(three).toBe(one);
  });
});
