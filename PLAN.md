# Plan: Order 3 — Trust Score read API (O3-A + O3-B)

_Round 6 revision — Claude, after Codex round 6 (cap extended by Rudra)_

## Goal

Serve the Trust Score that `apps/intelligence/trust_score/` already persists to MongoDB, over
authenticated HTTP, behind real Zod contracts — with "not enough history yet" as a first-class
response rather than an error or a null. Closes the remaining gap in F2.

## Context the reviewer needs (measured, not assumed)

Verified against live `canary_dev`, 2026-07-28/29:

- `trustscores`: 484 500 docs / 25 500 distinct profileIds — **19 monthly snapshots per profile**.
  Index `{profileId:1, generatedAt:-1}` exists (`apps/api/src/models/TrustScore.js:14`).
- **5 500 of those profileIds are orphans** (500 + 5 000 from earlier seed runs).
- `profiles`: 20 000; **only 1 976 have ≥3 concluded outcomes** (`min_engagements_for_scoring`).
  **90.1% cold-start**, yet all 20 000 carry score rows — `run.py:26` gates _training_ on
  `is_cold_start`, `run.py:37` scores everyone. 97.2% read `level: med, score ≈ 50`.
- `run.py` is **not idempotent**: `persist_trust_score` uses `insert_one`, no upsert, no wipe.
- `riskassessments` is **empty**; nothing computes RiskAssessment.
- **No seeded identity can log in**: 0/20 000 have `passwordHash`; `authProviderId` is the literal
  placeholder `seed-provider|N`; `activeProfileId` unset on all; **`emailVerified` false on all**.
- `RiskSignal.value` is a raw SHAP contribution; `parentType` is an enum of
  `TrustScore | RiskAssessment`.
- `score` and `level` are computed independently from the same probability vector
  (`model.py:55-65`) and can disagree; they do not in current data.

Separate segments (`TS-A`…`TS-D`) fix these. **This plan fixes none of them** — it serves what
exists, correctly, including reporting cold-start honestly.

## Endpoints — exact

```
GET /api/trust-scores/:profileId
GET /api/trust-scores?profileIds=<id>,<id>,...        (1..50 ids, comma-separated)
```

Middleware chain, in this exact order:

```
requireAuth → requireMarketplaceParticipant → identityKeyedLimiter → controller
```

