import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import JobPost from '../../src/models/JobPost.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from '../helpers/memoryDb.js';

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
    await JobPost.create(makeJobPost());
    const res = await request(app).get('/api/jobposts');
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
