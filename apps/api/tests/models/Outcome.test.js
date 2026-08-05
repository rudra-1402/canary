import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Outcome from '../../src/models/Outcome.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

const objectId = () => new mongoose.Types.ObjectId();

function outcome(overrides = {}) {
  return {
    engagementId: objectId(),
    subjectProfileId: objectId(),
    counterpartyProfileId: objectId(),
    subjectRole: 'freelancer',
    observed: true,
    deliveredAt: new Date('2026-01-01T00:00:00.000Z'),
    daysLate: -2,
    paidInFull: null,
    revisionsRequested: null,
    scopeCreepOccurred: null,
    ghosted: false,
    endedAs: 'completed',
    labelSource: 'synthetic',
    ...overrides,
  };
}

beforeAll(async () => {
  await startMemoryDb();
  await Outcome.init();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('Outcome schema', () => {
  it('validates a well-formed Outcome', () => {
    const doc = new Outcome(outcome());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid endedAs', () => {
    const doc = new Outcome(outcome({ endedAs: 'unknown' }));
    const err = doc.validateSync();
    expect(err.errors.endedAs).toBeDefined();
  });

  it('accepts counterparty-reported label source', () => {
    const doc = new Outcome(outcome({ labelSource: 'counterparty-reported' }));
    expect(doc.validateSync()).toBeUndefined();
  });

  it('allows different parties to save Outcomes for the same Engagement', async () => {
    const engagementId = objectId();
    await Outcome.create(outcome({ engagementId, subjectProfileId: objectId() }));
    await expect(
      Outcome.create(outcome({ engagementId, subjectProfileId: objectId() })),
    ).resolves.toBeDefined();
  });

  it('rejects a duplicate Outcome for the same Engagement and subject with a duplicate-key error', async () => {
    const engagementId = objectId();
    const subjectProfileId = objectId();
    await Outcome.create(outcome({ engagementId, subjectProfileId }));
    await expect(Outcome.create(outcome({ engagementId, subjectProfileId }))).rejects.toMatchObject(
      {
        code: 11000,
      },
    );
  });

  it.each(['subjectProfileId', 'counterpartyProfileId', 'subjectRole', 'observed'])(
    'requires %s',
    (field) => {
      const value = outcome();
      delete value[field];
      const err = new Outcome(value).validateSync();
      expect(err.errors[field]).toBeDefined();
    },
  );

  it('rejects a subjectRole outside the allowed enum', () => {
    const err = new Outcome(outcome({ subjectRole: 'agency' })).validateSync();
    expect(err.errors.subjectRole).toBeDefined();
  });

  it('accepts a negative daysLate value for early delivery', () => {
    const doc = new Outcome(outcome({ daysLate: -3 }));
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.daysLate).toBe(-3);
  });

  it('accepts null paidInFull for a freelancer Outcome', () => {
    const doc = new Outcome(outcome({ paidInFull: null }));
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.paidInFull).toBeNull();
  });

  it.each([
    ['freelancer delivery row with payment conduct', outcome({ paidInFull: true }), 'paidInFull'],
    [
      'client payment row with delivery conduct',
      outcome({ subjectRole: 'client', deliveredAt: new Date(), daysLate: 0 }),
      'deliveredAt',
    ],
    ['unobserved row with delivery conduct', outcome({ observed: false, daysLate: 0 }), 'daysLate'],
    [
      'self-ghosted freelancer row with delivery conduct',
      outcome({ ghosted: true, endedAs: 'ghosted', daysLate: 0 }),
      'daysLate',
    ],
    [
      'self-ghosted client row with payment conduct',
      outcome({
        subjectRole: 'client',
        ghosted: true,
        endedAs: 'ghosted',
        deliveredAt: null,
        daysLate: null,
        paidInFull: true,
        revisionsRequested: null,
        scopeCreepOccurred: null,
      }),
      'paidInFull',
    ],
  ])('rejects a %s', (_description, value, field) => {
    const err = new Outcome(value).validateSync();
    expect(err.errors[field]).toBeDefined();
  });

  it.each([
    [
      'freelancer',
      outcome({
        subjectRole: 'freelancer',
        observed: true,
        deliveredAt: new Date('2026-01-01T00:00:00.000Z'),
        daysLate: -2,
        paidInFull: null,
        revisionsRequested: null,
        scopeCreepOccurred: null,
      }),
    ],
    [
      'client',
      outcome({
        subjectRole: 'client',
        observed: true,
        deliveredAt: null,
        daysLate: null,
        paidInFull: true,
        revisionsRequested: 2,
        scopeCreepOccurred: false,
      }),
    ],
    [
      'unobserved',
      outcome({
        observed: false,
        deliveredAt: null,
        daysLate: null,
        paidInFull: null,
        revisionsRequested: null,
        scopeCreepOccurred: null,
      }),
    ],
    [
      'both-ghost',
      outcome({
        observed: true,
        ghosted: true,
        endedAs: 'ghosted',
        deliveredAt: null,
        daysLate: null,
        paidInFull: null,
        revisionsRequested: null,
        scopeCreepOccurred: null,
      }),
    ],
  ])('preserves explicit null conduct fields for a %s row', (_kind, value) => {
    const doc = new Outcome(value);
    expect(doc.validateSync()).toBeUndefined();
    expect({
      deliveredAt: doc.deliveredAt,
      daysLate: doc.daysLate,
      paidInFull: doc.paidInFull,
      revisionsRequested: doc.revisionsRequested,
      scopeCreepOccurred: doc.scopeCreepOccurred,
    }).toEqual({
      deliveredAt: value.deliveredAt,
      daysLate: value.daysLate,
      paidInFull: value.paidInFull,
      revisionsRequested: value.revisionsRequested,
      scopeCreepOccurred: value.scopeCreepOccurred,
    });
  });

  it('distinguishes counterparty-ghosted from self-ghosted rows', () => {
    const counterpartyGhosted = new Outcome(
      outcome({
        observed: false,
        ghosted: false,
        endedAs: 'ghosted',
        deliveredAt: null,
        daysLate: null,
        paidInFull: null,
        revisionsRequested: null,
        scopeCreepOccurred: null,
      }),
    );
    const selfGhosted = new Outcome(
      outcome({
        observed: true,
        ghosted: true,
        endedAs: 'ghosted',
        deliveredAt: null,
        daysLate: null,
        paidInFull: null,
        revisionsRequested: null,
        scopeCreepOccurred: null,
      }),
    );

    expect(counterpartyGhosted.validateSync()).toBeUndefined();
    expect(selfGhosted.validateSync()).toBeUndefined();
    expect(counterpartyGhosted).toMatchObject({ observed: false, ghosted: false });
    expect(selfGhosted).toMatchObject({ observed: true, ghosted: true });
  });

  it('does not default role-inapplicable or unobserved conduct fields', () => {
    const { deliveredAt, daysLate, paidInFull, revisionsRequested, scopeCreepOccurred, ...base } =
      outcome();
    const doc = new Outcome(base);
    expect(doc.validateSync()).toBeUndefined();
    expect({
      deliveredAt: doc.deliveredAt,
      daysLate: doc.daysLate,
      paidInFull: doc.paidInFull,
      revisionsRequested: doc.revisionsRequested,
      scopeCreepOccurred: doc.scopeCreepOccurred,
    }).toEqual({
      deliveredAt: undefined,
      daysLate: undefined,
      paidInFull: undefined,
      revisionsRequested: undefined,
      scopeCreepOccurred: undefined,
    });
  });
});
