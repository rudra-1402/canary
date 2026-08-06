import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import Engagement from '../../src/models/Engagement.js';
import JobPost from '../../src/models/JobPost.js';
import TrustScore from '../../src/models/TrustScore.js';
import Proposal from '../../src/models/Proposal.js';
import Profile from '../../src/models/Profile.js';
import Identity from '../../src/models/Identity.js';
import RiskAssessment from '../../src/models/RiskAssessment.js';
import RiskSignal from '../../src/models/RiskSignal.js';
import { requestProposalRiskAssessment } from '../../src/riskAssessment/riskAssessment.service.js';
import {
  listJobPosts,
  getJobPostById,
  createJobPost,
  updateOwnedJobPost,
  listOwnedJobPostProposals,
} from '../../src/jobPost/jobPost.service.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from '../helpers/memoryDb.js';

async function makeClientProfile(displayName) {
  const identity = await Identity.create({
    email: `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new mongoose.Types.ObjectId()}@example.test`,
    passwordHash: 'x',
  });
  const profile = await Profile.create({
    identityId: identity._id,
    role: 'client',
    origin: 'synthetic-seeded',
    displayName,
  });
  return profile._id;
}

function makeTrustScore(profileId, overrides = {}) {
  return {
    profileId,
    status: 'scored',
    score: 70,
    level: 'high',
    generatedAt: new Date('2026-01-01'),
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

beforeAll(startMemoryDb, 60000);
afterAll(stopMemoryDb);
afterEach(async () => {
  vi.restoreAllMocks();
  await clearCollections();
});

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

describe('listJobPosts proposalCount', () => {
  it('attaches the real proposal count per job post, including zero', async () => {
    const jobWithProposals = await JobPost.create(makeJobPost({ title: 'Has proposals' }));
    // Asserted below by title; the zero-proposal case needs the row, not a handle.
    await JobPost.create(makeJobPost({ title: 'No proposals' }));
    await Proposal.create({
      jobPostId: jobWithProposals._id,
      freelancerProfileId: new mongoose.Types.ObjectId(),
      bid: 500,
      payModel: 'project',
      proposedDurationDays: 10,
    });
    await Proposal.create({
      jobPostId: jobWithProposals._id,
      freelancerProfileId: new mongoose.Types.ObjectId(),
      bid: 600,
      payModel: 'project',
      proposedDurationDays: 12,
    });

    const result = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 20,
      trackRecordOnly: false,
    });

    const byTitle = Object.fromEntries(result.data.map((j) => [j.title, j.proposalCount]));
    expect(byTitle['Has proposals']).toBe(2);
    expect(byTitle['No proposals']).toBe(0);
  });
});

describe('listJobPosts clientDisplayName', () => {
  it('resolves each row to the display name of the client who posted it, across several clients', async () => {
    const clientA = await makeClientProfile('Acme Studio');
    const clientB = await makeClientProfile('Blue Harbor LLC');
    await JobPost.create(makeJobPost({ title: 'Post by A', clientProfileId: clientA }));
    await JobPost.create(makeJobPost({ title: 'Post by B', clientProfileId: clientB }));
    await JobPost.create(makeJobPost({ title: 'Second post by A', clientProfileId: clientA }));

    const result = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 20,
      trackRecordOnly: false,
    });

    const byTitle = Object.fromEntries(result.data.map((j) => [j.title, j.clientDisplayName]));
    expect(byTitle['Post by A']).toBe('Acme Studio');
    expect(byTitle['Post by B']).toBe('Blue Harbor LLC');
    expect(byTitle['Second post by A']).toBe('Acme Studio');
  });

  it('omits clientDisplayName rather than throwing when the client profile no longer exists', async () => {
    const orphanClientId = new mongoose.Types.ObjectId();
    await JobPost.create(makeJobPost({ title: 'Orphaned post', clientProfileId: orphanClientId }));

    const result = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 20,
      trackRecordOnly: false,
    });

    expect(result.data[0].clientDisplayName).toBeUndefined();
  });
});

