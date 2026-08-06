import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import JobPost from '../../src/models/JobPost.js';
import Proposal from '../../src/models/Proposal.js';
import { requestProposalRiskAssessment } from '../../src/riskAssessment/riskAssessment.service.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

async function activeProfileAgent(app, role) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email: `${new mongoose.Types.ObjectId()}@test.invalid`, password: 'longenough1' });
  const created = await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role, displayName: `${role} owner` });
  return { agent, csrf, profileId: created.body.id };
}

function authoringBody(overrides = {}) {
  return {
    title: 'Build a Client dashboard',
    category: 'web-development',
    description: 'Build the JobPost management and proposal inbox screens.',
    skills: ['react', 'node'],
    jobType: 'fixed',
    budgetOrRate: 2500,
    experienceLevel: 'intermediate',
    projectLength: '1-to-3-months',
    screeningQuestions: ['How will you test it?'],
    action: 'save_draft',
    ...overrides,
  };
}

function makeJobPost(overrides = {}) {
  return {
    clientProfileId: new mongoose.Types.ObjectId(),
    title: 'Build a landing page',
    category: 'web-development',
    description: 'Need a marketing site.',
    skills: ['react'],
    jobType: 'fixed',
    budgetOrRate: 1500,
    experienceLevel: 'intermediate',
    projectLength: '1-to-3-months',
    status: 'open',
    ...overrides,
  };
}

describe('GET /api/jobposts', () => {
  let app;
  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);
  afterEach(clearCollections);

  it('lists open jobs (200) with the envelope shape', async () => {
    // trackRecordOnly defaults to true; this test is about the envelope shape, not the
    // trust-score filter, and the fixture client has no TrustScore snapshot at all.
    await JobPost.create(makeJobPost());
    const res = await request(app).get('/api/jobposts?trackRecordOnly=false');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data[0]).not.toHaveProperty('_id');
  });

  it('returns 400 when pageSize exceeds the max', async () => {
    const res = await request(app).get('/api/jobposts?pageSize=999');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns a single job by id (200)', async () => {
    const created = await JobPost.create(makeJobPost({ title: 'Findable' }));
    const res = await request(app).get(`/api/jobposts/${created._id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Findable');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('returns 404 for a well-formed but absent id', async () => {
    const absentId = new mongoose.Types.ObjectId();
    const res = await request(app).get(`/api/jobposts/${absentId}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app).get('/api/jobposts/not-an-objectid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

describe('Client JobPost authoring', () => {
  let app;
  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);
  afterEach(clearCollections);

  it('creates a draft or open JobPost owned by the active Client Profile', async () => {
    const { agent, csrf, profileId } = await activeProfileAgent(app, 'client');
    const draft = await agent.post('/api/jobposts').set('x-csrf-token', csrf).send(authoringBody());
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ clientProfileId: profileId, status: 'draft' });

    const published = await agent
      .post('/api/jobposts')
      .set('x-csrf-token', csrf)
      .send(authoringBody({ title: 'Published', action: 'publish' }));
    expect(published.status).toBe(201);
    expect(published.body.status).toBe('open');
  });

  it('enforces CSRF, Client role, and server-owned identity/status', async () => {
    expect((await request(app).post('/api/jobposts').send(authoringBody())).status).toBe(401);
    const client = await activeProfileAgent(app, 'client');
    expect((await client.agent.post('/api/jobposts').send(authoringBody())).status).toBe(403);

    const freelancer = await activeProfileAgent(app, 'freelancer');
    expect(
      (
        await freelancer.agent
          .post('/api/jobposts')
          .set('x-csrf-token', freelancer.csrf)
          .send(authoringBody())
      ).status,
    ).toBe(403);

    const injected = await client.agent
      .post('/api/jobposts')
      .set('x-csrf-token', client.csrf)
      .send(authoringBody({ clientProfileId: new mongoose.Types.ObjectId(), status: 'open' }));
    expect(injected.status).toBe(400);
    expect(await JobPost.countDocuments()).toBe(0);
  });

  it('allows only the owner to publish and close through valid lifecycle actions', async () => {
    const owner = await activeProfileAgent(app, 'client');
    const stranger = await activeProfileAgent(app, 'client');
    const created = await owner.agent
      .post('/api/jobposts')
      .set('x-csrf-token', owner.csrf)
      .send(authoringBody());

    expect(
      (
        await stranger.agent
          .patch(`/api/jobposts/${created.body.id}`)
          .set('x-csrf-token', stranger.csrf)
          .send({ title: 'Hijacked' })
      ).status,
    ).toBe(403);

    const published = await owner.agent
      .patch(`/api/jobposts/${created.body.id}`)
      .set('x-csrf-token', owner.csrf)
      .send({ title: 'Ready to hire', action: 'publish' });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ title: 'Ready to hire', status: 'open' });

    expect(
      (
        await owner.agent
          .patch(`/api/jobposts/${created.body.id}`)
          .set('x-csrf-token', owner.csrf)
          .send({ action: 'save_draft' })
      ).status,
    ).toBe(400);

    const closed = await owner.agent
      .patch(`/api/jobposts/${created.body.id}`)
      .set('x-csrf-token', owner.csrf)
      .send({ action: 'close' });
    expect(closed.body.status).toBe('closed');
    expect(
      (
        await owner.agent
          .patch(`/api/jobposts/${created.body.id}`)
          .set('x-csrf-token', owner.csrf)
          .send({ title: 'Too late' })
      ).status,
    ).toBe(400);
  });
});

