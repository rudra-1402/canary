# Plan: A1 — generator semantic pass (Canary Trust Score)

_Round 7 revision._

---

# PART 1 — DESIGN SPEC

---

type: spec
title: A1 — generator semantic pass (attribution, contract terms, conduct independence)
status: approved — awaiting codex-review, then writing-plans
tags: [spec, generator, trust-score, slice-0, A1, leakage, attribution]
created: 2026-08-01
---

# A1 — Generator semantic pass

**Segment:** `A1` of the model track (`A1`→`A2`→`A3`→`A4`→`A5`), under the 2026-08-01 scope decision
**fixed model + Slice 2**. See [[2026-08-01-model-integrity-crisis-and-the-two-of-three-decision]].

**Tier A** work per [[model-selection-strategy]]'s calibration: it sets semantics every later segment
inherits, and the schema change is expensive to reverse.

---

## Why this exists

Two independent root-cause audits (mine, then Codex/gpt-5.6-terra unprimed) found the Trust Score's
training label is a **deterministic function of the model's own features**. All four inputs to
`compute_reliability_index` (`labels.py:9-14`) are also in `FEATURE_COLUMNS` (`features.py:1-11`).
Delete the model, run the arithmetic, get the same score. **The ML is currently decorative.**

Four further defects sit underneath it, all verified at source:

| #   | Defect                                        | Evidence                                                                                                                                                                                        |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `on_time_rate` arithmetically pinned to zero  | `_late_days_range_from_traits` returns a _minimum_ lateness; below reliability 0.975 on-time is impossible. 98.7% of non-ghosted outcomes late; feature exactly 0 for 96% of scoreable profiles |
| 2   | `paidInFull` is a flat coin flip              | `outcomes.py:75` — 94.745 / 94.837 / 94.600% across reliable/risky/bad-actor. 40% of label weight, zero independent signal                                                                      |
| 3   | Every outcome timestamped at engagement start | 11 148/11 148 have `recordedAt == engagement.createdAt`                                                                                                                                         |
| 4   | Review provenance dropped at persist          | 0/17 111 carry the planted flags; 97 sabotage reviews name a non-party subject                                                                                                                  |

**Found while designing this spec, not previously recorded:**

5. **`scopeCreepOccurred` is also ghost-derived.** `outcomes.py:69` is
   `rng.random() < (0.3 if ghost_p > 0.15 else 0.05)` — a threshold on ghosting propensity, not an
   independent behaviour. Combined with defects 1–2, **every one of the four label terms is either
   ghost-propensity-derived or dead**, so the label is approximately `f(ghost_p) + noise`. This is a
   stronger statement than the tracked "60% ghosting twice · 30% dead · 10% real" decomposition and
   supersedes it. _To be confirmed by measurement in `A3`, not asserted._
6. **`agreedTerms.timeline` is a `String`.** Free text ("3 weeks"). Nothing can compute lateness
   from it, so today's `daysLate` is **late relative to nothing** — a number with no referent. This
   is why the lateness fix could not be designed coherently before now.
7. **`Outcome.engagementId` is `unique: true`.** Structurally blocks one-row-per-party. Would have
   failed at insert time mid-implementation.

---

## Decisions taken (Rudra, 2026-08-01)

| #   | Decision                                                                                                                | Durability                     |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| D1  | **Leakage broken by a temporal label** — features from engagements up to `T`, label from behaviour after `T`            | Load-bearing                   |
| D2  | **Latent trait used as evaluation ground truth**, plus an **oracle model** trained directly on it, reported alongside   | Load-bearing                   |
| D3  | **Attribution = two Outcome rows per engagement**, one per party                                                        | Load-bearing                   |
| D4  | **Coupled conduct with honest missingness** — if one party ghosts, the other's conduct is _not observed_, never imputed | Load-bearing                   |
| D5  | **Contract depth = minimal+** — `dueAt`, `revisionsIncluded`, `deliveredAt`, `revisionsRequested`                       | Contingent on the 5-day budget |
| D6  | **Sabotage reviews become realistic** — real counterparty, unfair rating                                                | Load-bearing for Slice 2       |
| D7  | **PR `rudra/signal-audit-instrument` standalone first**                                                                 | Incidental                     |

### Killed options, with revival conditions

- **Killed: dropping the four leaked columns from `FEATURE_COLUMNS`.** Insufficient — every
  remaining behavioural field descends from the same `ghost_p` term, so the model would reconstruct
  the label through the generator's own dependency structure. The leak is in the data-generating
  process, not the column list. **Revival: none.** This is wrong on mechanism, not on cost.
