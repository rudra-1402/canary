# Plan Review Log — PLAN-UI (golden-path UI + missing writes)

Started 2026-08-02. MAX_ROUNDS=3. Reviewer: Codex gpt-5.6-terra, reasoning effort high, read-only.
Plan: `PLAN-UI.md`. Builder/arbiter: Claude Opus 5.

## Round 1 — Codex (gpt-5.6-terra, high)

**P0** Gate 4b passes `[0.00..0.34] + [1.0]x65`: 36 distinct, thresholds .33/1.00, bands low=33 med=2 high=65. A two-example middle class is degenerate. → require a minimum class count/proportion + this regression test.
**P0** Gate accepts near-constant distinct labels with balanced tertiles; never checks separation is meaningful. → add a spread criterion grounded in measurement resolution.
**P1** `outcomeReview.service.js` is neither transactional nor combined and does not reject non-`concluded`; a route over its two functions can persist an Outcome without its Review.
**P1** Ownership-sensitive IDs come from the request, not the session — a party can submit the counterparty's Outcome/Review.
**P1** New Reviews default `visibleAt: null` and the read API excludes nulls, so submitted reviews stay invisible; no server-side release defined.
**P1** `Proposal` has no unique `{jobPostId, freelancerProfileId}` index; concurrent duplicates defeat a service-level check.
**P1** Every concluded Engagement already has exactly two Outcomes, so Screen 9 on seeded data is always a duplicate rejection.
**P2** `POST /api/jobposts` and profile edit serve Screens 15/11, which the plan itself declares out of scope.
**A2** `trustScore.service.js` returns signals only to the profile owner, so a counterparty Trust Score has no explanation.
**A3** There is no root `.env`; `apps/api` and `apps/intelligence` load separate files.
**A4** shadcn/Radix is not installed; A4 hides an install + integration decision.

VERDICT: REVISE

### Claude's response — verified each before acting

**Accepted, verified first-hand:**

- P0 #1 **confirmed by running it**: `bands {'low': 33, 'med': 2, 'high': 65}` passes. Adding a minimum band size of 200, reusing the existing `MIN_SCOREABLE_PER_ARCHETYPE = 200` precedent in `quality/gates.py` rather than inventing a constant. Real margins are 2027 (freelancer min band) and 1640 (client) — 8x clear, so the floor is not tuned to pass. Codex's exact counterexample becomes a regression test.
- P0 #2 accepted: adding an interdecile spread floor (p90-p10 >= 0.10), grounded on the 0-100 reporting scale, not on what passes.
- P1 outcome/review **confirmed**: `createOutcome` and `createReview` are separate exports, the file's own comment documents the residual race, and nothing checks lifecycle state.
- P1 authorization accepted — session-derived identity, impersonation tests.
- P1 `visibleAt` accepted — server-owned release. Matches a defect already recorded in `tracking.md` (0 of 17 111 seeded reviews carry the field).
- P1 proposal unique index accepted.
- P2 scope accepted — cutting `POST /api/jobposts` and profile edit. The plan contradicted itself.
- A2 **confirmed**: `trustScore.service.js:58` attaches signals only when `viewerRelation === 'self'`. This is worse than a doc error — Screen 3 is the golden path's evaluation gate and the reasons are not served to the viewer. Adding a counterparty explanation contract as new scope.
- A3 **confirmed**: no root `.env`. Two files must be repointed.
- A4 accepted — committing to plain Tailwind primitives, no shadcn, no registries.

**Rejected in part, with reason:**

- P1 demo data. The seed holds **52 180 `active` engagements** alongside 58 608 concluded. Screen 9 operates on an active engagement and transitions it; it is not blocked. Codex's trap is real for concluded engagements only, so the fix is a scoping rule, not a new lifecycle path.

**Found by Claude, missed by Codex:**

- `quality/gates.py:30` still defines `LABEL_DEGENERACY_MAX_SHARE = 0.10` and enforces it at line 311. Removing the rule from `trust_score/labels.py` left a second copy live in the gate suite, so the two paths now disagree. Reconciling both.

## Round 2 — Codex

Conceded the Screen 9 point on evidence: _"I agree: the 52,180 active engagements provide real transition targets; I wrongly generalized the concluded-engagement invariant."_

