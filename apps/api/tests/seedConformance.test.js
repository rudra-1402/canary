import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { validateSeededCollections } from '../scripts/validateSeed.js';
import { SEED_TESTS_ENABLED, TRUST_SCORE_SEEDED } from './helpers/seedGate.js';

// Gated on a seeded database — see tests/helpers/seedGate.js. Against CI's empty Mongo this suite
// reported "conformance OK" having validated zero documents, every green run since it was written.
describe.skipIf(!SEED_TESTS_ENABLED)('seed conformance', () => {
  // Written by the Python trust_score pipeline, not the generator, so they are empty on a
  // generator-only seed. Their conformance is asserted only when that pipeline has also run.
  const TRUST_SCORE_COLLECTIONS = ['TrustScore', 'RiskSignal'];

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
    const mustBePopulated = TRUST_SCORE_SEEDED
      ? report
      : report.filter((r) => !TRUST_SCORE_COLLECTIONS.includes(r.collection));
    const emptied = mustBePopulated.filter((r) => r.checked === 0);
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
        ...TRUST_SCORE_COLLECTIONS,
      ].sort(),
    );
  }, 60000);
});
