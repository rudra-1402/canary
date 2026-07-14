# Team brief — read this once, it's your map to the whole project

> **TL;DR:** We're building **Canary** — a two-sided freelancer marketplace whose special power is a
> **client reputation you can actually trust.** On Fiverr/Upwork, only clients rate freelancers, and
> that rating is easy to fake. Canary makes it symmetric: **both** Freelancers and Clients carry a
> data-based **Trust Score**, hardened by an anti-gaming layer that detects fake reviews and
> collusion rings — so you know before you take a job (or hire someone) whether the other side is
> worth it. Plus income/tax forecasting for freelancers.
>
> **~1 month, 1 effective developer on the AI core (Rudra) + 2 teammates on normal web pages — no
> AI/ML knowledge needed from you.**

## Why this is different

Freelancers get burned by clients who disappear without paying, scope-creep, or ghost. Existing
platforms only _record_ this after the damage. Canary predicts and surfaces it _before_ you commit —
and because reputation is symmetric and gaming-resistant, it's trustworthy in a way one-directional
ratings aren't.

## The golden path (the one flow that must work for the demo)

Freelancer logs in → browses the marketplace, opens a JobPost → sees the client's Trust Score + the
reasons + honest peer reviews (fakes already filtered out) → optionally asks the AI agent for a
plain-English verdict → submits a Proposal → works the Engagement → records the Outcome when it
concludes (feeds the score's learn loop) → their own income/tax forecast sits on the same dashboard.
Only this path gets fully polished — everything else is bonus.

## What we're NOT building (so we don't drown)

Not trying to beat Upwork/Fiverr — it's a portfolio project, not a startup. Not scraping real
platforms (our marketplace is synthetic, generated data — see `apps/intelligence/generator/`). Not
real-time messaging, not a full invoicing engine, not payment processing. Not polishing every
screen — only the golden path. If anyone asks "what if we also added X" — the answer is almost
always "that's v2."

## Who does what (current division — plan-driven model, revised 2026-07-10)

| Person         | Owns                                                                                                                                                                                                                                                                                        | Tool                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **Rudra**      | **100% of frontend** (every screen, not just the golden path) + the entire AI core (data model, auth, Trust Score, anti-gaming, the forecast model) + the intelligence service + writes every backend feature as a full TDD plan for teammates to execute                                   | Claude Code         |
| **Teammate 2** | The written project report + diagrams — no code                                                                                                                                                                                                                                             | Kiro or Antigravity |
| **Aryan**      | Slice 6 (Income/Tax forecast) backend — Payment manual-entry + CSV import, IncomeForecast/TaxReserve read endpoints (not the model itself) — built from a Rudra-written plan, executed task-by-task, not designed independently. Plus demo/synthetic data generation + presentation slides. | Kiro or Antigravity |

This supersedes the earlier "hybrid model" (each teammate owned their slice's frontend and
backend). Read `.ai/protocols/plan-execution.md` before starting any assigned feature — it explains
how to work from a plan someone else designed. **Rule stands either way: you only edit files in your
own area**, and cross-slice changes go through a PR (see `.ai/onboarding/github-guide.md`).

## Tech stack

- **`apps/web`** — React + Vite + Tailwind, npm workspace.
- **`apps/api`** — Node + Express + MongoDB (Mongoose), npm workspace.
- **`apps/intelligence`** — Python, the ML/AI service (scikit-learn, networkx for the collusion
  graph, embeddings for the agent) — separate from the npm workspaces, its own venv.
- **`packages/shared`** — Zod contracts both `apps/web` and `apps/api` import, so the two sides can
  never structurally disagree on a shape.

## How three people on three AI tools stay consistent

Not by everyone using the same tool. By shared, machine-enforced files every tool reads
automatically: `.ai/START-HERE.md` (the real content) plus thin pointer files at each tool's
expected location (`AGENTS.md`, `CLAUDE.md`, `.kiro/steering/`, `.agents/rules/`). Formatters and
linters (Prettier/ESLint, Ruff/Black) auto-fix or reject anything that doesn't match, enforced by a
pre-commit hook nobody can bypass. Full mechanism: `.ai/onboarding/tooling-primer.md`.

## Timeline (4 weeks, demo-first)

Week 1: skeleton — all layers talking, foundations frozen, synthetic data seeded. Week 2: forecast +
marketplace pages. Week 3: Trust Score + anti-gaming (the feature we're judged on). Week 4: assemble,
polish the golden path, freeze code, prep the demo. If the deep AI runs long, the "v2" list absorbs
the overflow — the golden path always ships.

## What to read next

1. This brief ✅
2. `.ai/onboarding/tooling-primer.md` — set up your AI tool for this repo
3. `.ai/onboarding/github-guide.md` — the git you actually need
4. `.ai/protocols/working-agreement.md` — how we build in parallel without collisions
