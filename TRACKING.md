# Tracking — follow-ups, deferred fixes, known gaps

Durable record of things flagged during implementation that are not yet resolved. Anything here
must eventually be fixed or explicitly re-parked with a reason — nothing gets silently forgotten.
Update this file whenever a review or a piece of implementation work surfaces something that
isn't addressed immediately.

Status: 🔴 open (needs action) · 🟡 tracked, not blocking · ✅ resolved (kept for history)

---

## 🔴 Open — needs action

### Generator will bypass `createdAt` on Payment/Outcome
**Source:** Phase B code-quality review + same-session fix.
**What:** `Payment` and `Outcome` schemas now have `timestamps: {createdAt: true}` at the Mongoose
level, but the Python generator (Slice 0 plan, Task 24 `_resolve_ids`, in
`F:\Pro S3\docs\superpowers\plans\2026-07-05-slice-0-data-layer-and-generator.md`) writes documents
via raw `pymongo`, which bypasses Mongoose's timestamp middleware entirely — the same class of gap
already caught and fixed once for Profile/JobPost/Proposal earlier in that same plan.
**Fix:** before Phase C2 (Task 24, the orchestrator) executes, add explicit `createdAt` fields to
the Payment and Outcome document construction in `_resolve_ids`, matching the pattern already used
for Engagement/JobPost/Proposal.
**Blocks:** Phase C2 only. Does **not** block Phase C1 (pure Python logic, no DB writes at all).

---

## 🟡 Tracked, not blocking — do eventually

- **No root README / setup instructions.** How to run both services locally (npm install + pip
  install + shared MongoDB). Fine to defer while it's just Claude Code driving the build; matters
  the moment a third person needs to get this running cold. (Phase A review, Minor.)
- **`connectDB`/`get_client` don't validate a malformed (vs. absent) `MONGODB_URI`.** Only guards
  against falsy; a garbage value fails later with the raw driver's own error instead of a message
  pointing back at the env var. Acceptable for a walking skeleton. (Phase A review, Minor.)
- **No test for `disconnectDB()` called when never connected.** `mongoose.disconnect()` is
  no-op-safe in practice; edge case just isn't explicitly tested. (Phase A review, Minor.)
- **`get_database()` depends on the URI having a path segment** (`/canary_dev`). If a future
  deployment config omits it, `get_default_database()` throws an opaque `ConfigurationError`
  instead of a clear message. `.env.example` already includes the path; worth a comment next time
  `db.py` is touched. (Phase A review, Minor.)

---

## ✅ Resolved (kept for history)

- **Python `MongoClient` connections were never closed.** Added `close_client()` to
  `intelligence/generator/db.py` and a `mongo_client`/`mongo_db` fixture pair to
  `intelligence/tests/conftest.py` with proper teardown. (Phase A review, Important → fixed
  before Phase C1 started.)
- **`validate-seed` script pointed at a file that didn't exist yet.** Removed from
  `server/package.json` until Task 25 actually creates `scripts/validateSeed.js`.
  (Phase A code-quality review → fixed same session, commit `a05b183`.)
- **8/21 schemas had no `createdAt` audit trail; `Outcome.js` used an inconsistent `.add()` shape;
  free-text fields had no `maxlength` bound.** All 21 schemas now uniform, 6 free-text fields
  bounded at 5000 chars, `Briefing` gained missing indexes.
  (Phase B code-quality review → fixed same session, commit `c093749`.)

---

Related: the executable plan this implementation follows lives in the vault, not this repo —
`F:\Pro S3\docs\superpowers\plans\2026-07-05-slice-0-data-layer-and-generator.md`. This file tracks
*deviations and follow-ups discovered during execution*, not the plan itself — check both.
