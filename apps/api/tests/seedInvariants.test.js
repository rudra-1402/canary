import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { MIN_ENGAGEMENTS_FOR_SCORING } from '../src/trustScore/scoringConfig.js';
import { SEED_TESTS_ENABLED, TRUST_SCORE_SEEDED } from './helpers/seedGate.js';

// App-layer invariants over seeded data — the contract between the Python generator and this app.
// seedConformance.test.js checks documents against their Mongoose schemas; that cannot catch a
// field the schema allows to be absent, which is how every defect below reached main.
//
// `it.fails()` marks a KNOWN-BROKEN invariant: green while broken, and it starts failing the moment
// the defect is fixed, forcing promotion to a normal `it()`. Never add a plain `it()` for something
// currently broken — a red suite gets ignored, and that is how these went unnoticed.
//
// Everything below the config-alignment check needs a seeded database and is gated on
// CANARY_SEED_TESTS — see tests/helpers/seedGate.js. On an empty DB the invariants hold vacuously,
// which makes every `it.fails()` marker invert; skipping is the only honest answer.

const TIMEOUT = 120000;

const db = () => mongoose.connection.db;

async function countOrphans(collection, field, target) {
  const r = await db()
    .collection(collection)
    .aggregate(
      [
        { $lookup: { from: target, localField: field, foreignField: '_id', as: '__hit' } },
        { $match: { '__hit.0': { $exists: false } } },
        { $count: 'n' },
      ],
      { allowDiskUse: true },
    )
    .toArray();
  return r[0]?.n ?? 0;
}

async function countRoleMismatch(collection, field, expectedRole) {
  const r = await db()
    .collection(collection)
    .aggregate(
      [
        { $lookup: { from: 'profiles', localField: field, foreignField: '_id', as: '__p' } },
        { $unwind: '$__p' },
        { $match: { '__p.role': { $ne: expectedRole } } },
        { $count: 'n' },
      ],
      { allowDiskUse: true },
    )
    .toArray();
  return r[0]?.n ?? 0;
}

async function distinctStatuses(collection) {
  return db().collection(collection).distinct('status');
}

// Reads source files, not the database — so it runs everywhere, gate or no gate.
describe('cross-language config alignment', () => {
  it('scoring threshold stays aligned with the Python pipeline', async () => {
    const configUrl = new URL('../../intelligence/trust_score/config.py', import.meta.url);
    const configText = await (await import('node:fs/promises')).readFile(configUrl, 'utf8');
    const match = configText.match(/min_engagements_for_scoring:\s*int\s*=\s*(\d+)/);
    expect(match, 'min_engagements_for_scoring declaration was not found').not.toBeNull();
    expect(Number(match[1])).toBe(MIN_ENGAGEMENTS_FOR_SCORING);
  });

  // auth.routes.test.js hardcodes the seed dev password hash to prove a seeded Identity can log in
  // through the real route. If the Python constant changes and that one does not, the login test
  // keeps passing against a stale value while every real seeded login breaks — green suite, dead
  // demo. Same drift class as the threshold check above.
  it('the seed dev password hash stays aligned with the Python generator', async () => {
    const srcUrl = new URL('../../intelligence/generator/identities_profiles.py', import.meta.url);
    const src = await (await import('node:fs/promises')).readFile(srcUrl, 'utf8');
    const pyMatch = src.match(/SEED_DEV_PASSWORD_HASH\s*=\s*"([^"]+)"/);
    expect(
      pyMatch,
      'SEED_DEV_PASSWORD_HASH was not found in identities_profiles.py',
    ).not.toBeNull();

    const testUrl = new URL('./auth/auth.routes.test.js', import.meta.url);
    const testSrc = await (await import('node:fs/promises')).readFile(testUrl, 'utf8');
    const jsMatch = testSrc.match(/SEED_DEV_PASSWORD_HASH\s*=\s*'([^']+)'/);
    expect(jsMatch, 'SEED_DEV_PASSWORD_HASH was not found in auth.routes.test.js').not.toBeNull();

    expect(jsMatch[1], 'JS login test hash has drifted from the Python generator').toBe(pyMatch[1]);
  });
});

