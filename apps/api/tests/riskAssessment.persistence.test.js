import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Engagement from '../src/models/Engagement.js';
import JobPost from '../src/models/JobPost.js';
import RiskAssessment from '../src/models/RiskAssessment.js';
import RiskSignal from '../src/models/RiskSignal.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from './helpers/memoryDb.js';

describe('RiskAssessment persistence invariants', () => {
  beforeAll(async () => {
    await startMemoryDb();
    await Promise.all([
      Engagement.syncIndexes(),
      RiskAssessment.syncIndexes(),
      RiskSignal.syncIndexes(),
      JobPost.syncIndexes(),
    ]);
  });
  beforeEach(clearCollections);
  afterAll(stopMemoryDb);

  const ids = () => ({
    proposalId: new mongoose.Types.ObjectId(),
    jobPostId: new mongoose.Types.ObjectId(),
    freelancerProfileId: new mongoose.Types.ObjectId(),
    clientProfileId: new mongoose.Types.ObjectId(),
  });

  it('permits only one Engagement for a non-null Proposal', async () => {
    const fields = ids();
    await Engagement.create({ ...fields, status: 'prospective' });

    await expect(Engagement.create({ ...fields, status: 'prospective' })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('does not make null proposalId unique for historical Engagements', async () => {
    const first = ids();
    const second = ids();
    await Engagement.create({
      freelancerProfileId: first.freelancerProfileId,
      clientProfileId: first.clientProfileId,
      status: 'prospective',
    });
    await expect(
      Engagement.create({
        freelancerProfileId: second.freelancerProfileId,
        clientProfileId: second.clientProfileId,
        status: 'prospective',
      }),
    ).resolves.toBeDefined();
  });

  it('permits one RiskAssessment per Engagement input version', async () => {
    const engagementId = new mongoose.Types.ObjectId();
    const assessment = {
      engagementId,
      score: 31,
      level: 'low',
      verdict: 'proceed',
      confidence: 0.81,
      explanation: 'Structured evidence supports proceeding.',
      inputVersion: 'sha256:one',
      modelVersion: 'risk-deterministic-v1',
      generatedAt: new Date('2026-08-06T12:00:00.000Z'),
    };
    await RiskAssessment.create(assessment);

    await expect(RiskAssessment.create(assessment)).rejects.toMatchObject({ code: 11000 });
    await expect(
      RiskAssessment.create({ ...assessment, inputVersion: 'sha256:two' }),
    ).resolves.toBeDefined();
  });

  it('requires assessment version and generation metadata', () => {
    const doc = new RiskAssessment({
      engagementId: new mongoose.Types.ObjectId(),
      score: 31,
      level: 'low',
      verdict: 'proceed',
      confidence: 0.81,
    });
    const error = doc.validateSync();
    expect(error.errors.inputVersion).toBeDefined();
    expect(error.errors.modelVersion).toBeDefined();
    expect(error.errors.generatedAt).toBeDefined();
  });

  it('stores structured label/evidence and acceptance metadata', async () => {
    const fields = ids();
    const acceptedAt = new Date('2026-08-06T12:00:00.000Z');
    const engagement = await Engagement.create({
      ...fields,
      status: 'active',
      acceptedAt,
      agreedTerms: {
        scope: 'Build the approved dashboard.',
        price: 1200,
        paymentTerms: 'project',
        timeline: '14 days',
        dueAt: new Date('2026-08-20T12:00:00.000Z'),
      },
    });
    const assessment = await RiskAssessment.create({
      engagementId: engagement._id,
      score: 31,
      level: 'low',
      verdict: 'proceed',
      confidence: 0.81,
      explanation: 'Structured evidence supports proceeding.',
      inputVersion: 'sha256:one',
      modelVersion: 'risk-deterministic-v1',
      generatedAt: acceptedAt,
    });
    const signal = await RiskSignal.create({
      parentType: 'RiskAssessment',
      parentId: assessment._id,
      name: 'CLEAR_SCOPE',
      value: 0.4,
      direction: 'favorable',
      source: 'structured-data',
      label: 'Scope is specific',
      evidence: 'The JobPost includes a detailed description and named skills.',
    });

    expect(engagement.acceptedAt).toEqual(acceptedAt);
    expect(signal.label).toBe('Scope is specific');
    expect(signal.evidence).toContain('detailed description');
  });

  it('keeps complete snapshot fields optional for historical Engagement compatibility', () => {
    const historical = new Engagement({
      ...ids(),
      status: 'active',
      agreedTerms: {
        scope: 'Historical scope.',
        price: 500,
        paymentTerms: 'project',
        timeline: '7 days',
        dueAt: new Date('2026-08-20T12:00:00.000Z'),
      },
    });

    expect(historical.validateSync()).toBeUndefined();
  });

  it('stores the accepted Proposal winner on a JobPost', () => {
    const doc = new JobPost({
      ...ids(),
      title: 'Dashboard build',
      category: 'Design',
      description: 'Build a dashboard.',
      jobType: 'fixed',
      budgetOrRate: 1200,
      experienceLevel: 'intermediate',
      projectLength: 'less-than-1-month',
      acceptedProposalId: new mongoose.Types.ObjectId(),
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.acceptedProposalId).toBeInstanceOf(mongoose.Types.ObjectId);
  });
});
