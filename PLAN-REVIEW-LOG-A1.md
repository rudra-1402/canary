# Plan Review Log: A1 generator semantic pass

Started 2026-08-01. MAX_ROUNDS=5. Model: gpt-5.6-terra (high).

## Round 1 — Codex (gpt-5.6-terra, high)

Material issues remain:

- A compound unique index on `{engagementId, subjectProfileId}` prevents duplicates, not a third Outcome for an unrelated Profile; it does not enforce “exactly two, one per Engagement party.” Fix: enforce party/role/counterparty mapping and cardinality in a transaction or database validator, then test a third/non-party row is rejected.

- The existing Python fetch path and API `outcomeRows()` still assign every Outcome to both Engagement parties; with two rows they will credit each Profile with the wrong row (and the API `$group` picks one arbitrarily). Fix: query/index Outcomes by `subjectProfileId` and add end-to-end attribution tests for both scoring and serving paths.

- `payments.py` and ordinary-review generation collapse Outcomes with `{engagementId: outcome}`; after the change one party’s row silently overwrites the other. Fix: select the client Outcome for payment and the reviewed subject’s Outcome for rating logic, with explicit tests.

- `recordedAt` is specified as dependent on a payment event, but payments are generated after Outcomes; the plan creates a circular dependency and does not modify `payments.py`. Fix: generate a shared event timeline before both Outcome and Payment records.

- Newly created concluded Engagements can have `createdAt == now` or a future `dueAt`; clamping conclusion time to `now` then violates the required strict `recordedAt > createdAt`. Fix: make lifecycle generation ensure concluded Engagements have sufficient elapsed time, due date, delivery, payment, review, and recording chronology.

- Review timestamps remain persisted as `engagement.createdAt`, so future review behavior is available in historical feature windows even after Outcome timestamps are fixed. Fix: generate and persist review/visibility timestamps after the relevant conclusion event and filter features by visibility time.

- Gate 1 is internally contradictory: `labels.py` still derives labels from the feature vector, the repository has `FEATURE_NAMES` rather than `FEATURE_COLUMNS`, and A1 explicitly postpones temporal labels to A4. Fix: make Gate 1 an event-row/window-overlap check tied to the actual A4 label builder, and mark all of it not evaluable before that builder exists.

- Role-aware rows do not make the current role-blind feature/label design valid: freelancers have no payment/scope-creep conduct and clients have no delivery lateness, yet every feature and all four label terms are required for every Profile. Fix: define and test separate role-specific feature/label contracts (or a shared-only label) and run gates per role.

- “Subject is a party” is insufficient Review validation: it permits a non-party author, self-review, and duplicate reviews by one author; raw PyMongo writes bypass Mongoose validation anyway. Fix: enforce author/subject as opposite Engagement parties plus one-review-per-author-per-Engagement in the persistence boundary/database.

- The listed Zod targets do not exist (`apps/api/src/contracts/`); shared contracts live under `packages/shared/contracts/`, and none cover these models. Fix: name the actual shared contract files/exports and every API/generator consumer that must adopt them.

- The proposed model tests validate Mongoose only, while the production seed path writes raw documents; malformed documents can still enter Mongo. Fix: validate generated persistence documents against a shared schema or Mongo collection validator before insertion.

- “Independent RNG streams” does not establish independent behavior: all fields may still share correlated traits, and Gate 3 merely drops `ghosted` rows rather than requiring `observed` rows. Fix: define the intended conditional model, gate on `observed && !ghosted`, and measure residual dependence with adequate stratification.

- Statistical gates rely on one seeded sample, have no minimum sample size/confidence interval, and call a pooled-total-SD statistic “Cohen’s d” although it is not Cohen’s d. Fix: use a documented effect-size estimator with per-archetype minimums and multi-seed confidence bounds.

- Sabotage checks can pass with zero sabotage reviews, and “low rating contradicts good conduct” still permits every planted review to be a constant one-star signature. Fix: require a nonzero/minimum planted population and test rating diversity plus eligibility based on the subject’s own observed Outcome.

