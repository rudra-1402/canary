import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import Identity from '../../src/models/Identity.js';
import Profile from '../../src/models/Profile.js';
import Review from '../../src/models/Review.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

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

describe('Profile routes', () => {
  let app;

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
});