- **Killed: disjoint-field label (option B).** Not additive to D1 — it competes for the same
  training-label slot and is a strictly weaker version of it (answer on the next page vs answer
  hasn't happened yet). Also likely to re-leak via shared `ghost_p` ancestry.
  **Revival: as a deliberate _bad baseline_ in `A4`** — "here's what the naive approach scores and
  why it's inflated." Small add-on, needs nothing from `A1`. Skipped because the leakage is already
  provable in one line (4 of 4 label inputs are feature columns).
- **Killed: latent-trait label as the _training_ target (option C alone).** Overturns `labels.py`'s
  Decision 3 and leaves no production retraining story — real users have no hidden trait.
  **Revival: none as a training target**; it survives in full as D2's evaluation ruler.
- **Killed: Fiverr-style fixed-gig terms.** Would overturn ADR-0011 and hybrid-lite. The
  contract-based pipeline is already the locked model and already ~70% in the schema.
  **Revival: none** — this is a settled architectural decision, re-raised and re-confirmed.
- **Killed: one Outcome row + responsibility fields / per-party subdocuments.** Both keep the trap
  open: a reader that forgets to filter silently reproduces the defect. **Revival: only if the
  compound-index change proves unworkable** against a constraint not yet visible.
- **Killed: keeping sabotage structurally impossible.** Slice 2 would catch 100% with one join —
  making the second AI story decorative in exactly the way the first one is now.
  **Revival: as a small conformance fixture** if `X-A` wants malformed rows to assert against; that
  is a different purpose from being the detection target.
- **Killed: fully-independent per-party conduct.** Fabricates — a freelancer "delivered 12 days
  late" on an engagement where the client vanished in week one. **Revival: none.**

---

## Section 1 — Data model

### `Engagement.agreedTerms`

| Field                            | Change    | Contract                                                                                                                                                                                                  |
| -------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scope`, `price`, `paymentTerms` | unchanged | —                                                                                                                                                                                                         |
| `timeline`                       | **keep**  | Human-readable term, shown in UI. Not machine-checked.                                                                                                                                                    |
| `dueAt`                          | **add**   | `Date`. Required when `status !== 'prospective'` — the same conditional the subdocument already uses. The referent `daysLate` has never had.                                                              |
| `revisionsIncluded`              | **add**   | **Integer, minimum 0**, default 0, enforced in Mongoose _and_ Zod. What the client is entitled to request. A fractional or negative allowance would silently corrupt the `scopeCreepOccurred` derivation. |

### `Proposal`

| Field                  | Change   | Contract                                                                        |
| ---------------------- | -------- | ------------------------------------------------------------------------------- |
| `durationEstimate`     | **keep** | Human-readable.                                                                 |
| `proposedDurationDays` | **add**  | `Number`. At acceptance, `dueAt = engagement.createdAt + proposedDurationDays`. |

Rationale: keeps ADR-0011 honest — the freelancer sets the term and the client accepts it, so the
deadline is _derived from the negotiation_. Without this the generator would invent `dueAt` and the
contract story would be cosmetic.

### `Outcome` — one row per party per engagement

| Field                   | Change                                          | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engagementId`          | **drop `unique: true`**                         | Replaced by a compound unique index `{engagementId, subjectProfileId}`. ⚠️ **The index forbids duplicate (engagement, subject) pairs and nothing more** — it cannot see across collections, so it does NOT enforce "exactly two, and only the two parties". That is a relational invariant and lives at the persistence boundary (generator) and in a transactional service (app path). _Corrected after codex-review rounds 2-3, which caught this claiming a guarantee the index does not provide._ |
| `subjectProfileId`      | **add**, required                               | Whose conduct this row describes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `counterpartyProfileId` | **add**, required                               | Lets Slice 2 walk the graph without re-joining through Engagement.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `subjectRole`           | **add**, required                               | `'freelancer' \| 'client'`. `features.py` is role-blind today.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `observed`              | **add**, required                               | `false` when the counterparty ghosted and this party's conduct never became visible.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ghosted`               | **keep**, meaning changes                       | Did _this_ party ghost — not "did the engagement collapse".                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `daysLate`              | **keep**, gains a referent                      | `deliveredAt − agreedTerms.dueAt`. Freelancer rows only, null elsewhere. **May be negative** — early delivery is real positive signal and is currently inexpressible.                                                                                                                                                                                                                                                                                                                                 |
| `deliveredAt`           | **add**                                         | `Date`, freelancer rows only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `paidInFull`            | **keep**, scoped                                | Client rows only, null on freelancer rows. Drawn from client traits.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `revisionsRequested`    | **add**                                         | `Number`, client rows only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `scopeCreepOccurred`    | **keep**, derived, **nullable with no default** | `revisionsRequested > agreedTerms.revisionsIncluded`. Client rows only; **null** on freelancer rows, unobserved rows, and both-ghost rows. ⚠️ Its current `default: false` would silently assert "no scope creep happened" for every row that simply has no client conduct — the same null-vs-zero conflation that killed `on_time_rate`. **Every role-inapplicable or unobserved conduct field is nullable with no default**, for the same reason. _(codex-review round 3.)_                         |
| `endedAs`               | **keep**, both rows                             | Describes the engagement's ending — shared context, not one party's conduct.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `recordedAt`            | **keep**, meaning fixed                         | The actual conclusion moment. Always strictly after `engagement.createdAt`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `labelSource`           | unchanged                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Accepted wart:** roughly half the conduct columns are null on any given row. The polymorphic
`conduct` subdocument is cleaner on paper and worse here — Mongo queries and the Pandas feature build
both get more awkward, and `features.py` is exactly where both dead-feature defects lived. An
explicit `subjectRole` discriminator with nullable columns is easier to read wrongly _loudly_ than a
nested shape that means different things per row.

### `Review`

- `isPlantedCollusion` / `isPlantedSabotage` **must survive persistence**. Computed at
  `reviews.py:56-57`, present on **0 of 17 111** rows in Mongo — dropped in `run.py`'s id-resolution
  step, the same place the three `createdAt` defects lived. Same family as those and as the
  `activeProfileId` / seeded-credentials gaps: **the generator writes around app-layer logic.**
- `subjectProfileId` **must always be a party to** `engagementId`. Enforced, not assumed — this is
  the invariant the sabotage generator violates 97 times.

> **Hard constraint.** The planted flags are **evaluation-only**. No Slice 2 detector may read them
> as input. They exist solely to compute "planted X, caught Y". A detector that reads one has
> rebuilt target leakage in a new component — the exact defect this segment exists to remove.

### Migration

The compound index is incompatible with the existing 11 148 rows. This lands via **wipe-and-reseed
(`A3`)**, not in-place migration. Snapshot first (`node scripts/snapshotDb.js snapshot canary_dev`);
the `--wipe` guard will fire on the pipeline re-run and **must be asked about, never routed around**.

Zod contracts in `apps/api` move in lockstep with all four schemas.

---

## Section 2 — Generator conduct semantics

**Organising principle, and the direct fix for the root cause:** every conduct field gets its **own
trait input and its own noise source**. Today four descend from one `ghost_p` term, which is why the
label collapsed to `f(ghost_p)`. Independence is measured in Section 3, never assumed.

### Ghosting — drawn per party, independently

Replaces `outcomes.py:61-64`, which picks the worse party and applies that one probability to the
whole engagement.

| Case              | Freelancer row                  | Client row                      | `endedAs`             |
| ----------------- | ------------------------------- | ------------------------------- | --------------------- |
| Neither ghosts    | observed, conduct measured      | observed, conduct measured      | completed / cancelled |
| Client ghosts     | `observed: false`, conduct null | `ghosted: true`, observed       | ghosted               |
| Freelancer ghosts | `ghosted: true`, observed       | `observed: false`, conduct null | ghosted               |
| Both ghost        | `ghosted: true`                 | `ghosted: true`                 | ghosted               |

Row 2 is the motivating case: the client vanished, the freelancer's quality was never demonstrated,
and the record says _we don't know_ rather than inventing either answer.

### Lateness — probability, then magnitude

`_late_days_range_from_traits` returns a **floor**, so anyone below reliability 0.975 is late by
construction. Replaced by two independent draws:

1. **Whether** the party misses `dueAt` — probability rising as reliability falls.
2. **By how much** — magnitude scale rising as reliability falls.

On-time delivery becomes reachable at every trait level, just rarer for bad actors. Early delivery
becomes representable as small negative `daysLate`.

**Target on-time rates per archetype are deliberately NOT hardcoded.** They are an _outcome to be
measured_ (Section 3), not a constant to assert. Asserting them is how a test suite stays green over
a 98.7%-degenerate feature.

### Payment — client conduct, from client traits

`outcomes.py:75` (`not ghosted and rng.random() < 0.95`) becomes a function of the client's own
reliability with its own noise. It stays conditional on the engagement not collapsing — a client who
never received work cannot fail to pay for it — but **given an observed engagement, payment must
carry signal independent of ghosting.** That conditional independence is a gate, not an assumption.

### Revisions — client conduct, from client traits

Drawn against `revisionsIncluded`. `scopeCreepOccurred` becomes objective, attributed to the client,
and independent of ghost propensity for the first time.

### Sabotage reviews (D6)

Saboteurs review their **actual counterparty on a real shared engagement**, leaving a rating that
contradicts the observed outcome. Replaces `reviews.py:61-97`, where `victim` is drawn from the whole
reliable population (`rng.choice(reliable_targets)`) and attached to an unrelated engagement.

Detection then requires real signal — an author whose ratings systematically disagree with both the
outcomes and with everyone else's ratings of the same subjects — rather than a structural join.

Collusion generation (`reviews.py:39,45`) is **already correct** and is not changed: it plants
5-star reviews only when both parties are ring members on a real shared engagement.

### Timestamps

`recordedAt` becomes the real conclusion moment, derived from `deliveredAt` and the payment event,
always strictly after `engagement.createdAt`. **This single change is what makes D1 buildable** —
without temporal ordering there is nothing to split on.

Trait drift (`archetypes.py:28-45`) is unchanged and conduct continues to read traits at the
engagement's month. This part of the generator was right.

### Role-specific feature and label contracts

**Added after codex-review round 1 — this was a genuine gap, not a detail.** Two-row attribution
splits conduct by role: a freelancer has no `paidInFull` and no `revisionsRequested`; a client has no
`daysLate` and no `deliveredAt`. But `FEATURE_COLUMNS` requires all nine features for every profile,
and `compute_reliability_index` requires all four terms. **Role-split conduct and a role-blind
feature vector cannot both be right.**

Resolution — three contracts, stated explicitly rather than left to emerge:

| Contract               | Content                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared**             | `ghost_rate`, `completion_rate`, `avg_review_rating`, `observed_engagement_count`                                                            |
| **Freelancer-only**    | `on_time_rate`, `avg_days_late`, `recency_weighted_on_time_rate`                                                                             |
| **Client-only**        | `paid_in_full_rate`, `scope_creep_rate`                                                                                                      |
| **Role-parameterised** | `trend_slope` — same function, different input per role: recent-vs-older **on-time rate** for freelancers, **paid-in-full rate** for clients |

`trend_slope` was originally listed as shared. **That was wrong** (codex-review round 2): its current
definition is on-time based and clients have no `daysLate`. Rather than making it freelancer-only and
leaving clients with a thinner vector — in a product whose USP is a _symmetric_ score — it becomes
role-parameterised over each role's primary conduct signal.

The label is built **per role from that role's own contract**, not from one four-term formula applied
to both. A client is not scored on delivery punctuality they never had the opportunity to
demonstrate, and a freelancer is not scored on payment.

**Consequence for the model — decided in `A1`, not deferred.** An earlier draft left the
one-model-vs-two choice to `A4`. That is not deferrable: `features_to_dataframe` indexes every row
with one global `FEATURE_COLUMNS`, so role-specific vectors with different keys **cannot pass through
the existing pipeline at all**, and leaving it open leaves `A1`'s output shape undefined
(codex-review round 2).

**Decision: one superset schema.** Every row carries every column; role-inapplicable columns are
`NaN`, and `subject_role` is itself a feature. Rationale: XGBoost's `DMatrix` handles `NaN` natively
as a first-class "missing" branch rather than an imputed value, so the model learns _"this column is
absent for this role"_ instead of being fed a fabricated number — which is the same honest-missingness
principle D4 applies to conduct. It also keeps one model, one artifact, one explanation for the viva.

_Killed — two role-specific models:_ **revival if** `A4` measurement shows the shared model's
per-role performance is materially worse than role-split training. Cheap to revisit; the feature
contracts above are what a split would need, and they exist either way.

**Consequence for the gates:** every gate runs **per role**. A feature that separates archetypes for
freelancers and is absent for clients is correct, not a failure — and a gate that pools both roles
would report it as degenerate.

### Duplicate feature list

`FEATURE_COLUMNS` (`model.py:7-17`) and `FEATURE_NAMES` (`features.py:1-11`) are **identical
duplicated lists**. Two sources of truth that can drift silently; the role contracts above make
drift likely. They collapse to one definition as part of this pass.

### Missing-data policy in `features.py`

The file where both dead-feature defects lived, so this is explicit:

- Not-observed rows are **excluded from conduct denominators**, never counted as good.
- `engagement_count` counts **observed** outcomes. The cold-start gate
  (`min_engagements_for_scoring`) counts observed too — a profile whose counterparties all vanished
  genuinely has no track record.
- **`(o["daysLate"] or 0)` is banned** (lines 40, 63, 76). It silently reads null as on-time and is
  half of why `on_time_rate` died. Null and zero are different facts.
- Observation count is **exposed as a feature**, so the model can distinguish "reliably good" from
  "barely visible".

---

## Section 3 — Acceptance gates

`quality/signal_audit.py` (branch `rudra/signal-audit-instrument`, 112 lines + 124 lines of tests)
already provides the four primitives the root-cause audit prescribed: `separation`,
`conditional_signal`, `plausibility`, `label_composition`. They return **measurements, not
assertions** — the correct shape. `A1` sets the bar and wires them in; it does not rebuild them.

> **Thresholds are written down before any measurement is taken** — in the implementation plan,
> which is itself authored and `codex-review`ed before `A3` runs. Measuring first and then choosing
> thresholds rationalises whatever came out — a live risk, since the same mind wrote the generator,
> the tests, `X-A`, and the audit. A missed gate is a finding, not a reason to move the bar.

### The six gates

| #   | Gate                                                                                                                                                                                             | Catches (today's value)                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1   | **Leakage — row/window non-overlap.** Per profile, the set of rows feeding the features and the set feeding the label are disjoint, and every label row is strictly later than every feature row | 4 of 4 label inputs are feature columns                    |
| 2   | **Archetype recoverability** — every model feature clears a stated separation floor                                                                                                              | 3 of 9 features near-dead                                  |
| 3   | **Conditional independence per label term** — each term retains separation with ghosting held out                                                                                                | `paidInFull` 94.745/94.837/94.600                          |
| 4   | **Degeneracy bound** — no feature holds an identical value for more than a stated share of scoreable profiles                                                                                    | `on_time_rate` = 0 for 96%; 581 profiles at exactly 0.7000 |
| 5   | **Plausibility bounds** — on-time, ghosting, payment, scope-creep rates in ranges a real marketplace could show                                                                                  | 98.7% of engagements late                                  |
| 6   | **Label composition** — no zero-signal term; no high-separation feature omitted                                                                                                                  | `avg_days_late` (d=1.89) in no term                        |

Gate 1 is three lines and is the single check that would have caught the defect this segment exists
to fix.

**Numeric floors live in the implementation plan**, not this spec — they belong next to the code that
enforces them. Per the rule above, they are fixed before any measurement is taken.

**Which gates apply when.** `A1`'s step-7 run (500 profiles) exercises gates **2–6** against the new
conduct fields — that is a smoke test of the semantics, not a trainable population. **Gate 1's
temporal half cannot pass until `A2`**, because a future-window split needs fan-out that does not
exist yet; only its set-disjointness half is checkable at `A1`. Treating a gate as passed at `A1`
when it is merely unreachable would be the vacuous-CI defect a third time
([[tracking]]'s `seedConformance` entry, and `X-A`'s inverted `it.fails` markers).

### Comparative assertions are rewritten, not extended

`bad > good` passes at 0.9 vs 0.1 **and** at 0.0001 vs 0.00001 — immune to degeneracy by
construction. It is how a feature reached 98.7% degenerate with 76 tests green. Every comparative
assertion guarding generated data is replaced by a magnitude assertion. **Sign is not behaviour.**

### Tests that encode the defect

`test_trust_score_fetch.py:72` _requires_ the outcome be shared with both parties — precisely what
Section 1 abolishes. These are **rewritten, not updated.** A test asserting the bug is not a test
needing adjustment.

### Where the gates run

Pass/fail criterion for `A3`'s iteration loop: 500 → measure → fix → 5k → measure → fix → 20k only
when green. `A5` wires them as a CI gate so the next regression is caught by the machine rather than
by a third audit.

---

## Section 4 — Sequencing and verification

### Order

One ordering change falls out of D1: **`A2` is now mandatory and upstream of the reseed.** A
future-window label needs profiles with engagements on both sides of the split, and 82% of scoreable
profiles sit at exactly 3 engagements, which cannot be split. Fan-out was optional; it is now
load-bearing.

0. PR `rudra/signal-audit-instrument` standalone (D7).
1. Snapshot `canary_dev`.
2. Schema + Zod contracts (Section 1), TDD.
3. Generator conduct (Section 2), TDD, magnitude assertions only.
4. Rewrite the two tests that encode the old premise.
5. `features.py` missing-data policy.
6. Persist review provenance in `run.py`'s id-resolution step.
7. 500-profile run → gates → iterate.

Then `A2` → `A3` → `A4` → `A5`.

### Definition of done — evidence, with the decisive line quoted for each

| Claim                                                                        | Today                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| Exactly 2 Outcome rows per concluded engagement, compound index enforcing it | 1 row, shared                              |
| 0 outcomes where `recordedAt == engagement.createdAt`                        | 11 148 / 11 148                            |
| `paidInFull` separates by archetype                                          | 94.745 / 94.837 / 94.600                   |
| `on_time_rate` non-degenerate                                                | exactly 0 for 96% of scoreable profiles    |
| `scopeCreepOccurred` independent of ghost propensity                         | a threshold on it                          |
| 100% of reviews carry provenance flags                                       | 0 / 17 111                                 |
| 0 reviews whose subject wasn't party to the engagement                       | 97                                         |
| Feature rows ∩ label rows = ∅ per profile (**`A4`; not evaluable in `A1`**)  | label is a formula over the feature vector |

**A green suite over an unrun path is not evidence.** Each line above is closed by running it and
quoting the output.

### Error handling

- Compound index incompatible with existing rows → wipe-and-reseed, snapshot first.
- `--wipe` guard fires on the pipeline re-run → **ask, never rephrase around it**.
- `A3` runs at 500 then 5k before 20k. A 20k run that fails a gate costs an hour to learn what 500
  reports in a minute.

### Schedule

|                                                        | Hours                                |
| ------------------------------------------------------ | ------------------------------------ |
| `A1` (was 6–8; +contract layer)                        | 8–11                                 |
| `A2` fan-out + loginable identities + lifecycle states | 3–4                                  |
| `A3` reseed loop                                       | 2–3                                  |
| `A4` temporal label + retrain + oracle model           | 6–9                                  |
| `A5` CI gate                                           | 2                                    |
| **Model track**                                        | **21–29h ≈ 2.6–3.6 days**            |
| Slice 2                                                | 12–16h ≈ 1.5–2 days                  |
| **Total**                                              | **4.1–5.6 days against 5 available** |

**Fits at the low end; overruns by ~half a day at the high end.** Stated now rather than discovered
on Aug 4.

**Checkpoint — end of 2026-08-03.** If the model track is not through `A3`, descope in this order:
`A5`'s CI gate (2h — the suite still runs manually) → the oracle model (1–2h — the production-shaped
number survives) → fall back to the documented-model path from the killed Option B. This order costs
the least story per hour saved.