describe('listJobPosts trackRecordOnly filter', () => {
  it('excludes clients with an insufficient-history snapshot when trackRecordOnly is true', async () => {
    const scoredClient = new mongoose.Types.ObjectId();
    const unscoredClient = new mongoose.Types.ObjectId();
    await TrustScore.create(makeTrustScore(scoredClient));
    await TrustScore.create({
      profileId: unscoredClient,
      status: 'insufficient-history',
      generatedAt: new Date('2026-01-01'),
    });
    await JobPost.create(
      makeJobPost({ title: 'Scored client job', clientProfileId: scoredClient }),
    );
    await JobPost.create(
      makeJobPost({ title: 'Unscored client job', clientProfileId: unscoredClient }),
    );

    const result = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 20,
      trackRecordOnly: true,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Scored client job');
    expect(result.pagination.total).toBe(1);
  });

  it('excludes clients with no TrustScore record at all when trackRecordOnly is true', async () => {
    const scoredClient = new mongoose.Types.ObjectId();
    const noHistoryClient = new mongoose.Types.ObjectId();
    await TrustScore.create(makeTrustScore(scoredClient));
    await JobPost.create(
      makeJobPost({ title: 'Scored client job', clientProfileId: scoredClient }),
    );
    await JobPost.create(
      makeJobPost({ title: 'No trust score row', clientProfileId: noHistoryClient }),
    );

    const result = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 20,
      trackRecordOnly: true,
    });

    expect(result.data.map((j) => j.title)).toEqual(['Scored client job']);
  });

  it('returns everything, scored and unscored, when trackRecordOnly is false', async () => {
    const scoredClient = new mongoose.Types.ObjectId();
    const unscoredClient = new mongoose.Types.ObjectId();
    await TrustScore.create(makeTrustScore(scoredClient));
    await TrustScore.create({
      profileId: unscoredClient,
      status: 'insufficient-history',
      generatedAt: new Date('2026-01-01'),
    });
    await JobPost.create(
      makeJobPost({ title: 'Scored client job', clientProfileId: scoredClient }),
    );
    await JobPost.create(
      makeJobPost({ title: 'Unscored client job', clientProfileId: unscoredClient }),
    );

    const result = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 20,
      trackRecordOnly: false,
    });

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it('uses the latest snapshot per client, not just any historical one', async () => {
    const client = new mongoose.Types.ObjectId();
    // Client used to be insufficient-history, has since been scored.
    await TrustScore.create({
      profileId: client,
      status: 'insufficient-history',
      generatedAt: new Date('2026-01-01'),
    });
    await TrustScore.create(makeTrustScore(client, { generatedAt: new Date('2026-06-01') }));
    await JobPost.create(makeJobPost({ title: 'Now scored', clientProfileId: client }));

    const result = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 20,
      trackRecordOnly: true,
    });

    expect(result.data.map((j) => j.title)).toEqual(['Now scored']);
  });

  it('paginates correctly against the filtered set', async () => {
    const scoredClients = [
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
    ];
    const unscoredClient = new mongoose.Types.ObjectId();
    for (const clientId of scoredClients) {
      await TrustScore.create(makeTrustScore(clientId));
    }
    await TrustScore.create({
      profileId: unscoredClient,
      status: 'insufficient-history',
      generatedAt: new Date('2026-01-01'),
    });
    let i = 0;
    for (const clientId of scoredClients) {
      await JobPost.create(makeJobPost({ title: `Scored ${i++}`, clientProfileId: clientId }));
    }
    await JobPost.create(makeJobPost({ title: 'Unscored', clientProfileId: unscoredClient }));

    const page1 = await listJobPosts({
      status: 'open',
      page: 1,
      pageSize: 2,
      trackRecordOnly: true,
    });
    const page2 = await listJobPosts({
      status: 'open',
      page: 2,
      pageSize: 2,
      trackRecordOnly: true,
    });

    expect(page1.pagination.total).toBe(3);
    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(1);
    const allTitles = [...page1.data, ...page2.data].map((j) => j.title);
    expect(new Set(allTitles).size).toBe(3);
    expect(allTitles.every((t) => t.startsWith('Scored'))).toBe(true);
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

  it('attaches the real proposal count, including zero, for the single-job detail view', async () => {
    const withProposals = await JobPost.create(makeJobPost({ title: 'Has proposals' }));
    await Proposal.create({
      jobPostId: withProposals._id,
      freelancerProfileId: new mongoose.Types.ObjectId(),
      bid: 500,
      payModel: 'project',
      proposedDurationDays: 10,
    });
    await Proposal.create({
      jobPostId: withProposals._id,
      freelancerProfileId: new mongoose.Types.ObjectId(),
      bid: 600,
      payModel: 'project',
      proposedDurationDays: 12,
    });
    const withoutProposals = await JobPost.create(makeJobPost({ title: 'No proposals' }));

    expect((await getJobPostById(withProposals._id.toString())).proposalCount).toBe(2);
    expect((await getJobPostById(withoutProposals._id.toString())).proposalCount).toBe(0);
  });
});

