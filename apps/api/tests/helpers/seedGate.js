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

import { existsSync } from 'node:fs';
import path from 'node:path';

export const INTELLIGENCE_DIRECTORY = path.resolve(process.cwd(), '../intelligence');

export const SEED_TESTS_ENABLED = process.env.CANARY_SEED_TESTS === '1';
export const TRUST_SCORE_SEEDED = process.env.CANARY_TRUST_SCORE_SEEDED === '1';

// The rescore integration test shells out to the *real* Python scorer, so it needs two things
// that are deliberately not in git: a trained model artifact (a build output, regenerable from
// the pipeline) and the intelligence venv's interpreter (per-machine). The `js` CI job installs
// no Python at all, so it can never satisfy either — before this gate the suite failed there on
// a missing-file ENOENT while passing on a developer machine, which is the worst of both.
// Detected by probing rather than by an env var: the prerequisites are files, so their presence
// is the honest signal, and nobody has to remember to set a flag locally.
export const RESCORE_PYTHON_PATH =
  process.platform === 'win32'
    ? path.join(INTELLIGENCE_DIRECTORY, 'venv', 'Scripts', 'python.exe')
    : path.join(INTELLIGENCE_DIRECTORY, 'venv', 'bin', 'python');

export const RESCORE_ARTIFACT_PATH = path.join(
  INTELLIGENCE_DIRECTORY,
  'trust-score-model.b4.joblib',
);

export const RESCORE_INTEGRATION_READY =
  existsSync(RESCORE_PYTHON_PATH) && existsSync(RESCORE_ARTIFACT_PATH);
