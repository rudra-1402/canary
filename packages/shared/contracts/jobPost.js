import { z } from 'zod';

const jobTypeEnum = z.enum(['hourly', 'fixed']);
const experienceLevelEnum = z.enum(['entry', 'intermediate', 'expert']);
const projectLengthEnum = z.enum([
  'less-than-1-month',
  '1-to-3-months',
  '3-to-6-months',
  'more-than-6-months',
]);
const statusEnum = z.enum(['draft', 'open', 'closed']);

// GET /api/jobposts query params. Values arrive as strings, so coerce where typed; defaults
// scope browse to open work and paginate.
export const JobPostListQuerySchema = z.object({
  category: z.string().optional(),
  jobType: jobTypeEnum.optional(),
  experienceLevel: experienceLevelEnum.optional(),
  status: statusEnum.default('open'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // Defaults ON: only show job posts whose client has a real (`scored`) Trust Score
  // snapshot. A visible, user-facing filter — not a silent reorder — see FindWork's
  // "Clients with a track record" toggle.
  trackRecordOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((value) => value === undefined || value === true || value === 'true'),
});

// GET /api/jobposts/:id path param. Malformed id fails here -> 400.
export const JobPostIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId'),
});

// Public projection — the service maps the Mongoose doc to this; _id/__v never leak.
// createdAt is nullable: raw pymongo-seeded rows can bypass Mongoose timestamps.
export const JobPostSchema = z.object({
  id: z.string(),
  clientProfileId: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  skills: z.array(z.string()),
  jobType: jobTypeEnum,
  budgetOrRate: z.number(),
  experienceLevel: experienceLevelEnum,
  projectLength: projectLengthEnum,
  hoursPerWeek: z.number().optional(),
  screeningQuestions: z.array(z.string()),
  status: statusEnum,
  createdAt: z.string().datetime().nullable(),
  // Real Proposal document count for this job post. Optional: getJobPostById does not
  // compute it (only the list endpoint, where it's cheap to batch per page).
  proposalCount: z.number().int().min(0).optional(),
});

export const JobPostListResponseSchema = z.object({
  data: z.array(JobPostSchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