- The plan changes neither generator validation nor seed invariants to verify the new cross-record rules; existing `it.fails` still expects `responsibleParty`, not `subjectProfileId`. Fix: update validation/seed invariants to audit persisted two-row attribution, role/null semantics, review-party rules, and non-vacuous counts.

VERDICT: REVISE

### Claude's response — round 1

Accepted 14 of 15 findings. Six new tasks added (18 fetch.py attribution, 19 outcome-lookup collisions, 20 review timestamps, 21 persistence-boundary validation, 22 role-specific contracts, 23 seed invariants). Verified at source before accepting: fetch.py:17-18 dual-assign CONFIRMED; run.py:151,154 outcomes-before-payments CONFIRMED (recordedAt circularity real); packages/shared/contracts/ CONFIRMED (only health/jobPost/auth/trustScore exist); seedInvariants.test.js:456 responsibleParty CONFIRMED.

REJECTED 1: Codex claimed the repo has FEATURE_NAMES rather than FEATURE_COLUMNS. Both exist (model.py:7-17, features.py:1-11) with identical contents. Underlying concern valid (wrong citation in the plan); correction itself wrong. Real finding is the duplication -> Task 22.

Re-cost: A1 8-11h -> 13-17h. Model track 21-29h -> 26-35h. Total with Slice 2: 4.7-6.4 days against 5.

## Round 2 — BLOCKED, not converged

`codex exec resume` failed: `You've hit your usage limit ... try again at Aug 30th, 2026 11:58 PM.`
Round 1 consumed 115,336 tokens at gpt-5.6-terra/high.

**Do not read the named date as a hard wall.** On 2026-07-31 the identical error named Aug 28th and
a probe hours later succeeded — it was a rolling window. Probe before concluding Codex is gone; a
whole decision was previously made on that false premise.

**Loop state: round 1 of MAX_ROUNDS=5, last verdict REVISE, all 14 accepted findings incorporated,
no confirmation pass.** This is a deadlock-by-unavailability, not a convergence. Recorded as such
rather than presented as approval.

## Round 2 — Codex (gpt-5.6-terra, high)

The revised plan is materially better, but it is still not executable as written:

- Task 17 runs the smoke/gate report before Tasks 18–23, even though those later tasks fix attribution, validation, role contracts, and review leakage. Fix: move Tasks 18–23 before the gate run and rerun the final evidence after all fixes.

- The 500-profile smoke run cannot satisfy the stated minimum of 200 scoreable Profiles per archetype per role: bad-actors are only ~8% of Profiles and roles split ~60/40. Fix: use a sufficiently large multi-seed gate dataset or explicitly mark gates 2–6 not evaluable at 500.

- Gate 1 remains logically incompatible with D1: a temporal label may legitimately use the same named measure in a later window, while Task 22 still computes labels from role feature terms. Fix: replace column-name disjointness with a strict event/time-window non-overlap check in the actual A4 label builder.

- Role-specific vectors with different keys cannot pass through the current `features_to_dataframe`, which indexes every row with one global `FEATURE_COLUMNS`; deferring the one-model/two-model decision leaves A1’s pipeline undefined. Fix: choose and specify either two fixed role-specific model schemas or one fixed superset schema with explicit missing-value handling now.

- `trend_slope` is declared shared, but its current definition is delivery/on-time based; client rows have no `daysLate`. Fix: make it freelancer-only or specify and test a distinct client trend metric.

- Task 4 says a non-party third Outcome is rejected, but its implementation step only adds a compound index and fields; neither Zod nor a normal Mongo validator can verify Engagement-party membership across collections. Fix: specify an atomic service/transactional persistence check for the Engagement-to-two-Outcomes mapping and test concurrent/third-row attempts.

- Task 21 says Python should validate against shared Zod contracts “or a Mongo collection validator,” but neither option defines how cross-document Review/Outcome party invariants are checked. Fix: create one explicit Python-side relational validator over resolved Engagement/Profile IDs before inserts, alongside structural schema validation.

