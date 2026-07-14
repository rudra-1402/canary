# START HERE — Canary's protocol, for any AI tool or human

You are working in **Canary**, a two-sided freelancer marketplace whose core is a **symmetric,
gaming-resistant Trust Score** for both Freelancers and Clients. This file is read automatically by
every AI tool on this repo (see the trailhead files at the repo root — `AGENTS.md`, `CLAUDE.md`,
`.kiro/steering/`, `.agents/rules/` — each just points here). If you're a human: read this once,
then follow the links below for depth. If you're an AI: this file is enough to start; the linked
files are enough to go deep on any one area.

## The project, in one paragraph

Canary is like Upwork/Fiverr, but reputation runs **both ways** and is **hardened against gaming**.
Freelancers and Clients both hold accounts (Profiles), both get scored (TrustScore), both review
each other. An anti-gaming layer detects collusion rings and fake reviews and discounts them out of
the score. A RiskAssessment reads one specific prospective deal (counterparty's TrustScore + that
deal's terms). An AI due-diligence agent explains a Profile in plain English, grounded in our own
data. Plus income/tax forecasting for freelancers. Academic project, ~1 effective developer + 2
teammates on non-AI slices, showcase/portfolio goal, not a revenue product.

**Golden path:** freelancer discovers a JobPost → sees the client's TrustScore + reasons + authentic
reviews → gets an AI due-diligence briefing → submits a Proposal → works the Engagement → records
the Outcome (feeds the learn loop) → sees income/tax forecast on the same dashboard.

## Ubiquitous language — use these exact terms, never invent synonyms

| Term                        | Means                                                                                          | Never call it                      |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Identity**                | The login/account (credentials). Not itself scored.                                            | User, Account                      |
| **Profile**                 | A role-scoped presence (Freelancer _or_ Client) under an Identity. This is what's scored.      | Account, Role                      |
| **Freelancer** / **Client** | The two Profile roles — offers work / hires.                                                   | Seller/Talent/User, Buyer/Customer |
| **Party**                   | Either side of an Engagement or Review, when a rule applies symmetrically.                     | —                                  |
| **JobPost**                 | A Client's posted request for work.                                                            | Job, Listing, Gig                  |
| **Proposal**                | A Freelancer's offer against a JobPost.                                                        | Bid, Application                   |
| **Engagement**              | Accepted work between a Freelancer and a Client, with agreed terms.                            | Project, Contract, Gig             |
| **TrustScore**              | A Profile's _standing_ reputation (score + level + RiskSignals). "Is this person trustworthy?" | Rating, Reputation Score           |
| **RiskAssessment**          | A _decision-time_ read of one prospective Engagement. "Is this deal worth it?"                 | Risk Score, Prediction             |
| **RiskSignal**              | One engineered feature feeding a TrustScore or RiskAssessment.                                 | Feature, Factor                    |
| **Review**                  | Two-way, double-blind rating + text after a concluded Engagement.                              | Feedback, Rating                   |
| **ReviewAuthenticity**      | The anti-gaming verdict on a Review (`authentic` vs `suspected-collusion`).                    | —                                  |
| **Outcome**                 | What actually happened on a concluded Engagement — feeds the learn loop.                       | Result                             |

Full glossary (more terms — CollusionCluster, BriefAnalysis, Briefing, IncomeForecast, TaxReserve,
etc.): the project vault's `05-build/CONTEXT.md` (not in this repo — ask if you need it; the terms
above cover everything you'll touch before Slice 1 exists).

## Architecture rules

- **Language: plain JavaScript, not TypeScript.** Deliberate — not in the team's syllabus, and
  contract discipline (below) delivers the anti-breakage guarantee TS would otherwise give.
- **Contracts, not implementations.** Code depends on agreed _shapes_, never on how something works
  internally. Example: all code calls `getCurrentUser(request) → { id, email }` — nobody touches
  auth internals directly. Shared API shapes live in `packages/shared/contracts/` as Zod schemas,
  imported by both `apps/web` and `apps/api` — see `.ai/contracts/overview.md`.
- **Structure:** `apps/{web,api,intelligence}` + `packages/{shared,config}`, npm workspaces (web/api
  only — `intelligence` is Python, managed by pip/venv, deliberately outside the JS workspace graph).
- **`apps/web`** follows bulletproof-react: `app/` (routes/router) · `components/` (shared UI) ·
  `features/` (one per slice, created only as needed — don't scaffold empty folders) · `hooks/` ·
  `lib/`. **Features must not import each other**; only `shared → features → app` is allowed
  (machine-enforced via `eslint-plugin-import-x`'s `no-restricted-paths`, scoped to
  `apps/web/src/features/**`).
- **`apps/api`** is structure-by-component: one folder per domain (`auth/`, `clients/`, `risk/`...),
  each with `*.routes.js` / `*.controller.js` / `*.service.js` / `*.model.js`. Controllers are thin
  HTTP adapters; **services own business logic**; models are data access only.
- **Foundations are frozen.** Auth, the data model, and API style are decided once and wrapped
  behind interfaces. Changing one mid-build is a deliberate, announced PR — never a casual rewrite.
- **UI component system (shadcn/Radix + Tailwind + design tokens) is deliberately deferred** until
  Slice 7. `apps/web` right now is a genuinely bare walking skeleton — don't add `components.json`,
  install a registry, or invent tokens before then. This is not an oversight; it's locked.

## Hard don'ts

- ❌ No scraping Upwork/Fiverr or using their APIs for data — the marketplace is synthetic, seeded
  by our own generator (`apps/intelligence/generator/`).
- ❌ No TypeScript, no Turborepo, no Docker — all deliberately cut for this project's scope/timeline.
- ❌ No pasting AI-generated UI straight into the app once the design system exists (Slice 7+) —
  refactor onto the component library first.
- ❌ No new dependency without a reason you could defend in a viva — check with Rudra first if
  you're not sure whether something's already decided.
- ❌ Never commit directly to `main`/`master` once the GitHub repo exists — branch + PR, always.
- ❌ Never bypass the pre-commit hook (`--no-verify` is banned) — if it blocks you, fix the
  formatting/lint issue, don't route around it.
- ❌ Never invent a synonym for a term in the vocabulary table above.

## The behavioral playbook — when to ask, when to just proceed

This answers "what questions should I ask, and when should I stop overthinking":

- **Stay in your own slice.** The written report (Teammate 2, no code), Slice 6 backend + demo data
  - slides (Aryan), everything else including **all frontend** (Rudra). If you've been handed a
    plan file, read `.ai/protocols/plan-execution.md` first — execute it, don't redesign it. Need
    something outside your area? Ask — don't edit it directly.
- **When in doubt about scope, it's probably "v2."** This is a 1-month project; "done and good
  enough" beats "ambitious and broken." If you're about to build something not on the golden path
  and not explicitly asked for, stop and ask first rather than build it speculatively.
- **Don't add abstractions for hypothetical future needs.** Three similar lines beat a premature
  helper function. Build the feature slice in front of you; the next slice can refactor if a real
  pattern emerges — don't guess at it now.
- **Ask before touching shared/frozen foundations** (auth, data model, API style, the `apps/`+
  `packages/` layout itself). A "better way" you noticed is a proposal for a PR everyone sees, not a
  silent rewrite.
- **Ask before starting anything not already scoped in an approved spec or plan.** New feature idea
  mid-build → capture it as a note, don't build it — see `.ai/protocols/working-agreement.md` Rule 5.
- **Don't ask permission for mechanical, reversible, already-decided work** — running the formatter,
  fixing a lint finding the way its rule intends, writing the test for a task already on your plate.
  That's just doing the job.
- **If you're stuck for more than ~30 minutes**, post in the team WhatsApp group and tag Rudra rather
  than guessing further or silently working around the blocker.
- **TDD is expected from everyone**, on every tool, for every change — new to it? Read
  `.ai/onboarding/tdd-quickstart.md` first, it's a short worked example, not a lecture.

## Reading index — what else is in `.ai/` and when to open it

- **`.ai/onboarding/team-brief.md`** — the 5-minute "what is this project and why" for a new
  teammate. Read this first if you're a person, not an AI mid-task.
- **`.ai/onboarding/tooling-primer.md`** — how to set up Kiro/Antigravity/Claude Code for this repo,
  the full cross-tool-consistency mechanism, and the per-teammate onboarding checklist.
- **`.ai/onboarding/github-guide.md`** — the ~7 git things you actually need, for people new to git.
- **`.ai/onboarding/tdd-quickstart.md`** — a worked TDD example in this repo's actual stack
  (Vitest + React Testing Library), for anyone who hasn't done red-green-refactor before.
- **`.ai/protocols/working-agreement.md`** — the 6 rules that let 3 people build in parallel without
  breaking each other's work. Read before touching anything outside your own slice.
- **`.ai/protocols/plan-execution.md`** — if you've been handed a plan file someone else designed
  (this project's current model for Teammate 2/Aryan's assigned work), read this before starting:
  how to execute a plan task-by-task without redesigning it.
- **`.ai/protocols/security.md`** — the security/consistency guardrails for this repo: branch
  protection, secret handling, dependency hygiene, what's automated vs. what's a human's job.
- **`.ai/protocols/branching-and-review.md`** — the exact branch → commit → PR → merge flow and what
  CI checks before a PR can land.
- **`.ai/contracts/overview.md`** — how the Zod contract pattern works and where to find real
  schemas (`packages/shared/contracts/`).
