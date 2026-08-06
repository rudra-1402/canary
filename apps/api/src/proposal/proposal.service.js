import mongoose from 'mongoose';
import Engagement from '../models/Engagement.js';
import Proposal from '../models/Proposal.js';
import JobPost from '../models/JobPost.js';
import RiskAssessment from '../models/RiskAssessment.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  ensureCurrentProposalRiskAssessmentForAcceptance,
  findRiskAssessmentForEngagement,
  requestProposalRiskAssessment,
  toRiskAssessmentSummaryContract,
} from '../riskAssessment/riskAssessment.service.js';
import { toEngagementCommandContract } from '../engagement/engagement.serializer.js';

export async function createProposal(input, freelancerProfileId) {
  const jobPost = await JobPost.findById(input.jobPostId);
  if (!jobPost) throw new NotFoundError('JobPost', input.jobPostId);
  if (jobPost.status !== 'open') throw new BadRequestError('Proposals require an open JobPost');
  if (String(jobPost.clientProfileId) === String(freelancerProfileId)) {
    throw new ForbiddenError('Cannot submit a Proposal to your own JobPost');
  }

  try {
    return await Proposal.create({ ...input, freelancerProfileId, status: 'submitted' });
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('A Proposal already exists for this JobPost and freelancer');
    }
    throw error;
  }
}

async function decisionContext(proposalId, clientProfileId) {
  const proposal = await Proposal.findById(proposalId);
  if (!proposal) throw new NotFoundError('Proposal', proposalId);
  const jobPost = await JobPost.findById(proposal.jobPostId);
  if (!jobPost) throw new NotFoundError('JobPost', proposal.jobPostId);
  if (String(jobPost.clientProfileId) !== String(clientProfileId)) {
    throw new ForbiddenError('Only the owning Client may decide this Proposal');
  }
  return { proposal, jobPost };
}

async function existingAcceptanceAssessment(proposal, activeProfileId) {
  const engagement = await Engagement.findOne({ proposalId: proposal._id });
  if (!engagement) throw new BadRequestError('Accepted Proposal has no Engagement');
  if (engagement.status === 'prospective') {
    return ensureCurrentProposalRiskAssessmentForAcceptance(proposal._id, activeProfileId);
  }
  const assessment = await findRiskAssessmentForEngagement(engagement, activeProfileId);
  if (!assessment) throw new BadRequestError('Accepted Proposal has no RiskAssessment');
  return {
    engagement,
    riskAssessment: assessment.assessment,
    riskAssessmentStatus: assessment.status,
  };
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function completeAcceptance(
  proposalId,
  clientProfileId,
  riskAssessmentId,
  acceptedAt,
  session,
) {
  const proposal = await withSession(Proposal.findById(proposalId), session);
  if (!proposal) throw new NotFoundError('Proposal', proposalId);
  const jobPost = await withSession(JobPost.findById(proposal.jobPostId), session);
  if (!jobPost) throw new NotFoundError('JobPost', proposal.jobPostId);
  if (String(jobPost.clientProfileId) !== String(clientProfileId)) {
    throw new ForbiddenError('Only the owning Client may accept this Proposal');
  }
  if (!['submitted', 'shortlisted', 'accepted'].includes(proposal.status)) {
    throw new BadRequestError('Only a submitted Proposal may be accepted');
  }

  const winnerClaim = await JobPost.findOneAndUpdate(
    {
      _id: jobPost._id,
      clientProfileId,
      $or: [{ status: 'open', acceptedProposalId: null }, { acceptedProposalId: proposal._id }],
    },
    { $set: { status: 'closed', acceptedProposalId: proposal._id } },
    { returnDocument: 'after', session },
  );
  if (!winnerClaim) {
    throw new BadRequestError('This JobPost already has a different accepted Proposal');
  }

  let engagement = await withSession(Engagement.findOne({ proposalId: proposal._id }), session);
  if (!engagement) throw new BadRequestError('Proposal has no prospective Engagement');
  if (engagement.status === 'prospective') {
    const activationAt = engagement.acceptedAt ?? acceptedAt;
    const dueAt =
      engagement.agreedTerms.dueAt ??
      new Date(activationAt.getTime() + proposal.proposedDurationDays * 86_400_000);
    engagement =
      (await Engagement.findOneAndUpdate(
        { _id: engagement._id, status: 'prospective' },
        { $set: { status: 'active', acceptedAt: activationAt, 'agreedTerms.dueAt': dueAt } },
        { returnDocument: 'after', session },
      )) ?? (await withSession(Engagement.findById(engagement._id), session));
  }
  if (engagement.status === 'active' && (!engagement.acceptedAt || !engagement.agreedTerms.dueAt)) {
    const activationAt = engagement.acceptedAt ?? acceptedAt;
    const dueAt =
      engagement.agreedTerms.dueAt ??
      new Date(activationAt.getTime() + proposal.proposedDurationDays * 86_400_000);
    engagement =
      (await Engagement.findOneAndUpdate(
        {
          _id: engagement._id,
          status: 'active',
          acceptedAt: engagement.acceptedAt ?? null,
          'agreedTerms.dueAt': engagement.agreedTerms.dueAt ?? null,
        },
        { $set: { acceptedAt: activationAt, 'agreedTerms.dueAt': dueAt } },
        { returnDocument: 'after', session },
      )) ?? (await withSession(Engagement.findById(engagement._id), session));
  }
  if (engagement.status !== 'active') {
    throw new BadRequestError('Only a prospective Engagement may be activated');
  }

  proposal.status = 'accepted';
  proposal.declineReasonCode = null;
  await proposal.save({ session });
  await Proposal.updateMany(
    {
      jobPostId: proposal.jobPostId,
      _id: { $ne: proposal._id },
      status: { $in: ['submitted', 'shortlisted'] },
    },
    { $set: { status: 'declined', declineReasonCode: null } },
    { session },
  );
  const riskAssessment = await withSession(
    RiskAssessment.findOne({ _id: riskAssessmentId, engagementId: engagement._id }),
    session,
  );
  if (!riskAssessment) throw new BadRequestError('Proposal has no RiskAssessment');
  return { proposal, engagement, riskAssessment };
}

function transactionUnsupported(error) {
  return (
    [20, 263].includes(error?.code) ||
    /Transaction numbers are only allowed|does not support transactions/i.test(error?.message ?? '')
  );
}

async function transactionFirst(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!transactionUnsupported(error)) throw error;
    return work(null);
  } finally {
    await session.endSession();
  }
}

