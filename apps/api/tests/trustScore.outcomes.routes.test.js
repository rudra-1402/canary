import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import Identity from '../src/models/Identity.js';
import Profile from '../src/models/Profile.js';
import Engagement from '../src/models/Engagement.js';
import Outcome from '../src/models/Outcome.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { resetTrustScoreLimiters } from '../src/trustScore/trustScore.routes.js';

let app;
beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(async () => {
  await clearCollections();
  resetTrustScoreLimiters();
});

async function participant() {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  const email = `${new mongoose.Types.ObjectId()}@test.invalid`;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email, password: 'longenough1' });
  await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role: 'freelancer', displayName: 'Viewer' });
  return agent;
}

async function concludedOutcome(subjectProfileId, overrides = {}) {
  const engagement = await Engagement.create({
    freelancerProfileId: subjectProfileId,
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
    subjectProfileId,
    counterpartyProfileId: engagement.clientProfileId,
    subjectRole: 'freelancer',
    observed: true,
    daysLate: 0,
    endedAs: 'completed',
    labelSource: 'synthetic',
    recordedAt: new Date('2026-01-02'),
    ...overrides,
  });
}

describe('GET /api/trust-scores/:profileId/outcomes', () => {
  it('requires authentication', async () => {
    const response = await request(app).get(
      `/api/trust-scores/${new mongoose.Types.ObjectId()}/outcomes`,
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for a malformed profile id', async () => {
    const agent = await participant();
    const response = await agent.get('/api/trust-scores/not-an-objectid/outcomes');
    expect(response.status).toBe(400);
  });

  it('returns 404 for a well-formed but absent profile', async () => {
    const agent = await participant();
    const response = await agent.get(`/api/trust-scores/${new mongoose.Types.ObjectId()}/outcomes`);
    expect(response.status).toBe(404);
  });

  it('returns the safe outcome evidence fields only, newest first, with a pagination envelope', async () => {
    const agent = await participant();
    const targetIdentity = await Identity.create({ email: 'target@test.invalid' });
    const target = await Profile.create({
      identityId: targetIdentity._id,
      role: 'freelancer',
      origin: 'user-registered',
      discoverable: true,
      displayName: 'Target',
    });
    await concludedOutcome(target._id, { recordedAt: new Date('2026-01-01'), daysLate: 2 });
    const newest = await concludedOutcome(target._id, {
      recordedAt: new Date('2026-01-05'),
      daysLate: 0,
    });

    const response = await agent.get(`/api/trust-scores/${target._id}/outcomes`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, total: 2 });
    expect(response.body.data[0].id).toBe(newest._id.toString());
    expect(response.body.data[0]).toMatchObject({
      subjectRole: 'freelancer',
      endedAs: 'completed',
      ghosted: false,
      daysLate: 0,
    });
    expect(response.body.data[0]).not.toHaveProperty('engagementId');
    expect(response.body.data[0]).not.toHaveProperty('counterpartyProfileId');
    expect(response.body.data[0]).not.toHaveProperty('labelSource');
  });

  it('returns an empty data array with a real pagination envelope when the profile has no outcomes', async () => {
    const agent = await participant();
    const targetIdentity = await Identity.create({ email: 'bare-target@test.invalid' });
    const target = await Profile.create({
      identityId: targetIdentity._id,
      role: 'freelancer',
      origin: 'user-registered',
      discoverable: true,
      displayName: 'Bare Target',
    });

    const response = await agent.get(`/api/trust-scores/${target._id}/outcomes`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
  });

  it('treats a non-discoverable Profile as not-found for a non-owning viewer', async () => {
    const agent = await participant();
    const targetIdentity = await Identity.create({ email: 'hidden@test.invalid' });
    const target = await Profile.create({
      identityId: targetIdentity._id,
      role: 'freelancer',
      origin: 'user-registered',
      discoverable: false,
      displayName: 'Hidden',
    });

    const response = await agent.get(`/api/trust-scores/${target._id}/outcomes`);
    expect(response.status).toBe(404);
  });
});
