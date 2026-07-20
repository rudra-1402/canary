# Branching & review — the exact flow

## Branches

- `main` is always working. Nobody pushes to it directly — branch protection rejects the attempt.
- One branch per person/feature, named `yourname/what-it-is` (e.g. `teammate3/help-screen`).
- Git commands: `.ai/onboarding/github-guide.md`.

## What CI checks on every PR

- **JS:** `apps/web` and `apps/api` — Prettier format check, ESLint, and the Vitest suite.
- **Python:** `apps/intelligence` — Black format check, Ruff, and the pytest suite (against a
  `mongo` service container spun up for the duration of the CI run).
- **Dependency audit:** `npm audit` and `pip-audit`, surfacing (not necessarily blocking on) known
  vulnerabilities.

All of the above must be green before a PR can merge — branch protection requires the CI status
check to pass.

## Review

- **PRs require going through the PR flow, but don't require a mandatory approving review** to
  merge (0 required approvals). With a 3-person team where realistically only one other person is
  usually available to review, a hard requirement would stall merges whenever they're offline.
- Review is still expected in spirit, per the working agreement — a PR description that says what
  changed is the minimum; a glance from someone else before merging is the norm, not mandatory.
- **Cross-boundary changes** (touching shared core, the data model, another person's slice) should
  get an actual look from Rudra before merging, even though CI won't force it.

## CODEOWNERS

Feature folders map to their owner: Aryan's Slice 6 backend files (once that plan exists — path
TBD, see the plan when it's written) → Aryan, everything else including all of `apps/web` → Rudra.
Teammate 2 owns no folder (report lives outside the codebase). GitHub automatically suggests the
right reviewer on a PR touching those paths.

## If CI is red

Fix it on your branch and push again — don't merge around it, don't ask for an override. If you
don't understand why a check failed, ask in the team WhatsApp with the CI log link rather than
guessing at a fix.
