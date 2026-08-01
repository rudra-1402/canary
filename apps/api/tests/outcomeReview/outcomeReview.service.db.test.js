import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Engagement from '../../src/models/Engagement.js';
import Outcome from '../../src/models/Outcome.js';
import { createOutcome, createReview } from '../../src/outcomeReview/outcomeReview.service.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

const objectId = () => new mongoose.Types.ObjectId();

async function engagement() {
  return Engagement.create({
    freelancerProfileId: objectId(),
    clientProfileId: objectId(),
    status: 'concluded',
    agreedTerms: {
      scope: 'A scoped engagement',
      price: 100,
      paymentTerms: 'On completion',
      timeline: 'One week',
      dueAt: new Date('2026-01-10T00:00:00.000Z'),
    },
  });
}

function outcomeFor(engagementDoc, overrides = {}) {
  return {
    engagementId: engagementDoc._id,
    subjectProfileId: engagementDoc.freelancerProfileId,
    counterpartyProfileId: engagementDoc.clientProfileId,
    subjectRole: 'freelancer',
    observed: true,
    deliveredAt: new Date('2026-01-09T00:00:00.000Z'),
    daysLate: -1,
    paidInFull: null,
    revisionsRequested: null,
    scopeCreepOccurred: null,
    ghosted: false,
    endedAs: 'completed',
    labelSource: 'self-reported',
    ...overrides,
  };
}

function clientOutcomeFor(engagementDoc, overrides = {}) {
  return outcomeFor(engagementDoc, {
    subjectProfileId: engagementDoc.clientProfileId,
    counterpartyProfileId: engagementDoc.freelancerProfileId,
    subjectRole: 'client',
    deliveredAt: null,
    daysLate: null,
    paidInFull: true,
    revisionsRequested: 0,
    scopeCreepOccurred: false,
    ...overrides,
  });
}

function reviewFor(engagementDoc, overrides = {}) {
  return {
    engagementId: engagementDoc._id,
    authorProfileId: engagementDoc.freelancerProfileId,
    subjectProfileId: engagementDoc.clientProfileId,
    rating: 5,
    text: 'Clear and professional.',
    ...overrides,
  };
}

beforeAll(async () => {
  await startMemoryDb();
  await Promise.all([Outcome.init()]);
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('Outcome and Review write service', () => {
  it('writes valid two-party Outcomes and Reviews', async () => {
    const engagementDoc = await engagement();

    await expect(createOutcome(outcomeFor(engagementDoc))).resolves.toMatchObject({
      subjectRole: 'freelancer',
    });
    await expect(createOutcome(clientOutcomeFor(engagementDoc))).resolves.toMatchObject({
      subjectRole: 'client',
    });
    await expect(createReview(reviewFor(engagementDoc))).resolves.toMatchObject({ rating: 5 });
    await expect(
      createReview(
        reviewFor(engagementDoc, {
          authorProfileId: engagementDoc.clientProfileId,
          subjectProfileId: engagementDoc.freelancerProfileId,
        }),
      ),
    ).resolves.toMatchObject({ rating: 5 });
  });

  it('rejects an Outcome whose subject is not a party to its engagement', async () => {
    const engagementDoc = await engagement();

    await expect(
      createOutcome(outcomeFor(engagementDoc, { subjectProfileId: objectId() })),
    ).rejects.toThrow('Outcome subjectProfileId must be a party to the engagement');
  });

  it('rejects an Outcome whose counterparty is not the other party to its engagement', async () => {
    const engagementDoc = await engagement();

    await expect(
      createOutcome(outcomeFor(engagementDoc, { counterpartyProfileId: objectId() })),
    ).rejects.toThrow('Outcome counterpartyProfileId must be the other party to the engagement');
  });

  it('rejects an Outcome whose subject and counterparty are the same party', async () => {
    const engagementDoc = await engagement();

    await expect(
      createOutcome(
        outcomeFor(engagementDoc, { counterpartyProfileId: engagementDoc.freelancerProfileId }),
      ),
    ).rejects.toThrow('Outcome subjectProfileId and counterpartyProfileId must be distinct');
  });

  it('rejects an Outcome whose subjectRole does not match its subject party', async () => {
    const engagementDoc = await engagement();

    await expect(
      createOutcome(outcomeFor(engagementDoc, { subjectRole: 'client' })),
    ).rejects.toThrow('Outcome subjectRole must match the subject party on the engagement');
  });

  it('rejects a third Outcome for an engagement that already has two', async () => {
    const engagementDoc = await engagement();
    await createOutcome(outcomeFor(engagementDoc));
    await createOutcome(clientOutcomeFor(engagementDoc));

    await expect(
      createOutcome(outcomeFor(engagementDoc, { subjectProfileId: objectId() })),
    ).rejects.toThrow('An engagement may have no more than two Outcomes');
  });

  it('allows exactly one of two concurrent duplicate Outcome writes', async () => {
    const engagementDoc = await engagement();

    const writes = await Promise.allSettled([
      createOutcome(outcomeFor(engagementDoc)),
      createOutcome(outcomeFor(engagementDoc)),
    ]);

    expect(writes.filter((write) => write.status === 'fulfilled')).toHaveLength(1);
    expect(await Outcome.countDocuments({ engagementId: engagementDoc._id })).toBe(1);
  });

  it('rejects a self-review', async () => {
    const engagementDoc = await engagement();

    await expect(
      createReview(
        reviewFor(engagementDoc, { subjectProfileId: engagementDoc.freelancerProfileId }),
      ),
    ).rejects.toThrow('Review authorProfileId and subjectProfileId must be different parties');
  });

  it('rejects a Review whose author is not a party to its engagement', async () => {
    const engagementDoc = await engagement();

    await expect(
      createReview(reviewFor(engagementDoc, { authorProfileId: objectId() })),
    ).rejects.toThrow('Review authorProfileId must be a party to the engagement');
  });

  it('rejects a Review whose subject is not the opposite party', async () => {
    const engagementDoc = await engagement();

    await expect(
      createReview(reviewFor(engagementDoc, { subjectProfileId: objectId() })),
    ).rejects.toThrow('Review subjectProfileId must be the opposite party to the author');
  });

  it('rejects a second Review by the same author for an engagement', async () => {
    const engagementDoc = await engagement();
    await createReview(reviewFor(engagementDoc));

    await expect(createReview(reviewFor(engagementDoc))).rejects.toThrow(
      'An author may write only one Review per engagement',
    );
  });
});
