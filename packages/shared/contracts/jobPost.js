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
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const title = z.string().trim().min(1).max(160);
const category = z.string().trim().min(1).max(100);
const description = z.string().trim().min(1).max(5000);
const skill = z.string().trim().min(1).max(80);
const screeningQuestion = z.string().trim().min(1).max(500);
const writableJobPostFields = {
  title,
  category,
  description,
  skills: z.array(skill).max(15),
  jobType: jobTypeEnum,
  budgetOrRate: z.number().positive().max(1_000_000_000),
  experienceLevel: experienceLevelEnum,
  projectLength: projectLengthEnum,
  hoursPerWeek: z.number().int().min(1).max(168).optional(),
  screeningQuestions: z.array(screeningQuestion).max(10).default([]),
};

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
  id: objectId,
});

export const CreateJobPostRequestSchema = z
  .object({
    ...writableJobPostFields,
    action: z.enum(['save_draft', 'publish']),
  })
  .strict();

export const UpdateJobPostRequestSchema = z
  .object({
    title: title.optional(),
    category: category.optional(),
    description: description.optional(),
    skills: z.array(skill).max(15).optional(),
    jobType: jobTypeEnum.optional(),
    budgetOrRate: z.number().positive().max(1_000_000_000).optional(),
    experienceLevel: experienceLevelEnum.optional(),
    projectLength: projectLengthEnum.optional(),
    hoursPerWeek: z.number().int().min(1).max(168).nullable().optional(),
    screeningQuestions: z.array(screeningQuestion).max(10).optional(),
    action: z.enum(['save_draft', 'publish', 'close']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one change is required');

export const MyJobPostListQuerySchema = z
  .object({
    status: statusEnum.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

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
  // Display name of the client (Profile.displayName) who posted this job. Optional, same
  // reason as proposalCount: only the list endpoint batches it per page, and it's absent
  // if the client Profile no longer exists.
  clientDisplayName: z.string().optional(),
});

export const JobPostListResponseSchema = z.object({
  data: z.array(JobPostSchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});

const ProposalCountsSchema = z
  .object({
    submitted: z.number().int().nonnegative(),
    shortlisted: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    withdrawn: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const MyJobPostSchema = JobPostSchema.extend({
  proposalCounts: ProposalCountsSchema,
}).strict();

export const MyJobPostListResponseSchema = z
  .object({
    data: z.array(MyJobPostSchema),
    pagination: z
      .object({
        page: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int(),
      })
      .strict(),
  })
  .strict();
