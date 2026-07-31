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

    // ─────────────────────────────────────────────────────────────────────────────
    // KNOWN BROKEN — each of these caught a real defect. Promote to `it()` when fixed.
    // ─────────────────────────────────────────────────────────────────────────────

    // Fixed by TS-C. "seed-provider|N" is a placeholder, not a real Google `sub`, so asserting the
    // field merely EXISTS would pass while login stays impossible for all 20 000 identities.
    it.fails(
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

    // Fixed by TS-C. Written by createProfileForIdentity in the app path only; the generator never
    // runs it, so active-profile resolution sees null for every seeded user.
    it.fails(
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

    // Fixed by TS-C. Review.js declares visibleAt with default null; raw pymongo writes skip Mongoose
    // defaults, so the field is absent entirely and double-blind has nowhere to live.
    it.fails(
      'every Review carries a visibleAt field (TS-C)',
      async () => {
        const total = await db().collection('reviews').countDocuments();
        const withField = await db()
          .collection('reviews')
          .countDocuments({ visibleAt: { $exists: true } });
        expect(withField, `${withField}/${total} reviews have visibleAt`).toBe(total);
      },
      TIMEOUT,
    );

    // Fixed by TS-C. An accepted proposal that became an Engagement still reads "submitted".
    it.fails(
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

    // Fixed by TS-C. Find Work is the demo's primary browse screen and would list finished jobs.
    it.fails(
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

    // Fixed by TS-C. The generalisation of the three defects above: the generator only ever writes
    // the initial state of any lifecycle, so no state machine is exercised by the seed.
    it.fails(
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

    // Fixed by TS-D. Outcome has no attribution field, and fetch.py credits the identical row to both
    // parties — so a freelancer is scored down for their client's non-payment.
    it.fails(
      'every Outcome records which party was responsible (TS-D)',
      async () => {
        const total = await db().collection('outcomes').countDocuments();
        const attributed = await db()
          .collection('outcomes')
          .countDocuments({ responsibleParty: { $exists: true, $ne: null } });
        expect(attributed, `${attributed}/${total} outcomes carry attribution`).toBe(total);
      },
      TIMEOUT,
    );
  },
);
