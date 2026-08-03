import { describe, it, expect } from 'vitest';
import {
  JobPostListQuerySchema,
  JobPostIdParamSchema,
  JobPostSchema,
  JobPostListResponseSchema,
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
});
