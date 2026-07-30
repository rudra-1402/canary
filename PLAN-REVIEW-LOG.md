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

---

# Order 3 (Trust Score read API) — Codex plan-review log

Started 2026-07-29. MAX_ROUNDS=5. Reviewer: Codex (`gpt-5.6-terra`, reasoning effort `high`),
**read-only every round**. Plan under review: `PLAN.md`. Builder/arbiter: Claude.

Roles are reversed from the Slice 1 section above. Slice 1's post-mortem found **3 of its 4
execution bugs originated in the frozen plan** — one directly from a verbatim `XGBClassifier`
snippet the plan supplied. So this time the adversarial pass runs on the _plan, before any code_,
rather than on the diff afterwards.

## Act 1 — Plan review

### Round 1 — Codex critique

`VERDICT: REVISE`. Thirteen findings, verbatim:

1. Route paths, batch query encoding, response envelopes and duplicate-ID behaviour are undefined — separate implementers could produce incompatible APIs. _Fix: add complete request/response examples and exact endpoint definitions._
2. Responses vary by viewer (`self` gets signals, `member` does not) yet the plan promotes cacheability with no cache policy — shared/browser caching could leak self-only signals. _Fix: `Cache-Control: private, no-store` on both endpoints._
3. "Latest by `generatedAt`" is nondeterministic when a rerun writes duplicate timestamps: `TrustScore` has no uniqueness constraint and persistence only inserts. _Fix: enforce `{profileId, generatedAt}` uniqueness/upsert, or sort with a defined secondary field._
4. The read can return a stale snapshot while computing cold-start eligibility from current history — mixing two different as-of states. _Fix: require the snapshot to be current through the newest relevant Outcome, else return an explicit stale state._
5. "Correct outcome counts" is underspecified and easy to implement wrong by counting Outcome rows without proving the Engagement is concluded and belongs to the Profile. _Fix: specify one aggregate joining concluded Engagements._
6. `requireAuth` permits any newly registered, unverified Identity with no Profile to enumerate all TrustScores — "member" is not actually enforced. _Fix: require a verified Identity with an owned Profile._
7. Per-Identity limiting is trivially bypassed by registering more Identities, and limit/window/key-generator/reset semantics are omitted so 429 cannot be tested reliably. _Fix: named limiter with explicit limits and identity keying._
8. Middleware order matters — identity keying requires Passport deserialization before limiting. _Fix: prescribe `requireAuth` before the identity-keyed limiter._
9. Signal-strength bands have no thresholds, normalization, or zero-value rule; "monotonic" alone permits unstable labels across retrained models. _Fix: versioned thresholds or per-snapshot normalized semantics._
10. Even without raw SHAP, self-only direction+strength still reveals score-optimization levers in an anti-gaming system. _Fix: fact-based explanations, or explicitly accept and document the tradeoff._
11. Batch "no N+1" does not ensure correct association: signals must be fetched only for selected snapshot IDs and with `parentType: 'TrustScore'`. _Fix: two-query batch algorithm, test that other-parent signals never appear._
12. Task 8 is not reproducible — "hand-patch" specifies no credentials, CSRF/session flow, cleanup or assertions. _Fix: deterministic disposable live-fixture script._
13. The API hides snapshot freshness, so consumers cannot distinguish a current score from one generated before a reseed or model revision. _Fix: include validated `generatedAt` and preferably a scorer/model version._

### Claude's response — Round 1

**Accepted (10):** 1, 2, 3, 4, 5, 8, 9, 11, 12, and 6-in-principle.

Three are materially serious and none were on my radar:

- **#2 is a real security hole.** Two viewers, same URL, different payloads, and I had argued _for_
  GET partly on cacheability grounds (decision 9). A shared cache serving a `self` response to a
  `member` leaks exactly the signals D12 exists to withhold. Directly contradicted my own reasoning.
- **#3 lands on a known defect.** `run.py` is not idempotent (`insert_one`, no upsert, no wipe) and
  is already tracked. If it is ever re-run without a wipe, duplicate rows share `generatedAt` and
  "latest" becomes arbitrary — the read would be silently nondeterministic. The plan's own context
  section documented the non-idempotency and I still failed to connect it to the read path.
- **#11 is a correctness bug I would have shipped.** `RiskSignal.parentType` is an enum of
  `TrustScore | RiskAssessment`; a naive `parentId $in [...]` batch query would mix parent types the
  moment RiskAssessments exist. Nothing today would catch it — `riskassessments` is empty, so the
  test would pass and rot.

