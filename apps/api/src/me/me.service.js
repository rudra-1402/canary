import Proposal from '../models/Proposal.js';
import Engagement from '../models/Engagement.js';
import JobPost from '../models/JobPost.js';
import {
  MyEngagementSchema,
  MyEngagementsResponseSchema,
  MyProposalSchema,
  MyProposalsResponseSchema,
  MyJobPostSchema,
  MyJobPostListResponseSchema,
} from '@canary/shared';

const PROPOSAL_STATUSES = ['submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn'];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMyJobPostFilter(profileId, query) {
  const filter = { clientProfileId: profileId };
  if (query.status) filter.status = query.status;
  if (query.q) {
    const pattern = escapeRegex(query.q);
    filter.$or = [
      { title: { $regex: pattern, $options: 'i' } },
      { category: { $regex: pattern, $options: 'i' } },
    ];
  }
  return filter;
}

function emptyProposalCounts() {
  return {
    submitted: 0,
    shortlisted: 0,
    accepted: 0,
    declined: 0,
    withdrawn: 0,
    total: 0,
  };
}

function toOwnedJobPostContract(doc, proposalCounts) {
  return {
    id: doc._id.toString(),
    clientProfileId: doc.clientProfileId.toString(),
    title: doc.title,
    category: doc.category,
    description: doc.description,
    skills: doc.skills ?? [],
    jobType: doc.jobType,
    budgetOrRate: doc.budgetOrRate,
    experienceLevel: doc.experienceLevel,
    projectLength: doc.projectLength,
    hoursPerWeek: doc.hoursPerWeek,
    screeningQuestions: doc.screeningQuestions ?? [],
    status: doc.status,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    proposalCounts,
  };
}

async function proposalCountsByJobPost(jobPostIds) {
  if (!jobPostIds.length) return new Map();
  const rows = await Proposal.aggregate([
    { $match: { jobPostId: { $in: jobPostIds } } },
    { $group: { _id: { jobPostId: '$jobPostId', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const byJobPost = new Map();
  for (const row of rows) {
    const id = String(row._id.jobPostId);
    const counts = byJobPost.get(id) ?? emptyProposalCounts();
    if (PROPOSAL_STATUSES.includes(row._id.status)) counts[row._id.status] = row.count;
    counts.total += row.count;
    byJobPost.set(id, counts);
  }
  return byJobPost;
}

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

export async function listMyJobPosts(profileId, query) {
  const filter = buildMyJobPostFilter(profileId, query);
  const { page, pageSize } = query;
  const [docs, total] = await Promise.all([
    JobPost.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    JobPost.countDocuments(filter),
  ]);
  const counts = await proposalCountsByJobPost(docs.map((doc) => doc._id));
  return MyJobPostListResponseSchema.parse({
    data: docs.map((doc) =>
      MyJobPostSchema.parse(
        toOwnedJobPostContract(doc, counts.get(String(doc._id)) ?? emptyProposalCounts()),
      ),
    ),
    pagination: { page, pageSize, total },
  });
}
