import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

let app;

async function registeredProfileAgent(role, displayName) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({
      email: `${new mongoose.Types.ObjectId()}@test.invalid`,
      password: 'longenough1',
    });
  const created = await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role, displayName });
  return { agent, csrf, profileId: created.body.id };
}

describe('Profile completion to Freelancer discovery integration', () => {
  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);
  afterEach(clearCollections);

  it('adds and removes a completed Freelancer from Client discovery through real HTTP seams', async () => {
    const freelancer = await registeredProfileAgent('freelancer', 'Asha Mehta');
    const client = await registeredProfileAgent('client', 'Acme Studio');

    const completed = await freelancer.agent
      .patch(`/api/profiles/${freelancer.profileId}`)
      .set('x-csrf-token', freelancer.csrf)
      .send({
        headline: 'Product designer',
        bio: 'Designs evidence-led onboarding flows.',
        country: 'IN',
        skills: ['Figma', 'User research'],
        hourlyRate: 55,
        languages: ['English — professional'],
        discoverable: true,
        availableForWork: true,
      });

    expect(completed.status).toBe(200);
    expect(completed.body.onboarding).toEqual({ complete: true, missingFields: [] });
    expect(completed.body.profile.onboardingCompletedAt).toEqual(expect.any(String));

    const visible = await client.agent.get('/api/profiles?q=Asha&skills=Figma');
    expect(visible.status).toBe(200);
    expect(visible.body.data).toHaveLength(1);
    expect(visible.body.data[0]).toMatchObject({
      id: freelancer.profileId,
      displayName: 'Asha Mehta',
      hourlyRate: 55,
      availableForWork: true,
      activeEngagementCount: 0,
      trust: { status: 'insufficient-history' },
    });

    const unavailable = await freelancer.agent
      .patch(`/api/profiles/${freelancer.profileId}`)
      .set('x-csrf-token', freelancer.csrf)
      .send({ availableForWork: false });
    expect(unavailable.status).toBe(200);

    const hidden = await client.agent.get('/api/profiles?q=Asha&skills=Figma');
    expect(hidden.status).toBe(200);
    expect(hidden.body.data).toEqual([]);
    expect(hidden.body.pagination.total).toBe(0);
  });
});
