import JobPost from '../models/JobPost.js';
import TrustScore from '../models/TrustScore.js';
import Proposal from '../models/Proposal.js';
import { NotFoundError } from '../lib/errors.js';
import { JobPostSchema, JobPostListResponseSchema } from '@canary/shared';

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
export function toJobPostContract(doc, { proposalCount } = {}) {
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
  const proposalCounts = await proposalCountsFor(docs.map((doc) => doc._id));
  return JobPostListResponseSchema.parse({
    data: docs.map((doc) =>
      toJobPostContract(doc, { proposalCount: proposalCounts.get(String(doc._id)) ?? 0 }),
    ),
    pagination: { page, pageSize, total },
  });
}

export async function getJobPostById(id) {
  const doc = await JobPost.findById(id).lean();
  if (!doc) throw new NotFoundError('JobPost', id);
  return JobPostSchema.parse(toJobPostContract(doc));
}
