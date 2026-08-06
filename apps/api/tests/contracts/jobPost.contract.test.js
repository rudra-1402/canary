import { describe, it, expect } from 'vitest';
import {
  JobPostListQuerySchema,
  JobPostIdParamSchema,
  JobPostSchema,
  JobPostListResponseSchema,
  CreateJobPostRequestSchema,
  UpdateJobPostRequestSchema,
  MyJobPostListQuerySchema,
  MyJobPostListResponseSchema,
} from '@canary/shared';

describe('JobPost contracts', () => {
  it('list query defaults status=open, page=1, pageSize=20', () => {
    const parsed = JobPostListQuerySchema.parse({});
    expect(parsed).toMatchObject({ status: 'open', page: 1, pageSize: 20 });
  });

  it('list query defaults trackRecordOnly to true', () => {
    expect(JobPostListQuerySchema.parse({}).trackRecordOnly).toBe(true);
  });

  it('list query parses trackRecordOnly=false from the querystring', () => {
    expect(JobPostListQuerySchema.parse({ trackRecordOnly: 'false' }).trackRecordOnly).toBe(false);
  });

  it('list query treats trackRecordOnly=true explicitly the same as the default', () => {
    expect(JobPostListQuerySchema.parse({ trackRecordOnly: 'true' }).trackRecordOnly).toBe(true);
  });

  it('list query coerces numeric strings and rejects pageSize over 100', () => {
    expect(JobPostListQuerySchema.parse({ page: '2', pageSize: '5' })).toMatchObject({
      page: 2,
      pageSize: 5,
    });
    expect(() => JobPostListQuerySchema.parse({ pageSize: '999' })).toThrow();
  });

  it('id param accepts a 24-hex string and rejects anything else', () => {
    expect(JobPostIdParamSchema.parse({ id: 'a'.repeat(24) })).toEqual({ id: 'a'.repeat(24) });
    expect(() => JobPostIdParamSchema.parse({ id: 'not-an-objectid' })).toThrow();
  });

  it('JobPostSchema accepts a null createdAt and a well-formed job', () => {
    const job = {
      id: 'a'.repeat(24),
      clientProfileId: 'b'.repeat(24),
      title: 'x',
      category: 'x',
      description: 'x',
      skills: ['react'],
      jobType: 'fixed',
      budgetOrRate: 100,
      experienceLevel: 'entry',
      projectLength: '1-to-3-months',
      screeningQuestions: [],
      status: 'open',
      createdAt: null,
    };
    expect(() => JobPostSchema.parse(job)).not.toThrow();
    expect(
      JobPostListResponseSchema.parse({
        data: [job],
        pagination: { page: 1, pageSize: 20, total: 1 },
      }),
    ).toBeDefined();
  });

  const writableJob = {
    title: 'Build a trustworthy marketplace',
    category: 'web-development',
    description: 'Implement the Client dashboard and proposal inbox.',
    skills: ['react', 'node'],
    jobType: 'fixed',
    budgetOrRate: 2500,
    experienceLevel: 'intermediate',
    projectLength: '1-to-3-months',
    screeningQuestions: ['How would you test ownership?'],
  };

  it('accepts create actions but rejects browser-owned client and status fields', () => {
    expect(CreateJobPostRequestSchema.parse({ ...writableJob, action: 'publish' }).action).toBe(
      'publish',
    );
    expect(() =>
      CreateJobPostRequestSchema.parse({
        ...writableJob,
        action: 'publish',
        clientProfileId: 'a'.repeat(24),
      }),
    ).toThrow();
    expect(() =>
      CreateJobPostRequestSchema.parse({ ...writableJob, action: 'publish', status: 'open' }),
    ).toThrow();
  });

  it('accepts a non-empty patch and rejects empty or oversized values', () => {
    expect(UpdateJobPostRequestSchema.parse({ title: 'Revised', action: 'publish' })).toEqual({
      title: 'Revised',
      action: 'publish',
    });
    expect(() => UpdateJobPostRequestSchema.parse({})).toThrow();
    expect(() =>
      CreateJobPostRequestSchema.parse({
        ...writableJob,
        title: 'x'.repeat(161),
        action: 'publish',
      }),
    ).toThrow();
  });

  it('parses owned JobPost filters and a strict proposal-count response', () => {
    expect(
      MyJobPostListQuerySchema.parse({ status: 'draft', page: '2', q: 'React' }),
    ).toMatchObject({ status: 'draft', page: 2, pageSize: 20, q: 'React' });
    const base = JobPostSchema.parse({
      id: 'a'.repeat(24),
      clientProfileId: 'b'.repeat(24),
      ...writableJob,
      status: 'draft',
      createdAt: null,
    });
    expect(
      MyJobPostListResponseSchema.parse({
        data: [
          {
            ...base,
            proposalCounts: {
              submitted: 2,
              shortlisted: 1,
              accepted: 0,
              declined: 0,
              withdrawn: 0,
              total: 3,
            },
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      }).data[0].proposalCounts.total,
    ).toBe(3);
  });
});
