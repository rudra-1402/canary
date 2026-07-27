# Slice 1 (Trust Score engine) — Codex build log

Spec: `docs/superpowers/plans/2026-07-09-slice-1-trust-score-engine.md` (vault repo).
Branch: `rudra/slice-1-trust-score-engine`. Builder: Codex (gpt-5.6-terra, --yolo).
Verifier: Claude (diff read + real test run before every commit, per `codex-build` skill).

## Act 3 — Build

### Round 1 — Task 1: Add ML dependencies

**Codex build:** appended xgboost/shap/scikit-learn/pandas/scipy per spec. Hit a real,
correctly-diagnosed conflict: repo's Dependabot-bumped `numpy==2.5.1` is incompatible with
`shap`'s hard transitive dep on `numba` (every numba release caps numpy<2.5). Fixed by lowering
numpy to `2.4.2` — highest version satisfying numba, scipy>=2.0, and scikit-learn's floor at once.
No other lines touched.

**Claude's verdict:** ✅ Verified independently — read full diff (matches spec exactly, single
minimal hunk), ran `pytest -q` myself (39 passed, matches Codex's claim). Committed a4883e9.
Zero fix rounds needed.

### Round 2 — Task 2: id-map writer + Review createdAt fix + reseed

**Codex build:** wrote `generator/id_map.py` + test (TDD, RED then GREEN), wired it into
`run.py`, added `createdAt` to the Review insert sourced from the parent Engagement, updated
`.gitignore`. Correctly refused Steps 4-5 (live reseed + spot-check) — its sandbox blocks reading
`.env` files by design (same class of protection as Claude's own credential-file guard), so it
had no `MONGODB_URI` and declined to guess rather than fabricate a connection string.

**Claude's verdict:** ✅ Code diff verified independently (matches spec, only the 4 intended
files touched). Ran the live steps myself instead (dotenv loads `.env` automatically, no secret
ever typed): reseed produced exact expected counts (500/521/2629/358/287/449/4 rings), spot-check
confirmed `review has createdAt: True`, id-map has 500 entries all resolving to real profiles.
Ran `pytest -q` myself: 40 passed. Committed a7fbe66. Zero fix rounds needed.
**Pattern going forward:** any task step touching live Mongo (Tasks 7, 11, 12, 13, 14) — Codex
builds the code, Claude runs the credential-touching command.

### Round 3 — Task 3: trust_score/config.py

**Codex build:** package skeleton + `TrustScoreConfig` dataclass, exact match to spec including
the not-yet-tested fields (ewma/xgb params) needed by later tasks. TDD RED confirmed
(`ModuleNotFoundError`), then GREEN.

**Claude's verdict:** ✅ Read all 3 new files — verbatim match to spec, nothing extra. Ran
`pytest -q` myself: 42 passed (40 baseline + 2 new). Committed 367e36a. Zero fix rounds.

### Round 4 — Task 4: static feature aggregates

**Codex build:** implemented `compute_features`/`_static_aggregates` exactly per spec — then
**caught a real bug in the plan itself**: fixture's 2nd outcome defaults `endedAs="completed"`
(unspecified), so completion_rate over 3 outcomes (2 completed, 1 ghosted) is genuinely `2/3`, but
the spec's test asserted `1/3` with a stale comment. Codex refused to fudge the implementation to
match a wrong assertion — reported the inconsistency instead of guessing. Correct call.

**Claude's verdict:** confirmed Codex's math, fixed the one assertion line + comment (test bug,
not implementation bug), resumed same thread. Re-verified diff (single-line test change) + ran
`pytest -q` myself: 45 passed (42+3). Committed a402704. 1 fix round (spec bug, not Codex's fault).
Also: hit a new classifier gate here — `codex exec resume` needs
`--dangerously-bypass-approvals-and-sandbox`, not `--yolo` (resume doesn't take `--yolo`). User
approved + persisted as `Bash(codex exec resume *)` in `.claude/settings.local.json`.

### Round 5 — Task 5: temporal features (recency-weighted + trend slope)

**Codex build:** additive-only change, exact spec match, no spec issues found this round.
TDD RED confirmed (3 pass, 4 KeyError), then GREEN (7 passed).

**Claude's verdict:** ✅ Full diff read — purely additive, nothing touched outside the 2 named
files. Ran `pytest -q` myself: 49 passed (45+4). Committed c21109e. Zero fix rounds.

### Round 6 — Task 6: labels.py (Outcome-derived training label)

**Codex build:** exact spec match, caught another real spec bug: `0.4+0.3+0.2+0.1` isn't exactly
`1.0` in IEEE754 float (`0.9999999999999999`), so the spec's exact-equality assertion was always
going to fail regardless of implementation. Reported it instead of rounding the implementation to
force a match — correct call again (implementation is the source of truth, not an arbitrarily
precise test).

**Claude's verdict:** confirmed the float-precision issue, fixed via `pytest.approx(1.0)` in the
test only (labels.py untouched). Re-verified: `pytest -q` myself → 53 passed (49+4). Committed
fdb587a. 1 fix round (spec bug, not Codex's). **3 of 6 tasks so far have hit a real bug in the
frozen plan itself** (Tasks 4, 6, plus the numpy/shap conflict in Task 1) — the plan was
self-reviewed but never actually executed before now, so this is exactly the kind of drift a real
TDD run surfaces that a paper review can't.

### Round 7 — Task 7: fetch.py (bulk dataset loader)

**Codex build:** exact spec match, live Mongo round-trip via `mongo_db` fixture (local test DB,
no credentials needed — Codex's own sandbox blocks `.env` but this fixture never touches it).
No spec issues this round.

**Claude's verdict:** ✅ Read both files, exact match. Ran `pytest -q` myself: 55 passed (53+2).
Committed 317747a. Zero fix rounds.

### Round 8 — Task 8: model.py (per-role XGBoost)

**Codex build:** `model.py` exact spec match. Caught bug #4: spec's `_training_set()` only
produced `high`(2)/`low`(0) labels, skipping `med`(1) — installed xgboost==2.1.3 requires
contiguous class IDs and rejected the [0,2] gap. `model.py` itself was correct throughout.

**Claude's verdict:** confirmed the diagnosis, had Codex add a third synthetic-`med` fixture
generator (test-only change). Re-verified: reliable→99/high, unreliable→1/low (good separation),
`pytest -q` myself → 58 passed (55+3). Committed 6f13380. 1 fix round. **Flagged proactively:**
the `_trained_model()`/`_trained_model_and_explainer()` helpers in the original plan's Tasks
9/10/13 specs have the identical 2-class-only pattern — will pre-fix those prompts before
dispatch instead of hitting the same bug 3 more times.

**Post-commit catch:** repo's husky pre-commit hook (ruff) blocked the first commit attempt —
`noise = lambda: ...` in the test fixture violates E731 (no lambda assignment, use def). Same
lambda pattern is baked into the original plan's Tasks 9/10/13 test fixtures too — will pre-fix
those prompts as `def noise():` instead of copying the plan's lambda verbatim. Fixed directly
(trivial 2-line mechanical rename, didn't round-trip through Codex for it) and committed 6f13380.

### Round 9 — Task 9: explain.py (SHAP RiskSignals)

**Codex build:** exact spec match, both pre-flagged gotchas (lambda-assignment, contiguous
classes) avoided cleanly this round — zero new bugs from those two classes. New lint-only issue:
ruff's B905 wants explicit `zip(..., strict=)`. Codex correctly refused to silently add
`strict=False` (would suppress a real bug class) since the spec's line didn't specify it.

**Claude's verdict:** confirmed `FEATURE_COLUMNS`/`contributions` are always equal-length by
construction, added `strict=True` directly (correctness-free lint fix, no round-trip needed).
Ruff clean, `pytest -q` myself → 60 passed (58+2). Committed 1160c7b. Zero Codex fix rounds
(1 direct Claude fix).

### Round 10 — Task 10: backfill.py (no-lookahead monthly replay)

**Codex build:** exact spec match, both pre-flagged gotchas cleanly avoided. The no-lookahead QC
test (deleting a future Outcome must not change a past snapshot) passed on the first try. Minor:
my own prompt carried forward the plan's "6 passed" expectation, but the spec's test file only has
5 functions — Codex correctly reported the real count instead of chasing a phantom 6th test.

**Claude's verdict:** ✅ Ruff clean, read full file (matches spec). Ran `pytest -q` myself: 65
passed (60+5). Committed 206c4d6. Zero fix rounds. **The single most safety-critical assertion in
this whole slice (no-lookahead leakage) passed clean on the first pass.**

### Round 11 — Task 11: persistence.py (Mongo writes)

**Codex build:** exact spec match, live Mongo round-trip via `mongo_db` fixture. Only deviation: a
typo in my own PROOF command path, self-corrected sensibly.

**Claude's verdict:** ✅ Ruff clean, exact match. `pytest -q` myself → 66 passed (65+1).
Committed f5757d4. Zero fix rounds.

### Round 12 — Task 12: run.py (CLI orchestrator) + a real production bug

**Codex build:** `run.py` exact spec match (byte-for-byte, as instructed — no test file for this
task, it's pure wiring). One ruff import-sort nit (I001), fixed directly with `ruff --fix`.

**Claude's verdict — live run surfaced a REAL bug, not a spec/fixture issue:** ran
`python -m trust_score.run` against real seeded `canary_dev` (500 real profiles) myself — crashed:
`IndexError: index 2 is out of bounds for axis 0 with size 2` in `score_profile`. Root cause: the
real `freelancer` role's data happened to have zero non-cold-start profiles in the `"high"`
bucket, so XGBoost auto-detected only 2 classes and `predict_proba` returned a width-2 array,
but `score_profile`/`explain_profile` unconditionally index position 2 (`"high"`). This is a
genuine robustness gap in `model.py` (Task 8) that ALL of Task 8/9/10's synthetic unit tests
missed, because their fixtures always deliberately include all 3 classes — only real data volume
exposed it. **This is exactly why live-data verification matters even when every unit test is
green.**

Sent back to Codex (resumed Task 8's thread): forced `objective="multi:softprob"` + `num_class=3`
explicitly in `train_model` instead of letting XGBoost auto-infer class count from observed
labels. Codex added a genuine regression test (`test_model_handles_training_data_missing_one_class`)
that reproduced the exact crash RED, then passed GREEN after the fix. Verified: `pytest -q` myself
→ 67 passed. Reran the live orchestrator — succeeded: freelancer 296 profiles/5624 snapshots,
client 204 profiles/3876 snapshots (296+204=500, ×19 boundaries each = 9500, checks out exactly).
**Caught my own operational mistake too:** the first (crashed) run had partially written 57+
leftover documents into `trustscores`/`risksignals` before hitting the bug, and `run.py` has no
`--wipe` (unlike `generator.run`) — wiped both collections and reran clean, confirmed exactly 9500
trustscores / correct shape. Committed the model.py fix (3638ae0) and run.py (b4f054c) separately.
1 Codex fix round + 1 Claude-side data-hygiene cleanup, both for a bug neither of us could have
caught without actually running against real volume.

### Round 13 — Task 13: evaluate.py (held-out ground-truth harness) — the big one

**Codex build:** unit tests + `evaluate.py`, exact spec match. Its own fixture (15 high + 15 low,
zero med) immediately re-triggered the class-gap bug — but this time proved the earlier
`num_class=3` fix (Round 12) was **incomplete**, not just insufficiently tested: `xgboost==2.1.3`'s
`XGBClassifier.fit()` independently validates that observed `y` forms a dense contiguous range and
rejects gaps like `{0,2}` regardless of an explicit `num_class` kwarg. The freelancer live-run
"succeeded" earlier purely because that specific split's two present classes happened to already
be `{0,1}` — luck of data distribution, not a real fix.

**Real fix:** rewrote `train_model`/`score_profile` to use the low-level `xgb.Booster`+`DMatrix`
API instead of the sklearn `XGBClassifier` wrapper — no class-validation at all, just needs
`num_class` in params and integer labels in range, gaps and all. `explain.py` needed zero changes
(SHAP's `TreeExplainer` natively supports raw `Booster` objects). Added a second regression test
(`test_model_handles_non_contiguous_classes`) reproducing the exact `{0,2}` scenario. All 14
model/explain/backfill/evaluate tests pass, full suite 70 passed. Committed 35be6c9.

**Then a second, much bigger finding — not a code bug at all.** Ran `trust_score.evaluate` live:
freelancer rank correlation **-0.913** (client +0.344, both weak/wrong-direction). Per the plan's
own explicit gate ("if correlation looks degenerate... stop and debug"), invoked
`systematic-debugging` rather than pushing through. Root-cause investigation (Phase 1/2, full
evidence-gathering):

- 454/500 seeded profiles (91%) are cold-start (`< 3` concluded engagements) at evaluation time —
  only 287 concluded engagements existed total across 500 profiles (~1.15/profile), leaving just
  46 trainable profiles system-wide (23 freelancer + 23 client). Even **in-sample** correlation
  (train==score set, best case) was only -0.165/+0.275 — the signal exists but is drowned by tiny
  N, not absent.
- Secondary factor: `generator/outcomes.py`'s `generate_outcomes` attributes ghosting/lateness to
  _whichever party_ (freelancer or client) has the worse trait that month — a reliable freelancer
  paired with a bad-actor client inherits that client's bad Outcome in their own history, since
  `fetch.py` correctly (per spec) indexes each Outcome under both parties.

Both are properties of the **already-locked, independently-reviewed Slice 0 generator** — not
defects in any of this plan's 13 tasks, all of which faithfully implement the approved spec (Task
8's own synthetic unit test shows clean separation: reliable→99, unreliable→1).

**Surfaced to Rudra rather than silently fixing** — this affects the core USP's demo-readiness,
not a mechanical detail. He asked clarifying questions about the generator's ground-truth
mechanism (answered: hidden traits causally drive observable Outcome generation via
`_ghost_probability_from_traits`/`_late_days_range_from_traits`, model trains only on observable
features, `trueArchetype` is unsealed only at eval time on the held-out split — standard
train/test methodology, ground truth synthetically planted since no real historical data exists
pre-launch). Confirmed via reading `jobposts.py`/`engagements.py` that engagement volume scales
roughly **linearly** with `--num-profiles` (1-4 jobposts/client, independent of pool size, not a
fixed shared market) — so reseeding bigger directly tests the small-N hypothesis with zero code
changes to the locked generator.

**Reseeded at `--num-profiles 5000`** (10x, no generator code touched): 2846 concluded engagements
(~10x), 213 trainable freelancers (was 23), 311 trainable clients (was 23). Reran
`trust_score.run` + `trust_score.evaluate`:

- **Freelancer: -0.913 → +0.441** rank correlation. Bad-actor recall 4/4 (100%).
- **Client: +0.344 → +0.561** rank correlation. Bad-actor recall 6/7 (86%).
- SHAP sanity: 5/5 and 4/4 known bad actors flagged an unfavorable top signal. Determinism PASS
  both roles.

**Hypothesis confirmed — small-N was the dominant driver.** The model does learn the intended
signal; it just needed real volume. Python unit suite unaffected (70 passed, uses a separate
test DB/fixtures, not `canary_dev`). Committed e00cd9b.

### Round 14 — Task 14: Node seed conformance check

**Codex build:** wired `TrustScore`/`RiskSignal` into `validateSeed.js` + the expected-collections
list (both already existed as Mongoose models from Slice 0). Focused test passed 2/2. Full
`npm test` came back with **11 pre-existing failures** (module-resolution: passport, bcryptjs,
mongodb-memory-server, express-session) — correctly identified as unrelated to this 2-file change
and reported precisely rather than silently working around it.

**Claude's verdict:** confirmed via `node -e "require.resolve('passport')"` — `node_modules` was
genuinely stale (predates F3 auth's dependency additions), not a Task 14 regression. Ran
`npm install` at repo root myself (84 added, 27 removed, 37 changed) — fixed 43/44 files. The
last failure was the conformance test **timing out** at vitest's default 20s, a direct consequence
of my own 10x reseed (validating 5000 profiles' worth of documents legitimately takes longer than
500's worth). Bumped both conformance tests' timeout to 60s (mechanical fix, not a design
decision — did it directly). Re-verified: seedConformance 2/2 (23.8s), full suite 44/44 files,
131/131 tests. Committed eea37c8.

### Round 15 — Final full-repo verification

- Python (`apps/intelligence`): 70 passed.
- Node (`apps/api`): 44 files, 131 tests passed.
- Node (`apps/web`): 2 files, 3 tests passed.
- Working tree clean.
- Evaluation report at this point (500→5000 profile seed):
  - FREELANCER: test size 54, rank correlation 0.441, bad-actor recall 4/4 (100%), determinism
    PASS, SHAP sanity 4/4.
  - CLIENT: test size 78, rank correlation 0.561, bad-actor recall 6/7 (86%), determinism PASS,
    SHAP sanity 5/5.
- 16 commits landed on `rudra/slice-1-trust-score-engine` (14 plan tasks + 2 extra fix commits for
  the model.py class-handling bug, discovered via live-data verification, not caught by any
  synthetic unit test until deliberately reproduced). Log committed c512618.

### Round 16 — Rudra requested a second, bigger reseed to test the accuracy ceiling

Reasoning given to Rudra before running: 500→5000 fixed severe small-N noise AND populated a
previously-empty `"high"` bucket (0 examples at 500, 8-10 at 5000, still thin) — going bigger
again could plausibly help further via (a) thickening the still-thin `high` bucket, (b) tighter
variance on the correlation estimate. Recommended 4x (20000) over another 10x — diminishing
returns expected, not a repeat of the first dramatic flip.

**Reseeded `--num-profiles 20000`** (zero generator code changes, same as before): 11148 concluded
engagements, 812 trainable freelancers (was 213), 1164 trainable clients (was 311). Reran
`trust_score.run` (229,843 + 150,157 = 379,843 TrustScore snapshots written) and
`trust_score.evaluate`:

- Test set size jumped 54→203 (freelancer), 78→291 (client) — 4x more statistically reliable.
- **Rank correlation actually dropped**: freelancer 0.441→0.353, client 0.561→0.337.
- Bad-actor recall dropped too: freelancer 100%→78% (23 planted, 18 caught), client 86%→82%
  (22 planted, 18 caught).
- SHAP sanity 5/5 both roles, determinism PASS both roles — unchanged.

**Read: this is NOT a regression — it's the earlier 5000-profile numbers turning out to be a
lucky small-sample draw (classic regression-to-the-mean).** Model code is byte-identical between
both runs (zero changes) — only data volume changed. The 4x-bigger, far-more-representative test
set reveals a more honest, moderate correlation (~0.34-0.35) rather than the earlier optimistic
0.44-0.56. Confirms the diminishing-returns prediction made before running: 5000→20000 made the
estimate _more accurate_, not _higher_ — the signature of having already hit the real signal
ceiling (likely capped by the shared worse-party outcome-attribution noise flagged in Round 13,
which more data doesn't fix). **Recommended against a third reseed** — further N would tighten
the estimate further around the same ~0.35, not push it meaningfully higher.

**Final baseline, replaces the 5000-profile numbers from Round 13/15 as the reference:**
`canary_dev` holds **20000 profiles**, 812 trainable freelancers / 1164 trainable clients.
Correlation 0.35/0.34, bad-actor recall 78%/82%, both still clearly positive/functional — clears
the design spec's evaluation bar with a more statistically honest number than the first draw.
Python suite reconfirmed unaffected: 70 passed (no code touched this round).

## Summary

14/14 plan tasks complete. Every commit was Codex-built, Claude-verified (diff read + real test
run, never trusted a pasted report) before landing. 4 real bugs surfaced during execution, none
pre-existing in this plan's own logic once shipped — 3 were plan/fixture bugs (numpy/shap version
ceiling, a stale completion_rate assertion, a float-precision equality check) and 1 was a genuine
model.py robustness gap only real data volume exposed (non-contiguous XGBoost classes, fixed
properly with the Booster/DMatrix API in Round 13 after an incomplete first attempt in Round 12).

Two non-bug, demo-critical findings, both surfaced to Rudra before acting rather than silently
handled:

1. Live evaluation was initially degenerate (-0.91 freelancer correlation) purely from Slice 0's
   synthetic data volume being too thin against the cold-start gate — root-caused via
   `systematic-debugging`, fixed by reseeding 10x (500→5000), zero generator code changes.
2. Rudra asked to push further to test the accuracy ceiling — reseeded again 4x (5000→20000),
   which revealed the first reseed's numbers were an optimistic small-sample draw; the true,
   more statistically honest correlation is ~0.35 for both roles, still clearly positive with
   solid bad-actor recall (78-82%). Confirmed diminishing returns — recommended stopping here.

Final state: `canary_dev` holds 20000 profiles. 16 commits on `rudra/slice-1-trust-score-engine`,
not yet PR'd/merged into `main`.
