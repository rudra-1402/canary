import Engagement from '../models/Engagement.js';
import JobPost from '../models/JobPost.js';
import Profile from '../models/Profile.js';
import Proposal from '../models/Proposal.js';
import Review from '../models/Review.js';
import RiskAssessment from '../models/RiskAssessment.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  toEngagementCommandContract,
  toRiskAssessmentSummaryContract,
} from '../riskAssessment/riskAssessment.service.js';

function timelineFor(engagement) {
  return [
    engagement.createdAt && {
      event: 'prospective-created',
      at: engagement.createdAt.toISOString(),
    },
    engagement.acceptedAt && { event: 'accepted', at: engagement.acceptedAt.toISOString() },
    engagement.concludedAt && { event: 'concluded', at: engagement.concludedAt.toISOString() },
  ].filter(Boolean);
}

export async function getEngagementDetail(engagementId, activeProfileId) {
  const engagement = await Engagement.findById(engagementId);
  if (!engagement) throw new NotFoundError('Engagement', engagementId);
  const partyIds = [
    engagement.clientProfileId.toString(),
    engagement.freelancerProfileId.toString(),
  ];
  if (!partyIds.includes(activeProfileId.toString())) {
    throw new ForbiddenError('Only an Engagement Party may read its detail');
  }
  if (!engagement.jobPostId || !engagement.proposalId || !engagement.agreedTerms) {
    throw new BadRequestError('Engagement detail requires linked proposed terms');
  }

  const [jobPost, proposal, profiles, riskAssessment, existingReview] = await Promise.all([
    JobPost.findById(engagement.jobPostId).select('title').lean(),
    Proposal.findById(engagement.proposalId).select('status bid').lean(),
    Profile.find({
      _id: { $in: [engagement.clientProfileId, engagement.freelancerProfileId] },
    })
      .select('role displayName')
      .lean(),
    RiskAssessment.findOne({ engagementId: engagement._id }).sort({ generatedAt: -1, _id: -1 }),
    Review.exists({ engagementId: engagement._id, authorProfileId: activeProfileId }),
  ]);
  if (!jobPost) throw new NotFoundError('JobPost', engagement.jobPostId);
  if (!proposal) throw new NotFoundError('Proposal', engagement.proposalId);
  const profilesByRole = new Map(profiles.map((profile) => [profile.role, profile]));
  const client = profilesByRole.get('client');
  const freelancer = profilesByRole.get('freelancer');
  if (!client || !freelancer)
    throw new BadRequestError('Engagement Party profiles are unavailable');

  return {
    ...toEngagementCommandContract(engagement),
    jobPost: { id: jobPost._id.toString(), title: jobPost.title },
    proposal: {
      id: proposal._id.toString(),
      status: proposal.status,
      bid: proposal.bid,
    },
    parties: {
      freelancer: {
        id: freelancer._id.toString(),
        role: 'freelancer',
        displayName: freelancer.displayName,
      },
      client: {
        id: client._id.toString(),
        role: 'client',
        displayName: client.displayName,
      },
    },
    riskAssessment: riskAssessment ? await toRiskAssessmentSummaryContract(riskAssessment) : null,
    outcomeEligibility: engagement.status === 'active' && !existingReview,
    timeline: timelineFor(engagement),
  };
}
