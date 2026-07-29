import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { validateSeededCollections } from '../scripts/validateSeed.js';

describe('seed conformance', () => {
  // Built once and shared: validateSeededCollections() walks every seeded document (~60s against
  // the 20k seed), and running it per-test put both tests on the edge of their own timeout.
  let report;

  beforeAll(async () => {
    await connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/canary_dev');
    report = await validateSeededCollections();
  }, 180000);

  afterAll(async () => {
    await disconnectDB();
  });

  it('every document in every seeded collection validates against its Mongoose schema', async () => {
    // Without this, a cold/empty database reports checked:0 invalidCount:0 for every collection
    // and the assertion below passes having verified nothing.
    const emptied = report.filter((r) => r.checked === 0);
    expect(
      emptied,
      `nothing was checked in: ${emptied.map((r) => r.collection).join(', ')}`,
    ).toEqual([]);
    const failures = report.filter((r) => r.invalidCount > 0);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  }, 60000);

  it('checked every collection the generator seeds', async () => {
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
        'TrustScore',
        'RiskSignal',
      ].sort(),
    );
  }, 60000);
});
