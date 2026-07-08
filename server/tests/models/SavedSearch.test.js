import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import SavedSearch from '../../src/models/SavedSearch.js';

describe('SavedSearch schema', () => {
  it('validates a well-formed SavedSearch', () => {
    const doc = new SavedSearch({
      ownerProfileId: new mongoose.Types.ObjectId(),
      query: { keywords: 'react developer' },
      facets: { minRate: 30 },
      name: 'React roles',
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects a missing name', () => {
    const doc = new SavedSearch({
      ownerProfileId: new mongoose.Types.ObjectId(),
      query: {},
      facets: {},
    });
    const err = doc.validateSync();
    expect(err.errors.name).toBeDefined();
  });
});
