# PLAN-UI — golden-path screens + the writes they need

_Round 2 — revised after Codex round 1_

Target: demo 2026-08-06. Optimise for marks: breadth, real endpoints, real seeded data, no mocks.

## Assumptions (stated, not decided — overturn any and the plan changes)

- **A1 — Screens (6):** 24 Auth, 2 Find Work, 3 Job detail, 25 Trust Score detail, 7 My Jobs,
  9 Record Outcome. Freelancer-first, but **Screen 9 is role-adaptive** — either active party can
  record. Double-blind release needs both sides to submit, so a freelancer-only Screen 9 could not
  demonstrate it. Cheap, and it makes the symmetry claim visible without building the client suite.
- **A2 — Screen 4 IS IN** (P8 resolved 2026-08-02, Rudra). Not the planned RAG agent: **one grounded
  LLM call** — free-tier Gemini (AI Studio) or Groq — over facts retrieved by structured query from
  our own Mongo (TrustScore, ranked RiskSignals, visibility-filtered reviews, outcome history).
  No embeddings, no vector store, no agent loop, and **none of those are claimed**.
  - **Citation validation, server-side:** every claim must cite a RiskSignal ID present in the
    input; claims citing anything else are stripped before the response is returned. This is the
    anti-hallucination story and it is itself demoable.
  - **Persist to the existing `Briefing` entity**, serve from it afterwards, capture 👍/👎 into
    `BriefingFeedback`. Pre-generate for demo profiles; keep one live generation as the visible
    moment.
  - **Fallback = the deterministic verdict** (counterparty score + signals + deal terms) whenever
    the call fails, is rate-limited, or the subject has too little history. This is the spec's
    required abstention path, not a consolation prize.
  - API key lives in `apps/api/.env`. gitleaks is in CI; it must never reach a commit.
  - **Paid for by cutting Screen 7 (My Jobs)** — list rendering, no AI, least visible screen on the
    list. Rationale recorded so it is not silently restored.
- **A3 — DB:** **there is no root `.env`.** `apps/api/.env` and `apps/intelligence/.env` are
  separate files and **both** repoint to `canary_a4_dense`, or scoring and the API read different
  databases. `canary_dev` untouched. Also verify the manifest / id-map paths resolve from the
  working directory the pipeline is actually run from.
- **A4 — No shadcn, no registries.** Plain Tailwind 4 primitives, hand-written. The locked
  5-registry decision assumed a full build; at 4 days the install and integration cost buys nothing.

## Out of scope

Client screens (14–20), Settings, Notifications, Contract Workroom, cold-start, income/tax, gigs,
collusion badge. Messaging permanently cut. **`POST /api/jobposts` and profile edit are cut** —
they serve out-of-scope screens.

---

## Part A — Gate 4b redesign _(implemented; insufficient as built — must be finished)_

Built ahead of this plan, itself a process defect: `codex-review` is mandatory on every plan from
`A1` onward and this change had none. That is why it is in this review.

**Shipped so far** (`trust_score/labels.py`, `trust_score/run.py`): removed
`MAX_LABEL_VALUE_SHARE = 0.10`; kept `MIN_DISTINCT_LABEL_VALUES = 20`; `assert_label_distribution`
now derives tertiles and rejects an empty band; gate result printed per role so a run proves it
executed. 3 tests added, suite 145 → 148.

**Justification** — measured read-only on `canary_a4_dense` before the change. The failure the 10%
rule was written for (banding becomes unimplementable) does not occur: `bucket_label` is a pure
function of the value, so identical values always get identical bands and an atom can never be
split. Atom size tracks label-window length (31.6% of freelancers have one outcome in their label
window), not label quality.

|                    | freelancer (n=7648)  | client (n=5567)      |
| ------------------ | -------------------- | -------------------- |
| largest atom       | 1.0 @ 44.5%          | 1.0 @ 30.0%          |
| tertiles           | OK 0.750 / 1.000     | OK 0.833 / 0.963     |
| bands low/med/high | 29.0 / 26.5 / 44.5 % | 29.5 / 36.8 / 33.8 % |

### A.1 — The gate as shipped is insufficient. Confirmed, not conceded.

`[0.00..0.34] + [1.0]×65` passes it: 36 distinct, tertiles 0.33/1.00, bands `low=33 med=2 high=65`.
**Verified by running it.** A two-example training class is a degenerate label.

Add, and both floors are grounded rather than picked to pass:

- **Minimum band size = 200 examples.** Reuses `MIN_SCOREABLE_PER_ARCHETYPE = 200`, already in
  `quality/gates.py` and chosen independently of this question. Real margins: smallest band is
  2 027 (freelancer med) and 1 640 (client low) — clear by ~8×.
- **Minimum label spread: p90 − p10 ≥ 0.10.** Grounded on the 0–100 reporting scale, so the bands
  are separable at the resolution the score is actually shown at. Catches a near-constant label
  with distinct values and balanced tertiles.
