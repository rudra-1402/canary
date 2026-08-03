import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { buildJobPostFilter, toJobPostContract } from '../../src/jobPost/jobPost.service.js';

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

describe('toJobPostContract', () => {
  const base = {
    _id: new mongoose.Types.ObjectId(),
    __v: 0,
    clientProfileId: new mongoose.Types.ObjectId(),
    title: 'Build a site',
    category: 'web-development',
    description: 'Need a site',
    skills: ['react'],
    jobType: 'fixed',
    budgetOrRate: 1500,
    experienceLevel: 'intermediate',
    projectLength: '1-to-3-months',
    screeningQuestions: [],
    status: 'open',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  };

  it('maps _id to a string id and drops __v', () => {
    const out = toJobPostContract(base);
    expect(out.id).toBe(base._id.toString());
    expect(out.clientProfileId).toBe(base.clientProfileId.toString());
    expect(out).not.toHaveProperty('__v');
    expect(out).not.toHaveProperty('_id');
  });

  it('serializes createdAt to ISO and coalesces a missing createdAt to null', () => {
    expect(toJobPostContract(base).createdAt).toBe('2026-02-01T00:00:00.000Z');
    expect(toJobPostContract({ ...base, createdAt: undefined }).createdAt).toBeNull();
  });

  it('attaches proposalCount when given a count, omits it otherwise', () => {
    expect(toJobPostContract(base, { proposalCount: 4 }).proposalCount).toBe(4);
    expect(toJobPostContract(base).proposalCount).toBeUndefined();
  });

  it('attaches clientDisplayName when given a name, omits it otherwise', () => {
    expect(toJobPostContract(base, { clientDisplayName: 'Acme Studio' }).clientDisplayName).toBe(
      'Acme Studio',
    );
    expect(toJobPostContract(base).clientDisplayName).toBeUndefined();
  });
});