- The shared-conclusion-timeline change is not assigned to a concrete module/interface: Task 11 lists only `outcomes.py`, yet says both Outcomes and Payments must consume a precomputed timeline. Fix: name/create the timeline producer, add `payments.py` and `run.py` to Task 11, and test both consumers receive identical event times.

- Both-ghost semantics remain unspecified: the table omits `observed` and null-conduct behavior for that case, leaving feature denominators implementation-defined. Fix: state and test the exact field values for both rows when both parties ghost.

- The individual contract tasks still point to nonexistent `apps/api/src/contracts/` despite the corrected file table naming `packages/shared/contracts/`. Fix: update every task to create/import the actual shared contracts and list the package export changes.

- `proposedDurationDays` is tested as an integer but specified only as `Number, min 1`; fractional “days” can pass. Fix: enforce integer and positive constraints in both Mongoose and Zod.

- The serving-path correction is still conditional prose (“inspect … if present”), although `apps/api/src/trustScore/trustScore.service.js` currently does group Outcomes by Engagement and selects one. Fix: make that service and its DB tests explicit Task 18 files and assertions.

VERDICT: REVISE

### Claude's response — round 2

Accepted all 12. Changes: Task 17 -> Task 24, moved after 18-23 (it verified a system the later tasks had not yet fixed). Gate 1 redefined from column-name disjointness to row/window non-overlap, marked not-evaluable in A1. Sample-size precondition now states gates 2-6 are NOT evaluable at 500 profiles (~20 per cell vs 200 minimum) and that reaching it is an A2 fan-out requirement, not a reason to lower the bar. One superset model schema with NaN + subject_role decided in A1 (was deferred to A4; features_to_dataframe cannot take heterogeneous keys). trend_slope moved from shared to role-parameterised (on-time for freelancers, paid-in-full for clients). Task 4 no longer claims the index enforces party membership/cardinality; those move to an explicit persistence-boundary check with third-row and concurrent-insert tests. Task 21 split into structural + relational validation over resolved ids. Task 11 gains generator/timeline.py as a named producer plus payments.py and run.py as consumers, asserting identical event times. Task 18 makes trustScore.service.js explicit rather than conditional prose. Both-ghost case field values specified. proposedDurationDays integer-enforced in Mongoose and Zod. Remaining apps/api/src/contracts paths corrected to packages/shared/contracts.

## Round 3 — Codex (gpt-5.6-terra, high)

Still material issues:

- The “shared timeline” is still circular: it requires both parties’ conduct, but `run.py` is told to produce it before `generate_outcomes`, whose conduct includes `daysLate`/`paidInFull`. Fix: explicitly split conduct drawing from Outcome materialization: draw conduct → build timeline → emit Outcome/Payment/Review documents.

- `subject_role` is a model feature but is constant within each role; gates 2 and 4 run per role and therefore must fail it as zero-separation/100%-degenerate. Fix: mark the role discriminator as exempt metadata for per-role signal gates, or evaluate it only in a pooled-schema gate.

- `scopeCreepOccurred` remains `default: false` in the current model, contradicting the required null conduct fields for freelancer, unobserved, and both-ghost rows. Fix: make role-inapplicable/unobserved conduct fields nullable with no default, and add exact role/observation nullability tests.

- The app-path relational guarantee is still only prose: Task 4 says a “service-level check” covers it, but names no service, transaction, or test; a concurrent app write can create an invalid third row. Fix: add an explicit app persistence service/transaction task for Outcome and Review writes.

- “One review per author per engagement” has no stated compound unique index, so query-based validation races under concurrent inserts. Fix: add and test a unique `{ engagementId, authorProfileId }` index.

- Task 12’s “at least N sabotage reviews” leaves `N` undefined, so the supposedly non-vacuous detector target still has no enforceable floor. Fix: specify a fixed minimum/rate, sample size, and multi-seed requirement.