### Open tension

**The correlation may come back moderate after all of this.** Decision 4 (method defensibility over
the number) already answers it, but it is worth having decided twice: the first mediocre number after
three days of repair will _feel_ like failure and will not be. **A leak-free 0.40 that predicts
genuinely unseen behaviour is a stronger result than a leaked 0.85** — and D2's oracle model is what
lets that be _proved_ rather than asserted, by showing how much of the gap is the data's ceiling
rather than the model's failure.

### Before any code

`codex-review` on the implementation plan — gpt-5.6-terra, high. Artifacts and a neutral question,
**never my hypotheses**; priming makes agreement worthless. Codex found the leakage this whole
segment addresses.

---

Related: [[2026-08-01-model-integrity-crisis-and-the-two-of-three-decision]] · [[PROJECT-STATE]] ·
[[tracking]] · [[2026-07-31-structural-checks-statistical-artifact]] ·
[[2026-07-31-on-time-rate-dead-feature-defect]] · [[2026-07-29-trust-score-attribution-defect]] ·
[[validate-distributions-not-just-structure]]

---

# PART 2 — IMPLEMENTATION PLAN

---

type: plan
title: A1 — generator semantic pass (implementation plan)
status: draft — awaiting codex-review, then execution
tags: [plan, generator, trust-score, A1, leakage, attribution]
created: 2026-08-01
spec: "[[2026-08-01-a1-generator-semantic-pass-design]]"
---

# A1 — Generator Semantic Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove target leakage at its source by making the generator produce per-party, contract-
referenced, causally-independent conduct — so the Trust Score model predicts something it was not
handed.

**Architecture:** Each engagement gains a machine-checkable contract (`dueAt`, `revisionsIncluded`)
frozen from the accepted proposal. Each concluded engagement then produces **two** `Outcome` rows —
one per party — describing only that party's own conduct, with an explicit `observed` flag for the
case where a counterparty's ghosting made conduct unknowable. Every conduct field is drawn from its
subject's own traits with its own noise source, replacing today's single `ghost_p` term that four
label components silently descend from.

**Tech Stack:** Python 3.13 (generator, pytest), Mongoose 8 schemas + Zod contracts (`apps/api`),
raw pymongo writes, MongoDB `canary_dev`.

**Repo:** `F:\Canary`. **Branch:** `rudra/a1-generator-semantic-pass` off `main`.
**Spec:** [[2026-08-01-a1-generator-semantic-pass-design]].

---

## ⚠️ Plan convention for this project

Per `CLAUDE.md`: **this plan describes behaviour, contracts and test intent — it does not embed
literal implementation or test source.** Slice 1 lost time to three bugs that originated in its own
frozen plan (a verbatim `XGBClassifier` API choice, a wrong fixture assertion, a stale pinned
`requirements.txt` block). Supplying source in a plan converts a code defect into a plan defect by
construction.

Each task therefore specifies: exact files, the exact assertion that must hold, the exact command to
run, and the exact expected output. The implementer writes the code.

**Dependency state must be re-checked at execution start** — do not trust any version named here.
Slice 1's plan was 12 days old and its dependency block had gone stale under merged Dependabot PRs.

---

## Numeric floors — fixed now, before any measurement

Per the spec's rule: thresholds are chosen before data is seen, so a miss is a finding rather than a
reason to move the bar.

