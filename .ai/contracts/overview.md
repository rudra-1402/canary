# Contracts — how the Zod pattern works here

## The idea

`packages/shared/contracts/` holds Zod schemas describing the shape of every API call. Both
`apps/web` and `apps/api` import the _same_ schema instance (via the `@canary/shared` npm workspace
package) — so "the frontend and backend disagree about a response shape" becomes structurally
impossible, not just something code review has to catch.

## The real example

`packages/shared/contracts/health.js` — `HealthResponseSchema`, the shape of `GET /api/health`.
Seeded first because it's genuinely buildable today (no feature endpoint exists yet):

- `apps/api/src/health.js` — `getHealthStatus()` builds the response and validates it against the
  schema with `.parse()` before returning it (so a malformed response fails loudly on the server,
  not silently on the client).
- `apps/web/src/lib/health.js` — `describeHealth(rawResponse)` validates an incoming response
  against the _same_ schema before trusting it.

Both sides import from `@canary/shared`, not from a locally re-declared copy — that's the whole
point. Read those three files together to see the full pattern before writing your own contract.

## Adding a new contract

1. Define the schema in a new file under `packages/shared/contracts/` (one file per resource, like
   `health.js`), and export it from `packages/shared/index.js`.
2. Add `@canary/shared` as a dependency of your app if it isn't already (`npm install
"@canary/shared@*" --workspace=apps/<web|api>`).
3. Write the failing test first (TDD — see `.ai/onboarding/tdd-quickstart.md`) for whichever side
   you're building, then implement against the schema.
4. If both a request _and_ response shape exist, that's two schemas, not one — don't conflate them.

## The auth seam

`getCurrentUser(request)` returns `{ identityId, email, activeProfile: { id, role } | null }` — the
single door to the current identity and its active role-scoped Profile. Downstream code depends on
this shape, never on Passport/session internals, so swapping the auth provider or session strategy
touches only the seam (F3, ADR-0014).

## Node ↔ Python

Python can't import a Zod schema directly. For any contract that crosses into
`apps/intelligence`, the Zod schema stays canonical and the Python side's serializer/validation
mirrors it by hand — documented, both sides validate independently against the same shape. This
hasn't come up yet (no Node↔Python contract exists yet) but will once the intelligence service gets
a real API surface.
