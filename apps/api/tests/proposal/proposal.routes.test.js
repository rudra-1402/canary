import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import Identity from '../../src/models/Identity.js';
import JobPost from '../../src/models/JobPost.js';
import Profile from '../../src/models/Profile.js';
import Proposal from '../../src/models/Proposal.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

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
    .send({ role, displayName: `${role} submitter` });
  return { agent, csrf, profileId: created.body.id };
}

async function openJobPost(overrides = {}) {
  const identity = await Identity.create({
    email: `${new mongoose.Types.ObjectId()}@test.invalid`,
  });
  const owner = await Profile.create({
    identityId: identity._id,
    role: 'client',
    origin: 'user-registered',
    displayName: 'Job owner',
  });
  return JobPost.create({
    clientProfileId: owner._id,
    title: 'Build the feature',
    category: 'web-development',
    description: 'Implement the requested endpoint.',
    skills: ['node'],
    jobType: 'fixed',
    budgetOrRate: 1000,
    experienceLevel: 'intermediate',
    projectLength: '1-to-3-months',
    status: 'open',
    ...overrides,
  });
}

function proposalBody(jobPostId, overrides = {}) {
  return {
    jobPostId: String(jobPostId),
    bid: 900,
    payModel: 'project',
    proposedDurationDays: 14,
    coverLetter: 'I can build this safely.',
    screeningAnswers: [],
    ...overrides,
  };
}

beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('POST /api/proposals', () => {
  it('creates a submitted Proposal for the active freelancer Profile', async () => {
    const { agent, csrf, profileId } = await activeProfileAgent('freelancer');
    const jobPost = await openJobPost();

    const res = await agent
      .post('/api/proposals')
      .set('x-csrf-token', csrf)
      .send(proposalBody(jobPost._id));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('submitted');
    expect(
      await Proposal.findOne({ _id: res.body.id, freelancerProfileId: profileId }),
    ).not.toBeNull();
  });

  it('rejects a non-freelancer active Profile', async () => {
    const { agent, csrf } = await activeProfileAgent('client');
    const jobPost = await openJobPost();
    const res = await agent
      .post('/api/proposals')
      .set('x-csrf-token', csrf)
      .send(proposalBody(jobPost._id));
    expect(res.status).toBe(403);
  });

  it('rejects an absent or closed JobPost', async () => {
    const { agent, csrf } = await activeProfileAgent('freelancer');
    const absent = await agent
      .post('/api/proposals')
      .set('x-csrf-token', csrf)
      .send(proposalBody(new mongoose.Types.ObjectId()));
    expect(absent.status).toBe(404);
    const closed = await openJobPost({ status: 'closed' });
    const response = await agent
      .post('/api/proposals')
      .set('x-csrf-token', csrf)
      .send(proposalBody(closed._id));
    expect(response.status).toBe(400);
  });

  it('rejects a proposal to the active Profile’s own JobPost', async () => {
    const { agent, csrf, profileId } = await activeProfileAgent('freelancer');
    const jobPost = await openJobPost({ clientProfileId: profileId });
    const res = await agent
      .post('/api/proposals')
      .set('x-csrf-token', csrf)
      .send(proposalBody(jobPost._id));
    expect(res.status).toBe(403);
  });

  it('rejects a duplicate proposal from the same active Profile', async () => {
    const { agent, csrf } = await activeProfileAgent('freelancer');
    const jobPost = await openJobPost();
    const body = proposalBody(jobPost._id);
    expect((await agent.post('/api/proposals').set('x-csrf-token', csrf).send(body)).status).toBe(
      201,
    );
    expect((await agent.post('/api/proposals').set('x-csrf-token', csrf).send(body)).status).toBe(
      400,
    );
  });

  it('fails closed when the body attempts to impersonate another freelancer Profile', async () => {
    const { agent, csrf } = await activeProfileAgent('freelancer');
    const jobPost = await openJobPost();
    const res = await agent
      .post('/api/proposals')
      .set('x-csrf-token', csrf)
      .send(
        proposalBody(jobPost._id, {
          freelancerProfileId: new mongoose.Types.ObjectId().toString(),
        }),
      );
    expect(res.status).toBe(400);
    expect(await Proposal.countDocuments()).toBe(0);
  });
});