- Task 16 still tests Gate 1 as feature/label-name disjointness, although the revised gate correctly uses row/window non-overlap. Fix: replace that gate test with overlapping and non-overlapping event-window fixtures.

- Task 24 correctly marks gates not evaluable at 500, then incorrectly calls the definition-of-done rows “structural” even though paid separation, on-time degeneracy, and scope-creep independence are statistical claims. Fix: split smoke-only structural evidence from A3’s adequately powered statistical definition of done.

- Part 1 still states the compound index enforces “exactly two rows max” and Gate 1 is name disjointness, directly contradicting the corrected implementation plan. Fix: update the stale spec tables and definition-of-done rows before execution.

- Task 3 requires integer proposal duration in tests but its implementation instruction still says only “Number, min 1”; `revisionsIncluded` likewise lacks integer/nonnegative constraints. Fix: state and enforce integer/minimum constraints in both Mongoose and Zod.

VERDICT: REVISE

### Claude's response — round 3

Accepted all 10. Timeline circularity resolved by splitting into three phases (draw relative conduct -> build absolute timeline -> materialize documents); the earlier fix conflated drawing behaviour with dating it. subject_role exempted from gates 2/4a as a discriminator (a defect introduced by round 2 own superset fix). scopeCreepOccurred and all role-inapplicable/unobserved conduct fields made nullable with no default, tested per role/observation combination. New Task 23b: transactional app-path Outcome+Review write service with concurrent-write tests. Unique {engagementId, authorProfileId} index replaces query-based one-review-per-author check. Task 12 floor defined: >=30 planted sabotage reviews per seed at 5k, >=1.5% of saboteur-party engagements, >=5 seeds, >=3 distinct ratings. Task 16 gate-1 test switched to event-window fixtures. Task 24 definition-of-done split into structural (checkable at 500) vs statistical (deferred to A3). Spec Part 1 corrected: index no longer claimed to enforce exactly-two, gate 1 restated as row/window non-overlap in both the gate table and the definition-of-done.

## Round 4 — Codex (gpt-5.6-terra, high)

Material issues remain:

- Task 22 is self-contradictory: it first requires role vectors to omit inapplicable columns, then requires every row to carry every superset column as `NaN`. Fix: keep only the superset contract and assert inapplicable columns exist with `NaN`.

- `subject_role` is specified as an XGBoost feature but no numeric/categorical encoding is defined; the current `xgb.DMatrix` path will reject ordinary string/object columns. Fix: specify deterministic 0/1 encoding or pandas categorical plus the required XGBoost categorical configuration and tests.

- Gate 3 cannot apply unchanged to `ghost_rate`: filtering to `observed && !ghosted` makes the subject’s ghost indicator identically zero, so any label containing that shared term must fail. Fix: define exact per-role label terms/weights now and give the ghost term a separate, valid independence/recoverability check.

- Task 23b requires transactions, but the repository’s default Mongo URIs target a standalone `mongodb://127.0.0.1:27017`; Mongo transactions require a replica set, and the plan provisions neither one nor a fallback. Fix: explicitly provision and startup-check a replica set, or redesign the write invariant around enforceable atomic documents/indexes.

- The actual existing scoring-fetch test is `apps/intelligence/tests/test_trust_score_fetch.py`, but Tasks 15 and 18 target nonexistent/invented paths (`apps/api/tests/trustScore/test_trust_score_fetch.js` and `test_fetch.py`), so the old dual-attribution test can remain unmodified. Fix: name and update the real Python test file, plus the API service DB test file.

- Task 3 says it will tighten `Engagement.agreedTerms.revisionsIncluded`, but its owned files/commit are Proposal-only while Task 2 still specifies that field as merely `Number, default 0`. Fix: move the integer/nonnegative Engagement change and contract test into Task 2, or add those files explicitly to Task 3.

VERDICT: REVISE

### Claude's response — round 4

