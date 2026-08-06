import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Engagement from '../src/models/Engagement.js';
import Identity from '../src/models/Identity.js';
import JobPost from '../src/models/JobPost.js';
import Profile from '../src/models/Profile.js';
import Proposal from '../src/models/Proposal.js';
import RiskAssessment from '../src/models/RiskAssessment.js';
import RiskSignal from '../src/models/RiskSignal.js';
import TrustScore from '../src/models/TrustScore.js';
import { requestProposalRiskAssessment } from '../src/riskAssessment/riskAssessment.service.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from './helpers/memoryDb.js';

describe('RiskAssessment service', () => {
  beforeAll(async () => {
    await startMemoryDb();
    await Promise.all([
      Engagement.syncIndexes(),
      Proposal.syncIndexes(),
      RiskAssessment.syncIndexes(),
      RiskSignal.syncIndexes(),
    ]);
  });
  beforeEach(clearCollections);
  afterAll(stopMemoryDb);

  async function fixture() {
    const identity = await Identity.create({
      email: `risk-${new mongoose.Types.ObjectId()}@example.com`,
      passwordHash: 'hash',
      emailVerified: true,
    });
    const [client, freelancer, outsider] = await Profile.create([
      {
        identityId: identity._id,
        role: 'client',
        origin: 'user-registered',
        displayName: 'Aster Labs',
      },
      {
        identityId: identity._id,
        role: 'freelancer',
        origin: 'user-registered',
        displayName: 'Mina',
      },
      {
        identityId: new mongoose.Types.ObjectId(),
        role: 'client',
        origin: 'synthetic-seeded',
        displayName: 'Outsider',
      },
    ]);
    const jobPost = await JobPost.create({
      clientProfileId: client._id,
      title: 'Accessible analytics dashboard',
      category: 'Design and development',
      description:
        'Design and build an accessible analytics dashboard with five approved views, responsive behavior, documented empty states, and a final handoff.',
      skills: ['Figma', 'React', 'Accessibility'],
      jobType: 'fixed',
      budgetOrRate: 1200,
      experienceLevel: 'intermediate',
      projectLength: 'less-than-1-month',
      screeningQuestions: ['Share one comparable dashboard project.'],
      status: 'open',
    });
    const proposal = await Proposal.create({
      jobPostId: jobPost._id,
      freelancerProfileId: freelancer._id,
      bid: 1150,
      payModel: 'project',
      proposedDurationDays: 14,
      durationEstimate: '14 days',
      screeningAnswers: ['A comparable dashboard is in my portfolio.'],
      status: 'submitted',
    });
    await TrustScore.create([
      {
        profileId: client._id,
        status: 'scored',
        score: 88,
        level: 'high',
        generatedAt: new Date('2026-08-05T00:00:00.000Z'),
      },
      {
        profileId: freelancer._id,
        status: 'scored',
        score: 92,
        level: 'high',
        generatedAt: new Date('2026-08-05T00:00:00.000Z'),
      },
    ]);
    return { client, freelancer, outsider, jobPost, proposal };
  }

  it.each(['client', 'freelancer'])(
    'allows the %s Party and persists structured results',
    async (party) => {
      const data = await fixture();
      const result = await requestProposalRiskAssessment(data.proposal._id, data[party]._id, {
        recompute: false,
      });

      expect(result.engagement.status).toBe('prospective');
      expect(String(result.engagement.proposalId)).toBe(String(data.proposal._id));
      expect(result.engagement.agreedTerms).toMatchObject({
        scope: data.jobPost.description,
        price: data.proposal.bid,
        paymentTerms: data.proposal.payModel,
        timeline: '14 days',
      });
      expect(result.riskAssessment.modelVersion).toBe('risk-deterministic-v1');
      expect(result.riskAssessment.score).toBeLessThanOrEqual(34);
      const signals = await RiskSignal.find({ parentId: result.riskAssessment._id }).lean();
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((signal) => signal.source === 'structured-data')).toBe(true);
      expect(signals.map((signal) => signal.name)).toContain('CLEAR_SCOPE');
    },
  );

  it('forbids a Profile outside the Proposal Parties', async () => {
    const data = await fixture();
    await expect(
      requestProposalRiskAssessment(data.proposal._id, data.outsider._id, { recompute: false }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a Proposal with missing linked data', async () => {
    const data = await fixture();
    await JobPost.deleteOne({ _id: data.jobPost._id });
    await expect(
      requestProposalRiskAssessment(data.proposal._id, data.client._id, { recompute: false }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reuses the same Engagement and assessment for unchanged inputs', async () => {
    const data = await fixture();
    const first = await requestProposalRiskAssessment(data.proposal._id, data.client._id, {
      recompute: false,
    });
    const second = await requestProposalRiskAssessment(data.proposal._id, data.client._id, {
      recompute: true,
    });

    expect(String(second.engagement._id)).toBe(String(first.engagement._id));
    expect(String(second.riskAssessment._id)).toBe(String(first.riskAssessment._id));
    expect(await Engagement.countDocuments({ proposalId: data.proposal._id })).toBe(1);
    expect(await RiskAssessment.countDocuments({ engagementId: first.engagement._id })).toBe(1);
  });

  it('keeps the current assessment until an authorized changed-input recompute', async () => {
    const data = await fixture();
    const first = await requestProposalRiskAssessment(data.proposal._id, data.client._id, {
      recompute: false,
    });
    await Proposal.updateOne({ _id: data.proposal._id }, { $set: { bid: 1800 } });

    const stale = await requestProposalRiskAssessment(data.proposal._id, data.client._id, {
      recompute: false,
    });
    const recomputed = await requestProposalRiskAssessment(data.proposal._id, data.client._id, {
      recompute: true,
    });

    expect(String(stale.riskAssessment._id)).toBe(String(first.riskAssessment._id));
    expect(String(recomputed.riskAssessment._id)).not.toBe(String(first.riskAssessment._id));
    expect(recomputed.riskAssessment.inputVersion).not.toBe(first.riskAssessment.inputVersion);
    expect(recomputed.engagement.agreedTerms.price).toBe(1800);
  });

  it('survives concurrent identical requests without duplicate parent records or signals', async () => {
    const data = await fixture();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        requestProposalRiskAssessment(data.proposal._id, data.client._id, { recompute: false }),
      ),
    );
    const engagementId = results[0].engagement._id;
    const assessmentId = results[0].riskAssessment._id;

    expect(new Set(results.map((result) => String(result.engagement._id))).size).toBe(1);
    expect(new Set(results.map((result) => String(result.riskAssessment._id))).size).toBe(1);
    expect(await Engagement.countDocuments({ proposalId: data.proposal._id })).toBe(1);
    expect(await RiskAssessment.countDocuments({ engagementId })).toBe(1);
    const signals = await RiskSignal.find({ parentId: assessmentId }).lean();
    expect(new Set(signals.map((signal) => signal.name)).size).toBe(signals.length);
  });
});