**All gates run per role** (see the spec's role-contract section). Pooling roles would report a
correctly role-absent feature as degenerate.

**Discriminator columns are exempt from gates 2 and 4a.** `subject_role` is constant _within_ each
role by definition, so a per-role signal gate would score it at zero separation and 100% degeneracy
and fail it — correctly by the arithmetic, wrongly by intent. It is metadata that tells the model
which contract a row follows, not a behavioural signal. Mark it (and any future discriminator)
exempt explicitly rather than letting a gate fail on a column that is doing its job.
_(codex-review round 3 — a defect introduced by round 2's own superset-schema fix.)_

**Statistical validity preconditions, applying to gates 2-6:**

- **Minimum sample:** ≥ 200 scoreable profiles per archetype per role, or the gate reports
  _not evaluable_ rather than pass/fail.
  ⚠️ **This is unreachable at small N and that is intentional.** Bad actors are ~8% of profiles and
  roles split further, so **500 profiles yields ~20 per cell, not 200** — gates 2-6 are _not
  evaluable_ at the smoke-run size, and Task 24 must report them that way rather than green
  (codex-review round 2). Today's 20 000-profile seed has only 1 976 _scoreable_ profiles, so even
  that falls short. **Reaching the minimum is therefore an `A2` fan-out requirement**, and if `A2`
  cannot produce it, the gate stays _not evaluable_ — a finding about the dataset, not a reason to
  lower the bar.
- **Multi-seed:** every gate is evaluated across **≥ 5 seeds**, and reports the range. A single
  seeded sample is not evidence — this codebase's own standing lesson, learned when 25 of 30 swept
  seeds failed a test that seed 42 happened to pass.
- **Effect-size naming:** `signal_audit.separation` is _spread of per-archetype means in pooled
  population SDs_. **It is not Cohen's d** and must not be described as such in code, comments, or
  the viva. Thresholds below are calibrated on that statistic's own scale.

| Gate                                                            | Floor                                                                                                                                                                               | Reasoning                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Leakage — **row/window non-overlap**, not name disjointness | For every profile: `set(rows feeding the features) ∩ set(rows feeding the label) == ∅`, and every label row's `recordedAt` is strictly greater than every feature row's             | **Redefined after codex-review round 2.** Column-name disjointness is _wrong_ under a temporal label: `paid_in_full_rate` measured after `T` is a different quantity from the same-named feature measured before `T`, so name overlap is legitimate and row overlap is the actual defect. This gate lives with `A4`'s label builder and is **not evaluable in `A1`** — Task 24 reports it as such |
| 2 · Archetype recoverability                                    | `separation ≥ 0.5` for every feature in that role's contract                                                                                                                        | Medium effect on the pooled-SD scale. A feature below it carries weight with no signal                                                                                                                                                                                                                                                                                                            |
| 3 · Conditional independence                                    | Each **non-ghost** label term retains `separation ≥ 0.3` over **`observed && !ghosted`** rows. The **ghost term is exempt and checked by gate 2 instead**, over all `observed` rows | Dropping only `ghosted` rows leaves not-observed rows in the denominator and re-admits the ghosting channel. **But filtering to `!ghosted` makes the ghost indicator identically zero**, so a ghost term would fail gate 3 by construction — a fact about the filter, not the data _(codex-review round 4)_. `paidInFull` today: ~0                                                               |
| 4a · Feature degeneracy                                         | No feature holds one identical value for > 50% of scoreable profiles                                                                                                                | Rate features may legitimately pile at a boundary (`ghost_rate = 0` is common and real), so this is deliberately loose. `on_time_rate` at 96% fails clearly                                                                                                                                                                                                                                       |
| 4b · Label degeneracy                                           | The label has ≥ 20 distinct values, and no single value holds > 10% of scoreable profiles                                                                                           | Stricter than 4a **on purpose**: banding requires spread. The 581-profile atom at exactly `0.7000` (29.4%) is what made quantile thresholds unimplementable                                                                                                                                                                                                                                       |
| 5 · Plausibility                                                | on-time 0.55–0.90 · ghost 0.02–0.15 · paid-in-full 0.80–0.98 · scope-creep 0.10–0.40                                                                                                | **Judgment ranges, not sourced from published marketplace data.** They encode what this product would consider plausible. A miss is a prompt to re-examine, not proof of a bug — and that limitation is stated rather than hidden                                                                                                                                                                 |
| 6 · Label composition                                           | No term with conditional separation < 0.3; no feature with `separation ≥ 1.0` omitted from the label, **except a predeclared collinear sibling**                                    | `avg_days_late` at d=1.89 sits in no term today and trips this immediately                                                                                                                                                                                                                                                                                                                        |

**Collinearity exemption — declared in advance, not invented when the gate fires**
_(codex-review round 6, which caught gate 6 failing by design against my own fixed label)._
`on_time_rate` and `avg_days_late` are both derived from the same underlying `daysLate` quantity —
one thresholds it, the other averages it. They are collinear by construction, so requiring **both**
in the label would double-weight one behaviour while looking like two independent terms. That is the
defect this whole segment exists to remove, in miniature.

**Resolution:** the freelancer label carries **one** lateness term, and gate 6 exempts a feature
when another label term derives from the same underlying quantity. The exemption is **named at
declaration time and its sibling recorded**, so it can never be granted retroactively to whatever
happens to fail. Which of the two becomes the term is `A4`'s call, made on measured separation after
the lateness fix — both are currently distorted by the floor bug, so choosing now would be choosing
on corrupt numbers.

### Per-role label structure — fixed in `A1`; weights stay measurement-driven

Gate 3 cannot be evaluated without knowing which terms each role's label contains, so the
**structure** is fixed here. **Weights remain `A4`'s, set by measurement** — that was Rudra's
decision 1 and it stands; structure and weighting are different questions
_(codex-review round 4 asked for both; only structure is answerable now)_.

| Role           | Label terms — **fixed, no conditionals**                       |
| -------------- | -------------------------------------------------------------- |
| **Freelancer** | ghost (exempt from gate 3) · on-time delivery                  |
| **Client**     | ghost (exempt from gate 3) · paid-in-full · revision restraint |

_Round 4 gave the freelancer a third term derived from the **counterparty's** revision behaviour,
hedged with "only if it proves independent". **Both halves were wrong** (codex-review round 5): it
reintroduces exactly the cross-party attribution D3 exists to abolish — scoring a freelancer on what
their client did — and a conditional term makes the structure measurement-dependent, which is the
thing this section was written to prevent. Removed outright._

Both roles keep a ghost term because ghosting is the one conduct both genuinely exhibit and the one
the product most needs to price. It is checked for recoverability by gate 2 over all `observed`
rows, which is a real check — just not a _conditional_ one.

**`A2` fan-out target (measured in `A3`, recorded here so it isn't invented later):** ≥ 60% of
scoreable profiles retain ≥ 3 observed outcomes in the feature window **and** ≥ 1 in the label
window. Below that, the temporal split has starved the trainable population and the window boundary
needs moving before the model is blamed.

---

## File structure

| File                                                | Responsibility                                                                                                                                                                                                                                        | Action         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `apps/api/src/models/Engagement.js`                 | `agreedTerms` gains `dueAt`, `revisionsIncluded`                                                                                                                                                                                                      | Modify         |
| `apps/api/src/models/Proposal.js`                   | gains `proposedDurationDays`                                                                                                                                                                                                                          | Modify         |
| `apps/api/src/models/Outcome.js`                    | per-party shape, compound unique index                                                                                                                                                                                                                | Modify         |
| `apps/api/src/models/Review.js`                     | provenance flags persisted                                                                                                                                                                                                                            | Modify         |
| `packages/shared/contracts/`                        | Zod contracts. **Only `health`, `jobPost`, `auth`, `trustScore` exist** — Engagement / Proposal / Outcome / Review contracts must be **created**, not modified. (`apps/api/src/contracts/` does not exist; an earlier draft of this plan invented it) | Create         |
| `apps/intelligence/trust_score/fetch.py`            | **`fetch.py:17-18` assigns every outcome to both parties.** Must index by `subjectProfileId`                                                                                                                                                          | Modify         |
| `apps/intelligence/generator/payments.py`           | Collapses outcomes by `engagementId`; must select the **client** row                                                                                                                                                                                  | Modify         |
| `apps/intelligence/trust_score/model.py`            | `FEATURE_COLUMNS` duplicates `features.py`'s `FEATURE_NAMES` — collapse to one definition, made role-aware                                                                                                                                            | Modify         |
| `apps/api/tests/seedInvariants.test.js`             | Line 456 asserts on `responsibleParty`, a field this plan does not create                                                                                                                                                                             | Modify         |
| `apps/intelligence/generator/proposals.py`          | emits `proposedDurationDays`                                                                                                                                                                                                                          | Modify         |
| `apps/intelligence/generator/engagements.py`        | freezes `agreedTerms` incl. `dueAt`                                                                                                                                                                                                                   | Modify         |
| `apps/intelligence/generator/outcomes.py`           | **rewritten** — per-party conduct, four-case ghosting, independent draws                                                                                                                                                                              | Modify (major) |
| `apps/intelligence/generator/reviews.py`            | realistic sabotage                                                                                                                                                                                                                                    | Modify         |
| `apps/intelligence/generator/run.py`                | persists provenance + two-row outcomes                                                                                                                                                                                                                | Modify         |
| `apps/intelligence/trust_score/features.py`         | missing-data policy, role-awareness                                                                                                                                                                                                                   | Modify         |
| `apps/intelligence/quality/gates.py`                | the six gates with the floors above                                                                                                                                                                                                                   | **Create**     |
| `apps/intelligence/tests/test_outcomes.py`          | magnitude assertions replacing comparatives                                                                                                                                                                                                           | Modify (major) |
| `apps/intelligence/tests/test_gates.py`             | gate behaviour on synthetic degenerate input                                                                                                                                                                                                          | **Create**     |
| `apps/intelligence/tests/test_trust_score_fetch.py` | rewritten — line 72 asserts the defect                                                                                                                                                                                                                | Modify         |

`quality/gates.py` is new and separate from `quality/signal_audit.py` on purpose: `signal_audit`
**measures**, `gates` **judges**. Keeping the floors out of the measurement code means the
measurements stay reusable when the floors change.

---

## Task 0: Land the signal-audit instrument

**Files:** none changed — branch work only.

- [ ] **Step 1:** Push the existing branch.
      Run: `git push -u origin rudra/signal-audit-instrument`
      Expected: branch created on remote.
- [ ] **Step 2:** Open the PR.
      Run: `gh pr create --title "feat(quality): statistical acceptance measurements" --fill`
      Expected: PR URL printed.
- [ ] **Step 3:** Confirm CI green before proceeding.
      Run: `gh pr checks`
      Expected: all checks pass. **Do not start Task 1 against a red instrument.**

---

## Task 1: Snapshot the database

**Files:** none changed.

- [ ] **Step 1:** Snapshot.
      Run: `node scripts/snapshotDb.js snapshot canary_dev`
      Expected: a new directory under `F:\canary-snapshots\` with a document count logged.
- [ ] **Step 2:** Record the count in the branch's working log. This is the number a restore must
      reproduce. The last recorded snapshot was 590 708 documents; expect a similar order.

> **This plan wipes and reseeds. The `--wipe` guard will fire and MUST NOT be routed around.**
> When it blocks, stop and ask. That guard exists because a `pytest` run destroyed 484 500 rows
> behind a benign command.

---

## Task 2: Engagement contract terms

**Files:**

- Modify: `apps/api/src/models/Engagement.js` (the `agreedTermsSchema`)
- Create: `packages/shared/contracts/engagement.js` (does not exist) + its package export
- Test: `apps/api/tests/` — the model's existing schema test file

- [ ] **Step 1: Write the failing tests.** Assertions that must hold: - An Engagement with `status: 'active'` and `agreedTerms` lacking `dueAt` **fails validation**. - An Engagement with `status: 'prospective'` and no `agreedTerms` **passes** (existing
      conditional-required behaviour is preserved). - `revisionsIncluded` defaults to `0` when omitted, **rejects negatives, and rejects
      fractional values** — enforced in Mongoose and Zod, tested in both. _(Moved here from Task 3
      after codex-review round 4: Task 3 owns Proposal files only, so the constraint would never
      have been written.)_ - `dueAt` round-trips as a `Date`, not a string.
- [ ] **Step 2: Run to verify failure.**
      Run: `npm test -w apps/api -- Engagement`
      Expected: FAIL — `dueAt` not a known path.
- [ ] **Step 3: Implement** — add `dueAt` (Date, required under the same conditional the subdocument
      already uses for `status !== 'prospective'`) and `revisionsIncluded` (Number, default 0).
      Leave `timeline` (String) untouched: it is the human-readable term.
- [ ] **Step 4: Run to verify pass.** Same command. Expected: PASS.
- [ ] **Step 5: Create the shared Zod contract.** `packages/shared/contracts/engagement.js` does **not exist** — create it and add its export. (`apps/api/src/contracts/` is not a real path; an earlier draft invented it.) Then run the contract tests.
- [ ] **Step 6: Commit.** Stage only `Engagement.js`, its contract, and the test file.
      Message: `feat(schema): add machine-checkable contract terms to Engagement`

---

## Task 3: Proposal duration

**Files:**

- Modify: `apps/api/src/models/Proposal.js`
- Modify: the Proposal Zod contract
- Test: the Proposal model test file

- [ ] **Step 1: Write the failing tests.** - `proposedDurationDays` accepts a positive integer. - It rejects zero and negatives (a proposal cannot promise delivery before it is accepted). - **It rejects fractional values.** `Number, min 1` alone admits `2.5` days, which produces a
      nonsensical `dueAt`. Integer-ness must be enforced in **both** Mongoose and Zod, and tested
      in both. _(Raised by codex-review round 2.)_ - `durationEstimate` (String) still round-trips unchanged.
- [ ] **Step 2: Run to verify failure.** Run: `npm test -w apps/api -- Proposal`. Expected: FAIL.
- [ ] **Step 3: Implement.** `proposedDurationDays` — **integer**, minimum 1, enforced in Mongoose
      _and_ Zod. `Number, min 1` alone admits `2.5`, which produces a nonsensical `dueAt`.
      _(codex-review round 3: round 2 fixed the test and left the implementation instruction saying
      "Number, min 1".)_
      ℹ️ **`Engagement.agreedTerms.revisionsIncluded` gets the same integer/minimum-0 treatment, but
      it belongs to Task 2** — this task owns Proposal files only, so a constraint stated here would
      never have been implemented _(codex-review round 4)_.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Create the shared Zod contract** under `packages/shared/contracts/` and add its export — none of these contracts exist yet. Then run the contract tests.
- [ ] **Step 6: Commit.** `feat(schema): add proposedDurationDays to Proposal`

---

## Task 4: Outcome per-party shape

**Files:**

- Modify: `apps/api/src/models/Outcome.js`
- Modify: the Outcome Zod contract
- Test: the Outcome model test file

**This is the task that makes the misattribution defect structurally impossible.** Fields per the
spec's Section 1 table.

- [ ] **Step 1: Write the failing tests.** - Two Outcome rows with the **same** `engagementId` and **different** `subjectProfileId` both
      save successfully. - Two rows with the same `engagementId` **and** the same `subjectProfileId` — the second
      **fails on the unique index** (assert the duplicate-key error specifically, not any error). - `subjectProfileId`, `counterpartyProfileId`, `subjectRole`, `observed` are all required. - `subjectRole` rejects a value outside `'freelancer' | 'client'`. - `daysLate` accepts a **negative** number (early delivery) — this is currently inexpressible
      and is real positive signal. - `paidInFull` accepts `null` (freelancer rows carry no payment conduct). - **Exact nullability by role and observation.** `scopeCreepOccurred` currently has
      `default: false`, which would silently assert "no scope creep occurred" on every freelancer
      row, every unobserved row and every both-ghost row. **Every role-inapplicable or unobserved
      conduct field is nullable with no default**, and each combination is tested: freelancer row ·
      client row · unobserved row · both-ghost row. _(codex-review round 3 — this is the same
      null-vs-zero conflation that killed `on_time_rate`, reappearing through a schema default.)_
      ℹ️ **Cross-document assertions do NOT live here.** "A third row is rejected" and
      "subject must be a party" are cross-collection facts that Mongoose and Zod cannot express, so
      a test for them in this task could never pass against this task's work
      _(codex-review round 7)_. **They belong wholly to Task 23b's service integration tests.**
      This task is limited to local schema and index validation: field presence, types, nullability,
      and the compound unique index rejecting a duplicate `(engagement, subject)` pair. - The freelancer row's `subjectProfileId` equals the engagement's `freelancerProfileId`, and
      its `counterpartyProfileId` equals the `clientProfileId` — **assert the mapping, not just
      presence.** A swapped pair satisfies every "field exists" check.
- [ ] **Step 2: Run to verify failure.**
      Run: `npm test -w apps/api -- Outcome`
      Expected: FAIL — the two-row case fails first on the existing `unique: true`.
- [ ] **Step 3: Implement.** Drop `unique: true` from `engagementId`; add the compound unique index
      on `{engagementId, subjectProfileId}`; add the new fields; relax `paidInFull` to nullable.
      ⚠️ **The index cannot deliver the party-membership or cardinality guarantees on its own** —
      those are cross-collection facts (is this subject a party to _that_ engagement?) and neither a
      Mongo index nor a Zod schema can see across documents. **Implement the exactly-two-and-only-
      parties rule as an explicit persistence-boundary check** (Task 21 is where it lives for the
      generator; a service-level check covers the app path), and test a **third-row and a concurrent
      double-insert** attempt, not just the sequential duplicate. _(Raised by codex-review round 2 —
      the earlier draft claimed a guarantee the index does not provide.)_
- [ ] **Step 4: Run to verify pass.** Same command. Expected: PASS, including the duplicate-key case.
- [ ] **Step 5: Create the shared Zod contract** under `packages/shared/contracts/` and add its export — none of these contracts exist yet. Then run the contract tests.
- [ ] **Step 6: Commit.** `feat(schema): one Outcome row per party per engagement`

---

## Task 5: Review provenance and the party invariant

**Files:**

- Modify: `apps/api/src/models/Review.js`
- Modify: the Review Zod contract
- Test: the Review model test file

- [ ] **Step 1: Write the failing tests.** - `isPlantedCollusion` / `isPlantedSabotage` persist and read back as booleans, defaulting to
      `false`. - A **self-review** (`author == subject`) is rejected — a single-document fact, so it belongs
      here.
      ℹ️ **Party-membership assertions move to Task 23b** _(codex-review round 7)_: "subject is a
      party to the engagement" and "author and subject are opposite parties" are cross-collection
      facts. Mongoose cannot check them, so a test for them here could never pass against this
      task's work. _(This is the invariant the current sabotage generator violates 97 times — it is
      still enforced, just in the task that can actually enforce it.)_ - **One review per author per engagement** — a second is rejected, **enforced by a compound
      unique index `{engagementId, authorProfileId}`**, not by a query-then-insert check. A
      read-then-write check races under concurrent inserts and the race is invisible in tests that
      run serially. _(codex-review round 3.)_
- [ ] **Step 2: Run to verify failure.** Run: `npm test -w apps/api -- Review`. Expected: FAIL.
- [ ] **Step 3: Implement** both fields and all three relational checks.

> ⚠️ **Mongoose validation does not protect the seed.** The generator writes via raw pymongo and
> never constructs a Mongoose document — that is the root of the three `createdAt` defects, the
> `activeProfileId` gap, and the dropped provenance flags. **A model test passing here proves
> nothing about seeded data.** Task 21 adds the enforcement that actually covers the seed path.
> Raised by codex-review.

- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `feat(schema): persist review provenance, enforce subject is a party`

---

## Task 6: Generator emits contract terms

**Files:**

- Modify: `apps/intelligence/generator/proposals.py`
- Modify: `apps/intelligence/generator/engagements.py`
- Test: `apps/intelligence/tests/test_proposals.py`, `test_engagements.py`

- [ ] **Step 1: Write the failing tests.** - Every generated proposal carries a `proposedDurationDays` ≥ 1. - Durations vary — assert **at least 5 distinct values** across a 200-profile run. (A constant
      would pass any "field exists" check and produce a dead contract.) - Every non-prospective engagement's `agreedTerms.dueAt` equals its `createdAt` plus the
      **accepted proposal's** `proposedDurationDays` — not an independently drawn number. - `revisionsIncluded` varies and is ≥ 0.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_proposals.py apps/intelligence/tests/test_engagements.py -v`
      Expected: FAIL — attribute missing.
- [ ] **Step 3: Implement.** Proposals draw a duration; engagements freeze `dueAt` from the accepted
      proposal at acceptance time.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `feat(generator): derive engagement deadline from the accepted proposal`

---

## Task 7: Per-party ghosting

**Files:**

- Modify: `apps/intelligence/generator/outcomes.py`
- Test: `apps/intelligence/tests/test_outcomes.py`

Replaces `outcomes.py:61-64`, which picks the worse party and applies one probability to both.

- [ ] **Step 1: Write the failing tests.** The four-case table from the spec, asserted directly: - Neither ghosts → both rows `observed: true`, both `ghosted: false`. - Client ghosts → client row `ghosted: true, observed: true`; freelancer row
      `observed: false` with **all conduct fields null** (assert null explicitly, not falsy —
      `0` and `None` must be distinguishable). - Freelancer ghosts → mirror image. - **Both ghost → both rows `ghosted: true`, both `observed: true`, all other conduct fields
      null.** _(Raised by codex-review round 2: the earlier table left `observed` and conduct
      unspecified for this case, which would have made feature denominators
      implementation-defined.)_ The reasoning: each party's _own_ ghosting is directly observed —
      that is the conduct — while nothing else about either of them became visible. - Engagement-level: `endedAs == 'ghosted'` whenever either party ghosted. - **Independence:** across a 2 000-profile run, a freelancer's ghost rate must not shift by
      more than `separation 0.2` when conditioned on the client's archetype. (Today the worse
      party's probability drives both, so this fails by construction.)
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_outcomes.py -v -k ghost`
      Expected: FAIL.
- [ ] **Step 3: Implement.** Each party draws against their own traits at the engagement's month.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `feat(generator): draw ghosting per party from own traits`

---

## Task 8: Lateness as probability then magnitude

**Files:**

- Modify: `apps/intelligence/generator/outcomes.py`
- Test: `apps/intelligence/tests/test_outcomes.py`

Replaces `_late_days_range_from_traits`, which returns a **minimum** lateness — making on-time
delivery arithmetically impossible below reliability 0.975 and producing 98.7% late outcomes.

- [ ] **Step 1: Write the failing tests.** - **On-time is reachable at every trait level.** For each archetype, at least one on-time
      delivery in a 2 000-profile run. Assert per-archetype, not in aggregate. - Overall on-time rate falls in **0.55–0.90** (gate 5). - `separation` of `on_time_rate` across archetypes ≥ **0.5** (gate 2), and reliable > bad-actor
      in direction. **The magnitude assertion is the test; the direction is a sanity check, not
      coverage** — `bad > good` passes at 0.0001 vs 0.00001 and is how this feature reached 98.7%
      degenerate with 76 tests green. - Early delivery occurs: at least some `daysLate < 0`. - `daysLate` is measured against `agreedTerms.dueAt`, not drawn free-floating — assert it
      equals `deliveredAt - dueAt` in days for a constructed fixture.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_outcomes.py -v -k late`
      Expected: FAIL — on-time rate near 0.013.
- [ ] **Step 3: Implement.** Two independent draws: _whether_ the deadline is missed (probability
      rising as reliability falls), then _by how much_ (scale rising as reliability falls). Separate
      RNG streams from the ghosting draw.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): lateness as probability then magnitude, against dueAt`

---

## Task 9: Payment from client traits

**Files:**

- Modify: `apps/intelligence/generator/outcomes.py`
- Test: `apps/intelligence/tests/test_outcomes.py`

Replaces `outcomes.py:75` (`not ghosted and rng.random() < 0.95`) — measured at
94.745 / 94.837 / 94.600% across the three archetypes.

- [ ] **Step 1: Write the failing tests.** - `paid_in_full_rate` `separation` across **client** archetypes ≥ **0.5**. - **Conditional independence (gate 3):** with ghosting held out (observed engagements only),
      separation ≥ **0.3**. This is the assertion that fails today at ~0. - Overall paid-in-full rate in **0.80–0.98** (gate 5). - `paidInFull` is `null` on every freelancer row.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_outcomes.py -v -k paid`
      Expected: FAIL — separation ≈ 0.
- [ ] **Step 3: Implement.** Payment probability from the client's own reliability, own RNG stream,
      conditional on the engagement being observed.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): draw payment from client traits, not a flat coin flip`

---

## Task 10: Revisions and derived scope creep

**Files:**

- Modify: `apps/intelligence/generator/outcomes.py`
- Test: `apps/intelligence/tests/test_outcomes.py`

Replaces `outcomes.py:69` — a threshold on **ghost propensity**, which is why scope creep carries no
independent signal.

- [ ] **Step 1: Write the failing tests.** - `revisionsRequested` is null on freelancer rows, present on client rows. - `scopeCreepOccurred == (revisionsRequested > agreedTerms.revisionsIncluded)` — assert the
      derivation exactly on a constructed fixture, not statistically. - Scope-creep rate in **0.10–0.40** (gate 5). - **Conditional independence:** separation across client archetypes ≥ **0.3** with ghosting
      held out. Today it is a deterministic function of `ghost_p` and fails.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_outcomes.py -v -k scope`
      Expected: FAIL.
- [ ] **Step 3: Implement.** Revisions drawn from client traits with an independent RNG stream;
      scope creep derived from the contract comparison.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): revisions from client traits, scope creep derived from contract`

---

## Task 11: Shared conclusion timeline and real timestamps

**Files:**

- **Create: `apps/intelligence/generator/timeline.py`** — the timeline producer. One function, one
  responsibility: given an engagement and both parties' conduct, return the engagement's event
  moments (delivery, payment, conclusion/recording).
- Modify: `apps/intelligence/generator/outcomes.py` (consumes it)
- Modify: `apps/intelligence/generator/payments.py` (consumes it)
- Modify: `apps/intelligence/generator/run.py` (produces the timeline before both)
- Test: `apps/intelligence/tests/test_timeline.py` (new), `test_outcomes.py`, `test_payments.py`

_(Module and consumer list added after codex-review round 2. **Round 3 caught that this was still
circular** — a timeline "given both parties' conduct" cannot be built before `generate_outcomes`,
because conduct includes `daysLate` and `paidInFull`.)_

**Resolution — three explicit phases, in this order:**

1. **Draw conduct, relative.** Per party: ghosted? late? by how much (in days, relative to `dueAt`)?
   paid? how many revisions? **No absolute dates at all** — this phase reads traits and the contract,
   nothing else.
2. **Build the timeline** (`timeline.py`). Given the engagement's `createdAt` and `dueAt` plus the
   relative conduct from phase 1, resolve the absolute moments: `deliveredAt`, payment time,
   conclusion/`recordedAt`, and review windows.
3. **Materialize documents.** `outcomes.py` and `payments.py` emit their rows reading phases 1 and 2,
   never recomputing either.
   **Review timing is owned solely by Task 20**, not split across both tasks — Task 11 previously
   named `reviews.py` as a materializer without listing it in its files or testing its timeline
   input, while Task 20 changed only `run.py` persistence, so review timing had two half-owners and
   no full one _(codex-review round 6)_. Task 20 consumes `timeline.py` and owns `reviews.py`.

The circularity was real and came from conflating "draw the behaviour" with "date the behaviour".
Splitting those two is the fix; reordering `run.py` alone is not.

**Both consumers must receive identical event times for the same engagement** — assert that
directly. Two independent derivations agreeing on one seed is exactly the failure mode this codebase
has hit before.

Today **11 148 of 11 148** outcomes carry `recordedAt == engagement.createdAt`. Without this fix the
temporal label is unbuildable — there is nothing to split on.

- [ ] **Step 1: Write the failing tests.** - **Zero** outcomes where `recordedAt == engagement.createdAt`. - Every `recordedAt` is strictly greater than its engagement's `createdAt`. - No `recordedAt` in the future relative to the run's `now`. _(The generator has had three
      separate future-timestamp defects — `jobposts.py`, `reviews.py`, `payments.py`. Assert it.)_ - `recordedAt` spans a meaningful range: at least 12 distinct month-buckets across a
      2 000-profile run, so a temporal split has somewhere to cut. - **No concluded engagement has insufficient elapsed time for its own chronology.** Assert the
      full ordering `createdAt < dueAt`, `deliveredAt`, payment and review events all land before
      `now`. A concluded engagement created yesterday under a 30-day term is incoherent, and
      clamping its conclusion to `now` would then violate `recordedAt > createdAt`. _(Raised by
      codex-review.)_
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_outcomes.py -v -k timestamp`
      Expected: FAIL — all equal to `createdAt`.
