// Gates for suites that assert against a *seeded* database rather than fixtures they create
// themselves. CI's Mongo service container starts empty, so without a gate these suites either
// pass vacuously (nothing to violate) or — for the `it.fails()` markers in seedInvariants — invert
// and report "Expect test to fail" on absent data. Both are worse than not running.
//
// CANARY_SEED_TESTS=1        the generator has run against MONGODB_URI (identities…payments).
// CANARY_TRUST_SCORE_SEEDED=1 the Python trust_score pipeline has ALSO run (trustscores,
//                            risksignals). Separate because that step trains a model and needs a
//                            population with enough non-cold-start profiles — not something a
//                            small CI seed provides.

export const SEED_TESTS_ENABLED = process.env.CANARY_SEED_TESTS === '1';
export const TRUST_SCORE_SEEDED = process.env.CANARY_TRUST_SCORE_SEEDED === '1';