- **Regression test = the exact counterexample above**, asserting it now fails.

### A.3 — Distribution floors cannot prove the label is learnable

A label can pass every floor above and still be unlearnable: identical feature rows with randomly
assigned future labels give 302 distinct values, bands 300/300/300 and p90−p10 ≈ 0.91. Distribution
shape says nothing about whether features predict the target. Today evaluation only _reports_
metrics; nothing stops persistence when they are meaningless.

**Gate persistence on beating a predeclared baseline.** All three values are fixed here so the
implementer has nothing to invent:

- **Metric:** Spearman rank correlation on the held-out temporal test split, per role — the metric
  already reported, not a new one.
- **Procedure:** fixed seed 42. Train the real model on the training split. Then train **5 control
  models** on the same split with the training labels randomly permuted, and evaluate every model
  on the same untouched held-out split.
- **Condition:** persistence proceeds only if, **for both roles**, real Spearman > 0 **and** real
  Spearman ≥ `max(permuted) + 0.10`. Failing either refuses to persist, like any other gate.

The margin is not tuned to pass: real is 0.386 / 0.481 and a permuted control is ~0 by
construction, so the condition clears by roughly 3–4×. It is set at a level that would catch a
genuinely unlearnable label, not at the level that lets this one through.

It converts "our Spearman is 0.386" into "0.386 against permuted-label controls at ~0, on data the
model has never seen" — the strongest defensibility artifact available for the money.

_Scope note:_ this is the one place worth spending on model integrity, because it is the claim the
whole arc exists to support. If Part B or C slips, this is still cheaper than any of them.

### A.2 — A second copy of the deleted rule is still live

`quality/gates.py:30` defines `LABEL_DEGENERACY_MAX_SHARE = 0.10` and enforces it at line 311. The
training path no longer applies it; the gate suite still does. **Reconcile both to the same
definition** — band-outcome checks, not raw-atom share — or the two disagree about what a valid
label is. Whichever way this lands, it must be one rule in one place.

---

## Part B — Persist scores, repoint both apps

### B.0 — ⛔ BLOCKER, found in review: scoring emits no risk signals

`run.py::score_current_profiles` sets `"riskSignals": []` on **both** branches. `persistence.py`
iterates that empty list and writes nothing. `trustScore.service.js:183` then does
`if (eligible && signals.length === 0) throw new Error('TrustScore signals are unavailable')`.

**So persisting today makes the read API throw for exactly the profiles that have a real score.**
Screens 3 and 25 would 500 on the golden path. This is a regression from the `A1`/`A4` rewrite —
the earlier pipeline persisted 20 112 signals.

**Signal generation must be implemented before anything is persisted.** Each scored snapshot needs
structured, explainable signals derived from the feature vector that produced the score — the same
signals C.3 then exposes to a counterparty. Not decorative: they are the "reasons" half of the
golden path's evaluation gate.

**Verification is end-to-end and non-negotiable: persist → HTTP GET → a real score with real
reasons.** A green pipeline run is not evidence; the throw is on the API side.

### B.1

1. Run `trust_score.run --persist --evaluate` against `canary_a4_dense`.
   **Completion evidence must include the `Gate 4b <role>: PASS …` lines.** Exit code is not
   evidence — three defects in this project were checks that never ran.
2. Repoint **`apps/api/.env` and `apps/intelligence/.env`**. No wipe, no reseed, no `--wipe`.
3. Prove the loop: `trustscores` non-empty **and** the read API returns a real score over HTTP.

**Risk:** `prepare_output_collections` refuses a non-empty `trustscores` without `--wipe`.
`canary_a4_dense.trustscores` is currently empty. If that is ever false, stop and ask — never pass
`--wipe`.

---

## Part C — Writes and reads the golden path needs

Repo style is fixed: `apps/api/src/<domain>/{routes,controller,service}.js`, thin controllers,
services own logic, Zod contracts in `packages/shared/contracts/`. Authenticated + CSRF, matching
existing auth routes.

**Authorization rule, applies to everything below:** the acting profile is derived from the
**session and the loaded record** — never taken from the request body. A party may write only their
own row. Each endpoint gets an explicit impersonation test that must fail closed.

### C.1 — `POST /api/proposals` _(Screen 6, and Screen 7 reads the result)_

Freelancer submits to an open JobPost. Rejects: non-freelancer profile, closed/absent post, own
post, duplicate from the same profile. Starts `submitted`.
**Add a compound unique index `{jobPostId, freelancerProfileId}`** — a service-level existence
check loses to concurrent submits. Preflight the dense seed for existing conflicts before the index
is created, and translate duplicate-key errors into the documented rejection.

### C.2 — `POST /api/outcome-reviews` ⭐ _(Screen 9 — the learn-loop moment)_

**Correction to the existing plan text:** `outcomeReview.service.js` exports `createOutcome` and
`createReview` **separately**, is **not** transactional, and **does not check lifecycle state**. Its
own comment records the residual race. A plain route over the two functions can persist an Outcome
with no Review. So this is one **combined service operation**, not a thin route.

