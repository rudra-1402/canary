import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import JobPost from '../../src/models/JobPost.js';
import Proposal from '../../src/models/Proposal.js';
import Engagement from '../../src/models/Engagement.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

async function activeProfileAgent(app, role = 'freelancer') {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email: `${new mongoose.Types.ObjectId()}@test.invalid`, password: 'longenough1' });
  const profile = await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role, displayName: `Active ${role}` });
  return { agent, profileId: profile.body.id };
}

async function profileForRole(app, role, displayName) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email: `${new mongoose.Types.ObjectId()}@test.invalid`, password: 'longenough1' });
  return agent.post('/api/auth/profiles').set('x-csrf-token', csrf).send({ role, displayName });
}

function jobPost(clientProfileId) {
  return {
    clientProfileId,
    title: 'Build a dashboard',
    category: 'web-development',
    description: 'Build it.',
    skills: ['react'],
    jobType: 'fixed',
    budgetOrRate: 2000,
    experienceLevel: 'intermediate',
    projectLength: '1-to-3-months',
    status: 'closed',
  };
}

describe('My Work routes', () => {
  let app;

  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);
  afterEach(clearCollections);

  it('requires authentication for proposals', async () => {
    expect((await request(app).get('/api/me/proposals')).status).toBe(401);
  });

  it('returns the active Profile proposals with linked JobPost title and status', async () => {
    const { agent, profileId } = await activeProfileAgent(app);
    const client = await profileForRole(app, 'client', 'Client Inc');
    const clientProfileId = client.body.id;
    const post = await JobPost.create(jobPost(clientProfileId));
    await Proposal.create({
      jobPostId: post._id,
      freelancerProfileId: profileId,
      bid: 1800,
      payModel: 'project',
      proposedDurationDays: 14,
      status: 'shortlisted',
    });

    const res = await agent.get('/api/me/proposals');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      status: 'shortlisted',
      jobPost: { id: post._id.toString(), title: 'Build a dashboard', status: 'closed' },
    });
  });

  it('requires authentication for engagements', async () => {
    expect((await request(app).get('/api/me/engagements')).status).toBe(401);
  });

  it('returns engagements for either side with counterparty and agreedTerms', async () => {
    const { agent, profileId } = await activeProfileAgent(app);
    const client = await profileForRole(app, 'client', 'Client Inc');
    const dueAt = new Date('2026-08-31T00:00:00.000Z');
    const engagement = await Engagement.create({
      freelancerProfileId: profileId,
      clientProfileId: client.body.id,
      status: 'active',
      agreedTerms: {
        scope: 'Dashboard',
        price: 2000,
        paymentTerms: 'net-30',
        timeline: '2 weeks',
        dueAt,
        revisionsIncluded: 2,
      },
    });

    const res = await agent.get('/api/me/engagements');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        id: engagement._id.toString(),
        counterpartyProfileId: client.body.id,
        status: 'active',
        agreedTerms: expect.objectContaining({
          scope: 'Dashboard',
          dueAt: dueAt.toISOString(),
          revisionsIncluded: 2,
        }),
      }),
    ]);
  });

  it('returns engagements when the active Profile is the client side', async () => {
    const { agent, profileId } = await activeProfileAgent(app, 'client');
    const freelancer = await profileForRole(app, 'freelancer', 'Freelancer');
    await Engagement.create({
      freelancerProfileId: freelancer.body.id,
      clientProfileId: profileId,
      status: 'active',
      agreedTerms: {
        scope: 'Client-side work',
        price: 1500,
        paymentTerms: 'net-15',
        timeline: '10 days',
        dueAt: new Date('2026-08-31T00:00:00.000Z'),
      },
    });

    const res = await agent.get('/api/me/engagements');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].counterpartyProfileId).toBe(freelancer.body.id);
  });
});
