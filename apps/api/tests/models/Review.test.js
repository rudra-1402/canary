import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import Review from '../../src/models/Review.js';
import { clearCollections, startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

const objectId = () => new mongoose.Types.ObjectId();

function review(overrides = {}) {
  return {
    engagementId: objectId(),
    authorProfileId: objectId(),
    subjectProfileId: objectId(),
    rating: 5,
    text: 'Great to work with.',
    ...overrides,
  };
}

beforeAll(async () => {
  await startMemoryDb();
  await Review.init();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('Review schema', () => {
  it('validates a well-formed Review', () => {
    const doc = new Review(review());
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a rating outside 1-5', () => {
    const doc = new Review(review({ rating: 7, text: 'x' }));
    const err = doc.validateSync();
    expect(err.errors.rating).toBeDefined();
  });

  it('defaults planted provenance flags to false and persists them as booleans', async () => {
    const saved = await Review.create(review());
    const found = await Review.findById(saved._id);

    expect(found.isPlantedCollusion).toBe(false);
    expect(typeof found.isPlantedCollusion).toBe('boolean');
    expect(found.isPlantedSabotage).toBe(false);
    expect(typeof found.isPlantedSabotage).toBe('boolean');
  });

  it('persists planted provenance flags as booleans', async () => {
    const saved = await Review.create(
      review({ isPlantedCollusion: true, isPlantedSabotage: true }),
    );
    const found = await Review.findById(saved._id);

    expect(found.isPlantedCollusion).toBe(true);
    expect(typeof found.isPlantedCollusion).toBe('boolean');
    expect(found.isPlantedSabotage).toBe(true);
    expect(typeof found.isPlantedSabotage).toBe('boolean');
  });

  it('rejects a self-review', () => {
    const profileId = objectId();
    const err = new Review(
      review({ authorProfileId: profileId, subjectProfileId: profileId }),
    ).validateSync();

    expect(err.errors.authorProfileId).toBeDefined();
  });

  it('allows different authors to save Reviews for the same Engagement', async () => {
    const engagementId = objectId();
    await Review.create(review({ engagementId, authorProfileId: objectId() }));
    await expect(
      Review.create(review({ engagementId, authorProfileId: objectId() })),
    ).resolves.toBeDefined();
  });

  it('rejects a duplicate Review for the same Engagement and author with a duplicate-key error', async () => {
    const engagementId = objectId();
    const authorProfileId = objectId();
    await Review.create(review({ engagementId, authorProfileId }));
    await expect(Review.create(review({ engagementId, authorProfileId }))).rejects.toMatchObject({
      code: 11000,
    });
  });
});
