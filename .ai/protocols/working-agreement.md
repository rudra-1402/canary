# Working agreement — building in parallel without breaking each other

Born from a real past failure on this project: someone changed a foundation (auth) mid-build and it
broke the whole backend, because everything was glued to that foundation's internals. These 6 rules
prevent that from happening again.

## Rule 1 — Divide by feature, not by layer

Each person owns a complete vertical slice (its frontend + backend + data), not "all frontend" or
"all backend." A layer split means everyone waits on everyone; a feature split means each slice is
self-contained with clear ownership. Current slices: **Rudra** = golden path + shared core (Trust
Score, forecast, data model, main dashboard). **Teammate 2** = landing + report (own endpoints too,
under the hybrid model). **Teammate 3** = Help/About + demo data + slides (own endpoints too).

## Rule 2 — Depend on contracts, not implementations

Code depends on a stable _interface_ — a promise about shape — never on how something works inside.
The anti-breakage rule: all code calls `getCurrentUser(request) → { id, email }`; nobody touches
auth internals directly. Swapping auth later means changing the guts of one function, not every call
site. Same idea for APIs: agree the shape (`POST /api/risk-score → { score, level, reasons[] }`) as
a Zod schema in `packages/shared/contracts/`, and the model's internals can change freely as long as
that shape holds.

## Rule 3 — Contracts first, then build in parallel with mocks

You don't need someone else's code finished — you need the _contract_. Build your frontend against
the agreed API shape using mock data, today. Backend builds to the same shape, independently.
Integrate at the end and it just works, because both sides honored the contract.

## Rule 4 — Foundations are decided once, then frozen

Auth, the data model, and the API style are load-bearing walls: decided early, wrapped behind
interfaces, not re-architected mid-build unless something is genuinely broken. Changing a foundation
is deliberate, announced, via a PR everyone sees — never a casual "I found a better way" rewrite.

## Rule 5 — New ideas mid-build: add a module, don't rewrite a wall

A new feature idea is welcome only as a **new slice** that talks through existing contracts —
isolated, won't break anything else. If it requires changing a foundation, it waits. Capture the
impulse in a note and move on. For a 1-month project: "done and good enough" beats "better and
broken." Most new ideas are v2.

## Rule 6 — Stay in your own files; cross boundaries only via PR

Edit only your slice's folders. Need a change in the shared core (auth, data model, `packages/
shared`)? It's owned by Rudra — request it, don't edit it directly. Shared changes go through a PR
so everyone sees them (see `.ai/onboarding/github-guide.md`).

## What this means before writing feature code

1. Lock the data model and domain vocabulary first (`.ai/START-HERE.md`'s vocabulary table is the
   ubiquitous language — use those exact terms).
2. Write down the API contract between `apps/web` ↔ `apps/api` ↔ `apps/intelligence` as a Zod schema
   before building either side.
3. Wrap foundations (auth, data access) behind thin interfaces so they can be swapped later.
4. Stand up a walking skeleton so everyone has a stable structure to plug into before diverging.
