import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Proposal from '../../src/models/Proposal.js';

describe('Proposal schema', () => {
  const jobPostId = new mongoose.Types.ObjectId();
  const freelancerProfileId = new mongoose.Types.ObjectId();

  it('validates a well-formed Proposal', () => {
    const doc = new Proposal({
      jobPostId,
      freelancerProfileId,
      bid: 1200,
      payModel: 'milestone',
      proposedMilestones: [{ description: 'Design', amount: 400 }],
      proposedDurationDays: 21,
      durationEstimate: '3 weeks',
      coverLetter: 'I can do this.',
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.proposedDurationDays).toBe(21);
  });

  it('rejects a zero proposedDurationDays value', () => {
    const doc = new Proposal({
      jobPostId,
      freelancerProfileId,
      bid: 1200,
      payModel: 'project',
      proposedDurationDays: 0,
    });
    const err = doc.validateSync();
    expect(err.errors.proposedDurationDays).toBeDefined();
  });

  it('rejects a negative proposedDurationDays value', () => {
    const doc = new Proposal({
      jobPostId,
      freelancerProfileId,
      bid: 1200,
      payModel: 'project',
      proposedDurationDays: -1,
    });
    const err = doc.validateSync();
    expect(err.errors.proposedDurationDays).toBeDefined();
  });

  it('rejects a fractional proposedDurationDays value', () => {
    const doc = new Proposal({
      jobPostId,
      freelancerProfileId,
      bid: 1200,
      payModel: 'project',
      proposedDurationDays: 2.5,
    });
    const err = doc.validateSync();
    expect(err.errors.proposedDurationDays).toBeDefined();
  });

  it('keeps durationEstimate as a String', () => {
    const doc = new Proposal({
      jobPostId,
      freelancerProfileId,
      bid: 1200,
      payModel: 'project',
      proposedDurationDays: 21,
      durationEstimate: '3 weeks',
    });
    expect(doc.durationEstimate).toBe('3 weeks');
    expect(typeof doc.durationEstimate).toBe('string');
  });

  it('rejects an invalid status', () => {
    const doc = new Proposal({
      jobPostId,
      freelancerProfileId,
      bid: 100,
      payModel: 'project',
      status: 'maybe',
    });
    const err = doc.validateSync();
    expect(err.errors.status).toBeDefined();
  });

  it('declares the Client inbox index alongside the unique submission index', () => {
    expect(Proposal.schema.indexes()).toContainEqual([
      { jobPostId: 1, status: 1, createdAt: -1 },
      {},
    ]);
  });
});