**P0** A label passing every distribution floor can still be unlearnable — identical feature rows with randomly assigned labels give 302 distinct, bands 300/300/300, p90-p10 ~0.91. → gate persistence on a held-out learnability baseline.
**P1** C.2 concludes the engagement after the first party writes, then rejects the counterparty as non-active — stranding it with one Outcome and no double-blind release.
**P1** "Detectable" partial writes are not recoverable: Outcome succeeds, Review fails, retry hits the duplicate rejection and can never complete.
**P0** `run.py` emits `riskSignals: []`, persistence writes none, and `trustScore.service.js:183` throws for an eligible snapshot with no signals — the post-persist HTTP check and counterparty reasons both fail.
**P1** Screen 9 freelancer-only cannot demonstrate double-blind release, which needs the client's submission.

VERDICT: REVISE

### Claude's response — all five accepted, each verified first-hand

- **riskSignals blocker CONFIRMED by reading the code.** `score_current_profiles` sets `"riskSignals": []` on both branches; `persistence.py` iterates that empty list; the API throws for exactly the profiles that have a real score. Persisting today would 500 the golden path. Promoted to **Part B.0, a blocker**, with end-to-end persist-to-HTTP verification. This is a regression from the A1/A4 rewrite — the earlier pipeline persisted 20 112 signals. **Highest-value finding of the review; it would otherwise have surfaced during the demo.**
- C.2 lifecycle accepted — engagement stays `active` until both parties submit, then concludes.
- C.2 idempotent recovery accepted — same-party re-submission completes its own partial write.
- A.3 learnability gate added.
- Screen 9 made role-adaptive.

## Round 3 — Codex (final under the cap)

B.0, C.2's lifecycle and recovery, and role-adaptive Screen 9 confirmed as correctly specified and demo-supporting.

**[A.3]** Problem — the permuted-label gate lacks its metric, procedure and margin, so the executor must invent the condition that authorizes persistence. Fix — specify all three and test the gate before allowing `--persist`.

VERDICT: REVISE

### Claude's response — closed without spending a 4th round

Legitimate, and the exact defect class CLAUDE.md names: a plan that leaves a decision to the executor becomes a plan defect by construction. Specified all three in A.3 — metric (held-out Spearman, per role), procedure (seed 42, 5 permuted-label controls, same untouched test split), condition (real > 0 and real >= max(permuted) + 0.10 for both roles). Margin clears by 3-4x on real numbers, so it is set to catch an unlearnable label rather than to admit this one.

**Outcome: not a deadlock.** Codex approved the substance in round 3 and flagged one incompleteness, now closed. Rounds 4-7 have historically returned imprecision that TDD catches anyway, and two of them introduced defects — so the cap holds. Remaining risk is carried openly rather than argued away.

## Code review — Parts A + B.0 (implementation, not plan)

Same Codex thread resumed deliberately: it had never seen the code (fresh on implementation) but had demanded these exact fixes, so it could verify they landed rather than re-deriving them.

**VERDICT: APPROVED.** Gate 4b enforces all three floors; `quality.gates` delegates without circular-import failure; learnability uses held-out Spearman, seed 42, five permutations and the `real >= max(control) + 0.10` condition before persistence; scored snapshots emit finite role-applicable signals that persistence and the API projection accept; zero-valued signals become weak rather than throwing; role-inapplicable NaNs never emitted; cold-start stays signal-free; the removed and rescaled tests are legitimate consequences of the new rule, with nothing weakened to mask a failure.

### Claude's own verification, independent of both reports

- Ran the suite first-hand: `165 passed, 842 warnings in 75.57s`.
- **Caught an error in the subagent's report:** it claimed "0 removed". `git diff -U0 | grep '^-def test_'` shows `test_label_degeneracy_fails_a_29_point_4_percent_atom` was deleted. Legitimate (it asserted the rule P7 removed) and replaced by two band-outcome tests, but the headline count was wrong. True figures: 18 added, 1 removed, net +17. **This is exactly why test COUNTS get diffed rather than read off a report.**

### Estimate calibration, recorded so it stops recurring

Part A + B.0 estimated ~4-6 h, actual **~30 min** (subagent 21.6 min + verification and review ~8 min). 8-12x pessimistic. Cause: pricing execution at discovery rates after discovery was already spent. Rudra flagged the same pattern from the previous session (2-5-6 h estimated, ~2 h actual). _Standing: estimate execution and discovery separately; once the defects are found and contracts settled, execution runs an order of magnitude faster than the number that felt safe._
_Frontend does not inherit this._ Backend terminates on a passing suite; frontend terminates when Rudra approves it, and the binding cost is iteration cycles, not code volume.
