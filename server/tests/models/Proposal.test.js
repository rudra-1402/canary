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
      durationEstimate: '3 weeks',
      coverLetter: 'I can do this.',
    });
    expect(doc.validateSync()).toBeUndefined();
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
});
