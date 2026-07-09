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
- **Dependabot** opens PRs for outdated/vulnerable npm and pip dependencies automatically.
- **GitHub secret scanning + push protection** — GitHub itself scans pushed commits for
  recognizable secret patterns (API keys, tokens) and can block a push that contains one, before it
  ever lands in history.
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

## A note on what we evaluated and didn't ship

We tried `gitleaks` (no reliable npm distribution — would've meant every teammate manually
installing a Go binary) and `secretlint` (npm-native, but verified broken: it silently failed to
detect an AWS example key, an RSA private key, and a GitHub PAT in testing, with no error). Neither
made it into the pre-commit hook. **Don't re-add either without re-verifying it actually detects
something first** — a security tool that silently catches nothing is worse than no tool, because it
creates false confidence. GitHub's server-side secret scanning + push protection is the real
backstop for secrets right now.

## Standard hygiene, not paranoia

This is a 1-month academic/portfolio project with synthetic data, not a production system handling
real user funds or PII. The bar above is "standard hygiene" — branch protection, dependency/secret
scanning, no committed secrets — not maximal security theater (no SAST/CodeQL scanning was added;
it's more CI overhead than this project's risk profile justifies right now).