Accepted all 6. Task 22 contradiction resolved in favour of the superset contract (role contracts describe which columns are POPULATED, not which exist). subject_role encoded numerically 0/1 with a dtype assertion (DMatrix rejects object columns). Gate 3 now exempts the ghost term and routes it to gate 2 over all observed rows, because filtering to !ghosted makes the ghost indicator identically zero -- it would have failed by construction. Per-role label STRUCTURE fixed in A1 (gate 3 is undefined without it) while WEIGHTS stay measurement-driven in A4 per Rudra decision 1. Task 23b: single-node replica set provisioned for dev and CI with a loud startup check, since both default to standalone mongod and transactions would have failed at runtime; index-plus-precheck kept as a documented fallback with its residual race stated. Four invented test paths corrected to the real files (test_trust_score_fetch.py, test_trust_score_features.py; apps/api/tests/trustScore/ does not exist) -- Task 15 would otherwise have rewritten a nonexistent file and left the real dual-attribution test in place. revisionsIncluded integer/min-0 constraint moved from Task 3 to Task 2, whose files it actually belongs to.

## Round 5 — Codex (gpt-5.6-terra, high) — FINAL ROUND (MAX_ROUNDS=5)

- The “one superset model” decision is not wired into the actual pipeline: [`trust_score/run.py`](F:\Canary\apps\intelligence\trust_score\run.py) currently trains separately per role and calls `compute_features` without a role, while Task 22 does not modify `run.py` or backfill. Fix: add `run.py`/backfill changes and integration tests that train one mixed-role model and pass the encoded role into every feature snapshot.

- The freelancer label includes “scope adherence as experienced” from the counterparty’s revision behavior, conditionally “if it proves independent”; that reintroduces cross-party attribution and makes label structure measurement-dependent. Fix: remove counterparty conduct from the freelancer label and fix all label terms before measurement.

- Task 23b still does not name the local replica-set configuration, CI workflow/service configuration, startup-check implementation, or a command that verifies transactions; “provision” is not an executable plan step. Fix: name and test the exact local/CI configuration files and add a transaction-capability integration command before the service implementation.

- Task 22 declares `test_trust_score_model.py` responsible for dataframe/XGBoost assertions but only runs `test_trust_score_features.py`; the model-schema path can therefore stay broken with the task green. Fix: run both test files in the task’s fail/pass commands.

VERDICT: REVISE

### Claude's response — round 5

Accepted all 4. trust_score/run.py and backfill.py added to Task 22 with a mixed-role end-to-end integration test -- the one-superset-model decision was recorded in the spec and never wired into the pipeline that implements it, so run.py would have kept training per role. Freelancer label third term removed outright: it derived from the COUNTERPARTY revision behaviour (reintroducing the cross-party attribution D3 abolishes) and was hedged as conditional (making structure measurement-dependent, which that section exists to prevent). Task 23b replica-set provisioning made executable: named local --replSet command and URI change, CI workflow service-container change across every Mongo-touching job, a loud boot-time transaction capability probe, and a verification integration test that gates the task from starting. Task 22 fail/pass commands now run both test_trust_score_features.py and test_trust_score_model.py.

## LOOP TERMINATED AT MAX_ROUNDS=5 WITHOUT APPROVAL

This is a cap-out, NOT a convergence. Round 5 verdict was REVISE; its 4 findings are incorporated but UNVERIFIED by a 6th round. Findings per round: 15, 12, 10, 6, 4 -- monotonically decreasing and narrowing in scope, but not zero. Handing to the human per the skill rules. Precedent exists for extending the cap (Order 3 plan ran to round 6 with a Rudra-extended cap).

## Round 6 — Codex (cap extended by Rudra)

- Gate 6 and the fixed freelancer label contradict each other: `avg_days_late` is a freelancer feature and is explicitly documented as high-separation (`d=1.89`), but the fixed freelancer label omits it, so Gate 6 must fail by design. Fix: include it as a freelancer label term now, or predeclare a justified collinearity exemption in Gate 6.

