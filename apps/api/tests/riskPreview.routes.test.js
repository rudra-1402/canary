import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import Identity from '../src/models/Identity.js';
import JobPost from '../src/models/JobPost.js';
import Profile from '../src/models/Profile.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from './helpers/memoryDb.js';

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
    .send({ role, displayName: `${role} Party` });
  return { agent, csrf, profileId: created.body.id };
}

async function clientFixture() {
  const identity = await Identity.create({
    email: `${new mongoose.Types.ObjectId()}@test.invalid`,
  });
  return Profile.create({
    identityId: identity._id,
    role: 'client',
    origin: 'user-registered',
    displayName: 'Aster Labs',
  });
}

async function openJobPostFixture({ status = 'open' } = {}) {
  const client = await clientFixture();
  const jobPost = await JobPost.create({
    clientProfileId: client._id,
    title: 'Accessible analytics dashboard',
    category: 'web-development',
    description:
      'Design and build an accessible analytics dashboard with five approved views, responsive behavior, documented empty states, and a final handoff.',
    skills: ['React', 'Accessibility'],
    jobType: 'fixed',
    budgetOrRate: 1200,
    experienceLevel: 'intermediate',
    projectLength: 'less-than-1-month',
    screeningQuestions: ['Share comparable work.'],
    status,
  });
  return { client, jobPost };
}

beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('JobPost RiskAssessment preview HTTP API', () => {
  it('lets an active Freelancer preview risk on an open JobPost, with thin history reflected as a signal not a blocked score', async () => {
    const { jobPost } = await openJobPostFixture();
    const freelancer = await activeProfileAgent('freelancer');

    const response = await freelancer.agent
      .post(`/api/jobposts/${jobPost._id}/risk-preview`)
      .set('x-csrf-token', freelancer.csrf)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.engagement).toMatchObject({
      status: 'prospective',
      jobPostId: jobPost._id.toString(),
    });
    expect(response.body.data.engagement).not.toHaveProperty('proposalId');
    expect(response.body.data.riskAssessment.status).toBe('current');
    expect(response.body.data.riskAssessment.signals.map((signal) => signal.code)).toContain(
      'STANDING_HISTORY_MISSING',
    );
  });

  it('returns current then reports changed JobPost terms as stale until recompute', async () => {
    const { jobPost } = await openJobPostFixture();
    const freelancer = await activeProfileAgent('freelancer');
    const url = `/api/jobposts/${jobPost._id}/risk-preview`;

    const first = await freelancer.agent.post(url).set('x-csrf-token', freelancer.csrf).send({});
    expect(first.body.data.riskAssessment.status).toBe('current');

    await JobPost.updateOne({ _id: jobPost._id }, { $set: { budgetOrRate: 5000 } });
    const staleCommand = await freelancer.agent
      .post(url)
      .set('x-csrf-token', freelancer.csrf)
      .send({});
    expect(staleCommand.body.data.riskAssessment).toMatchObject({
      id: first.body.data.riskAssessment.id,
      status: 'stale',
    });

    const recomputed = await freelancer.agent
      .post(url)
      .set('x-csrf-token', freelancer.csrf)
      .send({ recompute: true });
    expect(recomputed.body.data.riskAssessment.status).toBe('current');
    expect(recomputed.body.data.riskAssessment.id).not.toBe(first.body.data.riskAssessment.id);
  });

  it('is idempotent for duplicate commands with unchanged inputs', async () => {
    const { jobPost } = await openJobPostFixture();
    const freelancer = await activeProfileAgent('freelancer');
    const url = `/api/jobposts/${jobPost._id}/risk-preview`;

    const first = await freelancer.agent.post(url).set('x-csrf-token', freelancer.csrf).send({});
    const second = await freelancer.agent.post(url).set('x-csrf-token', freelancer.csrf).send({});

    expect(second.body.data.engagement.id).toBe(first.body.data.engagement.id);
    expect(second.body.data.riskAssessment.id).toBe(first.body.data.riskAssessment.id);
  });

  it('rejects non-Freelancer Profiles', async () => {
    const { jobPost } = await openJobPostFixture();
    const client = await activeProfileAgent('client');
    const response = await client.agent
      .post(`/api/jobposts/${jobPost._id}/risk-preview`)
      .set('x-csrf-token', client.csrf)
      .send({});
    expect(response.status).toBe(403);
  });

  it('rejects a JobPost that is not open', async () => {
    const { jobPost } = await openJobPostFixture({ status: 'draft' });
    const freelancer = await activeProfileAgent('freelancer');
    const response = await freelancer.agent
      .post(`/api/jobposts/${jobPost._id}/risk-preview`)
      .set('x-csrf-token', freelancer.csrf)
      .send({});
    expect(response.status).toBe(400);
  });

  it('enforces authentication and CSRF', async () => {
    const { jobPost } = await openJobPostFixture();
    expect(
      (await request(app).post(`/api/jobposts/${jobPost._id}/risk-preview`).send({})).status,
    ).toBe(401);
    const freelancer = await activeProfileAgent('freelancer');
    expect(
      (await freelancer.agent.post(`/api/jobposts/${jobPost._id}/risk-preview`).send({})).status,
    ).toBe(403);
  });

  it('rejects a malformed JobPost id at the contract boundary', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    const response = await freelancer.agent
      .post('/api/jobposts/not-an-id/risk-preview')
      .set('x-csrf-token', freelancer.csrf)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
  });
});
