import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import JobPost from '../../src/models/JobPost.js';

describe('JobPost schema', () => {
  const clientProfileId = new mongoose.Types.ObjectId();

  it('validates a well-formed JobPost', () => {
    const doc = new JobPost({
      clientProfileId,
      title: 'Build a landing page',
      category: 'web-development',
      description: 'Need a marketing site.',
      skills: ['react'],
      jobType: 'fixed',
      budgetOrRate: 1500,
      experienceLevel: 'intermediate',
      projectLength: '1-to-3-months',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid jobType', () => {
    const doc = new JobPost({
      clientProfileId,
      title: 'x',
      category: 'x',
      description: 'x',
      jobType: 'retainer',
      budgetOrRate: 100,
      experienceLevel: 'entry',
      projectLength: '1-to-3-months',
    });
    const err = doc.validateSync();
    expect(err.errors.jobType).toBeDefined();
  });
});
