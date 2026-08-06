import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

async function registeredProfile(app, role) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email: `${new mongoose.Types.ObjectId()}@test.invalid`, password: 'longenough1' });
  const profile = await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role, displayName: `${role} integration` });
  return { agent, csrf, profileId: profile.body.id };
}

describe('Client JobPost to proposal inbox flow', () => {
  let app;

  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);
  afterEach(clearCollections);

  it('connects draft, publish, Proposal submission, dashboard count, and inbox', async () => {
    const client = await registeredProfile(app, 'client');
    const freelancer = await registeredProfile(app, 'freelancer');

    const draft = await client.agent
      .post('/api/jobposts')
      .set('x-csrf-token', client.csrf)
      .send({
        title: 'Build the Canary demo',
        category: 'web-development',
        description: 'Connect the approved Client and Freelancer demo flow.',
        skills: ['react', 'node'],
        jobType: 'fixed',
        budgetOrRate: 2000,
        experienceLevel: 'intermediate',
        projectLength: '1-to-3-months',
        screeningQuestions: [],
        action: 'save_draft',
      });
    expect(draft.status).toBe(201);

    const published = await client.agent
      .patch(`/api/jobposts/${draft.body.id}`)
      .set('x-csrf-token', client.csrf)
      .send({ action: 'publish' });
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('open');

    const submitted = await freelancer.agent
      .post('/api/proposals')
      .set('x-csrf-token', freelancer.csrf)
      .send({
        jobPostId: draft.body.id,
        bid: 1800,
        payModel: 'project',
        proposedDurationDays: 14,
        coverLetter: 'I can deliver the approved flow.',
        screeningAnswers: [],
      });
    expect(submitted.status).toBe(201);

    const dashboard = await client.agent.get('/api/me/jobposts?status=open');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data[0].proposalCounts.submitted).toBe(1);

    const inbox = await client.agent.get(`/api/jobposts/${draft.body.id}/proposals`);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data[0]).toMatchObject({
      id: submitted.body.id,
      freelancer: { id: freelancer.profileId },
      trustScore: { status: 'insufficient-history', profileId: freelancer.profileId },
    });
  });
});
