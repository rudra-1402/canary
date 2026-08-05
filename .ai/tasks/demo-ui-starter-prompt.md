# Starter prompt — hand this to the teammate

Paste everything in the block below into the AI tool (ChatGPT, Claude, Cursor, whatever) as the
**first message** of a fresh conversation. Send the data dump separately.

---

```text
You are working in the Canary repo on ONE task: building demo UI screens for a demo on
2026-08-06. Nothing else.

═══════════════════════════════════════════════════════════════════════
STEP 0 — SETUP (the human runs these; confirm they are done before coding)
═══════════════════════════════════════════════════════════════════════

Prerequisites: Node 22, MongoDB running locally, Git. Python is NOT needed.

  git clone https://github.com/rudra-1402/canary.git
  cd canary
  npm install
  cp apps/api/.env.example apps/api/.env
  cp apps/web/.env.example apps/web/.env
  git checkout -b <yourname>/demo-ui

IMPORTANT: run `npm install` at the repo root ONLY. Never inside apps/web or apps/api —
it creates a second, conflicting node_modules and breaks the build.

Then edit apps/api/.env so it contains at least these four lines:

  MONGODB_URI=mongodb://127.0.0.1:27017/canary_demo
  PORT=4000
  SESSION_SECRET=any-non-empty-string-for-dev
  CLIENT_URL=http://localhost:5173

Leave apps/web/.env as copied (VITE_API_URL=http://localhost:4000/api).
Do not fill in the Google or SMTP values — the app runs fine without them.

Load the seeded database from the dump Rudra sent (unzip it first):

  mongorestore --db canary_demo ./canary-dump/canary_b4

Run the app in two terminals:

  npm run dev --workspace=apps/api     → http://localhost:4000
  npm run dev --workspace=apps/web     → http://localhost:5173

Log in with any seeded email and the password: canary-demo-password
Useful accounts: dramsey@example.org (3 active engagements),
rowejoel@example.net (7 active engagements) — both good for the Record Outcome screen.

If something fails here, STOP and report it. Do not start writing UI code against a
broken setup, and do not "fix" it by editing backend files.

═══════════════════════════════════════════════════════════════════════
STEP 1 — READ THIS FIRST
═══════════════════════════════════════════════════════════════════════

Read this file completely before writing any code, and treat it as the ONLY
authoritative source for this task:

  .ai/tasks/demo-ui-teammate-brief.md

It tells you which screens to build, in what order, and what the data actually contains.
Follow it exactly.

═══════════════════════════════════════════════════════════════════════
STEP 2 — SCOPE (a hard boundary, not a preference)
═══════════════════════════════════════════════════════════════════════

- You may ONLY create or edit files under apps/web/src/
- You may NOT touch apps/api/, apps/intelligence/, packages/, .github/, any .env file,
  or anything else outside apps/web/src/. Not to "fix" something. Not to make a test
  pass. If a screen needs a backend change, STOP and say so instead of making it.
- Do NOT build the AI briefing's model-calling or citation-validation logic. Build the
  UI shell only, against a mock response Rudra gives you.

═══════════════════════════════════════════════════════════════════════
ABOUT THE OTHER DOCUMENTATION IN THIS REPO
═══════════════════════════════════════════════════════════════════════

Other files in .ai/ (team-brief.md, tooling-primer.md, branching-and-review.md,
START-HERE.md) describe the whole project — team allocation, backend slices, timelines,
CODEOWNERS, IDE setup. Parts of that are OUT OF DATE, and none of it is your task.

From START-HERE.md use ONLY two things:
  1. the vocabulary table — Profile, JobPost, Proposal, Engagement, TrustScore,
     RiskSignal, Review, Outcome. Use these exact words, never invent synonyms.
  2. the design-token rules.

Ignore everything in those files about who owns what, backend work, IDE setup, and
timelines. Where they contradict the brief, THE BRIEF WINS.

═══════════════════════════════════════════════════════════════════════
NON-NEGOTIABLE RULES
═══════════════════════════════════════════════════════════════════════

- NEVER hardcode a colour. No hex values, no text-blue-600, no bg-slate-100. Use only
  the tokens defined in apps/web/src/index.css (bg-background, text-foreground, bg-card,
  text-muted-foreground, border-border, bg-primary, bg-destructive, plus band-high /
  band-med for trust levels). This is the single most important rule in the task —
  Rudra rebrands after the demo, and hardcoded colours turn that into a manual sweep.
  Note: --primary is the brand colour; --accent is a subtle hover surface, not the brand.
- NEVER run npm install. The full stack is already installed: shadcn + registries,
  Motion, GSAP, TanStack Query, TanStack Table, Zustand, React Hook Form + Zod,
  lucide-react, sonner, date-fns, Recharts, XState, Tailwind 4, React Router 7.
  To add a component, run this from apps/web/:
      npx shadcn@latest add button
      npx shadcn@latest add @magicui/marquee
  Registries available: @magicui, @cult, @animate-ui, @motion-primitives, @kokonutui
- NEVER call fetch() directly in a component. Use the wrappers in src/lib/api/*.js —
  they handle CSRF and typed errors.
- EVERY screen handles three states: loading, error, and empty. Spinner, ErrorNotice,
  and EmptyState already exist in src/components/ui/.
- PropTypes on every component you hand-write (this repo is plain JS, no TypeScript).
- Reuse the existing primitives before inventing new ones: Button, Spinner, ErrorNotice,
  EmptyState, TrustBadge.
- Do NOT create a features/ folder — an ESLint rule guards it and will block your commit.
- NEVER commit to main. Work on your branch, open a PR, tag Rudra. Do not merge it
  yourself.
- NEVER use git commit --no-verify. If the pre-commit hook blocks you, fix what it
  reports.
- Match the patterns in src/app/routes/JobDetail.jsx — it is the reference for how a
  screen in this codebase is written.

═══════════════════════════════════════════════════════════════════════
HOW TO WORK
═══════════════════════════════════════════════════════════════════════

Before writing code, ask clarifying questions until the screen's purpose, its data, and
its states are unambiguous. Do not start while anything is still a guess. Then state
which screen you are building and what it will show, and wait for confirmation.

Do not produce generic AI-looking UI. No purple gradient heroes, no three centered
icon-in-a-circle cards, no everything-rounded-2xl-with-a-soft-shadow. The Trust Score
panel is the product — give it the visual weight on any screen it appears on.

When a screen is done: run `npm test --workspace=apps/web` and `npx eslint .` and make
sure both pass before committing.
```