- Task 22 now trains one mixed-role model end-to-end, but role-label weights and bucket thresholds are explicitly deferred to A4; `compute_reliability_index` cannot produce the required training labels without them. Fix: either fix the role-specific label formulas/weights/buckets in A1, or defer the mixed-model training integration and label implementation to A4.

- Task 11 says `reviews.py` materializes documents from the shared timeline, but does not list it as a Task 11 file or test its timeline input; Task 20 instead only changes `run.py` persistence. Fix: choose one owner for review timing, name its interface and files, and test that review generation/persistence cannot bypass the shared timeline.

VERDICT: REVISE

### Claude's response — round 6

Accepted all 3. Gate 6 vs the fixed freelancer label was a genuine self-contradiction: avg_days_late at d=1.89 clears the >=1.0 omission floor but the label omits it, so the gate failed by design. Resolved with a PREDECLARED collinearity exemption -- on_time_rate and avg_days_late both derive from daysLate, so requiring both would double-weight one behaviour while looking like two terms. Exemption is named at declaration with its sibling recorded so it cannot be granted retroactively; which of the two becomes the term is A4 measurement, since both are currently distorted by the lateness floor bug. Mixed-role TRAINING integration moved from Task 22 to A4 -- compute_reliability_index cannot emit labels without weights and buckets, which are A4 by Rudra decision 1; A1 delivers schema, encoding and role-aware features only. This REDUCES A1 scope, the first reduction in six rounds. Review timing consolidated under Task 20 as sole owner consuming timeline.py; it had been split between Tasks 11 and 20 with neither owning it.

## Round 7 — Codex

- Tasks 4–5 require cross-document party/cardinality validation, but their listed Mongoose/Zod-only work cannot implement or pass those tests; fix: move those assertions wholly to Task 23b’s service integration tests and limit Tasks 4–5 to local schema/index validation.

- Task 22 says A1 must not train because labels are undefined until A4, yet `run.py` still trains/scores and the plan never specifies a non-training replacement; fix: add an explicit feature-preparation-only mode and make scoring/training unavailable until A4.

- `evaluate.py` is untouched despite calling role-less `compute_features` and legacy labels, and `explain.py` lacks a display mapping for new `subject_role`; fix: include both consumers and tests in Task 22.

- Gate 6 tests only generic omission and never verifies the named lateness-sibling exemption is exclusive; fix: test that only the declared sibling pair is exempt and all undeclared/ex-post exemptions fail.

- Replica-set setup is still prose, with no concrete CI service command, primary-readiness poll, or listed workflow/setup files; fix: prescribe the exact CI/local configuration plus an idempotent initiation-and-primary wait before transaction tests.

- Several prescribed pytest commands include literal “(CREATE …)” prose, and Task 20 names nonexistent `test_features.py`; fix: use valid commands and `test_trust_score_features.py`.

VERDICT: REVISE

### Claude's response — round 7

Accepted all 6. Cross-document assertions moved out of Tasks 4-5 (Mongoose/Zod cannot express them, so those tests could never have passed against those tasks) into Task 23b; Tasks 4-5 keep only local schema/index/nullability validation plus the self-review check. run.py gains an explicit feature-preparation-only mode with training/scoring failing loudly until A4. evaluate.py and explain.py added to Task 22 as untouched consumers of the role change. Gate 6 exemption exclusivity now tested: undeclared features still fail and post-hoc exemptions are rejected. Replica-set setup gains idempotent initiation plus a primary-readiness poll in local and every Mongo-touching CI job. Repaired self-inflicted damage: a bulk path rename in round 4 had injected the prose "(CREATE - no generator-run test file exists today)" INSIDE three literal pytest command strings, and Task 20 still named a bare test_features.py.

### TREND REVERSAL — findings per round: 15, 12, 10, 6, 4, 3, 6

Round 7 went UP. Of its 6 findings, 2 were introduced by round 6 own fixes and 1 was pure bulk-edit damage from round 4. The loop is no longer monotonically converging: revisions are now introducing roughly as many defects as they remove. Recorded as a plateau signal, and surfaced to Rudra rather than ground on.
