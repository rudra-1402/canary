import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Engagement from '../src/models/Engagement.js';
import Identity from '../src/models/Identity.js';
import JobPost from '../src/models/JobPost.js';
import Profile from '../src/models/Profile.js';
import Proposal from '../src/models/Proposal.js';
import RiskAssessment from '../src/models/RiskAssessment.js';
import { acceptProposal, declineProposal } from '../src/proposal/proposal.service.js';
import { requestProposalRiskAssessment } from '../src/riskAssessment/riskAssessment.service.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from './helpers/memoryDb.js';

describe('Proposal decision service', () => {
  beforeAll(async () => {
    await startMemoryDb();
    await Promise.all([Engagement.syncIndexes(), Proposal.syncIndexes(), RiskAssessment.syncIndexes()]);
  });
  beforeEach(clearCollections);
  afterAll(stopMemoryDb);

  async function profile(role, displayName) {
    const identity = await Identity.create({ email: `${new mongoose.Types.ObjectId()}@test.invalid` });
    return Profile.create({
      identityId: identity._id,
      role,
      origin: 'user-registered',
      displayName,
    });
  }

  async function fixture() {
    const client = await profile('client', 'Aster Labs');
    const otherClient = await profile('client', 'Other Client');
    const [freelancer, competitor] = await Promise.all([
      profile('freelancer', 'Mina'),
      profile('freelancer', 'Noah'),
    ]);
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
    const [proposal, competingProposal] = await Proposal.create([
      {
        jobPostId: jobPost._id,
        freelancerProfileId: freelancer._id,
        bid: 1100,
        payModel: 'project',
        proposedDurationDays: 14,
        status: 'submitted',
      },
      {
        jobPostId: jobPost._id,
        freelancerProfileId: competitor._id,
        bid: 1050,
        payModel: 'project',
        proposedDurationDays: 10,
        status: 'shortlisted',
      },
    ]);
    return { client, otherClient, freelancer, competitor, jobPost, proposal, competingProposal };
  }

  it('requires explicit confirmation and Client ownership', async () => {
    const data = await fixture();
    await expect(
      acceptProposal(data.proposal._id, data.client._id, { confirm: false }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      acceptProposal(data.proposal._id, data.otherClient._id, { confirm: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      acceptProposal(data.proposal._id, data.freelancer._id, { confirm: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates the assessment and activates that same prospective Engagement', async () => {
    const data = await fixture();
    const prospective = await requestProposalRiskAssessment(
      data.proposal._id,
      data.client._id,
      { recompute: false },
    );
    const result = await acceptProposal(data.proposal._id, data.client._id, { confirm: true });

    expect(String(result.engagement._id)).toBe(String(prospective.engagement._id));
    expect(String(result.riskAssessment._id)).toBe(String(prospective.riskAssessment._id));
    expect(result.engagement.status).toBe('active');
    expect(result.engagement.acceptedAt).toBeInstanceOf(Date);
    expect(result.engagement.agreedTerms.dueAt).toBeInstanceOf(Date);
    const days =
      (result.engagement.agreedTerms.dueAt - result.engagement.acceptedAt) / (24 * 60 * 60 * 1000);
    expect(days).toBe(14);
  });

  it('accepts one Proposal, declines competitors, and closes the JobPost', async () => {
    const data = await fixture();
    await acceptProposal(data.proposal._id, data.client._id, { confirm: true });

    const [winner, competitor, jobPost] = await Promise.all([
      Proposal.findById(data.proposal._id),
      Proposal.findById(data.competingProposal._id),
      JobPost.findById(data.jobPost._id),
    ]);
    expect(winner.status).toBe('accepted');
    expect(competitor.status).toBe('declined');
    expect(jobPost.status).toBe('closed');
    expect(String(jobPost.acceptedProposalId)).toBe(String(winner._id));
    expect(await Proposal.countDocuments({ jobPostId: jobPost._id, status: 'accepted' })).toBe(1);
  });

  it('returns the same accepted state when the command is retried', async () => {
    const data = await fixture();
    const first = await acceptProposal(data.proposal._id, data.client._id, { confirm: true });
    const second = await acceptProposal(data.proposal._id, data.client._id, { confirm: true });

    expect(String(second.engagement._id)).toBe(String(first.engagement._id));
    expect(String(second.riskAssessment._id)).toBe(String(first.riskAssessment._id));
    expect(second.engagement.acceptedAt).toEqual(first.engagement.acceptedAt);
  });

  it('cannot accept a competing Proposal after a winner is claimed', async () => {
    const data = await fixture();
    await acceptProposal(data.proposal._id, data.client._id, { confirm: true });
    await expect(
      acceptProposal(data.competingProposal._id, data.client._id, { confirm: true }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await Proposal.countDocuments({ jobPostId: data.jobPost._id, status: 'accepted' })).toBe(1);
  });

  it('allows only one winner under concurrent competing acceptance', async () => {
    const data = await fixture();
    const results = await Promise.allSettled([
      acceptProposal(data.proposal._id, data.client._id, { confirm: true }),
      acceptProposal(data.competingProposal._id, data.client._id, { confirm: true }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await Proposal.countDocuments({ jobPostId: data.jobPost._id, status: 'accepted' })).toBe(1);
    expect(await Engagement.countDocuments({ jobPostId: data.jobPost._id, status: 'active' })).toBe(1);
  });

  it('declines only the selected Proposal and preserves decision-support records', async () => {
    const data = await fixture();
    const assessed = await requestProposalRiskAssessment(
      data.proposal._id,
      data.client._id,
      { recompute: false },
    );
    const result = await declineProposal(data.proposal._id, data.client._id, {
      reasonCode: 'terms-not-aligned',
    });

    expect(result.status).toBe('declined');
    expect(result.declineReasonCode).toBe('terms-not-aligned');
    expect((await Proposal.findById(data.competingProposal._id)).status).toBe('shortlisted');
    expect((await JobPost.findById(data.jobPost._id)).status).toBe('open');
    expect(await Engagement.findById(assessed.engagement._id)).not.toBeNull();
    expect(await RiskAssessment.findById(assessed.riskAssessment._id)).not.toBeNull();
  });
});
