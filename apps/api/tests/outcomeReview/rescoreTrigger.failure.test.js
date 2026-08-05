import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import Engagement from '../../src/models/Engagement.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

const originalEnv = { ...process.env };
let app;

async function activeProfileAgent(role) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email: `${new mongoose.Types.ObjectId()}@test.invalid`, password: 'longenough1' });
  const created = await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role, displayName: `${role} party` });
  return { agent, csrf, profileId: created.body.id };
}

async function activeEngagement(freelancerProfileId, clientProfileId) {
  return Engagement.create({
    freelancerProfileId,
    clientProfileId,
    status: 'active',
    agreedTerms: {
      scope: 'Deliver the work',
      price: 1000,
      paymentTerms: 'On completion',
      timeline: 'Two weeks',
      dueAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  });
}

function bodyFor(role, engagementId) {
  return {
    engagementId: String(engagementId),
    outcome:
      role === 'client'
        ? {
            observed: true,
            deliveredAt: '2026-01-30T00:00:00.000Z',
            daysLate: -2,
            paidInFull: null,
            revisionsRequested: null,
            scopeCreepOccurred: null,
            endedAs: 'completed',
          }
        : {
            observed: true,
            deliveredAt: null,
            daysLate: null,
            paidInFull: true,
            revisionsRequested: 0,
            scopeCreepOccurred: false,
            endedAs: 'completed',
          },
    review: { rating: 5, text: 'Excellent.' },
  };
}

beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(async () => {
  process.env = { ...originalEnv };
  await clearCollections();
});

describe('rescore trigger failures', () => {
  it('keeps the final POST successful and the Trust Score readable when Python is missing', async () => {
    process.env.RESCORE_ON_CONCLUSION_ENABLED = 'true';
    process.env.RESCORE_PYTHON = 'missing-venv/Scripts/python.exe';
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const freelancer = await activeProfileAgent('freelancer');
    const client = await activeProfileAgent('client');
    const engagement = await activeEngagement(freelancer.profileId, client.profileId);

    await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(bodyFor('freelancer', engagement._id))
      .expect(201);
    const conclusion = await client.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', client.csrf)
      .send(bodyFor('client', engagement._id));

    expect(conclusion.status).toBe(201);
    const score = await freelancer.agent.get(`/api/trust-scores/${freelancer.profileId}`);
    expect(score.status).toBe(200);
    expect(score.body.status).toBe('insufficient-history');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Trust Score rescore process failed'),
    );
    error.mockRestore();
  });
});