export async function acceptProposal(proposalId, clientProfileId, { confirm } = {}) {
  if (confirm !== true) throw new BadRequestError('Explicit acceptance confirmation is required');
  const { proposal } = await decisionContext(proposalId, clientProfileId);
  if (!['submitted', 'shortlisted', 'accepted'].includes(proposal.status)) {
    throw new BadRequestError('Only a submitted Proposal may be accepted');
  }

  const assessment =
    proposal.status === 'accepted'
      ? await existingAcceptanceAssessment(proposal, clientProfileId)
      : await requestProposalRiskAssessment(proposalId, clientProfileId, { recompute: true });
  if (assessment.riskAssessmentStatus !== 'current') {
    throw new BadRequestError('Proposal acceptance requires a current RiskAssessment');
  }
  const acceptedAt = new Date();
  return transactionFirst((session) =>
    completeAcceptance(
      proposalId,
      clientProfileId,
      assessment.riskAssessment._id,
      acceptedAt,
      session,
    ),
  );
}

export async function toProposalDecisionContract(result) {
  return {
    proposal: { id: result.proposal._id.toString(), status: result.proposal.status },
    engagement: toEngagementCommandContract(result.engagement),
    riskAssessment: await toRiskAssessmentSummaryContract(result.riskAssessment, 'current'),
  };
}

export async function acceptProposalCommand(proposalId, clientProfileId, input) {
  return toProposalDecisionContract(await acceptProposal(proposalId, clientProfileId, input));
}

export async function declineProposal(proposalId, clientProfileId, { reasonCode } = {}) {
  const { proposal } = await decisionContext(proposalId, clientProfileId);
  if (proposal.status === 'declined') return proposal;
  if (!['submitted', 'shortlisted'].includes(proposal.status)) {
    throw new BadRequestError('Only a submitted Proposal may be declined');
  }
  const declined = await Proposal.findOneAndUpdate(
    { _id: proposal._id, status: { $in: ['submitted', 'shortlisted'] } },
    { $set: { status: 'declined', declineReasonCode: reasonCode ?? null } },
    { returnDocument: 'after', runValidators: true },
  );
  if (declined) return declined;
  const current = await Proposal.findById(proposal._id);
  if (current?.status === 'declined') return current;
  throw new BadRequestError('Proposal can no longer be declined');
}
