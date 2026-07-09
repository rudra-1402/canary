import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { validateSeededCollections } from '../scripts/validateSeed.js';

describe('seed conformance', () => {
  beforeAll(async () => {
    await connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/canary_dev');
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('every document in every seeded collection validates against its Mongoose schema', async () => {
    const report = await validateSeededCollections();
    const failures = report.filter((r) => r.invalidCount > 0);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it('checked every collection the generator seeds', async () => {
    const report = await validateSeededCollections();
    const checked = report.map((r) => r.collection).sort();
    expect(checked).toEqual(
      [
        'Identity',
        'Engagement',
        'JobPost',
        'Outcome',
        'Payment',
        'Profile',
        'Proposal',
        'Review',
      ].sort(),
    );
  });
});