`requireMarketplaceParticipant` is a named async guard asserting the Identity owns ≥1 Profile
(decision 8) → 403 otherwise. It must sit **after** `requireAuth` (needs the deserialized identity)
and **before** the limiter (so unauthenticated/non-participant traffic cannot consume a
participant's quota).

Both responses: **`Cache-Control: private, no-store`**.

### State precedence — evaluated in this order, and tested as an order

A profile's state is **not** "does a snapshot exist". ~18 000 below-threshold profiles currently
carry fabricated snapshots (the `TS-A` defect), so a snapshot-first rule would classify them
`scored`. Threshold is checked **first**:

1. Profile does not exist → `not-found` / 404.
2. Current concluded-engagement count **< threshold** → `insufficient-history`, **regardless of any
   stored snapshot.** This is what stops today's fabricated rows leaking through, and it must hold
   before `TS-A` lands as well as after.
3. Currently eligible, but no snapshot taken while eligible → `pending-score`.
4. Eligible with a snapshot, and concluded Outcomes postdate it → `stale`.
5. Eligible with a snapshot covering all concluded Outcomes → `scored`.

Test the _precedence_, not just the states: a below-threshold profile **with** a stored snapshot must
return `insufficient-history`. That fixture is today's live majority case.

### Response envelopes — four states, not two

`scored` — a current snapshot covering all concluded Outcomes:

```
{ "status": "scored", "profileId": "<24hex>", "band": "BAND_MED", "score": 47,
  "generatedAt": "<ISO>",
  "signals": [ { "name": "on-time-rate", "direction": "unfavorable",
                 "strength": "STRENGTH_STRONG" } ] }
```

`signals` present **only** for `self`; for `member` the key is **absent**, not `[]`.

`stale` — a snapshot exists but newer concluded Outcomes postdate it. **Its own status, not a
boolean on `scored`.** Same payload shape plus `outcomesSince`. A consumer cannot render it as a
current score without explicitly handling the case — the same reasoning that rejected nullable
fields in decision 1, applied consistently.

`pending-score` — the profile now meets the threshold but no snapshot covers it (the scorer runs
periodically; a profile can cross the threshold between runs). Carries `outcomeCount`, no score.
**This state will be common in a live system and had no representation before Codex round 2.**

`insufficient-history` — below threshold:

```
{ "status": "insufficient-history", "profileId": "<24hex>",
  "outcomeCount": 2, "outcomesNeeded": 3 }
```

Unknown profile → `404` via the existing `NotFoundError` path.

Batch — one entry per **requested** id, order preserved:

```
{ "data": [ <scored>, <stale>, <pending-score>, <insufficient-history>,
            { "status": "not-found", "profileId": "<24hex>" } ] }
```

Unknown ids yield explicit `not-found` entries, never silently dropped. **Raw token count is capped
at 50 before de-duplication as well as after** — otherwise arbitrarily many repeated tokens pass
until URL-size limits intervene.

## Key decisions & tradeoffs (contest these)

1. **Discriminated union on `status`.** ~90% of responses are `insufficient-history`; a nullable
   `score` invites a UI rendering `0/100` for someone with no history, which is defamatory on a
   trust product.
2. **Band derives from `score`, never the stored `level`** — guards the latent divergence above.
3. **Band thresholds are a config constant, not contract** — `TS-B` revises without an API change.
   Provisional from the observed trimodal distribution: `<25` LOW, `<75` MED, else HIGH.
4. **Raw SHAP values never leave the API.**
5. **Viewer relation is an explicit enum** — `self | member | anonymous`; projection is a pure
   function of it. `anonymous` is unreachable while guarded, but present so public reads later are
   one enum case rather than unpicking `req.user` assumptions.
6. **`self` means ownership**, not active profile — `activeProfileId` is unset on all 20 000.
7. **`member` sees band + score, not signals.** Most contestable — see Risks.
8. **Access requires an authenticated Identity that owns at least one Profile.** A bare registered
   Identity with no Profile is not a marketplace participant and cannot enumerate scores.
   ⚠️ **Email verification is deliberately NOT required yet**: `emailVerified` is false on all
   20 000 seeded identities, so enforcing it today locks out every demo user. Gate on it **after
   `TS-C`** sets it. Recorded so the ordering isn't discovered at demo time.
9. **Batch is `GET ?profileIds=…` capped at 50 distinct ids.**
10. **Aggregate-on-read**, not a denormalized current-score table — a derived table can go stale
    silently, the same failure class as the fabricated-score defect.
11. **Rate limiting — two flat limiters, not one weighted one.** _(Revised after Codex round 5: the
    weighted version was unimplementable in the stated middleware order — the limiter runs before
    Zod parsing, so the id count isn't known yet, and stock `express-rate-limit` increments exactly
    one hit per request.)_
    - `trustScoreSingleLimiter` — **120 req / 5 min**, keyed by `identity._id`.
    - `trustScoreBatchLimiter` — **20 req / 5 min**, keyed by `identity._id`, on the batch route
      only.
      **Real enumeration bound: 1 120 profile-reads per 5 minutes per identity**, not 1 000 —
      (20 × 50) + 120, because the two limiters are independent and one identity can exhaust both.
      _(Corrected after Codex round 6; the earlier "~1 000" ignored the single-read budget.)_ If a hard
      1 000 ceiling is ever actually required, that needs a third shared aggregate limiter — not done,
      because the difference is immaterial to the threat model and an aggregate limiter reintroduces
      the custom-store complexity the flat scheme just removed.
      Both flat-cost, both stock middleware, no custom store, and both deterministically testable.
      Keyed by identity, never IP — `trust proxy` is unconfigured, so IP bucketing would put every
      client behind a proxy in one bucket. **Injectable store so tests reset between cases.**
      ⚠️ The default store is process-local: correct for one instance, must be revisited if scaled.
12. **Wire tokens `BAND_*` / `STRENGTH_*`** are deliberately non-prose so a UI rendering them raw
    looks broken rather than like real copy.
13. **Snapshot selection is deterministic**: sort `generatedAt` desc, then `_id` desc as tiebreak.
    Required because `run.py` is non-idempotent — a re-run without a wipe produces duplicate rows
    sharing `generatedAt`, and "latest" would otherwise be arbitrary between identical requests.
14. **Two counts, not one — the state machine needs both.** _(Corrected after Codex round 4: the
    previous single-count rule could not express its own precedence table.)_ The service computes
    **`currentOutcomeCount`** (as of now) and, when a snapshot exists,
    **`snapshotOutcomeCount`** (as of `generatedAt`). Eligibility precedence reads
    `currentOutcomeCount`; staleness reads the difference. The case that broke the old rule: a
    profile with **2 outcomes at snapshot time and 3 now** is eligible now but was not when scored,
    so it is `pending-score` — not `insufficient-history` (the old snapshot-windowed count said 2)
    and not `stale` (no snapshot was ever taken while eligible). Only `currentOutcomeCount` is
    exposed on the wire, as `outcomeCount`; the rest is internal.
    _(Superseded text kept for the reasoning:)_ When **no snapshot exists** (`insufficient-history`,
    `pending-score`
    — the normal case for ~90% of profiles once `TS-A` stops scoring cold-start), counts are
    computed **as of now**, because there is no snapshot to anchor to. Staleness is expressed by the
    `stale` status, not by a boolean.
15. **Strength bands are normalized against the stored signals only.** SHAP magnitudes are
    unnormalized and shift across retrains, so absolute cutoffs would silently re-label every
    profile after a retrain. ⚠️ Strength **cannot** be a share of the snapshot's _total_ absolute
    contribution: `explain.py` sets `TOP_K_SIGNALS = 3` and persists only those three, so the total
    is not in the database. Strength is therefore each signal's share of the **persisted** signals'
    total absolute value. `value == 0` maps to the weakest band and must not divide by zero.
16. **Only `source: 'structured-data'` signals are projected.** `RiskSignal.source` also permits
    `brief-analysis`, which Slice 3 will produce. Those are not SHAP contributions and are not
    comparable on the same strength scale. Today that collection is empty, so an unfiltered
    projection would pass every test and break silently later.
17. **Non-self reads respect `Profile.discoverable`.** The field exists on every Profile and was
    being ignored — any participant could enumerate scores for profiles that have opted out or have
    not completed onboarding. `self` reads are unaffected (it is your own data). A non-discoverable
    profile returns 404 rather than 403 to a `member`, so the endpoint does not confirm existence.
18. **`stale.outcomesSince`** is a positive integer: the count of **distinct Outcome-backed
    concluded Engagements whose Outcome `recordedAt` is strictly after the snapshot's
    `generatedAt`**. Boundary-tested at exactly-equal timestamps, which must count as _covered_, not
    _since_ — otherwise every snapshot is stale the instant it is written.
19. **The scoring threshold stays duplicated for now — descoped, with the risk named.**
    _(Revised after Codex round 5, which correctly objected that I had added a decision with no task,
    and that it changes `packages/shared` and Python config while the plan claims to touch neither.)_
    `min_engagements_for_scoring = 3` lives in `apps/intelligence/trust_score/config.py` and is
    already hand-duplicated into `apps/api/tests/seedInvariants.test.js`; this adds a third copy in
    the API. **A shared cross-runtime artifact is the right answer and is deliberately not done
    here:** `working-agreement.md` freezes shared foundations, and `TS-A`/`TS-B` are actively editing
    that same Python file — changing it from two directions in the same week is how merge defects get
    made. Instead — **and this is now an executable task, not an aspiration**
    _(Codex round 6 correctly objected that "`X-A` gains an assertion" named no file and no
    mechanism)_:
    - Node's single source is **`apps/api/src/trustScore/scoringConfig.js`**, exporting
      `MIN_ENGAGEMENTS_FOR_SCORING`. Nothing else in the API may hardcode it.
    - **Task 0** (below) adds a drift test to the existing
      **`apps/api/tests/seedInvariants.test.js`** — which already carries this constant duplicated by
      hand, with a comment saying it will silently drift. The test **reads
      `apps/intelligence/trust_score/config.py` as text** and extracts
      `min_engagements_for_scoring: int = <n>`, asserting it equals the Node export.
      Text-parsing Python from a JS test is admittedly crude; it is chosen because it needs no shared
      artifact, no Python execution in the JS suite, and no change to a frozen package — and it fails
      **loudly** on drift, which is the entire point. Replace it with a real shared artifact when a
      segment next owns `config.py`.
      **Tracked as a follow-up** for that segment.
20. **The batch read fails closed on inconsistency.** `TS-A` wipes `trustscores` + `risksignals`
    before re-running, so a read concurrent with a reseed can select a snapshot whose signals have
    already been deleted. Mongo transactions require a replica set and this runs standalone, so the
    rule is: **if signals are missing for a selected snapshot, fail the request rather than return a
    scored response with no reasons.** A silently signal-less `self` response is indistinguishable
    from a genuine one.

## Approach

Eight tasks, TDD, mirroring `apps/api/src/jobPost/` (routes → controller → service) and its 4-file
test convention.

0. **Threshold single-source + drift guard** — create
   `apps/api/src/trustScore/scoringConfig.js` exporting `MIN_ENGAGEMENTS_FOR_SCORING`. Add a drift
   test to the existing `apps/api/tests/seedInvariants.test.js` that reads
   `apps/intelligence/trust_score/config.py` as text, extracts
   `min_engagements_for_scoring: int = <n>`, and asserts equality with the Node export. Replace that
   file's hand-duplicated constant with an import from the new module. **Test fails if the regex
   matches nothing** — a silently unmatched pattern would make the guard vacuous, which is the exact
   failure mode `seedInvariants` was written to prevent.
1. **Contracts** — `packages/shared/contracts/trustScore.js`. The union must _discriminate_: reject
   a payload carrying `score` alongside `status:'insufficient-history'`. **No schema anywhere admits
   a numeric signal value.** Batch param: 1–50 distinct hex ids, 51 → reject.
2. **Band derivation** — pure, total over 0–100, rejects out-of-range. Test that a document whose
   `level` disagrees with its `score` still bands by `score`.
3. **Signal projection** — `{name, direction, strength}`, **no `value` key under any input**;
   strength normalized against persisted signals only (decision 15); monotonic in `|value|`;
   deterministic ordering for equal magnitudes; all-zero and single-signal inputs handled without
   dividing by zero. **Filter to `source: 'structured-data'`** (decision 16) and assert a
   `brief-analysis` signal is excluded.
4. **Viewer relation + projection** — `self` gets signals, `member` does not (key absent). Assert a
   viewer whose `activeProfileId` is null or points at their other profile still resolves `self`.
   Assert `anonymous` projects without throwing.
5. **Service read** — deterministic latest snapshot (decision 13; fixtures include **two rows with
   identical `generatedAt`** and assert a stable pick across repeated calls, plus fixtures inserted
   out of chronological order so insertion-order or `_id`-only ordering fails). Outcome counting is
   **one aggregate joining Engagements where `status: 'concluded'` and the profile is on either
   side, counting distinct Outcome-backed engagements** — never a bare `outcomes` count, which would
   neither prove the engagement concluded nor that it belongs to this profile.
   **The aggregate returns three values, not one** _(corrected after Codex round 5 — this task
   previously specified a single windowed count, which contradicted decision 14 and would have
   reintroduced the 2-at-snapshot/3-now misclassification)_: `currentOutcomeCount` (as of now),
   `snapshotOutcomeCount` (as of `generatedAt`, when a snapshot exists), and `outcomesSince`.
   **Predicates, stated explicitly so no implementer re-derives them:**
   - `currentOutcomeCount < threshold` → `insufficient-history`
   - `currentOutcomeCount >= threshold` **and** no snapshot with `snapshotOutcomeCount >= threshold`
     → `pending-score`
   - eligible snapshot exists **and** `outcomesSince > 0` → `stale`
   - eligible snapshot exists **and** `outcomesSince == 0` → `scored`
     **All four asserted**, plus the two adversarial fixtures: a below-threshold profile _with_ a
     stored snapshot (today's live majority — must be `insufficient-history`), and 2-at-snapshot /
     3-now (must be `pending-score`).
6. **Route/controller/guard/limiter** — 401 unauthenticated; 403 for an Identity owning no Profile;
   400 malformed id; 429 after the named limiter's explicit limit; `Cache-Control: private,
no-store` asserted on every 200; and an explicit test that **a member with no relationship
   whatsoever to the target can read it** (the evaluation gate has no prior relationship by
   definition).
7. **Batch** — a **bounded, profile-led query plan**, not a per-id loop. "Two queries" was wrong:
   snapshotless and unknown profiles need the profile/outcome aggregate too. Specify:
   (a) resolve which requested ids exist as Profiles; (b) latest snapshot per existing id;
   (c) the concluded-engagement count aggregate for ids needing it; (d) signals for exactly the
   selected snapshot `_id`s, **filtered by `parentType: 'TrustScore'` and
   `source: 'structured-data'`**. Assert a `RiskSignal` with `parentType: 'RiskAssessment'` and a
   colliding `parentId` never appears — `riskassessments` is empty today, so without this the bug
   ships and rots until that collection fills. Assert a **bounded query count independent of id
   count** (not literally two); all five states in one response; duplicates collapsed; raw tokens
   capped before de-dup.
8. **Real-HTTP verification** against the live 20 000-profile seed — a committed, deterministic,
   disposable fixture script, not a hand-patch. **Exploits D10 to avoid mutating seeded data:** a
   `member` may read _any_ profile, so verifying `scored` needs only **one** loginable identity plus
   any scoreable profile — no ownership, no reassignment. The script creates one Identity with a
   known password hash, `emailVerified: true`, and one owned Profile; runs the real
   login → CSRF → authenticated-GET flow; asserts the decisive fields for a `member` read of a
   scoreable profile and an `insufficient-history` read of a cold-start one; then removes exactly
   what it created. **`self`-on-a-scored-profile is deferred to post-`TS-C`** — decided, not left
   open. Reassigning a real Profile's `identityId` mutates seeded data that other work reads, for a
   single assertion, three days before `TS-C` makes seeded identities loginable by construction. The
   `self` projection is fully covered by unit and db tests at Tasks 4–5; what defers is only its
   live-HTTP confirmation, and that is recorded as a follow-up rather than dropped.

## Risks / open questions

- **Decision 7 remains the weak point.** With `member` seeing no signals, the evaluation-gate screen
  shows a band and a number with **no reasons** until the RAG briefing slice ships — and that slice
  is a candidate for being cut. Codex independently proposed the same middle option already flagged
  internally: give members a **fact-based** reason line from outcome counts ("18 of 20 contracts
  paid in full") rather than SHAP attributions. It honours facts-vs-attribution without depending on
  the briefing, and it is in **no current segment**. Needs a human decision.
- **Accepted tradeoff:** even `self`-only direction+strength reveals score-optimization levers.
  Self-gaming toward "improve your on-time rate" is the behaviour the product wants; cross-party
  lever discovery is what decision 7 closes. Documented rather than designed away.
- **Out of scope but now tracked:** per-identity rate limiting is bypassable by mass registration.
  Signup-abuse control is a different subsystem.
- **Out of scope but now tracked:** no scorer/model version exists anywhere in the pipeline, so
  responses cannot express _which model_ produced a score. Belongs with the retraining segments.
- Are band thresholds sufficiently insulated as a config constant, or does the band belong outside
  the response entirely?
- Does exposing `outcomeCount` for a counterparty leak anything, given it counts public engagements?

## Out of scope

RiskAssessment reads · population percentile context · caching/ETag beyond the no-store header ·
public/anonymous reads · fixing any measured defect above · whether the score is _correct_.