- Operates on an **`active`** engagement. The seed holds **52 180 active** engagements, so this is
  demoable against real data. Concluded engagements already carry two Outcomes and are correctly
  rejected as duplicates.
- **The engagement stays `active` after the first party submits.** Concluding on the first write
  would reject the counterparty as non-active, permanently stranding the engagement with one
  Outcome and no double-blind release. **Transition to `concluded` only once both parties'
  Outcome+Review pairs exist.**
- Writes the acting party's Outcome **and** their Review, ordered, guarded by unique indexes.
- **Idempotent per party.** Without a replica set a partial write is possible — Outcome inserted,
  Review failed — and a naive retry would hit the duplicate rejection and could never complete.
  Re-submission by the same party must recognise its own incomplete submission and finish it, not
  reject it. Test the partial-write recovery path explicitly; it is the one failure mode the
  missing transaction actually leaves open.
- Rejects: non-party, non-active engagement, duplicate _completed_ submission, self-review.
- **No replica set.** Real transactions need one and it is not affordable here. Order the writes so
  a partial failure is detectable, keep the unique indexes as the real guard, and **document the
  residual race in the service** rather than claiming atomicity we do not have.
- **`visibleAt` is server-owned.** Write `null`, then release **both** reviews when the second
  valid review arrives. Without this, submitted reviews are invisible — the read API excludes
  nulls, and 0 of 17 111 seeded reviews carry the field at all (`tracking.md`).

### C.3 — Counterparty Trust Score explanation _(new scope — Screens 3 and 25 depend on it)_

`trustScore.service.js:58` attaches signals only when `viewerRelation === 'self'`. **A freelancer
looking at a client therefore sees a score with no reasons** — and "sees the client's Trust Score

- reasons inline" is the golden path's evaluation gate. A number with no explanation is the demo's
  weakest possible form.

Define a **public explanation contract**: a safe, bounded subset of signals shown to any
authenticated viewer. Must never expose planted ground-truth flags (`isPlantedCollusion`,
`isPlantedSabotage`), raw counterparty identities, or anything the reviews endpoint already
visibility-filters. Test both viewer relations explicitly.

**Test intent, all of C:** happy path over real seeded data, every rejection named above, an
auth/ownership failure per endpoint. Integration against real Mongo, not mocked models.

**Sizing:** largest single block, and the security-sensitive one. Codex.

---

## Part D — Web foundation + shell + two screens ⛔ CHECKPOINT

**Prerequisite:** `.ai/START-HERE.md:66-68` forbids `components.json`, registries and tokens before
Slice 7. Slice 7 is now being built. Edit that lock first or the repo contradicts its own rules file
that Claude, Kiro and Antigravity all read.

Existing base: React 19, Vite, Tailwind 4, react-router 7, vitest + testing-library, one `Home`
route. Not nothing, but no auth flow, no API client, no state.

1. Token layer (colour, type scale, spacing) on Tailwind 4. Near-monochrome, one accent, one
   reserved alarm hue used only for risk states.
2. App shell: nav, auth-aware routing, session bootstrap from `GET /api/auth/me`.
3. API client + auth flow (login, CSRF, session) against real endpoints.
4. **Screen 24 (Auth) and Screen 2 (Find Work) only.**

**Then stop and show Rudra.** He is the taste-holder of record, has reset the design language to
zero twice, and once rejected a contrast-verified palette on taste grounds. Building four more
screens on an unseen direction is the known-expensive mistake.

---

## Part E — Remaining four screens

Screen 3 (Job detail + client Trust Score **and reasons** inline, per C.3) → Screen 4 (grounded
briefing, per A2) → Screen 25 (Trust Score detail) → Screen 9 (Record Outcome + Review).
Screen 7 is cut to pay for Screen 4.

Each: real endpoint, real seeded data, loading + empty + error states. No mocked data anywhere —
`A2` is why: the app once had a login screen zero of 20 000 seeded users could use.

**Sizing:** independent screens against settled contracts. Sonnet subagents, one per screen.

---

## Verification (every part)

- Run it. Quote the decisive line. Never claim done on an unrun path.
- **Verify the check RAN**, not that the command exited zero.
- **Check test COUNTS**, not pass/fail — a Codex task once removed 29 tests and added 18 while
  reporting "Deviations: none" over a green suite.
- Any agent's report is advisory until the diff is read and the tests re-run first-hand.
- Never silence a red check. No `continue-on-error`, no skip, no expected-fail marker.

## Known risks

1. Part D's checkpoint can reject the direction and cost a rebuild. Accepted — cheaper here than
   after six screens.
2. A2 leaves one AI story. If P8 resolves the other way, Parts C and E both grow.
3. Screen 9 is the learn-loop moment and sits last. If time runs out it is the one to protect.
4. C.3 was discovered during review, not planning. Other read-path gaps of the same shape may exist
   in screens not yet traced.