describe('Client JobPost proposal inbox', () => {
  let app;
  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);
  afterEach(clearCollections);

  it('returns owned proposals sorted and filtered with public Profile and TrustScore data', async () => {
    const client = await activeProfileAgent(app, 'client');
    const freelancerA = await activeProfileAgent(app, 'freelancer');
    const freelancerB = await activeProfileAgent(app, 'freelancer');
    const post = await JobPost.create(makeJobPost({ clientProfileId: client.profileId }));
    await Proposal.create({
      jobPostId: post._id,
      freelancerProfileId: freelancerA.profileId,
      bid: 1400,
      payModel: 'project',
      proposedDurationDays: 14,
      coverLetter: 'Higher proposal',
      status: 'submitted',
    });
    await Proposal.create({
      jobPostId: post._id,
      freelancerProfileId: freelancerB.profileId,
      bid: 900,
      payModel: 'project',
      proposedDurationDays: 10,
      coverLetter: 'Lower proposal',
      status: 'submitted',
    });

    const res = await client.agent.get(
      `/api/jobposts/${post._id}/proposals?status=submitted&sort=bid_low&pageSize=1`,
    );

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 1, total: 2 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      bid: 900,
      prospectiveEngagementId: null,
      riskAssessment: null,
      freelancer: { id: freelancerB.profileId, role: 'freelancer' },
      trustScore: {
        status: 'insufficient-history',
        profileId: freelancerB.profileId,
      },
    });
    expect(res.body.data[0].freelancer).not.toHaveProperty('identityId');
    expect(res.body.data[0].freelancer).not.toHaveProperty('origin');
    expect(res.body.data[0].freelancer).not.toHaveProperty('taxRatePct');
    expect(res.body.data[0].freelancer).not.toHaveProperty('onboardingCompletedAt');
  });

  it('serializes null, current, and stale prospective assessment state over HTTP', async () => {
    const client = await activeProfileAgent(app, 'client');
    const freelancers = await Promise.all([
      activeProfileAgent(app, 'freelancer'),
      activeProfileAgent(app, 'freelancer'),
      activeProfileAgent(app, 'freelancer'),
    ]);
    const post = await JobPost.create(makeJobPost({ clientProfileId: client.profileId }));
    const proposals = await Proposal.create(
      freelancers.map((freelancer, index) => ({
        jobPostId: post._id,
        freelancerProfileId: freelancer.profileId,
        bid: 900 + index * 100,
        payModel: 'project',
        proposedDurationDays: 10,
        status: 'submitted',
      })),
    );
    await requestProposalRiskAssessment(proposals[1]._id, client.profileId);
    await requestProposalRiskAssessment(proposals[2]._id, client.profileId);
    await Proposal.updateOne({ _id: proposals[2]._id }, { $set: { bid: 1500 } });

    const res = await client.agent.get(`/api/jobposts/${post._id}/proposals?sort=bid_low`);

    expect(res.status).toBe(200);
    const byProfile = new Map(res.body.data.map((row) => [row.freelancer.id, row]));
    expect(byProfile.get(freelancers[0].profileId)).toMatchObject({
      prospectiveEngagementId: null,
      riskAssessment: null,
    });
    expect(byProfile.get(freelancers[1].profileId)).toMatchObject({
      prospectiveEngagementId: expect.stringMatching(/^[0-9a-f]{24}$/),
      riskAssessment: { status: 'current' },
    });
    expect(byProfile.get(freelancers[2].profileId)).toMatchObject({
      prospectiveEngagementId: expect.stringMatching(/^[0-9a-f]{24}$/),
      riskAssessment: { status: 'stale' },
    });
  });

  it('requires Client ownership without concealing an existing JobPost', async () => {
    const owner = await activeProfileAgent(app, 'client');
    const otherClient = await activeProfileAgent(app, 'client');
    const freelancer = await activeProfileAgent(app, 'freelancer');
    const post = await JobPost.create(makeJobPost({ clientProfileId: owner.profileId }));

    expect((await otherClient.agent.get(`/api/jobposts/${post._id}/proposals`)).status).toBe(403);
    expect((await freelancer.agent.get(`/api/jobposts/${post._id}/proposals`)).status).toBe(403);
    expect(
      (await owner.agent.get(`/api/jobposts/${new mongoose.Types.ObjectId().toString()}/proposals`))
        .status,
    ).toBe(404);
  });
});