- [ ] **Step 3: Implement — note the ordering constraint.**
      ⚠️ **The original plan was circular** and codex-review caught it: `run.py:151` generates
      outcomes, `run.py:154` generates payments, so `recordedAt` **cannot** depend on a payment
      event that does not exist yet.
      **Resolution:** compute a **shared conclusion timeline per engagement before both** —
      delivery, payment and recording moments derived together from the contract and conduct — and
      have `generate_outcomes` and `generate_payments` both read it. Do not reorder `run.py` alone;
      that would just move the circularity.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): shared conclusion timeline, real outcome timestamps`

---

## Task 12: Realistic sabotage reviews

**Files:**

- Modify: `apps/intelligence/generator/reviews.py` (lines 61-97)
- Test: `apps/intelligence/tests/test_reviews.py`

Today `victim = rng.choice(reliable_targets)` picks from the whole population and attaches the review
to an unrelated engagement — structurally impossible, and detectable by Slice 2 with a single join.

- [ ] **Step 1: Write the failing tests.** - **Every** sabotage review's `subjectProfileId` is a party to its `engagementId`. - Every sabotage review's author is the **counterparty** on that same engagement. - Sabotage ratings contradict the outcome: assert the rating is low while the subject's
      conduct on that engagement was good. Assert on the _relationship_, not on a fixed rating
      value — a constant `1` is its own degeneracy and would let a detector cheat. - The 2-reviews-per-engagement cap still holds (existing invariant, must not regress). - Collusion generation is **unchanged**: 5-star reviews only where both parties are ring
      members on a real shared engagement. - **Non-vacuous population, with a stated floor:** **≥ 30 planted sabotage reviews per seed at
      5 000 profiles**, and **≥ 1.5% of saboteur-party engagements** carry one, verified across
      **≥ 5 seeds**. _(Round 2 wrote "at least N" and never defined N — an unenforceable floor is
      the same as no floor. codex-review round 3.)_ Every other assertion here is satisfied by a
      dataset containing zero sabotage reviews; that is the vacuous-pass defect again. - **Rating diversity:** planted sabotage ratings span **≥ 3 distinct values**. A constant
      1-star is a signature a detector can match without detecting anything, which would make
      Slice 2's recall number meaningless. - **Eligibility:** the subject had an _observed_ outcome on that engagement — you cannot
      plausibly sabotage someone whose conduct was never visible.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_reviews.py -v -k sabotage`
      Expected: FAIL — subject is not a party.