describe('JobPost authoring service', () => {
  it('derives owner/status and enforces owner lifecycle transitions', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const created = await createJobPost(authoringInput('save_draft'), ownerId);
    expect(created).toMatchObject({ clientProfileId: ownerId.toString(), status: 'draft' });

    await expect(
      updateOwnedJobPost(created.id, new mongoose.Types.ObjectId(), { title: 'No' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const published = await updateOwnedJobPost(created.id, ownerId, { action: 'publish' });
    expect(published.status).toBe('open');
    await expect(
      updateOwnedJobPost(created.id, ownerId, { action: 'save_draft' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

function authoringInput(action) {
  return {
    title: 'Build a dashboard',
    category: 'web-development',
    description: 'Implement the approved Client flow.',
    skills: ['node'],
    jobType: 'fixed',
    budgetOrRate: 1500,
    experienceLevel: 'intermediate',
    projectLength: '1-to-3-months',
    screeningQuestions: [],
    action,
  };
}

describe('listOwnedJobPostProposals', () => {
  it('projects the applicant safely and batches their TrustScore state', async () => {
    const clientProfileId = await makeClientProfile('Inbox owner');
    const identity = await Identity.create({
      email: `${new mongoose.Types.ObjectId()}@example.test`,
      passwordHash: 'x',
    });
    const freelancer = await Profile.create({
      identityId: identity._id,
      role: 'freelancer',
      origin: 'user-registered',
      displayName: 'Inbox applicant',
      skills: ['node'],
    });
    const post = await JobPost.create(makeJobPost({ clientProfileId }));
    await Proposal.create({
      jobPostId: post._id,
      freelancerProfileId: freelancer._id,
      bid: 800,
      payModel: 'project',
      proposedDurationDays: 8,
    });

    const result = await listOwnedJobPostProposals(post._id, clientProfileId, {
      sort: 'newest',
      page: 1,
      pageSize: 20,
    });

    expect(result.data[0]).toMatchObject({
      freelancer: { id: freelancer._id.toString(), displayName: 'Inbox applicant' },
      trustScore: { status: 'insufficient-history', profileId: freelancer._id.toString() },
    });
    expect(result.data[0].freelancer).not.toHaveProperty('identityId');
    expect(result.data[0]).toMatchObject({
      prospectiveEngagementId: null,
      riskAssessment: null,
    });
  });

  it('batches null, current, and stale assessment state for one inbox page', async () => {
    const clientProfileId = await makeClientProfile('Assessment inbox owner');
    const client = await Profile.findById(clientProfileId).lean();
    const post = await JobPost.create(makeJobPost({ clientProfileId }));
    const proposals = [];
    for (const label of ['none', 'current', 'stale']) {
      const identity = await Identity.create({
        email: `${label}-${new mongoose.Types.ObjectId()}@example.test`,
        passwordHash: 'x',
      });
      const freelancer = await Profile.create({
        identityId: identity._id,
        role: 'freelancer',
        origin: 'user-registered',
        displayName: `${label} applicant`,
      });
      proposals.push(
        await Proposal.create({
          jobPostId: post._id,
          freelancerProfileId: freelancer._id,
          bid: 800,
          payModel: 'project',
          proposedDurationDays: 8,
        }),
      );
    }
    await requestProposalRiskAssessment(proposals[1]._id, clientProfileId);
    await requestProposalRiskAssessment(proposals[2]._id, clientProfileId);
    await Proposal.updateOne({ _id: proposals[2]._id }, { $set: { bid: 1200 } });

    const spies = [
      vi.spyOn(Engagement, 'find'),
      vi.spyOn(RiskAssessment, 'find'),
      vi.spyOn(RiskAssessment, 'aggregate'),
      vi.spyOn(RiskSignal, 'find'),
    ];
    const result = await listOwnedJobPostProposals(
      post._id,
      clientProfileId,
      { sort: 'newest', page: 1, pageSize: 20 },
      client.identityId,
    );
    const byName = new Map(result.data.map((row) => [row.freelancer.displayName, row]));

    expect(byName.get('none applicant')).toMatchObject({
      prospectiveEngagementId: null,
      riskAssessment: null,
    });
    expect(byName.get('current applicant').riskAssessment.status).toBe('current');
    expect(byName.get('stale applicant').riskAssessment.status).toBe('stale');
    expect(byName.get('current applicant').prospectiveEngagementId).toMatch(/^[0-9a-f]{24}$/);
    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 1]);

    vi.restoreAllMocks();
    await Engagement.updateOne({ proposalId: proposals[1]._id }, { $set: { status: 'active' } });
    const afterActivation = await listOwnedJobPostProposals(
      post._id,
      clientProfileId,
      { sort: 'newest', page: 1, pageSize: 20 },
      client.identityId,
    );
    const activatedRow = afterActivation.data.find(
      (row) => row.freelancer.displayName === 'current applicant',
    );
    expect(activatedRow).toMatchObject({
      prospectiveEngagementId: null,
      riskAssessment: null,
    });
  });
});
