import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import JobPost from '../../src/models/JobPost.js';
import { listJobPosts, getJobPostById } from '../../src/jobPost/jobPost.service.js';
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

beforeAll(startMemoryDb, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('listJobPosts', () => {
  it('returns only open jobs by default with a pagination envelope', async () => {
    await JobPost.create(makeJobPost({ title: 'Open A' }));
    await JobPost.create(makeJobPost({ title: 'Open B' }));
    await JobPost.create(makeJobPost({ title: 'Closed', status: 'closed' }));

    const result = await listJobPosts({ status: 'open', page: 1, pageSize: 20 });
    expect(result.data).toHaveLength(2);
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 2 });
    expect(result.data.every((j) => j.status === 'open')).toBe(true);
  });

  it('honors jobType filter and pagination', async () => {
    await JobPost.create(makeJobPost({ jobType: 'fixed' }));
    await JobPost.create(makeJobPost({ jobType: 'hourly' }));
    await JobPost.create(makeJobPost({ jobType: 'hourly' }));

    const result = await listJobPosts({ status: 'open', jobType: 'hourly', page: 2, pageSize: 1 });
    expect(result.data).toHaveLength(1);
    expect(result.pagination).toEqual({ page: 2, pageSize: 1, total: 2 });
  });

  it('sorts by createdAt descending', async () => {
    const a = await JobPost.create(makeJobPost({ title: 'Jan' }));
    const b = await JobPost.create(makeJobPost({ title: 'Mar' }));
    const c = await JobPost.create(makeJobPost({ title: 'Feb' }));
    // createdAt is schema-immutable (mongoose auto-marks timestamp fields immutable);
    // overwriteImmutable lets this fixture backdate it to exercise sort order.
    await JobPost.updateOne(
      { _id: a._id },
      { $set: { createdAt: new Date('2026-01-01') } },
      { overwriteImmutable: true },
    );
    await JobPost.updateOne(
      { _id: b._id },
      { $set: { createdAt: new Date('2026-03-01') } },
      { overwriteImmutable: true },
    );
    await JobPost.updateOne(
      { _id: c._id },
      { $set: { createdAt: new Date('2026-02-01') } },
      { overwriteImmutable: true },
    );

    const result = await listJobPosts({ status: 'open', page: 1, pageSize: 20 });
    expect(result.data.map((j) => j.title)).toEqual(['Mar', 'Feb', 'Jan']);
  });

  it('paginates deterministically when createdAt ties (stable sort by _id)', async () => {
    const a = await JobPost.create(makeJobPost({ title: 'T1' }));
    const b = await JobPost.create(makeJobPost({ title: 'T2' }));
    const c = await JobPost.create(makeJobPost({ title: 'T3' }));
    const sameTime = new Date('2026-05-01T00:00:00.000Z');
    for (const doc of [a, b, c]) {
      await JobPost.updateOne(
        { _id: doc._id },
        { $set: { createdAt: sameTime } },
        { overwriteImmutable: true },
      );
    }
    const ids = [];
    for (const page of [1, 2, 3]) {
      const result = await listJobPosts({ status: 'open', page, pageSize: 1 });
      expect(result.data).toHaveLength(1);
      ids.push(result.data[0].id);
    }
    // With equal createdAt, the { _id: -1 } tiebreaker makes paging deterministic:
    // pages must arrive in strict _id-descending order (no duplication, no skips).
    // Without the tiebreaker this order is unspecified in real MongoDB.
    const expectedIdDesc = [a._id.toString(), b._id.toString(), c._id.toString()].sort().reverse();
    expect(ids).toEqual(expectedIdDesc);
  });
});

describe('getJobPostById', () => {
  it('returns the contract shape for an existing job, without _id/__v', async () => {
    const created = await JobPost.create(makeJobPost({ title: 'Findable' }));
    const job = await getJobPostById(created._id.toString());
    expect(job.id).toBe(created._id.toString());
    expect(job.title).toBe('Findable');
    expect(job).not.toHaveProperty('_id');
    expect(job).not.toHaveProperty('__v');
  });

  it('throws NotFoundError for a well-formed but absent id', async () => {
    const absentId = new mongoose.Types.ObjectId().toString();
    await expect(getJobPostById(absentId)).rejects.toThrow(`JobPost ${absentId} not found`);
  });
});
