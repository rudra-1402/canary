import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Engagement from '../../src/models/Engagement.js';

describe('Engagement schema', () => {
  const freelancerProfileId = new mongoose.Types.ObjectId();
  const clientProfileId = new mongoose.Types.ObjectId();

  it('validates a prospective Engagement with no agreedTerms yet', () => {
    const doc = new Engagement({ freelancerProfileId, clientProfileId, status: 'prospective' });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('validates an active Engagement with agreedTerms', () => {
    const doc = new Engagement({
      freelancerProfileId,
      clientProfileId,
      status: 'active',
      agreedTerms: {
        scope: 'Build a site',
        price: 1200,
        paymentTerms: 'net-30',
        timeline: '4 weeks',
      },
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an active Engagement missing agreedTerms', () => {
    const doc = new Engagement({ freelancerProfileId, clientProfileId, status: 'active' });
    const err = doc.validateSync();
    expect(err.errors.agreedTerms).toBeDefined();
  });
});
