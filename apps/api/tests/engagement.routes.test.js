import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import Engagement from '../src/models/Engagement.js';
import Identity from '../src/models/Identity.js';
import JobPost from '../src/models/JobPost.js';
import Profile from '../src/models/Profile.js';
import Proposal from '../src/models/Proposal.js';
import Review from '../src/models/Review.js';
import { acceptProposal } from '../src/proposal/proposal.service.js';
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
    .send({ role, displayName: `${role} viewer` });
  return { agent, csrf, profileId: created.body.id };
}

async function directProfile(role, name) {
  const identity = await Identity.create({ email: `${new mongoose.Types.ObjectId()}@test.invalid` });
  return Profile.create({
    identityId: identity._id,
    role,
    origin: 'user-registered',
    displayName: name,
  });
}

async function fixture(activeRole = 'client') {
  const active = await activeProfileAgent(activeRole);
  const activeId = new mongoose.Types.ObjectId(active.profileId);
  const client =
    activeRole === 'client' ? { _id: activeId, displayName: 'client viewer' } : await directProfile('client', 'Aster Labs');
  const freelancer =
    activeRole === 'freelancer'
      ? { _id: activeId, displayName: 'freelancer viewer' }
      : await directProfile('freelancer', 'Mina');
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
    status: 'open',
  });
  const proposal = await Proposal.create({
    jobPostId: jobPost._id,
    freelancerProfileId: freelancer._id,
    bid: 1100,
    payModel: 'project',
    proposedDurationDays: 14,
    status: 'submitted',
  });
  return { ...active, activeRole, client, freelancer, jobPost, proposal };
}

beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('GET /api/engagements/:engagementId', () => {
  it.each(['client', 'freelancer'])('returns private detail to the %s Party', async (role) => {
    const data = await fixture(role);
    const accepted = await acceptProposal(data.proposal._id, data.client._id, { confirm: true });
    const response = await data.agent.get(`/api/engagements/${accepted.engagement._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.engagement).toMatchObject({
      id: String(accepted.engagement._id),
      status: 'active',
      jobPost: { id: String(data.jobPost._id), title: data.jobPost.title },
      proposal: { id: String(data.proposal._id), status: 'accepted', bid: 1100 },
      outcomeEligibility: true,
    });
    expect(response.body.data.engagement.parties.client.role).toBe('client');
    expect(response.body.data.engagement.parties.freelancer.role).toBe('freelancer');
    expect(response.body.data.engagement.riskAssessment.modelVersion).toBe(
      'risk-deterministic-v1',
    );
    expect(response.body.data.engagement.timeline.map((event) => event.event)).toEqual([
      'prospective-created',
      'accepted',
    ]);
    expect(response.body.data.engagement).not.toHaveProperty('_id');
  });

  it('makes outcome eligibility viewer-specific after that Party reviews', async () => {
    const data = await fixture('client');
    const accepted = await acceptProposal(data.proposal._id, data.client._id, { confirm: true });
    await Review.create({
      engagementId: accepted.engagement._id,
      authorProfileId: data.client._id,
      subjectProfileId: data.freelancer._id,
      rating: 4,
      text: 'Solid work.',
      visibleAt: null,
    });
    const response = await data.agent.get(`/api/engagements/${accepted.engagement._id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.engagement.outcomeEligibility).toBe(false);
  });

  it('enforces authentication and Party relationship', async () => {
    const data = await fixture('client');
    const accepted = await acceptProposal(data.proposal._id, data.client._id, { confirm: true });
    const url = `/api/engagements/${accepted.engagement._id}`;
    expect((await request(app).get(url)).status).toBe(401);
    const outsider = await activeProfileAgent('client');
    expect((await outsider.agent.get(url)).status).toBe(403);
  });

  it('returns contract errors for malformed and missing IDs', async () => {
    const data = await fixture('client');
    expect((await data.agent.get('/api/engagements/not-an-id')).status).toBe(400);
    expect(
      (await data.agent.get(`/api/engagements/${new mongoose.Types.ObjectId()}`)).status,
    ).toBe(404);
  });

  it('returns a nullable assessment and no outcome action for a prospective Engagement', async () => {
    const data = await fixture('client');
    const engagement = await Engagement.create({
      freelancerProfileId: data.freelancer._id,
      clientProfileId: data.client._id,
      jobPostId: data.jobPost._id,
      proposalId: data.proposal._id,
      status: 'prospective',
      agreedTerms: {
        scope: data.jobPost.description,
        price: data.proposal.bid,
        paymentTerms: data.proposal.payModel,
        timeline: '14 days',
      },
    });
    const response = await data.agent.get(`/api/engagements/${engagement._id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.engagement.riskAssessment).toBeNull();
    expect(response.body.data.engagement.outcomeEligibility).toBe(false);
  });
});
