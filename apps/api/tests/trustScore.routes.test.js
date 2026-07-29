import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import Identity from '../src/models/Identity.js';
import Profile from '../src/models/Profile.js';
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

describe('TrustScore routes', () => {
  it('requires authentication', async () => {
    const response = await request(app).get(`/api/trust-scores/${new mongoose.Types.ObjectId()}`);
    expect(response.status).toBe(401);
  });

  it('returns 400 for malformed ids before service access', async () => {
    const agent = await participant();
    const response = await agent.get('/api/trust-scores/not-an-objectid');
    expect(response.status).toBe(400);
  });

  it('requires a marketplace Profile and lets a participant read an unrelated discoverable Profile', async () => {
    const bare = request.agent(app);
    const csrf = (await bare.get('/api/auth/csrf-token')).body.csrfToken;
    await bare
      .post('/api/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: 'bare@test.invalid', password: 'longenough1' });
    expect((await bare.get(`/api/trust-scores/${new mongoose.Types.ObjectId()}`)).status).toBe(403);
    const agent = await participant();
    const targetIdentity = await Identity.create({ email: 'target@test.invalid' });
    const target = await Profile.create({
      identityId: targetIdentity._id,
      role: 'freelancer',
      origin: 'user-registered',
      discoverable: true,
      displayName: 'Target',
    });
    const response = await agent.get(`/api/trust-scores/${target._id}`);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('insufficient-history');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('does not mount an unguarded endpoint', async () => {
    const response = await request(app).get('/api/trust-scores?profileIds=' + 'a'.repeat(24));
    expect(response.status).toBe(401);
  });

  it('enforces the identity-keyed single-read limit', async () => {
    const agent = await participant();
    const profile = await Profile.findOne({ displayName: 'Viewer' });
    for (let i = 0; i < 120; i += 1) {
      expect((await agent.get(`/api/trust-scores/${profile._id}`)).status).toBe(200);
    }
    expect((await agent.get(`/api/trust-scores/${profile._id}`)).status).toBe(429);
  });
});
