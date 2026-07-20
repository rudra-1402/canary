import JobPost from '../models/JobPost.js';
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
export function toJobPostContract(doc) {
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
  };
}

export async function listJobPosts(query) {
  const filter = buildJobPostFilter(query);
  const { page, pageSize } = query;
  const [docs, total] = await Promise.all([
    JobPost.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    JobPost.countDocuments(filter),
  ]);
  return JobPostListResponseSchema.parse({
    data: docs.map(toJobPostContract),
    pagination: { page, pageSize, total },
  });
}

export async function getJobPostById(id) {
  const doc = await JobPost.findById(id).lean();
  if (!doc) throw new NotFoundError('JobPost', id);
  return JobPostSchema.parse(toJobPostContract(doc));
}