- [ ] **Step 3: Implement.** Saboteurs review their real counterparty on a real shared engagement
      with a rating inconsistent with the observed outcome.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): sabotage reviews target the real counterparty`

---

## Task 13: Persistence — two rows and surviving provenance

**Files:**

- Modify: `apps/intelligence/generator/run.py` (the `_resolve_ids` / persistence path)
- Test: `apps/intelligence/tests/test_generator_run.py`

`run.py`'s id-resolution step is where the three `createdAt` defects and the dropped provenance flags
all live. **The generator writing around app-layer logic is this codebase's most-repeated bug
family** — treat the family, not the instance.

- [ ] **Step 1: Write the failing tests.** - Every concluded engagement produces **exactly 2** persisted Outcome documents. - Both carry resolved `subjectProfileId` and `counterpartyProfileId` ObjectIds, and they are
      the two parties to that engagement — not swapped. **Assert the mapping, not just presence:**
      the freelancer row's subject is the freelancer. - **100%** of persisted reviews carry `isPlantedCollusion` and `isPlantedSabotage`.
      (Today: 0 of 17 111.) - Every persisted Outcome carries `createdAt` (fourth check of the recurring family).
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_generator_run.py -v`
      Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): persist per-party outcomes and review provenance`

---

## Task 14: Feature missing-data policy

**Files:**

- Modify: `apps/intelligence/trust_score/features.py`
- Test: `apps/intelligence/tests/test_trust_score_features.py`

The file where both dead-feature defects lived.

- [ ] **Step 1: Write the failing tests.** - A not-observed outcome is **excluded from conduct denominators** — assert that adding one
      changes no conduct rate. - A not-observed outcome does **not** count toward `engagement_count`, and therefore not
      toward the cold-start gate. A profile whose counterparties all vanished is
      `insufficient-history`, not "clean record". - **`daysLate: None` is never read as on-time.** Construct a profile whose only outcome has a
      null `daysLate` and assert `on_time_rate` is not 1.0. _(This is the exact
      `(o["daysLate"] or 0)` bug at lines 40, 63 and 76.)_ - Features are role-aware: the same engagement yields different vectors for the two parties. - Observation count is exposed as a feature.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_trust_score_features.py -v`
      Expected: FAIL — null coerced to on-time.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(features): honest missing-data policy, role-aware aggregates`

---

## Task 15: Rewrite the tests that encode the defect

**Files:**

- Modify: `apps/intelligence/tests/test_trust_score_fetch.py` (line 72 requires the outcome be
  shared with both parties — precisely what Task 4 abolishes)
- Modify: any `test_outcomes.py` comparative assertions not already replaced by Tasks 7-11

- [ ] **Step 1:** Run the full suites and list every failure.
      Run: `npm test -w apps/api` and `pytest apps/intelligence -v`
      Expected: a specific set of failures, each one a test asserting old semantics.
- [ ] **Step 2:** For each failure, decide **rewrite vs update** and record the reason in the commit
      body. A test that asserts the bug is rewritten, not adjusted.
- [ ] **Step 3:** Confirm no comparative (`bad > good`) assertion remains as the sole guard over any
      generated field. Grep for the pattern and check each hit.
- [ ] **Step 4:** Run both suites green.
- [ ] **Step 5: Commit.** `test: rewrite assertions that encoded shared-outcome semantics`

---

## Task 16: Wire the acceptance gates

**Files:**

- Create: `apps/intelligence/quality/gates.py`
- Create: `apps/intelligence/tests/test_gates.py`

Consumes `quality/signal_audit.py`'s four primitives. **`signal_audit` measures; `gates` judges.**

- [ ] **Step 1: Write the failing tests.** Each gate is tested against **synthetic input engineered
      to fail it**, so a gate that silently does nothing is caught: - **Gate 1 uses event-window fixtures, not column names.** Feed it a profile whose feature
      rows and label rows **overlap** and assert it fails; feed it cleanly separated windows and
      assert it passes; feed it windows that don't overlap but where a label row predates a
      feature row and assert it fails. _(Round 2 redefined this gate and round 3 caught that this
      test still checked name disjointness — the test and the gate had drifted apart in the same
      revision.)_ - Gate 2 fails a feature with separation below 0.5. - Gate 3 fails a term whose conditional separation is below 0.3 — feed it a flat 95% field
      and assert it fails. **This is the `paidInFull` regression test.** - Gate 4a fails a feature constant across >50%; 4b fails a label with a >10% atom — feed it
      29.4% at one value and assert it fails. - Gate 5 fails a rate outside its range — feed 0.987 late and assert it fails. - Gate 6 fails when a separation-1.0 feature is omitted from the label. - **The collinearity exemption is exclusive.** Assert that _only_ the declared
      lateness-sibling pair is exempt: an undeclared high-separation feature still fails, and an
      exemption supplied _after_ the gate has run is rejected. _(codex-review round 7 — an
      exemption that can be granted retroactively is not an exemption, it is an escape hatch, and
      it would let any inconvenient gate failure be waved through.)_
      **Every gate must be proven to fire in both directions.** The first destructive-command guard
      compared a variable against itself and silently passed everything; a gate that cannot fail is
      worse than no gate.
- [ ] **Step 2: Run to verify failure.** Run: `pytest apps/intelligence/tests/test_gates.py -v`.
      Expected: FAIL — module missing.
- [ ] **Step 3: Implement** `gates.py` with the floors from the table above as named constants.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `feat(quality): six acceptance gates over the signal-audit measurements`

---

## Task 18: Fix the scoring fetch path

**Files:**

- Modify: `apps/intelligence/trust_score/fetch.py` (lines 12-18)
- Test: `apps/intelligence/tests/test_trust_score_fetch.py`

**Raised by codex-review; the original plan had no task for this and would have shipped a
regression.** `fetch.py:17-18` loops over _both_ engagement parties and appends the same outcome to
each. With two rows per engagement, every profile would receive **both** rows — its own and its
counterparty's — making attribution worse than today rather than better.

- [ ] **Step 1: Write the failing tests.** - A profile's outcome list contains **only** rows where `subjectProfileId` is that profile. - Given one engagement with two rows, each party receives **exactly one** row, and it is
      theirs. Assert identity, not count. - A row whose subject is neither party is attached to nobody.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_trust_score_fetch.py -v`
      Expected: FAIL — each profile receives 2 rows.
