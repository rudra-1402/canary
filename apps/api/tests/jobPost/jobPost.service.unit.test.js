import { describe, it, expect } from 'vitest';
import { buildJobPostFilter } from '../../src/jobPost/jobPost.service.js';

describe('buildJobPostFilter', () => {
  it('always filters by the parsed status', () => {
    expect(buildJobPostFilter({ status: 'open' })).toEqual({ status: 'open' });
  });

  it('adds optional fields only when present', () => {
    const filter = buildJobPostFilter({
      status: 'open',
      category: 'web-development',
      jobType: 'fixed',
      experienceLevel: 'expert',
    });
    expect(filter).toEqual({
      status: 'open',
      category: 'web-development',
      jobType: 'fixed',
      experienceLevel: 'expert',
    });
  });
});
