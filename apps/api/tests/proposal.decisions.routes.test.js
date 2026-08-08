import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import Identity from '../src/models/Identity.js';
import JobPost from '../src/models/JobPost.js';
import Profile from '../src/models/Profile.js';
import Proposal from '../src/models/Proposal.js';
import { requestProposalRiskAssessment } from '../src/riskAssessment/riskAssessment.service.js';
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
    .send({ role, displayName: `${role} decision maker` });
  return { agent, csrf, profileId: created.body.id };
}

async function directProfile(role) {
  const identity = await Identity.create({
    email: `${new mongoose.Types.ObjectId()}@test.invalid`,
  });
  return Profile.create({
    identityId: identity._id,
    role,
    origin: 'user-registered',
    displayName: `${role} counterparty`,
  });
}

async function fixture() {
  const client = await activeProfileAgent('client');
  const freelancer = await directProfile('freelancer');
  const jobPost = await JobPost.create({
    clientProfileId: client.profileId,
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
  return { client, freelancer, jobPost, proposal };
}

beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('Client Proposal decision APIs', () => {
  it('accepts with explicit confirmation and returns refreshed persisted state', async () => {
    const data = await fixture();
    const response = await data.client.agent
      .post(`/api/proposals/${data.proposal._id}/accept`)
      .set('x-csrf-token', data.client.csrf)
      .send({ confirm: true });

    expect(response.status).toBe(200);
    expect(response.body.data.proposal).toEqual({
      id: String(data.proposal._id),
      status: 'accepted',
    });
    expect(response.body.data.engagement).toMatchObject({
      proposalId: String(data.proposal._id),
      status: 'active',
    });
    expect(response.body.data.engagement.acceptedAt).toMatch(/Z$/);
    expect(response.body.data.riskAssessment.signals[0]).not.toHaveProperty('value');
  });

  it('returns a current recomputed assessment when terms changed before acceptance', async () => {
    const data = await fixture();
    const original = await requestProposalRiskAssessment(data.proposal._id, data.client.profileId);
    await Proposal.updateOne({ _id: data.proposal._id }, { $set: { bid: 1800 } });

    const response = await data.client.agent
      .post(`/api/proposals/${data.proposal._id}/accept`)
      .set('x-csrf-token', data.client.csrf)
      .send({ confirm: true });

    expect(response.status).toBe(200);
    expect(response.body.data.riskAssessment.status).toBe('current');
    expect(response.body.data.riskAssessment.id).not.toBe(String(original.riskAssessment._id));
    expect(response.body.data.engagement.agreedTerms.price).toBe(1800);
  });

  it('rejects missing/false confirmation at the shared contract boundary', async () => {
    const data = await fixture();
    for (const body of [{}, { confirm: false }]) {
      const response = await data.client.agent
        .post(`/api/proposals/${data.proposal._id}/accept`)
        .set('x-csrf-token', data.client.csrf)
        .send(body);
      expect(response.status).toBe(400);
    }
    expect((await Proposal.findById(data.proposal._id)).status).toBe('submitted');
  });

  it('enforces authentication, CSRF, Client role, and ownership', async () => {
    const data = await fixture();
    const url = `/api/proposals/${data.proposal._id}/accept`;
    expect((await request(app).post(url).send({ confirm: true })).status).toBe(401);
    expect((await data.client.agent.post(url).send({ confirm: true })).status).toBe(403);

    const freelancer = await activeProfileAgent('freelancer');
    expect(
      (
        await freelancer.agent
          .post(url)
          .set('x-csrf-token', freelancer.csrf)
          .send({ confirm: true })
      ).status,
    ).toBe(403);

    const otherClient = await activeProfileAgent('client');
    expect(
      (
        await otherClient.agent
          .post(url)
          .set('x-csrf-token', otherClient.csrf)
          .send({ confirm: true })
      ).status,
    ).toBe(403);
  });

  it('returns the same Engagement and assessment on an acceptance retry', async () => {
    const data = await fixture();
    const url = `/api/proposals/${data.proposal._id}/accept`;
    const first = await data.client.agent
      .post(url)
      .set('x-csrf-token', data.client.csrf)
      .send({ confirm: true });
    const second = await data.client.agent
      .post(url)
      .set('x-csrf-token', data.client.csrf)
      .send({ confirm: true });
    expect(second.status).toBe(200);
    expect(second.body.data.engagement.id).toBe(first.body.data.engagement.id);
    expect(second.body.data.riskAssessment.id).toBe(first.body.data.riskAssessment.id);
  });

  it('declines one Proposal with an optional private reason', async () => {
    const data = await fixture();
    const response = await data.client.agent
      .post(`/api/proposals/${data.proposal._id}/decline`)
      .set('x-csrf-token', data.client.csrf)
      .send({ reasonCode: 'terms-not-aligned' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { proposal: { id: String(data.proposal._id), status: 'declined' } },
    });
    expect((await Proposal.findById(data.proposal._id)).declineReasonCode).toBe(
      'terms-not-aligned',
    );
  });
});