- [ ] **Step 3: Implement.** Index by `subjectProfileId` directly; the engagement join is no longer
      needed for attribution.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Fix the serving path.** `apps/api/src/trustScore/trustScore.service.js` **does**
      group Outcomes by Engagement and select one — verified, not hypothetical _(codex-review round
      2 corrected this from conditional prose to a confirmed defect)_. Add it and its DB tests to
      this task's files. Assert: a profile's served outcome set contains only rows whose
      `subjectProfileId` is that profile, and that a two-row engagement contributes exactly one row
      to each party.
- [ ] **Step 6: Commit.** `fix(trust-score): attribute outcomes by subject, not by engagement party`

---

## Task 19: Fix outcome-lookup collisions

**Files:**

- Modify: `apps/intelligence/generator/payments.py`
- Modify: `apps/intelligence/generator/reviews.py` (line 27)
- Test: `apps/intelligence/tests/test_payments.py`, `test_reviews.py`

**Raised by codex-review.** Both modules build `{engagementLocalId: outcome}` dictionaries. With two
rows per engagement, **one party's row silently overwrites the other's** — a last-write-wins bug with
no error, whose effect depends on generation order.

- [ ] **Step 1: Write the failing tests.** - Payment generation reads the **client** row (payment is client conduct). - Review rating logic reads the **reviewed subject's** row, not an arbitrary one. - Construct an engagement whose two rows differ in every conduct field and assert the consumer
      picked the right one. A test where both rows agree proves nothing.
- [ ] **Step 2: Run to verify failure.**
      Run: `pytest apps/intelligence/tests/test_payments.py apps/intelligence/tests/test_reviews.py -v`
      Expected: FAIL.
- [ ] **Step 3: Implement.** Key lookups by `(engagementLocalId, subjectLocalId)`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): key outcome lookups by engagement and subject`

---

## Task 20: Review timestamps and visibility

**Files:**

- Modify: `apps/intelligence/generator/reviews.py` — **sole owner of review timing**; consumes
  `timeline.py`'s event moments rather than deriving its own _(ownership consolidated here after
  codex-review round 6, which found it split between Tasks 11 and 20 with neither owning it)_
- Modify: `apps/intelligence/generator/run.py` (Review persistence)
- Modify: `apps/intelligence/trust_score/features.py` (review filtering)
- Test: `apps/intelligence/tests/test_generator_run.py` (**create** — no generator-run test file exists today), `apps/intelligence/tests/test_trust_score_features.py`

**Raised by codex-review, and it is a leakage hole the original plan left open.** `run.py` persists
`Review.createdAt` as the _source engagement's_ `createdAt`. Fixing outcome timestamps while leaving
reviews at engagement-start means **a review written after the fact is visible inside a historical
feature window** — future information in a past feature vector, which is the same class of defect as
the target leakage this whole segment exists to remove.

- [ ] **Step 1: Write the failing tests.** - **Zero** reviews where `createdAt == engagement.createdAt`. - Every review's `createdAt` is after its engagement's conclusion event. - `Review.visibleAt` is populated (currently null on all 17 111 — the double-blind rule has
      nowhere to live) and features filter on **visibility**, not authorship time. - A feature vector computed `as_of` T contains no review visible after T.
- [ ] **Step 2: Run to verify failure.** Run: `pytest apps/intelligence/tests/test_generator_run.py -v -k review`
      Expected: FAIL.
- [ ] **Step 3: Implement**, reading from Task 11's shared conclusion timeline.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `fix(generator): real review timestamps and visibility windows`

---

## Task 21: Persistence-boundary validation

**Files:**

- Create: a shared validation step in `apps/intelligence/generator/run.py`'s persistence path
- Test: `apps/intelligence/tests/test_generator_run.py`

**Raised by codex-review, and it treats the family rather than the instance.** Every schema
constraint in Tasks 2-5 is enforced by Mongoose. **The generator never constructs a Mongoose
document.** That single fact is the origin of the three `createdAt` defects, the unset
`activeProfileId`, the missing seeded credentials, and the dropped provenance flags — five instances
of one bug. Model tests passing while seeded documents are malformed is the _normal_ outcome here,
not the surprising one.

- [ ] **Step 1: Write the failing tests.** - A deliberately malformed generated document (missing `subjectProfileId`, or a review whose
      subject is not a party) is **rejected before insertion**, with a message naming the field. - The check runs over **every** collection the generator writes, not a chosen subset — assert
      the covered-collection list equals the written-collection list, so adding a collection later
      cannot silently escape validation.
- [ ] **Step 2: Run to verify failure.** Run: `pytest apps/intelligence/tests/test_generator_run.py -v -k validate`
      Expected: FAIL — no such check exists.
- [ ] **Step 3: Implement — two layers, because one is not enough.**
      _(Sharpened after codex-review round 2: "validate against Zod **or** a Mongo validator" was
      underspecified, and neither can express cross-document facts.)_ 1. **Structural** — each document against its collection's shape (required fields, types,
      enums). 2. **Relational** — a Python-side validator over the _resolved_ Engagement/Profile ids,
      checked before insert: every Outcome's subject and counterparty are the two parties to its
      engagement and are distinct; exactly two Outcomes per concluded engagement; every Review's
      author and subject are opposite parties to its engagement; one review per author per
      engagement.
      Structural validation cannot see relationships, and that is where every defect in this
      family has actually lived.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `feat(generator): validate documents at the persistence boundary`

---

## Task 22: Role-specific feature and label contracts

**Files:**

- Modify: `apps/intelligence/trust_score/features.py`
- Modify: `apps/intelligence/trust_score/model.py` (`FEATURE_COLUMNS`)
- Modify: `apps/intelligence/trust_score/labels.py`
- **Modify: `apps/intelligence/trust_score/run.py`** — it currently **trains a separate model per
  role** and calls `compute_features` with no role argument. The one-superset-model decision is
  inert until this changes _(codex-review round 5: the decision was recorded in the spec and never
  wired into the pipeline that implements it)_.
- **Modify: `apps/intelligence/trust_score/backfill.py`** — every historical snapshot must carry the
  encoded role too, or backfilled rows and live rows disagree on schema.

> ⚠️ **Scope correction — the mixed-role _training_ integration moves to `A4`.**
> _(codex-review round 6.)_ Round 5 put an end-to-end "train one mixed-role model" test here, which
> **cannot work**: `compute_reliability_index` needs per-role weights and bucket thresholds to
> produce any training label at all, and those are deliberately `A4`'s, set by measurement (Rudra's
> decision 1). A1 cannot train a model whose labels are not yet defined.
> **`A1` delivers:** the superset schema, the numeric role encoding, role-aware feature computation,
> and `run.py`/`backfill.py` emitting rows in that shape.
> **`A4` owns:** weights, buckets, and the mixed-role training run.
>
> **`run.py` therefore needs a feature-preparation-only mode**, and training/scoring must be
> **unavailable — failing loudly, not silently skipped** — until `A4` defines the labels
> _(codex-review round 7: `run.py` still trains today, and "A1 must not train" with no replacement
> mode is not an implementable instruction)_.
>
> **Two more consumers of the role change, both currently untouched** _(round 7)_:
> `evaluate.py` calls role-less `compute_features` and the legacy label, and `explain.py` has no
> display mapping for `subject_role` — a feature that would surface in explanations as a bare `0`
> or `1`. Both belong in this task with tests.
> This **reduces `A1`'s scope** rather than expanding it — the first thing in six rounds that has.

- Test: role-aware feature vectors and dataframe assembly only. **No training assertion in `A1`.**
- Test: `apps/intelligence/tests/test_trust_score_features.py`, `test_trust_score_model.py`

**Raised by codex-review — the largest design gap in the original plan.** Role-split conduct and a
role-blind nine-feature vector are mutually inconsistent: a freelancer has no `paidInFull`, a client
has no `daysLate`, yet every feature and all four label terms are currently required for everyone.
Contracts per the spec's role-contract table.

- [ ] **Step 1: Write the failing tests.** - **Every row carries every superset column.** A freelancer row has the client-only columns
      present and `NaN`; the mirror holds for clients. _(Round 2 wrote "contains no client-only
      column", which directly contradicts the superset schema the same task requires —
      codex-review round 4. The superset contract wins; the role contracts describe which columns
      are **populated**, not which exist.)_ - The label for each role is computed from that role's own terms — a client is not scored on
      delivery punctuality they never had the chance to demonstrate. - **`FEATURE_COLUMNS` and `FEATURE_NAMES` resolve to one definition.** They are currently
      identical duplicates in two files (`model.py:7-17`, `features.py:1-11`); the role split makes
      silent drift likely. Assert a single source of truth. - **One superset schema, not two role schemas** (spec decision, taken in `A1` rather than
      deferred): every row carries every column, role-inapplicable columns are `NaN`, and
      `subject_role` is itself a feature, **encoded numerically as `0` (freelancer) / `1` (client),
      never as a string** — `xgb.DMatrix` rejects object/string columns, so a raw role label would
      fail at training time, not at review time _(codex-review round 4)_. Assert the encoding is
      deterministic and that the dataframe's dtype is numeric.
      Assert that `features_to_dataframe` accepts both roles'
      vectors and yields a single consistent column order — **it currently indexes every row with
      one global `FEATURE_COLUMNS`, so role-specific vectors with different keys cannot pass
      through it at all** _(codex-review round 2)_. - **`NaN` reaches the model as missing, not as an imputed number.** Assert the dataframe
      carries `NaN` for role-inapplicable columns rather than `0` — XGBoost's `DMatrix` treats
      missing as its own branch, which is the same honest-missingness principle D4 applies to
      conduct. A `0` here would silently mean "this client is never late", which is not a fact. - **`trend_slope` is role-parameterised**, not shared: recent-vs-older on-time rate for
      freelancers, paid-in-full rate for clients. Assert both are computed and differ in input.
      _(It was listed as shared; clients have no `daysLate` — codex-review round 2.)_
- [ ] **Step 2: Run to verify failure.** Run **both** files — the dataframe and XGBoost assertions
      live in the model test, and running only the features test would let the model-schema path stay
      broken while this task reports green _(codex-review round 5)_:
      `pytest apps/intelligence/tests/test_trust_score_features.py apps/intelligence/tests/test_trust_score_model.py -v`
      Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `refactor(trust-score): role-specific feature and label contracts`

---

## Task 23: Update seed invariants

**Files:**

- Modify: `apps/api/tests/seedInvariants.test.js` (line 456 asserts on `responsibleParty`)
- Test: same file

**Raised by codex-review.** `X-A` asserts on a field name (`responsibleParty`) that this plan does
not create, and none of its 24 structural assertions cover the new cross-record rules.

- [ ] **Step 1:** Read every `it.fails()` marker and classify each: still valid · now wrong ·
      now unreachable. Record the classification — an `it.fails` that inverts on absent data is the
      defect that made CI vacuous for weeks.
- [ ] **Step 2: Write the new invariants.** Persisted two-row attribution · role/null semantics ·
      review author/subject party rules · **non-vacuous counts** (every invariant asserts it
      examined a non-zero number of documents).
- [ ] **Step 3:** Run with `CANARY_SEED_TESTS` against a real seed.
      Run: `CANARY_SEED_TESTS=1 npm test -w apps/api -- seedInvariants`
      Expected: the new invariants fail against old-shape data, pass against new.
- [ ] **Step 4: Commit.** `test: seed invariants for per-party attribution`

---

## Task 23b: App-path persistence service

**Files:**

- Create/modify: an Outcome+Review write service in `apps/api/src/`
- Test: its DB test file

_(Added after codex-review round 3. Task 21 covers the **generator's** persistence boundary. The
**app path** was left as prose — "a service-level check covers it" — naming no service, no
transaction, and no test. A concurrent app write can still create an invalid third Outcome row, and
the relational invariants cannot be expressed by an index or by Zod.)_

- [ ] **Step 1: Write the failing tests.** - Writing an Outcome whose subject is not a party to the engagement is rejected. - Writing a third Outcome for an engagement that already has two is rejected. - **Two concurrent writes** for the same (engagement, subject) result in exactly one row —
      assert under actual concurrency, not sequentially. - A Review write whose author and subject are not opposite parties is rejected.
- [ ] **Step 2: Run to verify failure.** Expected: FAIL — no such service.
- [ ] **Step 3: Implement — and resolve the transaction prerequisite first.**
      ⚠️ **Mongo transactions require a replica set. This repo's default URI is a standalone
      `mongodb://127.0.0.1:27017`, and CI's Mongo service container is standalone too**, so a
      transactional write path as originally worded would fail at runtime in both places
      _(codex-review round 4 — a real environment blocker, not a style note)_.
      **Chosen resolution: provision a single-node replica set**, named concretely rather than left
      as the word "provision" _(codex-review round 5 — an unexecutable plan step)_: - **Local:** start `mongod` with `--replSet rs0`, then run an **idempotent** initiation (safe
      to re-run against an already-initiated set), then **poll until the node reports PRIMARY**
      before any transaction is attempted. Record both commands and the `.env` URI change
      (`?replicaSet=rs0`) in the repo's setup notes. - **CI:** `.github/workflows/ci.yml` — the Mongo service container gets the same `--replSet`
      argument, an initiation step, and **the same primary-readiness poll**, in **every job that
      touches Mongo**, not only the new one. _(codex-review round 7: without the poll, the first
      transaction races the election and fails intermittently — the worst possible failure mode,
      because it passes locally and flakes in CI.)_ - **Startup check:** a capability probe that attempts a no-op transaction and **fails loudly**
      at boot if unavailable, rather than silently degrading to non-transactional writes. - **Verification command, run before the service is implemented:** a one-shot integration test
      that opens and commits a transaction against the configured URI. If that does not pass,
      Task 23b does not start.
      _Killed — index-plus-precheck without transactions:_ leaves a TOCTOU window on the
      exactly-two-and-only-parties rule. **Revival: if replica-set provisioning proves painful in
      CI**, fall back to it and _document the residual race_ rather than pretending it is closed —
      the unique indexes still prevent the common duplicate case.
      The unique indexes remain the backstop either way; the service is where cross-collection
      facts are checked.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit.** `feat(api): transactional outcome and review write service`

