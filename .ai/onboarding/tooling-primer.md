# Tooling primer — set up your AI tool, stay consistent with everyone else

**The one idea, up front:** we do NOT stay consistent by using the same AI tool. We stay consistent
because every tool is forced to obey the same shared files, and a pre-commit hook auto-fixes or
rejects anything that doesn't match. You can use whatever AI IDE you like.

## How consistency actually works (strongest to weakest guarantee)

1. **Automated gates (unbreakable).** Prettier/ESLint (JS) and Black/Ruff (Python) rewrite or reject
   code that doesn't match, via a Husky pre-commit hook. No willpower required, and it cannot be
   skipped (`--no-verify` is banned — see `.ai/protocols/security.md`).
2. **Shared instructions (strong).** `.ai/START-HERE.md` is read by every AI tool before it writes
   anything, via a thin pointer file at each tool's own expected location.
3. **Shared building blocks (structural).** The same `packages/shared` Zod contracts, and — once
   Slice 7 lands — the same component library and design tokens.

## Setup by tool

### Claude Code (Rudra)

Reads `CLAUDE.md` (thin) + `AGENTS.md` (thin) — both point to `.ai/START-HERE.md`.

### Kiro (Aryan)

1. Clone the repo, open the folder in Kiro.
2. Kiro auto-reads root `AGENTS.md` (always included) → inherits `.ai/START-HERE.md`'s rules.
3. `.kiro/steering/product.md` already exists (thin, points to `.ai/START-HERE.md` + your area).
4. Enable the Prettier + ESLint extensions, "format on save."
5. Confirm it worked: ask Kiro "what are the project conventions?" — it should mention Freelancer/
   Client/Engagement/TrustScore and "stay in your own slice."

Teammate 2 doesn't need this section — the written report has no code, so no AI IDE setup applies.

### Google Antigravity (Aryan, if using Antigravity instead of Kiro)

1. Clone + open the repo.
2. Antigravity reads root `AGENTS.md` as cross-tool foundation rules automatically.
3. `.agents/rules/conventions.md` already exists (thin, same pattern as Kiro's steering file).
4. Personal preferences (not project rules) go in `~/.gemini/GEMINI.md` on your own machine — never
   project conventions, those belong in this repo's `.ai/START-HERE.md` so everyone shares them.
5. Enable Prettier + ESLint extensions, "format on save."

## Environment setup — do this once per laptop

**Everyone:**

1. Install Node 22 LTS (pinned in `.nvmrc` at repo root) — `nvm install` if you use nvm.
2. Clone the repo (see `.ai/onboarding/github-guide.md` if you're new to git).
3. From the repo root: `npm install` — installs `apps/web`, `apps/api`, and both `packages/*` in
   one shot (npm workspaces). **Never run `npm install` inside `apps/web` or `apps/api`
   individually** — it creates a second, conflicting `node_modules`.
4. `npm run prepare` (or just `npm install` — Husky's hook installs itself automatically via the
   `prepare` script) so your commits get the same auto-formatting as everyone else's.
5. Copy env templates: `cp apps/api/.env.example apps/api/.env` (and `apps/intelligence/.env.example`
   → `.env` if you touch Python). Never commit the real `.env` files.

**Teammate 2 (written report):** none of the above applies — the report is written outside this
codebase, no repo checkout or environment setup needed.

**Aryan (Slice 6 backend + demo data + slides):** you additionally need Python 3.13 (pinned in
`apps/intelligence/.python-version`) for the demo-data scripts:

```bash
cd apps/intelligence
python -m venv venv
venv/Scripts/python.exe -m pip install -r requirements.txt
```

Coordinate with Rudra before changing anything in `apps/intelligence/generator/` — it also produces
the ML's ground-truth training data, so your demo-data conventions and his training-data conventions
need to stay compatible.

6. Make your branch (`yourname/what-it-is`) and start. Never work on `main` directly.

## Adding a dependency

Check with Rudra before adding anything not already in `package.json`/`requirements.txt` — an
unreviewed dependency is how bundle size and style drift happen. This is a small project; almost
everything it needs is already decided.

## Onboarding checklist (tick top to bottom)

- [ ] Read `.ai/onboarding/team-brief.md` → this file → `.ai/onboarding/github-guide.md` →
      `.ai/protocols/working-agreement.md`.
- [ ] Install Node 22 LTS (+ Python 3.13 if you're Aryan, for demo-data scripts).
- [ ] Install your AI IDE (Kiro or Antigravity).
- [ ] `git clone` the repo; open it in your IDE.
- [ ] Confirm your IDE picked up the conventions (ask it "what are this project's conventions?").
- [ ] `npm install` at the repo root (not inside a workspace folder).
- [ ] Copy `.env.example` → `.env` where relevant.
- [ ] Create your branch (`yourname/slice`).
- [ ] Make a tiny test commit; confirm the pre-commit hook runs and formats it.
- [ ] Only then start real work.
