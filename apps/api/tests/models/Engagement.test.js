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
    const dueAt = new Date('2026-08-31T00:00:00.000Z');
    const doc = new Engagement({
      freelancerProfileId,
      clientProfileId,
      status: 'active',
      agreedTerms: {
        scope: 'Build a site',
        price: 1200,
        paymentTerms: 'net-30',
        timeline: '4 weeks',
        dueAt,
      },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.agreedTerms.dueAt).toBeInstanceOf(Date);
  });

  it('rejects an active Engagement missing agreedTerms', () => {
    const doc = new Engagement({ freelancerProfileId, clientProfileId, status: 'active' });
    const err = doc.validateSync();
    expect(err.errors.agreedTerms).toBeDefined();
  });

  it('rejects an active Engagement with agreedTerms lacking dueAt', () => {
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
    const err = doc.validateSync();
    expect(err.errors['agreedTerms.dueAt']).toBeDefined();
  });

  it('defaults revisionsIncluded to 0 when omitted', () => {
    const doc = new Engagement({
      freelancerProfileId,
      clientProfileId,
      status: 'active',
      agreedTerms: {
        scope: 'Build a site',
        price: 1200,
        paymentTerms: 'net-30',
        timeline: '4 weeks',
        dueAt: new Date('2026-08-31T00:00:00.000Z'),
      },
    });
    expect(doc.agreedTerms.revisionsIncluded).toBe(0);
  });

  it('rejects a negative revisionsIncluded value', () => {
    const doc = new Engagement({
      freelancerProfileId,
      clientProfileId,
      status: 'active',
      agreedTerms: {
        scope: 'Build a site',
        price: 1200,
        paymentTerms: 'net-30',
        timeline: '4 weeks',
        dueAt: new Date('2026-08-31T00:00:00.000Z'),
        revisionsIncluded: -1,
      },
    });
    const err = doc.validateSync();
    expect(err.errors['agreedTerms.revisionsIncluded']).toBeDefined();
  });

  it('rejects a fractional revisionsIncluded value', () => {
    const doc = new Engagement({
      freelancerProfileId,
      clientProfileId,
      status: 'active',
      agreedTerms: {
        scope: 'Build a site',
        price: 1200,
        paymentTerms: 'net-30',
        timeline: '4 weeks',
        dueAt: new Date('2026-08-31T00:00:00.000Z'),
        revisionsIncluded: 1.5,
      },
    });
    const err = doc.validateSync();
    expect(err.errors['agreedTerms.revisionsIncluded']).toBeDefined();
  });

  it('declares the active Freelancer lookup index', () => {
    const indexKeys = Engagement.schema.indexes().map(([keys]) => keys);
    expect(indexKeys).toContainEqual({ status: 1, freelancerProfileId: 1 });
  });
});