**#4** is the subtlest: cold-start eligibility is computed from _current_ engagement counts while the
snapshot returned may be up to a month old, so one response can mix two as-of states. Accepted;
resolved by deriving both from the snapshot and surfacing staleness explicitly.

**Accepted in principle, scoped (#6):** requiring a verified Identity with an owned Profile is
right. ⚠️ But `emailVerified` is `false` on all 20 000 seeded identities, so enforcing verification
today locks every seeded user out — the plan must require _an owned Profile_ now and gate on
`emailVerified` only once `TS-C` sets it. Recorded so the ordering is not discovered at demo time.

**Rejected / narrowed, with reasons:**

- **#7's registration-abuse controls** — correct that per-identity limiting is bypassable by mass
  registration, but signup abuse control is a different subsystem and not Order 3's job. The limiter
  is specified concretely (limit/window/key/reset) so 429 is testable; the mass-registration vector
  is recorded as a tracked follow-up rather than absorbed silently.
- **#13's model/scorer version** — agreed in principle, but nothing on the Python side records a
  model version today, so this cannot be served without an intelligence-layer change. `generatedAt`
  was already in the response and now carries an explicit freshness contract. Model version recorded
  as a follow-up for the retraining segments, which are the ones that make it meaningful.
- **#10** — accepted as a _documented tradeoff_, not a redesign. Self-gaming toward "improve your
  on-time rate" is the behaviour the product wants; the danger is cross-party lever discovery, which
  D12 already closes. Notably Codex independently proposed fact-based explanations — the same option
  already flagged as open against the D1/D12 contradiction, which strengthens the case for it.

### Round 2 — Codex critique

`VERDICT: REVISE`. Eight findings, most of them consequences of the Round 1 fixes:

1. Cold-start after `TS-A` is contradictory: a below-threshold profile will have **no snapshot**, so there is no `generatedAt` for the stipulated as-of count. _Fix: define no-snapshot behaviour explicitly._
2. A profile can reach three Outcomes **after** the scorer last ran — neither `scored` nor legitimately `insufficient-history`, and no response variant represents it. _Fix: add a `pending-score` status._
3. "Strength as share of total snapshot contribution" **cannot be calculated** — persistence stores only SHAP's top three signals, not all feature contributions. _Fix: define strength relative to stored signals, or persist a snapshot-level total._
4. The live fixture is impossible as written: a newly created Profile cannot "point at" an existing scoreable Profile, and a new Profile has no snapshot. _Fix: complete disposable scored fixture, or reassign-and-restore._
5. The prescribed "two queries" cannot produce all required states and misses Profiles with no snapshots. _Fix: specify the exact query plan including snapshotless and unknown profiles._
6. `RiskSignal.source` permits `brief-analysis`, but the projection treats every signal as comparable SHAP data. _Fix: filter to `source: 'structured-data'` or define per-source semantics._
7. `snapshotIsCurrent: false` still returns normal `scored` status, relying on every consumer to notice a boolean before using stale trust data. _Fix: make stale a distinct status._
8. The 50-ID cap is applied only after de-duplication, so arbitrarily many repeated tokens pass until URL limits intervene. _Fix: cap raw token count too._

### Claude's response — Round 2

**All eight accepted.** Round 2 was more valuable than Round 1, because six of the eight are defects
_introduced by my Round 1 fixes_ — which is precisely what a persistent adversarial session is for.
A fresh reviewer each round would have re-litigated Round 1 instead of auditing its consequences.

The three that matter most:

- **#3 makes my Round 1 fix unimplementable.** I defined strength as a signal's share of the
  snapshot's total absolute contribution. `explain.py` sets `TOP_K_SIGNALS = 3` and persists only
  those three — the denominator does not exist in the database. I specified a computation over data
  that isn't stored, and no test written from that spec would have compiled against reality.
  Strength is now defined relative to the stored signals only.
- **#7 caught me contradicting my own principle.** Decision 1 rejects nullable fields precisely
  because they rely on consumers checking before rendering — then I introduced `snapshotIsCurrent`
  as a boolean doing exactly that. Stale is now its own status; the type system refuses to let a
  stale score render as current.
- **#2 is a genuinely missing state**, not a refinement. A profile that crosses the threshold
  between scorer runs is scoreable but unscored. It is neither of the two states I had, and it will
  occur constantly in a live system where the scorer runs monthly.

**#1** resolved by making the as-of rule conditional: counts are as-of the snapshot when one exists,
as-of now when none does — the only coherent reading once `TS-A` stops writing snapshots for
cold-start profiles.

**#4** resolved by exploiting D10 rather than mutating seeded data: a `member` may read _any_
profile, so verifying the `scored` branch needs only **one** loginable identity plus any scoreable
profile — no ownership, no reassignment. Only `self`-on-a-scored-profile needs ownership, and that
single case uses an explicit reassign-and-restore, or defers to post-`TS-C`.

**#5** accepted with a correction to my own framing: "two queries" was wrong, since snapshotless and
unknown profiles need the profile/outcome aggregate as well. The plan now specifies the actual query
plan and asserts a **bounded** count rather than the number two.

**#6** is forward-looking and cheap: Slice 3's brief analyzer will produce `source: 'brief-analysis'`
signals, and today's empty state means an unfiltered projection would pass every test and break
later — the same rot pattern as #11 in Round 1.

### Round 3 — Codex critique

`VERDICT: REVISE`. Six findings:

1. The four-state machine has no precedence rule for the known fabricated cold-start snapshots — a below-threshold Profile with a stored row can still be classified `scored`/`stale`. _Fix: define and test precedence, threshold first._
2. The exact middleware chain omits the "Identity owns ≥1 Profile" gate that decision 8 requires. _Fix: named participant guard with precise placement._
3. Cross-party reads ignore `Profile.discoverable`, letting any participant enumerate scores for private/onboarding-incomplete Profiles. _Fix: non-self reads only for discoverable Profiles._
4. Task 8 still leaves the self-read verification undecided ("either reassign-and-restore or defer") — an implementation choice the plan's own rules say must be fixed. _Fix: choose one._
5. The batch query plan has no consistency boundary; a concurrent scorer wipe/reseed can select a snapshot whose signals are gone. _Fix: consistent read, or detect missing signals and fail closed._
6. `stale.outcomesSince` has no type or counting rule. _Fix: define it and boundary-test._

### Claude's response — Round 3

**All six accepted.** Two would have shipped as real bugs:

- **#1 is the best finding of the whole review.** My four-state machine keyed on "does a snapshot
  exist" — and ~18 000 profiles currently hold _fabricated_ snapshots from the very defect `TS-A`
  exists to fix. Every one of them would have been served as `scored`. The plan documented that
  defect in its own context section and I still built a state machine that walks straight into it.
  Precedence is now explicit — threshold is evaluated **before** snapshot existence — and the
  precedence itself is tested, using today's live majority case as the fixture.
- **#3 is a straightforward privacy hole I missed.** `Profile.discoverable` exists on every document
  and I never consulted it. Any participant could enumerate scores for profiles that opted out or
  never finished onboarding. Non-self reads now respect it, returning **404 rather than 403** so the
  endpoint does not confirm the existence of a profile it will not disclose.

**#4 is fair and slightly embarrassing:** I wrote "state which, do not leave it implicit" and then
left it implicit. Decided — `self`-on-scored live verification defers to post-`TS-C`; mutating real
seeded data for one assertion, three days before that mutation becomes unnecessary, is not worth it.
The `self` projection remains fully covered by unit and db tests; only its live-HTTP confirmation
moves, and it is recorded rather than dropped.

**#5** is a genuine race: `TS-A` wipes `trustscores` + `risksignals` before re-running, so a read
during a reseed can select a snapshot whose signals are already deleted. Transactions need a replica
set and this is standalone, so the rule is **fail closed** — a `self` response with silently missing
signals is indistinguishable from a legitimate one.

**#6** resolved with the boundary that matters: outcomes timestamped exactly equal to `generatedAt`
count as **covered**, not **since**. The opposite reading would mark every snapshot stale the instant
it was written.

### Rounds 4 and 5 — Codex critique

**Round 4** (`VERDICT: REVISE`, 3 findings):

1. State evaluation cannot work from the specified aggregate — it needs both current and at-snapshot counts, but Task 5 windows at the snapshot. A profile with 2 outcomes at snapshot and 3 now must be `pending-score`. _Fix: return both counts plus `outcomesSince`, define predicates from both._
2. The scoring threshold has no cross-runtime source of truth — Python owns it, Node must independently decide every state transition. _Fix: shared versioned config artifact._
3. The identity-keyed limiter is still unspecified despite being security-critical — no max, window, store, or reset. _Fix: name the exact configuration._

**Round 5** (`VERDICT: REVISE`, 3 findings — **MAX_ROUNDS cap reached**):

1. Task 5 _still_ specifies one windowed count, contradicting the Decision 14 fix. _Fix: aggregate returns all three with explicit predicates per state._
2. The weighted batch limit cannot work in the stated middleware order — the limiter runs before Zod parsing/dedup, and stock `express-rate-limit` increments one hit per request. _Fix: parse before limiting with a custom weighted store, or charge flat._
3. The cross-runtime JSON artifact is a decision with no task, and it changes `packages/shared` and Python config while the plan claims to touch neither. _Fix: dedicated task with approval, or drop._

### Claude's response — Rounds 4–5

**All six accepted.** Round 5's #1 is the one worth dwelling on: I fixed Decision 14 in round 4 and
**left Task 5 contradicting it** — so an implementer following the tasks would have reintroduced the
exact bug the decision was written to remove. Fixing a decision without propagating to the task that
implements it is a plan defect of its own, and it is precisely how a "reviewed" plan ships a known
bug.

**Round 5 #2** killed a fix I had been pleased with. Weighted batch cost is unimplementable in the
prescribed chain — the limiter runs before parsing, so the id count doesn't exist yet, and stock
middleware increments one per request. Replaced with **two flat limiters** (120/5min single,
20/5min batch), which needs no custom store and bounds enumeration at ~1 000 profiles per 5 minutes
instead of ~6 000. Simpler _and_ stricter.

**Round 5 #3 — descoped rather than fixed.** Codex was right that I had added a decision with no
task, and right that it violates the plan's own scope claim. But the fix it proposes touches
`packages/shared` (frozen by `working-agreement.md`) and `config.py` (being edited concurrently by
`TS-A`/`TS-B`). Changing that file from two directions in one week is how merge defects are made.
The threshold stays duplicated, Node reads it from one module rather than several, and **`X-A` gains
an assertion that the API value matches the Python config value** so drift fails in CI. Recorded as
a follow-up for whichever segment next owns `config.py`.

---

## Outcome: MAX_ROUNDS reached without APPROVED — reported as such

Verdicts: `REVISE ×5`. Findings per round: **13 → 8 → 6 → 3 → 3**. Clear convergence, but the loop
hit its cap rather than converging to approval, and that is reported honestly rather than dressed up.

**Nothing is an unresolved disagreement.** All 33 findings were accepted, or narrowed/descoped with a
reason logged. There is no point where Claude and Codex still hold opposing positions.

**The real caveat: round 5's three fixes were never reviewed.** They are the newest and least-tested
part of the plan, and two of them (the two-limiter scheme, the descoped threshold artifact) are
material design changes made after the last critique. A sixth round would most likely find something
in them — the finding rate is still 3 per round, not 0.

### Rounds 6–7 — cap extended by Rudra

Rudra authorised extending past `MAX_ROUNDS=5`, specifically to review the three unreviewed round-5
fixes. Round 6 was pointed at them explicitly.

**Round 6** (`VERDICT: REVISE`, 2 findings):

1. The threshold drift guard is not executable — "`X-A` gains an assertion" names no file and no mechanism, and `X-A` is a segment ID in a different repo, not a test target. _Fix: name the Node module and add a runnable conformance task._
2. The two limiters do not bound enumeration at ~1 000 — one identity can spend 20 batch requests (1 000 ids) **plus** 120 single reads in the same window. _Fix: document the real 1 120 bound or add an aggregate limiter._

**Round 7** — `VERDICT: APPROVED`:

> "No remaining material implementation flaw found. The revised limiter, drift guard, and state
> aggregate are internally consistent."

### Claude's response — Round 6

Both accepted; both were mine to get wrong.

- **#1 was a vacuous guard**, which is the specific failure this project keeps hitting. I wrote a
  drift assertion that named no file and no mechanism — the plan-level equivalent of
  `seedConformance` passing with `checked: 0`. Now **Task 0**, with named files, a stated mechanism
  (the JS test text-parses `config.py` for `min_engagements_for_scoring: int = <n>`), and — the part
  that matters — **the test fails if the regex matches nothing**, so the guard cannot itself become
  vacuous.
- **#2 was an arithmetic error.** I claimed ~1 000; it is (20 × 50) + 120 = **1 120**, because the
  limiters are independent. Corrected in place rather than papered over. No aggregate limiter added:
  the difference is immaterial to the threat model, and an aggregate limiter reintroduces exactly the
  custom-store complexity the flat scheme was adopted to remove.

---

## Outcome: APPROVED at round 7

Findings per round: **13 → 8 → 6 → 3 → 3 → 2 → 0.** Thirty-five total, all accepted or narrowed with
a logged reason; **zero unresolved disagreements**.

**Extending past the cap was worth it.** Rounds 6–7 cost ~10 minutes and caught a vacuous guard plus
a wrong number — both in the fixes that had never been reviewed, exactly where the risk was
predicted to be.

**What the loop bought, concretely** — three defects that would have shipped:

1. **State precedence.** The state machine keyed on "does a snapshot exist"; ~18 000 profiles hold
   fabricated snapshots from the `TS-A` defect and would every one have been served as `scored` —
   in a plan whose own context section documents that defect.
2. **Shared-cache leak.** Viewer-dependent payloads on a cacheable GET, no cache policy.
3. **`Profile.discoverable` ignored**, letting any participant enumerate opted-out profiles.

Plus two missing states, a strength normalisation specified over data that is not persisted, and a
`parentType` filter whose absence would pass every test today and rot until RiskAssessments exist.

**Next:** `codex-build` — roles flip, Codex implements, Claude reads every diff and runs every test
before each commit. Build rounds append below.

## Act 3 — Build

Roles flipped: Codex builds, Claude verifies. Launched with `-s workspace-write -c
approval_policy="never"` rather than `--yolo` — a real filesystem boundary instead of a bypass,
after Claude Code's classifier (correctly) blocked the dangerous-bypass flag. Containment was
layered: OS sandbox (real) + prompt file-allowlist (cooperative) + post-build diff check against
that allowlist (real) + clean tree and no Codex commits (real, fully revertible).

### Round 1 — Codex build

11 files created, 3 modified. **Allowlist compliance exact** — nothing written off-list.

- `packages/shared/contracts/trustScore.js` — 4-state discriminated union, `.strict()` throughout,
  band/strength enums, batch param
- `apps/api/src/trustScore/{scoringConfig,bands,trustScore.service,trustScore.controller,trustScore.routes}.js`
- `apps/api/scripts/verifyTrustScoreLive.js` — Task 8 disposable live fixture
- 4 test files matching the house convention
- modified: `app.js` (mount only), `packages/shared/index.js` (re-export only),
  `seedInvariants.test.js` (Task 0 drift guard only)

### Claude's verdict — Round 1

**Proof run by Claude, not trusted from the report:** `Test Files 49 passed (49) · Tests 169 passed
| 9 expected fail (178)`.

**The trap held.** The nine `it.fails()` cases in `seedInvariants.test.js` are untouched — a cold
builder "helpfully" fixing them would have turned the suite green while nine tracked defects
silently stopped being tracked, and a green suite is exactly what stops anyone looking. The drift
guard Codex added carries the required vacuity check (`expect(match).not.toBeNull()`), so the guard
cannot itself become vacuous.

**Verified against the decisions the review fought for** — precedence checks `currentOutcomeCount`
_before_ snapshot existence (round 3's best finding); `discoverable` returns not-found not 403;
staleness uses strict `>` so equal timestamps count as covered; signals filtered to
`source: 'structured-data'` and `parentType: 'TrustScore'`; no numeric `value` reachable on the wire;
middleware order and both limiters as specified; `Cache-Control: private, no-store` asserted at
`routes.test.js:45`.

**One genuine gap, fixed by Claude directly** (sub-20-line edit — the skill says not to delegate
those): **no query-count assertion**. The plan singled this out precisely because _correctness alone
passes with a per-id loop_, and a waterfall would surface only as slowness on Find Work. Added a
test asserting DB round-trips are identical for 1 and 12 profiles. Passes; query count is constant
at 4, independent of batch size.

**Deviations accepted, with reasons:**

- `STRENGTH_WEAK|MEDIUM|STRONG` instead of the spec's `SLIGHT|MODERATE|STRONG`. Cosmetic; both are
  non-prose identifiers, which was the actual requirement.
- Batch duplicates are **rejected at the contract** (400) while the service also collapses them
  defensively. The spec was internally ambiguous here ("one entry per requested id" vs "duplicates
  collapsed"); rejecting at the edge and collapsing in depth resolves it coherently.
- The fail-closed missing-signals guard throws for **any** eligible profile, including `member`
  reads that would not include signals anyway. Broader than the spec scoped it, but it errs toward
  failing closed, and narrowing it is a design call rather than a defect. Flagged, not changed.

Fix rounds used: **0 delegated** (1 gap fixed in-place by Claude).
