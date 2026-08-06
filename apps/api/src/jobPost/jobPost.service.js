import JobPost from '../models/JobPost.js';
import TrustScore from '../models/TrustScore.js';
import Proposal from '../models/Proposal.js';
import Profile from '../models/Profile.js';
import Engagement from '../models/Engagement.js';
import { toPublicProfileContract } from '../profile/profile.service.js';
import { getTrustScores } from '../trustScore/trustScore.service.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { findRiskAssessmentSummariesForEngagements } from '../riskAssessment/riskAssessment.service.js';
import {
  JobPostSchema,
  JobPostListResponseSchema,
  JobPostProposalSchema,
  JobPostProposalListResponseSchema,
} from '@canary/shared';

// Build the Mongo filter from an already-parsed query (status always present via the default).
export function buildJobPostFilter(query) {
  const filter = { status: query.status };
  if (query.category) filter.category = query.category;
  if (query.jobType) filter.jobType = query.jobType;
  if (query.experienceLevel) filter.experienceLevel = query.experienceLevel;
  return filter;
}

// Map a lean Mongoose doc to the public shape; _id/__v never leak. createdAt is null when
// absent (seeded-data guard).
export function toJobPostContract(doc, { proposalCount, clientDisplayName } = {}) {
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
    ...(proposalCount === undefined ? {} : { proposalCount }),
    ...(clientDisplayName === undefined ? {} : { clientDisplayName }),
  };
}

