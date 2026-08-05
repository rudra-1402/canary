import { describe, it, expect } from 'vitest';
import { CreateOutcomeReviewRequestSchema, OutcomeSchema } from '@canary/shared';

const objectId = (character) => character.repeat(24);

function outcome(overrides = {}) {
  return {
    engagementId: objectId('a'),
    subjectProfileId: objectId('b'),
    counterpartyProfileId: objectId('c'),
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

describe('Outcome contracts', () => {
  it.each(['subjectProfileId', 'counterpartyProfileId', 'subjectRole', 'observed'])(
    'requires %s',
    (field) => {
      const value = outcome();
      delete value[field];
      expect(() => OutcomeSchema.parse(value)).toThrow();
    },
  );

  it('rejects a subjectRole outside the allowed enum', () => {
    expect(() => OutcomeSchema.parse(outcome({ subjectRole: 'agency' }))).toThrow();
  });

  it('accepts counterparty-reported and synthetic label sources', () => {
    expect(OutcomeSchema.parse(outcome({ labelSource: 'counterparty-reported' })).labelSource).toBe(
      'counterparty-reported',
    );
    expect(OutcomeSchema.parse(outcome({ labelSource: 'synthetic' })).labelSource).toBe(
      'synthetic',
    );
  });

  it('accepts a negative daysLate value for early delivery', () => {
    expect(OutcomeSchema.parse(outcome({ daysLate: -3 })).daysLate).toBe(-3);
  });

  it('accepts null paidInFull for a freelancer Outcome', () => {
    expect(OutcomeSchema.parse(outcome({ paidInFull: null })).paidInFull).toBeNull();
  });

  it.each([
    ['freelancer delivery row with payment conduct', outcome({ paidInFull: true })],
    [
      'client payment row with delivery conduct',
      outcome({ subjectRole: 'client', deliveredAt: new Date(), daysLate: 0 }),
    ],
    ['unobserved row with delivery conduct', outcome({ observed: false, daysLate: 0 })],
    [
      'self-ghosted freelancer row with delivery conduct',
      outcome({ ghosted: true, endedAs: 'ghosted', daysLate: 0 }),
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
    ],
  ])('rejects a %s', (_description, value) => {
    expect(() => OutcomeSchema.parse(value)).toThrow();
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
    const parsed = OutcomeSchema.parse(value);
    expect({
      deliveredAt: parsed.deliveredAt,
      daysLate: parsed.daysLate,
      paidInFull: parsed.paidInFull,
      revisionsRequested: parsed.revisionsRequested,
      scopeCreepOccurred: parsed.scopeCreepOccurred,
    }).toEqual({
      deliveredAt: value.deliveredAt,
      daysLate: value.daysLate,
      paidInFull: value.paidInFull,
      revisionsRequested: value.revisionsRequested,
      scopeCreepOccurred: value.scopeCreepOccurred,
    });
  });

  it('distinguishes counterparty-ghosted from self-ghosted rows', () => {
    const counterpartyGhosted = OutcomeSchema.parse(
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
    const selfGhosted = OutcomeSchema.parse(
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

    expect(counterpartyGhosted).toMatchObject({ observed: false, ghosted: false });
    expect(selfGhosted).toMatchObject({ observed: true, ghosted: true });
  });

  it('does not accept party identity, role, label source, or visibleAt in the write request', () => {
    const request = {
      engagementId: objectId('a'),
      outcome: {
        observed: true,
        deliveredAt: '2026-01-01T00:00:00.000Z',
        daysLate: 0,
        paidInFull: null,
        revisionsRequested: null,
        scopeCreepOccurred: null,
        endedAs: 'completed',
      },
      review: { rating: 5, text: 'Professional and clear.' },
    };
    expect(CreateOutcomeReviewRequestSchema.parse(request).outcome.deliveredAt).toBeInstanceOf(
      Date,
    );
    expect(() =>
      CreateOutcomeReviewRequestSchema.parse({
        ...request,
        outcome: { ...request.outcome, subjectProfileId: objectId('b') },
      }),
    ).toThrow();
    expect(() =>
      CreateOutcomeReviewRequestSchema.parse({
        ...request,
        review: { ...request.review, visibleAt: new Date() },
      }),
    ).toThrow();
  });

  it('does not default role-inapplicable or unobserved conduct fields', () => {
    const { deliveredAt, daysLate, paidInFull, revisionsRequested, scopeCreepOccurred, ...base } =
      outcome();
    const parsed = OutcomeSchema.parse(base);
    expect(parsed).not.toHaveProperty('deliveredAt');
    expect(parsed).not.toHaveProperty('daysLate');
    expect(parsed).not.toHaveProperty('paidInFull');
    expect(parsed).not.toHaveProperty('revisionsRequested');
    expect(parsed).not.toHaveProperty('scopeCreepOccurred');
  });
});