describe.skipIf(!SEED_TESTS_ENABLED)(
  'seed invariants (Python generator → Node app contract)',
  () => {
    beforeAll(async () => {
      await connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/canary_dev');
    });

    afterAll(async () => {
      await disconnectDB();
    });

    // Guards against the whole suite passing vacuously against an unseeded database — the failure
    // mode already flagged for seedConformance.test.js.
    it(
      'the database is actually seeded',
      async () => {
        for (const c of [
          'identities',
          'profiles',
          'jobposts',
          'proposals',
          'engagements',
          'outcomes',
          'reviews',
        ]) {
          expect(await db().collection(c).countDocuments(), `${c} is empty`).toBeGreaterThan(0);
        }
      },
      TIMEOUT,
    );

    describe('referential integrity — verified clean 2026-07-29, these are regression guards', () => {
      const refs = [
        ['profiles', 'identityId', 'identities'],
        ['jobposts', 'clientProfileId', 'profiles'],
        ['proposals', 'jobPostId', 'jobposts'],
        ['proposals', 'freelancerProfileId', 'profiles'],
        ['engagements', 'proposalId', 'proposals'],
        ['outcomes', 'engagementId', 'engagements'],
        ['reviews', 'engagementId', 'engagements'],
        ['payments', 'engagementId', 'engagements'],
      ];
      for (const [collection, field, target] of refs) {
        it(
          `${collection}.${field} → ${target} has no orphans`,
          async () => {
            expect(await countOrphans(collection, field, target)).toBe(0);
          },
          TIMEOUT,
        );
      }
    });

    describe('role correctness — verified clean 2026-07-29', () => {
      it(
        'every JobPost is authored by a client profile',
        async () => {
          expect(await countRoleMismatch('jobposts', 'clientProfileId', 'client')).toBe(0);
        },
        TIMEOUT,
      );

      it(
        'every Proposal is authored by a freelancer profile',
        async () => {
          expect(await countRoleMismatch('proposals', 'freelancerProfileId', 'freelancer')).toBe(0);
        },
        TIMEOUT,
      );

      it(
        'both sides of every Engagement are correctly roled',
        async () => {
          expect(await countRoleMismatch('engagements', 'freelancerProfileId', 'freelancer')).toBe(
            0,
          );
          expect(await countRoleMismatch('engagements', 'clientProfileId', 'client')).toBe(0);
        },
        TIMEOUT,
      );
    });

    describe('timestamps — three prior defects, currently clean', () => {
      const collections = [
        'identities',
        'profiles',
        'jobposts',
        'proposals',
        'engagements',
        'outcomes',
        'payments',
        'reviews',
      ];
      for (const c of collections) {
        it(
          `${c} documents all carry createdAt`,
          async () => {
            const total = await db().collection(c).countDocuments();
            const withField = await db()
              .collection(c)
              .countDocuments({ createdAt: { $exists: true, $ne: null } });
            expect(withField, `${c}: ${withField}/${total}`).toBe(total);
          },
          TIMEOUT,
        );
      }
    });

    it(
      'no Engagement has more than two Reviews',
      async () => {
        const over = await db()
          .collection('reviews')
          .aggregate(
            [
              { $group: { _id: '$engagementId', n: { $sum: 1 } } },
              { $match: { n: { $gt: 2 } } },
              { $count: 'n' },
            ],
            { allowDiskUse: true },
          )
          .toArray();
        expect(over[0]?.n ?? 0).toBe(0);
      },
      TIMEOUT,
    );

    // Seeded identities use the shared development credential; a placeholder OAuth sub alone is not
    // loginable, so this asserts a real local-password path is present.
    it(
      'every Identity has a usable credential (TS-C)',
      async () => {
        const unusable = await db()
          .collection('identities')
          .countDocuments({
            passwordHash: { $in: [null, undefined] },
            $or: [
              { authProviderId: { $in: [null, undefined] } },
              { authProviderId: /^seed-provider\|/ },
            ],
          });
        expect(unusable).toBe(0);
      },
      TIMEOUT,
    );

    // Raw pymongo writes bypass createProfileForIdentity, so the generator resolves the owned
    // active Profile itself before persistence.
    it(
      'every Identity has activeProfileId pointing at a Profile it owns (TS-C)',
      async () => {
        const bad = await db()
          .collection('identities')
          .aggregate(
            [
              {
                $lookup: {
                  from: 'profiles',
                  localField: 'activeProfileId',
                  foreignField: '_id',
                  as: 'p',
                },
              },
              {
                $match: {
                  $or: [
                    { activeProfileId: { $in: [null, undefined] } },
                    { 'p.0': { $exists: false } },
                    { $expr: { $ne: [{ $arrayElemAt: ['$p.identityId', 0] }, '$_id'] } },
                  ],
                },
              },
              { $count: 'n' },
            ],
            { allowDiskUse: true },
          )
          .toArray();
        expect(bad[0]?.n ?? 0).toBe(0);
      },
      TIMEOUT,
    );

    // The Python trust_score pipeline is a separate run from the generator, and both of the markers
    // below are only meaningful once it has produced snapshots — an empty `trustscores` satisfies
    // them vacuously and inverts the marker. Hence the second gate.
    describe.skipIf(!TRUST_SCORE_SEEDED)('trust score snapshots', () => {
      it(
        'trustscores is actually populated',
        async () => {
          expect(await db().collection('trustscores').countDocuments()).toBeGreaterThan(0);
        },
        TIMEOUT,
      );

      it(
        'trustscores documents all carry createdAt',
        async () => {
          const total = await db().collection('trustscores').countDocuments();
          const withField = await db()
            .collection('trustscores')
            .countDocuments({ createdAt: { $exists: true, $ne: null } });
          expect(withField, `trustscores: ${withField}/${total}`).toBe(total);
        },
        TIMEOUT,
      );

      // Fixed by TS-A's wipe: 5 500 stale ids had accumulated across reseeds while profiles
      // were replaced, corrupting any population statistic by ~21%.
      it(
        'every TrustScore references an existing Profile',
        async () => {
          expect(await countOrphans('trustscores', 'profileId', 'profiles')).toBe(0);
        },
        TIMEOUT,
      );

      // Absence-by-omission was D1's rejected alternative; asserting every row states a
      // status stops it creeping back in as a "fix" for the assertion below.
      it(
        'every TrustScore states a status',
        async () => {
          const total = await db().collection('trustscores').countDocuments();
          const stated = await db()
            .collection('trustscores')
            .countDocuments({ status: { $in: ['scored', 'insufficient-history'] } });
          expect(stated, `${stated}/${total} snapshots state a status`).toBe(total);
        },
        TIMEOUT,
      );

      // REWRITTEN by TS-A, not merely promoted. The original asserted that a sub-threshold
      // profile has no TrustScore at all — false by design now, since those profiles keep
      // rows that say "insufficient-history" instead of fabricating 50/med. Promoting it as
      // written would have swapped a green-while-broken test for a red-while-correct one.
      it(
        'no profile below the scoring threshold has a SCORED TrustScore',
        async () => {
          const scoredButUnscoreable = await db()
            .collection('trustscores')
            .aggregate(
              [
                { $match: { status: 'scored' } },
                { $group: { _id: '$profileId' } },
                {
                  $lookup: {
                    from: 'engagements',
                    let: { pid: '$_id' },
                    pipeline: [
                      {
                        $match: {
                          $expr: {
                            $and: [
                              { $eq: ['$status', 'concluded'] },
                              {
                                $or: [
                                  { $eq: ['$freelancerProfileId', '$$pid'] },
                                  { $eq: ['$clientProfileId', '$$pid'] },
                                ],
                              },
                            ],
                          },
                        },
                      },
                      { $count: 'n' },
                    ],
                    as: 'eng',
                  },
                },
                {
                  $match: {
                    $expr: {
                      $lt: [
                        { $ifNull: [{ $arrayElemAt: ['$eng.n', 0] }, 0] },
                        MIN_ENGAGEMENTS_FOR_SCORING,
                      ],
                    },
                  },
                },
                { $count: 'n' },
              ],
              { allowDiskUse: true },
            )
            .toArray();
          expect(scoredButUnscoreable[0]?.n ?? 0).toBe(0);
        },
        TIMEOUT,
      );
    });

    // RESOLVED by A1 Task 20 — promoted from it.fails to a real assertion. Review.js declares
    // visibleAt with default null and raw pymongo writes skip Mongoose defaults, so the field was
    // absent on all 17111 rows and the double-blind rule had nowhere to live. reviews.py now derives
    // it from the shared conclusion timeline, so the marker inverted ("Expect test to fail").
    it(
      'every Review carries a populated visibleAt',
      async () => {
        const total = await db().collection('reviews').countDocuments();
        expect(total, 'no reviews seeded — this invariant would pass vacuously').toBeGreaterThan(0);
        const populated = await db()
          .collection('reviews')
          .countDocuments({ visibleAt: { $exists: true, $ne: null } });
        expect(populated, `${populated}/${total} reviews have a populated visibleAt`).toBe(total);
      },
      TIMEOUT,
    );

    // An accepted proposal that became an Engagement must no longer read "submitted".
    it(
      'no Proposal referenced by an Engagement is still "submitted" (TS-C)',
      async () => {
        const stale = await db()
          .collection('engagements')
          .aggregate(
            [
              {
                $lookup: {
                  from: 'proposals',
                  localField: 'proposalId',
                  foreignField: '_id',
                  as: 'p',
                },
              },
              { $unwind: '$p' },
              { $match: { 'p.status': 'submitted' } },
              { $count: 'n' },
            ],
            { allowDiskUse: true },
          )
          .toArray();
        expect(stale[0]?.n ?? 0).toBe(0);
      },
      TIMEOUT,
    );

    // Find Work must not list a concluded JobPost as open.
    it(
      'no JobPost with a concluded Engagement is still "open" (TS-C)',
      async () => {
        const stale = await db()
          .collection('engagements')
          .aggregate(
            [
              { $match: { status: 'concluded' } },
              {
                $lookup: {
                  from: 'jobposts',
                  localField: 'jobPostId',
                  foreignField: '_id',
                  as: 'j',
                },
              },
              { $unwind: '$j' },
              { $match: { 'j.status': 'open' } },
              { $count: 'n' },
            ],
            { allowDiskUse: true },
          )
          .toArray();
        expect(stale[0]?.n ?? 0).toBe(0);
      },
      TIMEOUT,
    );

    // The seed exercises every marketplace lifecycle rather than emitting only initial states.
    it(
      'every lifecycle actually transitions — statuses show more than one value (TS-C)',
      async () => {
        for (const c of ['jobposts', 'proposals', 'engagements']) {
          expect(
            (await distinctStatuses(c)).length,
            `${c} only ever has one status`,
          ).toBeGreaterThan(1);
        }
      },
      TIMEOUT,
    );

    // RESOLVED by A1 Tasks 4/7/13 — promoted from it.fails, and REWRITTEN rather than adjusted.
    // The old marker asserted `responsibleParty`, a field the shipped fix never creates: attribution
    // is expressed by splitting one shared row into one row per party, not by naming a culprit on a
    // shared row. Left as-is it would have "expected-failed" forever for the wrong reason — passing
    // as a marker while the defect it described was already gone.
    it(
      'every Outcome is attributed to exactly one party',
      async () => {
        const total = await db().collection('outcomes').countDocuments();
        expect(total, 'no outcomes seeded — this invariant would pass vacuously').toBeGreaterThan(
          0,
        );

        const attributed = await db()
          .collection('outcomes')
          .countDocuments({
            subjectProfileId: { $exists: true, $ne: null },
            counterpartyProfileId: { $exists: true, $ne: null },
            subjectRole: { $in: ['freelancer', 'client'] },
          });
        expect(attributed, `${attributed}/${total} outcomes carry per-party attribution`).toBe(
          total,
        );

        const selfAttributed = await db()
          .collection('outcomes')
          .countDocuments({ $expr: { $eq: ['$subjectProfileId', '$counterpartyProfileId'] } });
        expect(selfAttributed, 'outcomes where subject and counterparty are the same profile').toBe(
          0,
        );
      },
      TIMEOUT,
    );

    // A1's cardinality guarantee. Asserts the MAPPING, not just presence: a swapped subject and
    // counterparty satisfies every "field exists" check while attributing conduct to the wrong party,
    // which is the exact defect this segment exists to remove.
    it(
      'every concluded Engagement has exactly two Outcomes, one per correctly-roled party',
      async () => {
        const concluded = await db()
          .collection('engagements')
          .countDocuments({ status: 'concluded' });
        expect(concluded, 'no concluded engagements seeded').toBeGreaterThan(0);

        const wrongCardinality = await db()
          .collection('outcomes')
          .aggregate(
            [
              { $group: { _id: '$engagementId', n: { $sum: 1 } } },
              { $match: { n: { $ne: 2 } } },
              { $count: 'bad' },
            ],
            { allowDiskUse: true },
          )
          .toArray();
        expect(wrongCardinality[0]?.bad ?? 0, 'engagements without exactly 2 Outcomes').toBe(0);

        const misMapped = await db()
          .collection('outcomes')
          .aggregate(
            [
              {
                $lookup: {
                  from: 'engagements',
                  localField: 'engagementId',
                  foreignField: '_id',
                  as: 'e',
                },
              },
              { $unwind: '$e' },
              {
                $match: {
                  $expr: {
                    $not: {
                      $or: [
                        {
                          $and: [
                            { $eq: ['$subjectRole', 'freelancer'] },
                            { $eq: ['$subjectProfileId', '$e.freelancerProfileId'] },
                            { $eq: ['$counterpartyProfileId', '$e.clientProfileId'] },
                          ],
                        },
                        {
                          $and: [
                            { $eq: ['$subjectRole', 'client'] },
                            { $eq: ['$subjectProfileId', '$e.clientProfileId'] },
                            { $eq: ['$counterpartyProfileId', '$e.freelancerProfileId'] },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
              { $count: 'bad' },
            ],
            { allowDiskUse: true },
          )
          .toArray();
        expect(
          misMapped[0]?.bad ?? 0,
          'Outcomes whose role/party mapping is wrong or swapped',
        ).toBe(0);
      },
      TIMEOUT,
    );

    // A1 Task 20. Outcome timestamps were fixed in Task 11 and reviews were initially left behind,
    // which would put a review written after the fact inside a historical feature window — future
    // information in a past feature vector, the same defect class as the target leakage.
    it(
      'no Outcome or Review is timestamped at its Engagement creation',
      async () => {
        for (const collection of ['outcomes', 'reviews']) {
          const stale = await db()
            .collection(collection)
            .aggregate(
              [
                {
                  $lookup: {
                    from: 'engagements',
                    localField: 'engagementId',
                    foreignField: '_id',
                    as: 'e',
                  },
                },
                { $unwind: '$e' },
                { $match: { $expr: { $eq: ['$createdAt', '$e.createdAt'] } } },
                { $count: 'bad' },
              ],
              { allowDiskUse: true },
            )
            .toArray();
          expect(stale[0]?.bad ?? 0, `${collection} stamped at engagement creation`).toBe(0);
        }
      },
      TIMEOUT,
    );
  },
);
