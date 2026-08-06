import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import Identity from '../../src/models/Identity.js';
import Profile from '../../src/models/Profile.js';
import Review from '../../src/models/Review.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

let app;

function makeProfile(identityId, overrides = {}) {
  return {
    identityId,
    role: 'freelancer',
    origin: 'synthetic-seeded',
    displayName: 'Avery Chen',
    verificationStatus: 'id-verified',
    skills: ['react', 'node'],
    hourlyRate: 85,
    country: 'India',
    ...overrides,
  };
}

async function createProfile(overrides = {}) {
  const identity = await Identity.create({
    email: `${new mongoose.Types.ObjectId()}@test.invalid`,
    passwordHash: 'never-returned',
  });
  return Profile.create(makeProfile(identity._id, overrides));
}

async function activeProfileAgent(role) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({
      email: `${new mongoose.Types.ObjectId()}@test.invalid`,
      password: 'longenough1',
    });
  const created = await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role, displayName: 'Demo Profile' });
  return { agent, csrf, profileId: created.body.id };
}

describe('Profile routes', () => {
  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);
  afterEach(clearCollections);

  it('returns a public Profile without Identity authentication fields', async () => {
    const profile = await createProfile();

    const res = await request(app).get(`/api/profiles/${profile._id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: profile._id.toString(),
      role: 'freelancer',
      displayName: 'Avery Chen',
      skills: ['react', 'node'],
    });
    expect(res.body).not.toHaveProperty('identityId');
    expect(res.body).not.toHaveProperty('email');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('returns 404 for a well-formed absent Profile id', async () => {
    const res = await request(app).get(`/api/profiles/${new mongoose.Types.ObjectId()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });

  it('returns only currently visible reviews and never planted provenance flags', async () => {
    const subject = await createProfile();
    const author = await createProfile({ displayName: 'Reviewer' });
    const engagementId = new mongoose.Types.ObjectId();
    const pastReview = await Review.create({
      engagementId,
      authorProfileId: author._id,
      subjectProfileId: subject._id,
      rating: 5,
      text: 'Visible review',
      visibleAt: new Date(Date.now() - 60_000),
      isPlantedCollusion: true,
      isPlantedSabotage: true,
    });
    await Review.create({
      engagementId: new mongoose.Types.ObjectId(),
      authorProfileId: author._id,
      subjectProfileId: subject._id,
      rating: 1,
      text: 'Future review',
      visibleAt: new Date(Date.now() + 60_000),
      isPlantedCollusion: true,
    });

    const res = await request(app).get(`/api/profiles/${subject._id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: pastReview._id.toString(),
      text: 'Visible review',
    });
    expect(res.body.data[0]).not.toHaveProperty('isPlantedCollusion');
    expect(res.body.data[0]).not.toHaveProperty('isPlantedSabotage');
  });

  it('returns 404 for reviews of a well-formed absent Profile id', async () => {
    const res = await request(app).get(`/api/profiles/${new mongoose.Types.ObjectId()}/reviews`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });

  it('updates only the active Profile owned by the Identity', async () => {
    const { agent, csrf, profileId } = await activeProfileAgent('freelancer');

    const res = await agent
      .patch(`/api/profiles/${profileId}`)
      .set('x-csrf-token', csrf)
      .send({ headline: 'Product designer', availableForWork: true });

    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      id: profileId,
      headline: 'Product designer',
      availableForWork: true,
    });
    expect(res.body.profile).not.toHaveProperty('identityId');
  });

  it('rejects a Profile owned by another Identity', async () => {
    const owner = await activeProfileAgent('freelancer');
    const other = await activeProfileAgent('freelancer');

    const res = await other.agent
      .patch(`/api/profiles/${owner.profileId}`)
      .set('x-csrf-token', other.csrf)
      .send({ headline: 'Not mine' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ForbiddenError');
  });

  it('rejects Client-only and system-managed fields on a Freelancer patch', async () => {
    const { agent, csrf, profileId } = await activeProfileAgent('freelancer');

    const clientField = await agent
      .patch(`/api/profiles/${profileId}`)
      .set('x-csrf-token', csrf)
      .send({ businessName: 'X' });
    const managedField = await agent
      .patch(`/api/profiles/${profileId}`)
      .set('x-csrf-token', csrf)
      .send({ paymentVerified: true });

    expect(clientField.status).toBe(400);
    expect(managedField.status).toBe(400);
  });

  it('enforces authentication, CSRF, ObjectId, and non-empty patch validation', async () => {
    const anonymous = request.agent(app);
    const anonymousCsrf = (await anonymous.get('/api/auth/csrf-token')).body.csrfToken;
    const targetId = new mongoose.Types.ObjectId();
    expect(
      (
        await anonymous
          .patch(`/api/profiles/${targetId}`)
          .set('x-csrf-token', anonymousCsrf)
          .send({ headline: 'No session' })
      ).status,
    ).toBe(401);

    const { agent, csrf, profileId } = await activeProfileAgent('freelancer');
    expect(
      (await agent.patch(`/api/profiles/${profileId}`).send({ headline: 'No CSRF' })).status,
    ).toBe(403);
    expect(
      (
        await agent
          .patch('/api/profiles/not-an-object-id')
          .set('x-csrf-token', csrf)
          .send({ headline: 'Invalid id' })
      ).status,
    ).toBe(400);
    expect(
      (await agent.patch(`/api/profiles/${profileId}`).set('x-csrf-token', csrf).send({})).status,
    ).toBe(400);
  });

  it('hides a non-discoverable Profile from anonymous viewers but not its owner', async () => {
    const { agent, csrf, profileId } = await activeProfileAgent('freelancer');
    const patch = await agent
      .patch(`/api/profiles/${profileId}`)
      .set('x-csrf-token', csrf)
      .send({ discoverable: false });
    expect(patch.status).toBe(200);

    expect((await request(app).get(`/api/profiles/${profileId}`)).status).toBe(404);
    expect((await agent.get(`/api/profiles/${profileId}`)).status).toBe(200);
  });

  it('requires an active Client Profile for Freelancer discovery', async () => {
    const freelancer = await activeProfileAgent('freelancer');
    expect((await freelancer.agent.get('/api/profiles')).status).toBe(403);
  });

  it('returns only discoverable and available Freelancer Profiles', async () => {
    const client = await activeProfileAgent('client');
    await createProfile({
      role: 'freelancer',
      discoverable: true,
      availableForWork: true,
      displayName: 'Visible',
    });
    await createProfile({
      role: 'freelancer',
      discoverable: false,
      availableForWork: true,
      displayName: 'Private',
    });
    await createProfile({
      role: 'freelancer',
      discoverable: true,
      availableForWork: false,
      displayName: 'Unavailable',
    });
    await createProfile({ role: 'client', discoverable: true, displayName: 'Client' });

    const res = await client.agent.get('/api/profiles');

    expect(res.status).toBe(200);
    expect(res.body.data.map((item) => item.displayName)).toEqual(['Visible']);
    expect(res.body.data[0]).toMatchObject({
      role: 'freelancer',
      availableForWork: true,
      activeEngagementCount: 0,
      trust: { status: 'insufficient-history' },
    });
  });

  it('validates Gallery rate ranges before querying MongoDB', async () => {
    const client = await activeProfileAgent('client');
    const res = await client.agent.get('/api/profiles?minRate=100&maxRate=50');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});
