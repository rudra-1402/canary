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
- **Secret scanning** — a `gitleaks` CI job fails the build if a credential is committed (see below).
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

## Automated secret scanning — gitleaks in CI (closed 2026-07-20)

A `secrets` job in `.github/workflows/ci.yml` runs **`gitleaks/gitleaks-action@v2`** on every push
and PR. It scans the commit diffs for leaked credentials (AWS keys, private keys, GitHub PATs, etc.)
and fails the check on a hit — and because it's a server-side CI gate, `--no-verify` can't bypass it.

Why this works where earlier attempts didn't:

- **`gitleaks` as a CI action, not a local tool.** The earlier objection ("no reliable npm
  distribution, every teammate installs a Go binary on Windows") was about a _client-side_ hook. The
  action runs the gitleaks Go binary on GitHub's Ubuntu runner — no npm, no local install, nothing
  for a teammate to set up. `GITLEAKS_LICENSE` is only required for GitHub _orgs_, so it's free here.
- **`secretlint`** was tried as an npm-native scanner and **verified broken** (silently detected
  nothing against a real AWS key / RSA key / GitHub PAT, exit 0) — removed, since a scanner that
  catches nothing is worse than none. gitleaks does not have this problem.
- **GitHub's own secret scanning** stays unavailable (private repo needs GitHub Advanced Security,
  not on this plan) — the gitleaks CI job is what stands in for it.

Still discipline, not automation: `.gitignore` excludes every real `.env` (only `.env.example` is
tracked) and Rudra holds all live keys locally. gitleaks is the automated backstop under that.

Deliberately **not** added (scope): a client-side pre-commit secret hook (server-side gate is
sufficient for this project's risk profile and avoids the Windows-binary friction), and a custom
`.gitleaks.toml` allowlist (default rules don't flag placeholder `.env.example` values; add one only
if a real false positive appears, never to silence a real finding).

## Standard hygiene, not paranoia

This is a 1-month academic/portfolio project with synthetic data, not a production system handling
real user funds or PII. The bar above is "standard hygiene" — branch protection, dependency/secret
scanning, no committed secrets — not maximal security theater (no SAST/CodeQL scanning was added;
it's more CI overhead than this project's risk profile justifies right now).
