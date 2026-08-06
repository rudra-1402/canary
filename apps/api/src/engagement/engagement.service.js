import Engagement from '../models/Engagement.js';
import JobPost from '../models/JobPost.js';
import Profile from '../models/Profile.js';
import Proposal from '../models/Proposal.js';
import Review from '../models/Review.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { findRiskAssessmentSummaryForEngagement } from '../riskAssessment/riskAssessment.service.js';
import { getTrustScores } from '../trustScore/trustScore.service.js';
import { toPublicProfileContract } from '../profile/profile.service.js';
import { toCompleteTermsContract, toEngagementCommandContract } from './engagement.serializer.js';

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

function allowedActionsFor(engagement, activeProfileId, existingReview) {
  if (engagement.status === 'prospective') {
    if (String(activeProfileId) === String(engagement.clientProfileId)) {
      return ['request-risk-assessment', 'accept-proposal', 'decline-proposal'];
    }
    return ['request-risk-assessment'];
  }
  if (engagement.status === 'active' && !existingReview) return ['submit-outcome-review'];
  return [];
}

export async function getEngagementDetail(engagementId, activeProfileId, viewerIdentityId) {
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

  const [jobPost, proposal, profiles, existingReview, trustScores] = await Promise.all([
    JobPost.findById(engagement.jobPostId).select('title').lean(),
    Proposal.findById(engagement.proposalId).select('status bid').lean(),
    Profile.find({
      _id: { $in: [engagement.clientProfileId, engagement.freelancerProfileId] },
    }).lean(),
    Review.exists({ engagementId: engagement._id, authorProfileId: activeProfileId }),
    getTrustScores(partyIds, viewerIdentityId, { visibilityGrantedProfileIds: partyIds }),
  ]);
  if (!jobPost) throw new NotFoundError('JobPost', engagement.jobPostId);
  if (!proposal) throw new NotFoundError('Proposal', engagement.proposalId);
  const profilesByRole = new Map(profiles.map((profile) => [profile.role, profile]));
  const client = profilesByRole.get('client');
  const freelancer = profilesByRole.get('freelancer');
  if (!client || !freelancer)
    throw new BadRequestError('Engagement Party profiles are unavailable');
  const trustByProfileId = new Map(trustScores.map((score) => [score.profileId, score]));
  const freelancerTrust = trustByProfileId.get(String(freelancer._id));
  const clientTrust = trustByProfileId.get(String(client._id));
  if (!freelancerTrust || !clientTrust) {
    throw new BadRequestError('Engagement Party TrustScore states are unavailable');
  }
  const proposedTerms = toCompleteTermsContract(engagement.agreedTerms);
  const outcomeEligibility = engagement.status === 'active' && !existingReview;

  return {
    ...toEngagementCommandContract(engagement),
    proposedTerms,
    agreedTerms: engagement.status === 'prospective' ? null : proposedTerms,
    concludedAt: engagement.concludedAt ? engagement.concludedAt.toISOString() : null,
    jobPost: { id: jobPost._id.toString(), title: jobPost.title },
    proposal: {
      id: proposal._id.toString(),
      status: proposal.status,
      bid: proposal.bid,
    },
    parties: {
      freelancer: toPublicProfileContract(freelancer),
      client: toPublicProfileContract(client),
    },
    trustByParty: {
      freelancer: freelancerTrust,
      client: clientTrust,
    },
    riskAssessment: await findRiskAssessmentSummaryForEngagement(engagement, activeProfileId),
    outcomeEligibility,
    allowedActions: allowedActionsFor(engagement, activeProfileId, existingReview),
    timeline: timelineFor(engagement),
  };
}
