import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import Engagement from '../../src/models/Engagement.js';
import Outcome from '../../src/models/Outcome.js';
import Review from '../../src/models/Review.js';
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
    .send({ role, displayName: `${role} party` });
  return { agent, csrf, profileId: created.body.id };
}

async function activeEngagement(freelancerProfileId, clientProfileId, status = 'active') {
  return Engagement.create({
    freelancerProfileId,
    clientProfileId,
    status,
    agreedTerms: {
      scope: 'Deliver the work',
      price: 1000,
      paymentTerms: 'On completion',
      timeline: 'Two weeks',
      dueAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  });
}

function bodyFor(role, engagementId, overrides = {}) {
  const outcome =
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
        };
  return {
    engagementId: String(engagementId),
    outcome,
    review: { rating: 5, text: 'Excellent.' },
    ...overrides,
  };
}

beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('POST /api/outcome-reviews', () => {
  it('keeps the Engagement active after first submission, then concludes and releases both Reviews', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    const client = await activeProfileAgent('client');
    const engagement = await activeEngagement(freelancer.profileId, client.profileId);

    const first = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(bodyFor('freelancer', engagement._id));
    expect(first.status).toBe(201);
    expect(first.body.engagementStatus).toBe('active');
    expect((await Engagement.findById(engagement._id)).status).toBe('active');
    expect((await Review.findById(first.body.reviewId)).visibleAt).toBeNull();

    const second = await client.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', client.csrf)
      .send(bodyFor('client', engagement._id));
    expect(second.status).toBe(201);
    expect(second.body.engagementStatus).toBe('concluded');
    expect((await Engagement.findById(engagement._id)).status).toBe('concluded');
    const reviews = await Review.find({ engagementId: engagement._id });
    expect(reviews).toHaveLength(2);
    expect(reviews.every((review) => review.visibleAt instanceof Date)).toBe(true);
  });

  it('exposes outcome evidence only after both parties conclude the Engagement', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    const client = await activeProfileAgent('client');
    const engagement = await activeEngagement(freelancer.profileId, client.profileId);

    const first = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(bodyFor('freelancer', engagement._id));
    expect(first.status).toBe(201);

    const beforeConclusion = await freelancer.agent.get(
      `/api/trust-scores/${freelancer.profileId}/outcomes`,
    );
    expect(beforeConclusion.status).toBe(200);
    expect(beforeConclusion.body).toMatchObject({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0 },
    });

    const second = await client.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', client.csrf)
      .send(bodyFor('client', engagement._id));
    expect(second.status).toBe(201);

    const [freelancerEvidence, clientEvidence] = await Promise.all([
      freelancer.agent.get(`/api/trust-scores/${freelancer.profileId}/outcomes`),
      client.agent.get(`/api/trust-scores/${client.profileId}/outcomes`),
    ]);
    expect(freelancerEvidence.body.pagination.total).toBe(1);
    expect(clientEvidence.body.pagination.total).toBe(1);
    expect(freelancerEvidence.body.data[0].id).toBe(second.body.outcomeId);
    expect(clientEvidence.body.data[0].id).toBe(first.body.outcomeId);
  });

  it('recovers an Outcome-only partial write when the same party resubmits', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    const client = await activeProfileAgent('client');
    const engagement = await activeEngagement(freelancer.profileId, client.profileId);
    await Outcome.create({
      engagementId: engagement._id,
      subjectProfileId: client.profileId,
      counterpartyProfileId: freelancer.profileId,
      subjectRole: 'client',
      observed: true,
      deliveredAt: null,
      daysLate: null,
      paidInFull: true,
      revisionsRequested: 0,
      scopeCreepOccurred: false,
      endedAs: 'completed',
      labelSource: 'counterparty-reported',
    });

    const res = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(bodyFor('freelancer', engagement._id));
    expect(res.status).toBe(201);
    expect(await Outcome.countDocuments({ engagementId: engagement._id })).toBe(1);
    expect(await Review.countDocuments({ engagementId: engagement._id })).toBe(1);
  });

  it('attributes a freelancer ghosting report to the client and forces it observed', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    const client = await activeProfileAgent('client');
    const engagement = await activeEngagement(freelancer.profileId, client.profileId);

    const response = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send({
        ...bodyFor('freelancer', engagement._id),
        outcome: {
          observed: false,
          deliveredAt: null,
          daysLate: null,
          paidInFull: null,
          revisionsRequested: null,
          scopeCreepOccurred: null,
          ghosted: true,
          endedAs: 'ghosted',
        },
      });

    expect(response.status).toBe(201);
    const outcome = await Outcome.findById(response.body.outcomeId);
    expect(outcome).toMatchObject({
      subjectProfileId: expect.objectContaining({ toString: expect.any(Function) }),
      counterpartyProfileId: expect.objectContaining({ toString: expect.any(Function) }),
      subjectRole: 'client',
      ghosted: true,
      observed: true,
      labelSource: 'counterparty-reported',
    });
    expect(String(outcome.subjectProfileId)).toBe(client.profileId);
    expect(String(outcome.counterpartyProfileId)).toBe(freelancer.profileId);
    expect(
      await Outcome.exists({
        engagementId: engagement._id,
        subjectProfileId: freelancer.profileId,
        ghosted: true,
      }),
    ).toBeNull();
  });

  it('rejects a non-party, an inactive Engagement, and a completed duplicate submission', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    const client = await activeProfileAgent('client');
    const stranger = await activeProfileAgent('freelancer');
    const engagement = await activeEngagement(freelancer.profileId, client.profileId);
    const forbidden = await stranger.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', stranger.csrf)
      .send(bodyFor('freelancer', engagement._id));
    expect(forbidden.status).toBe(403);

    const prospective = await activeEngagement(
      freelancer.profileId,
      client.profileId,
      'prospective',
    );
    const inactive = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(bodyFor('freelancer', prospective._id));
    expect(inactive.status).toBe(400);

    const concluded = await activeEngagement(freelancer.profileId, client.profileId, 'concluded');
    const concludedResponse = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(bodyFor('freelancer', concluded._id));
    expect(concludedResponse.status).toBe(400);

    expect(
      (
        await freelancer.agent
          .post('/api/outcome-reviews')
          .set('x-csrf-token', freelancer.csrf)
          .send(bodyFor('freelancer', engagement._id))
      ).status,
    ).toBe(201);
    expect(
      (
        await freelancer.agent
          .post('/api/outcome-reviews')
          .set('x-csrf-token', freelancer.csrf)
          .send(bodyFor('freelancer', engagement._id))
      ).status,
    ).toBe(400);
  });

  it('rejects a self-review and body-level impersonation before either can write', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    const engagement = await activeEngagement(freelancer.profileId, freelancer.profileId);
    const selfReview = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(bodyFor('freelancer', engagement._id));
    expect(selfReview.status).toBe(400);

    const client = await activeProfileAgent('client');
    const validEngagement = await activeEngagement(freelancer.profileId, client.profileId);
    const impersonation = await freelancer.agent
      .post('/api/outcome-reviews')
      .set('x-csrf-token', freelancer.csrf)
      .send(
        bodyFor('freelancer', validEngagement._id, {
          outcome: {
            ...bodyFor('freelancer', validEngagement._id).outcome,
            subjectProfileId: client.profileId,
          },
        }),
      );
    expect(impersonation.status).toBe(400);
    expect(await Outcome.countDocuments({ engagementId: validEngagement._id })).toBe(0);
  });
});
