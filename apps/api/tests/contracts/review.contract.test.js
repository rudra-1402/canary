import { describe, it, expect } from 'vitest';
import { ReviewSchema } from '@canary/shared';

const objectId = (character) => character.repeat(24);

function review(overrides = {}) {
  return {
    engagementId: objectId('a'),
    authorProfileId: objectId('b'),
    subjectProfileId: objectId('c'),
    rating: 5,
    text: 'Great to work with.',
    ...overrides,
  };
}

describe('Review contracts', () => {
  it('defaults planted provenance flags to false', () => {
    const parsed = ReviewSchema.parse(review());

    expect(parsed.isPlantedCollusion).toBe(false);
    expect(typeof parsed.isPlantedCollusion).toBe('boolean');
    expect(parsed.isPlantedSabotage).toBe(false);
    expect(typeof parsed.isPlantedSabotage).toBe('boolean');
  });

  it('accepts planted provenance flags as booleans', () => {
    const parsed = ReviewSchema.parse(
      review({ isPlantedCollusion: true, isPlantedSabotage: true }),
    );

    expect(parsed.isPlantedCollusion).toBe(true);
    expect(parsed.isPlantedSabotage).toBe(true);
  });

  it('rejects a self-review', () => {
    const profileId = objectId('b');

    expect(() =>
      ReviewSchema.parse(review({ authorProfileId: profileId, subjectProfileId: profileId })),
    ).toThrow();
  });
});
