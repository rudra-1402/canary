import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import Engagement from '../src/models/Engagement.js';
import Identity from '../src/models/Identity.js';
import JobPost from '../src/models/JobPost.js';
import Profile from '../src/models/Profile.js';
import Proposal from '../src/models/Proposal.js';
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

async function linkedProfile(role) {
  const identity = await Identity.create({ email: `${new mongoose.Types.ObjectId()}@test.invalid` });
  return Profile.create({
    identityId: identity._id,
    role,
    origin: 'user-registered',
    displayName: `${role} counterparty`,
  });
}

async function proposalFixture(activeRole) {
  const active = await activeProfileAgent(activeRole);
  const activeId = new mongoose.Types.ObjectId(active.profileId);
  const client = activeRole === 'client' ? { _id: activeId } : await linkedProfile('client');
  const freelancer =
    activeRole === 'freelancer' ? { _id: activeId } : await linkedProfile('freelancer');
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
    status: 'open',
  });
  const proposal = await Proposal.create({
    jobPostId: jobPost._id,
    freelancerProfileId: freelancer._id,
    bid: 1100,
    payModel: 'project',
    proposedDurationDays: 14,
    screeningAnswers: ['Portfolio example attached.'],
    status: 'submitted',
  });
  return { ...active, client, freelancer, jobPost, proposal };
}

beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('RiskAssessment HTTP APIs', () => {
  it.each(['client', 'freelancer'])('lets the %s Party request and read an assessment', async (role) => {
    const data = await proposalFixture(role);
    const command = await data.agent
      .post(`/api/proposals/${data.proposal._id}/risk-assessment`)
      .set('x-csrf-token', data.csrf)
      .send({});

    expect(command.status).toBe(200);
    expect(command.body.data.engagement.status).toBe('prospective');
    expect(command.body.data.riskAssessment).toMatchObject({
      engagementId: command.body.data.engagement.id,
      modelVersion: 'risk-deterministic-v1',
    });
    expect(command.body.data.riskAssessment.signals[0]).not.toHaveProperty('value');
    expect(command.body.data.engagement).not.toHaveProperty('_id');

    const read = await data.agent.get(
      `/api/engagements/${command.body.data.engagement.id}/risk-assessment`,
    );
    expect(read.status).toBe(200);
    expect(read.body.data.riskAssessment.id).toBe(command.body.data.riskAssessment.id);
  });

  it('enforces authentication and CSRF on the command', async () => {
    const id = new mongoose.Types.ObjectId();
    expect((await request(app).post(`/api/proposals/${id}/risk-assessment`).send({})).status).toBe(
      401,
    );
    const data = await proposalFixture('client');
    expect(
      (await data.agent.post(`/api/proposals/${data.proposal._id}/risk-assessment`).send({})).status,
    ).toBe(403);
  });

  it('rejects malformed IDs at the contract boundary', async () => {
    const data = await proposalFixture('client');
    const response = await data.agent
      .post('/api/proposals/not-an-id/risk-assessment')
      .set('x-csrf-token', data.csrf)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ValidationError');
  });

  it('forbids Profiles outside the Proposal relationship', async () => {
    const data = await proposalFixture('client');
    const outsider = await activeProfileAgent('client');
    const response = await outsider.agent
      .post(`/api/proposals/${data.proposal._id}/risk-assessment`)
      .set('x-csrf-token', outsider.csrf)
      .send({});
    expect(response.status).toBe(403);
  });

  it('returns the stable missing-assessment error to an Engagement Party', async () => {
    const data = await proposalFixture('client');
    const engagement = await Engagement.create({
      clientProfileId: data.client._id,
      freelancerProfileId: data.freelancer._id,
      jobPostId: data.jobPost._id,
      proposalId: data.proposal._id,
      status: 'prospective',
    });
    const response = await data.agent.get(
      `/api/engagements/${engagement._id}/risk-assessment`,
    );
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('RISK_ASSESSMENT_NOT_FOUND');
  });

  it('returns the same records on duplicate commands', async () => {
    const data = await proposalFixture('client');
    const url = `/api/proposals/${data.proposal._id}/risk-assessment`;
    const first = await data.agent.post(url).set('x-csrf-token', data.csrf).send({});
    const second = await data.agent.post(url).set('x-csrf-token', data.csrf).send({});
    expect(second.status).toBe(200);
    expect(second.body.data.engagement.id).toBe(first.body.data.engagement.id);
    expect(second.body.data.riskAssessment.id).toBe(first.body.data.riskAssessment.id);
  });
});
