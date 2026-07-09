# Security & consistency protocol

What's automated (you don't have to remember it) vs. what's a human's job.

## Automated — enforced by machines, not memory

- **Formatting/linting on every commit.** A Husky pre-commit hook runs Prettier + ESLint (JS) and
  Black + Ruff (Python) on staged files via `lint-staged`. **`git commit --no-verify` is banned** —
  if the hook blocks you, fix the underlying issue. This is what makes "3 people, 3 AI tools, one
  consistent codebase" actually true instead of aspirational.
- **CI on every push/PR.** Re-runs the same formatters/linters plus the full test suite in the
  cloud — even if someone's local hooks were somehow bypassed, a red CI check blocks the merge. See
  `.ai/protocols/branching-and-review.md`.
- **Dependabot** opens PRs for outdated/vulnerable npm and pip dependencies automatically —
  confirmed working (opened 8 real update PRs the moment the repo was created).
- **`npm audit` / `pip-audit`** run as a CI step, surfacing known-vulnerable dependencies.
- **Branch protection on `main`** — direct pushes are rejected; everything goes through a reviewable
  PR that must pass CI first.

## Manual — your job, not a machine's

- **Never commit a real `.env` file.** Only `.env.example` (with placeholder values) is ever
  committed — real secrets stay local. `.gitignore` already excludes every real `.env`, but that's
  a backstop, not a substitute for not typing a real key into a tracked file.
- **API keys for the AI/ML services (Gemini, later Anthropic) stay with Rudra.** Per the working
  agreement, teammates build against mock data and never need a live key on their machine — if a
  future slice genuinely needs one, ask before assuming you should have it.
- **Don't add a new dependency without checking first** — an unreviewed package is how supply-chain
  risk and bundle bloat both creep in. See `.ai/START-HERE.md`'s hard don'ts.
- **Report anything that looks like a leaked credential immediately** (in the team WhatsApp,
  tagging Rudra) rather than trying to quietly fix it yourself — a leaked key needs to be rotated,
  not just deleted from the file.

## ⚠️ Known gap: no automated secret scanning at all, right now

Neither a local nor a server-side secret scanner is currently active on this repo — this is a real
gap, not an oversight to gloss over:

- **`gitleaks`** — no reliable npm distribution (would mean every teammate manually installing a Go
  binary on Windows). Never installed.
- **`secretlint`** (npm-native alternative) — installed, configured, and **verified broken**: it
  silently failed to detect an AWS example key, an RSA private key, and a GitHub PAT in direct
  testing, with no error (exit 0, empty results). Removed rather than shipped — a security tool
  that silently catches nothing is worse than no tool, because it creates false confidence.
- **GitHub server-side secret scanning + push protection** — attempted via the API, confirmed
  unavailable: `"Secret scanning is not available for this repository"`. This is a **private** repo,
  and GitHub only offers secret scanning for free on **public** repos; private-repo secret scanning
  needs GitHub Advanced Security, which isn't included on this account's current plan.

**What actually backstops this right now:** `.gitignore` correctly excludes every real `.env` file
(verified — only `.env.example` files are tracked), and no real API key exists in this repo yet
(Rudra holds all keys locally, per the working agreement). That's discipline, not automation.

**Real options if this needs to close**, in rough order of cost: (1) make the repo public once it's
demo-ready — free secret scanning included, but exposes the code early; (2) a paid GitHub plan or
GitHub Advanced Security add-on for private-repo secret scanning; (3) re-attempt a client-side
scanner (a different secretlint version, or gitleaks via Docker if that dependency becomes
acceptable later) — **only if you re-verify it actually detects a real secret before trusting it,**
the same way the ones above were tested and failed. Not resolved as part of this pass — flagged for
a deliberate decision rather than silently left unaddressed.

## Standard hygiene, not paranoia

This is a 1-month academic/portfolio project with synthetic data, not a production system handling
real user funds or PII. The bar above is "standard hygiene" — branch protection, dependency/secret
scanning, no committed secrets — not maximal security theater (no SAST/CodeQL scanning was added;
it's more CI overhead than this project's risk profile justifies right now).