---

## Task 24: Smoke run and gate report — LAST

**Files:** none changed — this is the verification task.

> **Numbered 24 and placed last on purpose.** It was Task 17 in the round-1 plan, sitting _before_
> Tasks 18-23 — which fix attribution, the serving path, review leakage, persistence validation and
> the role contracts. Verifying before those land would have measured the wrong system.
> _(Raised by codex-review round 2; a pure consequence of appending tasks without re-reading the
> order.)_

- [ ] **Step 1:** Confirm the Task 1 snapshot exists before any wipe.
- [ ] **Step 2:** Seed 500 profiles into a **scratch database**, never `canary_dev`.
      Expected: run completes, manifest written.
- [ ] **Step 3:** Run the gates and capture the report.
- [ ] **Step 4: Expect mostly NOT EVALUABLE, and record it that way.** - **Gates 2-6: not evaluable at 500 profiles.** ~8% bad actors split across two roles gives
      ~20 per cell against a 200 minimum. Reporting them green here would be false. - **Gate 1: not evaluable.** It is now a row/window non-overlap check that lives with `A4`'s
      label builder, which does not exist yet. - What this run _does_ prove: the generator completes, documents validate at the persistence
      boundary, and the definition-of-done table below holds. That is a smoke test, and calling it
      anything more would repeat the vacuous-pass defect a third time (`seedConformance` passed on
      zero documents for weeks; `X-A`'s `it.fails` markers inverted on an empty database).
- [ ] **Step 5: Verify the definition-of-done table — but split it, because it is not all
      structural.** _(codex-review round 3: round 2's version called all eight rows "structural"
      while three of them are statistical claims that the same step had just declared not evaluable
      at 500. That contradiction would have produced exactly the false-green this plan exists to
      prevent.)_ - **Structural — checkable here at 500, quote the decisive line for each:** exactly 2 Outcome
      rows per concluded engagement · 0 outcomes with `recordedAt == engagement.createdAt` · 100%
      of reviews carry provenance flags · 0 reviews whose subject is not a party · role-inapplicable
      conduct fields are null, not defaulted. - **Statistical — deferred to `A3` at adequate power, NOT claimed here:** `paidInFull`
      separation · `on_time_rate` non-degeneracy · `scopeCreepOccurred` independence from ghost
      propensity. These need the per-cell minimum that 500 profiles cannot supply.
- [ ] **Step 6: Commit** the report as the evidence artifact.
      `chore(quality): A1 smoke report at 500 profiles`

---

## Self-review

**Spec coverage.** Section 1 → Tasks 2-5, 21. Section 2 → Tasks 6-14, 18-20, 22. Section 3 → Tasks
15-16, 23. Section 4 → Tasks 0, 1, 24. **No spec requirement is without a task.**

### Round 1 codex-review — what was accepted and what was not

**Accepted (14 findings, all incorporated above):** compound index does not give
exactly-two-per-party (Task 4) · `fetch.py` dual-assignment (**Task 18, new — the plan would have
shipped a regression**) · `payments.py`/`reviews.py` lookup collisions (Task 19, new) · circular
`recordedAt`↔payment dependency (Task 11, verified at `run.py:151,154`) · concluded engagements with
incoherent chronology (Task 11) · review timestamps leaking future information (Task 20, new) ·
Gate 1 not evaluable in `A1` (floors table + Task 24) · **role-blind features against role-split
conduct (Task 22, new — the largest gap)** · insufficient review validation and raw-pymongo bypass
(Task 5 + Task 21, new) · wrong Zod contract path (file table — `packages/shared/contracts/`, and
the four needed contracts do not exist) · Mongoose-only tests over a raw-write seed (Task 21) ·
independent RNG ≠ independent behaviour, gate on `observed && !ghosted` (floors table) ·
single-seed gates with no minimum sample and a mislabelled effect size (floors table) · sabotage
checks passing on an empty set (Task 12) · seed invariants asserting `responsibleParty` (Task 23).

**Rejected, with reason:** Codex stated the repository has `FEATURE_NAMES` _rather than_
`FEATURE_COLUMNS`. **Both exist** — `model.py:7-17` and `features.py:1-11` — with identical
contents. The underlying concern was right (my citation pointed at the wrong file) but the
correction was wrong, and the real finding is the **duplication**, now Task 22's third assertion.

### Re-cost after round 1

Six new tasks. **`A1` moves from 8-11h to 13-17h.** Tasks 18-19 are not optional — without them
two-row attribution is a regression, not a fix. Task 22 is not optional — the role contradiction
blocks `A4`. Tasks 20-21 are the leakage and bug-family fixes that make the rest hold.

**Consequence for the five days:** the model track moves from 21-29h to **26-35h ≈ 3.2-4.4 days**,
and with Slice 2 at 12-16h the total becomes **4.7-6.4 days against 5.** This no longer fits at the
midpoint, only at the floor. **This is a decision for Rudra, not something to absorb quietly** —
the Aug 3 checkpoint and descope order in the spec's Section 4 now matter considerably more, and
the pure-Option-B revival condition is live rather than theoretical.

**Gaps deliberately left to later segments, named so they are not mistaken for oversights:**

- The temporal label itself is `A4`, not here. `A1` only makes it _possible_ (Task 11).
- Fan-out, loginable identities and lifecycle states are `A2`.
- The 20k final run is `A3`.
- CI wiring of the gates is `A5`.

**Placeholder scan.** No "TBD", no "add appropriate error handling", no "similar to Task N". Every
task names exact files, an exact command, and exact expected output. Code and test source are
omitted **by project rule**, not by omission — each task states the precise assertion instead.

**Consistency check.** Field names used across tasks match the spec's Section 1 table exactly:
`subjectProfileId`, `counterpartyProfileId`, `subjectRole`, `observed`, `deliveredAt`, `daysLate`,
`revisionsRequested`, `scopeCreepOccurred`, `recordedAt`. Gate numbering is consistent between the
floors table, Task 16, and Task 24.

**One risk this plan cannot remove.** Tasks 7-11 all modify `outcomes.py`, and it is 86 lines today
that will roughly triple. If it becomes unwieldy mid-execution, splitting conduct generation into its
own module is a reasonable in-flight call — but the split must not separate a draw from the trait it
reads, or the independence gates become hard to reason about.

---

Related: [[2026-08-01-a1-generator-semantic-pass-design]] ·
[[2026-08-01-model-integrity-crisis-and-the-two-of-three-decision]] · [[PROJECT-STATE]] ·
[[tracking]]