// Real Proposal counts for exactly this page of job posts (cheap: bounded by pageSize).
async function proposalCountsFor(jobPostIds) {
  if (jobPostIds.length === 0) return new Map();
  const rows = await Proposal.aggregate([
    { $match: { jobPostId: { $in: jobPostIds } } },
    { $group: { _id: '$jobPostId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

// Display names for exactly this page's distinct clients (bounded by pageSize, not the
// whole `profiles` collection). A client whose Profile has since been deleted is simply
// absent from the returned Map — toJobPostContract omits clientDisplayName for that row.
async function clientDisplayNamesFor(clientProfileIds) {
  if (clientProfileIds.length === 0) return new Map();
  const uniqueIds = [...new Set(clientProfileIds.map((id) => String(id)))];
  const profiles = await Profile.find({ _id: { $in: uniqueIds } }, { displayName: 1 }).lean();
  return new Map(profiles.map((profile) => [String(profile._id), profile.displayName]));
}

// Of the clients posting under `filter`, which have a real Trust Score (latest
// TrustScore snapshot has status "scored")? A client with no snapshot at all, or
// whose latest snapshot is "insufficient-history", is excluded.
async function scoredClientProfileIds(filter) {
  const clientProfileIds = await JobPost.distinct('clientProfileId', filter);
  if (clientProfileIds.length === 0) return [];
  const rows = await TrustScore.aggregate([
    { $match: { profileId: { $in: clientProfileIds } } },
    { $sort: { generatedAt: -1, _id: -1 } },
    { $group: { _id: '$profileId', status: { $first: '$status' } } },
    { $match: { status: 'scored' } },
  ]);
  return rows.map((row) => row._id);
}

export async function listJobPosts(query) {
  const filter = buildJobPostFilter(query);
  if (query.trackRecordOnly) {
    filter.clientProfileId = { $in: await scoredClientProfileIds(filter) };
  }
  const { page, pageSize } = query;
  const [docs, total] = await Promise.all([
    JobPost.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    JobPost.countDocuments(filter),
  ]);
  const [proposalCounts, clientDisplayNames] = await Promise.all([
    proposalCountsFor(docs.map((doc) => doc._id)),
    clientDisplayNamesFor(docs.map((doc) => doc.clientProfileId)),
  ]);
  return JobPostListResponseSchema.parse({
    data: docs.map((doc) =>
      toJobPostContract(doc, {
        proposalCount: proposalCounts.get(String(doc._id)) ?? 0,
        clientDisplayName: clientDisplayNames.get(String(doc.clientProfileId)),
      }),
    ),
    pagination: { page, pageSize, total },
  });
}

export async function getJobPostById(id) {
  const doc = await JobPost.findById(id).lean();
  if (!doc) throw new NotFoundError('JobPost', id);
  const proposalCount = await Proposal.countDocuments({ jobPostId: doc._id });
  return JobPostSchema.parse(toJobPostContract(doc, { proposalCount }));
}

export async function createJobPost(input, clientProfileId) {
  const { action, ...fields } = input;
  const doc = await JobPost.create({
    ...fields,
    clientProfileId,
    status: action === 'publish' ? 'open' : 'draft',
  });
  return JobPostSchema.parse(toJobPostContract(doc));
}

function nextStatus(currentStatus, action) {
  if (currentStatus === 'closed') throw new BadRequestError('Closed JobPosts are immutable');
  if (!action) return currentStatus;
  if (currentStatus === 'draft') {
    if (action === 'save_draft') return 'draft';
    if (action === 'publish') return 'open';
    throw new BadRequestError('A draft JobPost cannot be closed');
  }
  if (action === 'close') return 'closed';
  throw new BadRequestError('An open JobPost can only be edited or closed');
}

export async function updateOwnedJobPost(id, clientProfileId, input) {
  const doc = await JobPost.findById(id);
  if (!doc) throw new NotFoundError('JobPost', id);
  if (String(doc.clientProfileId) !== String(clientProfileId)) {
    throw new ForbiddenError('Only the owning Client may update this JobPost');
  }

  const { action, ...fields } = input;
  const status = nextStatus(doc.status, action);
  for (const [key, value] of Object.entries(fields)) {
    doc[key] = value === null ? undefined : value;
  }
  doc.status = status;
  await doc.save();
  return JobPostSchema.parse(toJobPostContract(doc));
}

function proposalInboxSort(sort) {
  if (sort === 'bid_low') return { bid: 1, _id: -1 };
  if (sort === 'bid_high') return { bid: -1, _id: -1 };
  return { createdAt: -1, _id: -1 };
}

function toJobPostProposalContract(doc, freelancer, trustScore, engagement, riskAssessment) {
  return {
    id: doc._id.toString(),
    jobPostId: doc.jobPostId.toString(),
    bid: doc.bid,
    payModel: doc.payModel,
    proposedMilestones: doc.proposedMilestones ?? [],
    durationEstimate: doc.durationEstimate,
    proposedDurationDays: doc.proposedDurationDays,
    coverLetter: doc.coverLetter,
    screeningAnswers: doc.screeningAnswers ?? [],
    status: doc.status,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    freelancer: toPublicProfileContract(freelancer),
    trustScore,
    prospectiveEngagementId: engagement ? String(engagement._id) : null,
    riskAssessment: riskAssessment ?? null,
  };
}

export async function listOwnedJobPostProposals(id, clientProfileId, query, viewerIdentityId) {
  const jobPost = await JobPost.findById(id).lean();
  if (!jobPost) throw new NotFoundError('JobPost', id);
  if (String(jobPost.clientProfileId) !== String(clientProfileId)) {
    throw new ForbiddenError('Only the owning Client may read this proposal inbox');
  }

  const filter = { jobPostId: jobPost._id };
  if (query.status) filter.status = query.status;
  const { page, pageSize } = query;
  const [docs, total] = await Promise.all([
    Proposal.find(filter)
      .sort(proposalInboxSort(query.sort))
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Proposal.countDocuments(filter),
  ]);

  const profileIds = [...new Set(docs.map((doc) => String(doc.freelancerProfileId)))];
  const [profiles, trustScores, engagements] = await Promise.all([
    Profile.find({ _id: { $in: profileIds }, role: 'freelancer' }).lean(),
    getTrustScores(profileIds, viewerIdentityId, { visibilityGrantedProfileIds: profileIds }),
    Engagement.find({
      proposalId: { $in: docs.map((doc) => doc._id) },
      status: 'prospective',
    }).lean(),
  ]);
  const profilesById = new Map(profiles.map((profile) => [String(profile._id), profile]));
  const trustScoresById = new Map(trustScores.map((score) => [score.profileId, score]));
  const engagementsByProposal = new Map(
    engagements.map((engagement) => [String(engagement.proposalId), engagement]),
  );
  const riskAssessmentsByEngagement = await findRiskAssessmentSummariesForEngagements(
    engagements,
    clientProfileId,
    viewerIdentityId,
  );

  return JobPostProposalListResponseSchema.parse({
    data: docs.map((doc) => {
      const profileId = String(doc.freelancerProfileId);
      const freelancer = profilesById.get(profileId);
      const trustScore = trustScoresById.get(profileId);
      if (!freelancer || !trustScore || trustScore.status === 'not-found') {
        throw new Error('Proposal applicant data is unavailable');
      }
      const engagement = engagementsByProposal.get(String(doc._id));
      return JobPostProposalSchema.parse(
        toJobPostProposalContract(
          doc,
          freelancer,
          trustScore,
          engagement,
          engagement ? riskAssessmentsByEngagement.get(String(engagement._id)) : null,
        ),
      );
    }),
    pagination: { page, pageSize, total },
  });
}
