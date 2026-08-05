import Proposal from '../models/Proposal.js';
import Engagement from '../models/Engagement.js';
import {
  MyEngagementSchema,
  MyEngagementsResponseSchema,
  MyProposalSchema,
  MyProposalsResponseSchema,
} from '@canary/shared';

export function toMyProposalContract(doc) {
  const jobPost = doc.jobPostId;
  if (!jobPost || !jobPost._id) throw new Error('Proposal JobPost is unavailable');
  return {
    id: doc._id.toString(),
    bid: doc.bid,
    payModel: doc.payModel,
    proposedMilestones: doc.proposedMilestones ?? [],
    durationEstimate: doc.durationEstimate,
    proposedDurationDays: doc.proposedDurationDays,
    coverLetter: doc.coverLetter,
    screeningAnswers: doc.screeningAnswers ?? [],
    status: doc.status,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    jobPost: {
      id: jobPost._id.toString(),
      title: jobPost.title,
      status: jobPost.status,
    },
  };
}

function toAgreedTermsContract(agreedTerms) {
  if (!agreedTerms) return null;
  return {
    scope: agreedTerms.scope,
    price: agreedTerms.price,
    paymentTerms: agreedTerms.paymentTerms,
    timeline: agreedTerms.timeline,
    dueAt: agreedTerms.dueAt ? new Date(agreedTerms.dueAt).toISOString() : undefined,
    revisionsIncluded: agreedTerms.revisionsIncluded ?? 0,
  };
}

export function toMyEngagementContract(doc, activeProfileId) {
  const isFreelancer = String(doc.freelancerProfileId) === String(activeProfileId);
  return {
    id: doc._id.toString(),
    counterpartyProfileId: (isFreelancer
      ? doc.clientProfileId
      : doc.freelancerProfileId
    ).toString(),
    jobPostId: doc.jobPostId ? doc.jobPostId.toString() : null,
    proposalId: doc.proposalId ? doc.proposalId.toString() : null,
    status: doc.status,
    agreedTerms: toAgreedTermsContract(doc.agreedTerms),
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export async function listMyProposals(profileId) {
  const docs = await Proposal.find({ freelancerProfileId: profileId })
    .sort({ createdAt: -1, _id: -1 })
    .populate({ path: 'jobPostId', select: 'title status' })
    .lean();
  return MyProposalsResponseSchema.parse({
    data: docs.map((doc) => MyProposalSchema.parse(toMyProposalContract(doc))),
  });
}

export async function listMyEngagements(profileId) {
  const docs = await Engagement.find({
    $or: [{ freelancerProfileId: profileId }, { clientProfileId: profileId }],
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return MyEngagementsResponseSchema.parse({
    data: docs.map((doc) => MyEngagementSchema.parse(toMyEngagementContract(doc, profileId))),
  });
}
