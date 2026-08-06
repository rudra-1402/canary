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

  it('enforces the authoring contract bounds', () => {
    const doc = new JobPost({
      clientProfileId,
      title: 'x'.repeat(161),
      category: 'x'.repeat(101),
      description: 'x',
      skills: Array.from({ length: 16 }, (_, index) => `skill-${index}`),
      jobType: 'hourly',
      budgetOrRate: 0,
      experienceLevel: 'entry',
      projectLength: 'less-than-1-month',
      hoursPerWeek: 169,
      screeningQuestions: Array.from({ length: 11 }, (_, index) => `Question ${index}`),
    });
    const err = doc.validateSync();
    expect(err.errors.title).toBeDefined();
    expect(err.errors.category).toBeDefined();
    expect(err.errors.skills).toBeDefined();
    expect(err.errors.budgetOrRate).toBeDefined();
    expect(err.errors.hoursPerWeek).toBeDefined();
    expect(err.errors.screeningQuestions).toBeDefined();
  });

  it('rejects whitespace-only bounded strings at persistence', () => {
    const doc = new JobPost({
      clientProfileId,
      title: '   ',
      category: '   ',
      description: '   ',
      skills: ['   '],
      jobType: 'fixed',
      budgetOrRate: 100,
      experienceLevel: 'entry',
      projectLength: '1-to-3-months',
      screeningQuestions: ['   '],
    });
    const err = doc.validateSync();
    expect(err.errors.title).toBeDefined();
    expect(err.errors.category).toBeDefined();
    expect(err.errors.description).toBeDefined();
    expect(err.errors['skills.0']).toBeDefined();
    expect(err.errors['screeningQuestions.0']).toBeDefined();
  });

  it('declares the owned dashboard index', () => {
    expect(JobPost.schema.indexes()).toContainEqual([
      { clientProfileId: 1, status: 1, createdAt: -1 },
      {},
    ]);
  });
});
