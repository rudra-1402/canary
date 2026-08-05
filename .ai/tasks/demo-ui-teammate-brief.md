# Demo UI brief — read this before you touch anything

You've been asked to build UI for a handful of screens for tomorrow's demo (**2026-08-06**), ahead
of the actual evaluation (**2026-08-08**). This file is the complete instruction set for that task.
It doesn't replace the repo's normal rules — it adds a few that apply specifically to you, this
task, this deadline.

**Read these two first, in order, before writing anything:**

1. `.ai/START-HERE.md` — the whole project's rules. You don't need to memorize it, but skim it once.
2. `.ai/onboarding/team-brief.md` — what Canary is, the golden path, who owns what.

If anything below contradicts something you half-remember from those files, this file wins for
this task — but if it seems like a real contradiction rather than a narrowing, ask, don't guess.

---

## 1. What you're building, in order

Two screens already exist and work — **Auth** and **Find Work**. Don't touch them unless asked.

Build in this order. **Stop after step 1 and check in before moving to step 2** — the deadline is
tight enough that building the wrong thing first is expensive.

1. **Golden path only, first:**
   - **Job detail screen** — job spec + the client's Trust Score panel (score, band, four ranked
     risk signals) + real reviews + a "Submit proposal" action. All of this is backed by real data
     today.
   - **AI due-diligence briefing screen — UI shell only.** Build the screen that _displays_ a
     briefing (loading state, the verdict text, citations, thumbs up/down feedback buttons). **Do
     not build the logic that generates the briefing** — that's grounding an LLM call against our
     own data with citation validation, and it's mine, not yours. Wire your UI against a hardcoded
     mock response for now (I'll give you the exact response shape / Zod contract to build against).
   - **Record Outcome + Review screen** — "how did it go" capture, star rating, written feedback.
     Backed by a real endpoint (`POST /api/outcome-reviews`) already.
2. **Only once step 1 is done and I've seen it:** Trust Score detail screen (score, band, gauge,
   the same four ranked signals, evidence list). Cut anything the data doesn't back — ask if unsure
   whether something's real; don't assume.

Don't build anything not listed here (notifications, messaging, search, saved lists, the mobile
layout) — none of it has real data behind it for this demo, and it's explicitly cut. If you think
something's missing, ask, don't add it.

---

## 2. Hard boundaries — never, no exceptions

These aren't style preferences. Breaking one of these is the difference between "small fix" and
"lost afternoon two days before evaluation."

- **Never commit to `main`.** Branch protection blocks it anyway, but don't try. One branch, named
  `yourname/demo-ui`.
- **Never merge your own PR.** Open it, tag me, I merge. You have PR rights, not merge rights.
- **Never open, edit, or commit a real `.env` file.** Only `.env.example` exists in the repo; keep
  it that way. If you need a real value to run the app locally, ask me for it directly — don't
  guess, don't generate one, don't copy one from anywhere else.
- **Never touch `apps/api/src`, `apps/intelligence`, `packages/shared`, or anything under
  auth/data-model.** You're frontend-only, and inside your own screen files at that. Need a backend
  change (a field the API doesn't return, a new endpoint)? Ask — don't add it yourself.
- **Never build the AI briefing's actual model-calling / citation-validation logic** — see step 1.
  UI shell against a mock, full stop.
- **No new dependencies without asking.** Everything you need is already installed — see section 3.
  Pulling components from the configured shadcn registries is expected and encouraged; running
  `npm install <something-else>` is not.
- **Never bypass the pre-commit hook** (`--no-verify` is banned). If it blocks your commit, fix the
  formatting/lint issue it's pointing at.
- **If you're stuck more than ~30 minutes, ask** — team WhatsApp, tag me. Don't silently work around
  a blocker or guess at a design decision that isn't yours to make.

---

## 3. Your stack — all installed, nothing for you to set up

Run `npm install` at the repo root once. That's it. Everything below is already wired:

| Purpose                       | Use                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Components                    | **shadcn** + registries (see below)                                                                         |
| Animation                     | **Motion** (`motion/react`) — the app-wide default                                                          |
| Scroll / SVG morph animation  | **GSAP** — only if scoped to one page, never mixed into the same component tree as Motion                   |
| Server data                   | **TanStack Query**                                                                                          |
| Global state                  | **Zustand**                                                                                                 |
| Forms                         | **React Hook Form** + `@hookform/resolvers` + **Zod**                                                       |
| Icons                         | **lucide-react**                                                                                            |
| Toasts                        | **sonner**                                                                                                  |
| Dates / currency              | **date-fns** + `Intl`                                                                                       |
| Tables                        | **TanStack Table**                                                                                          |
| Charts                        | **Recharts**                                                                                                |
| Multi-state flows (3+ states) | **XState** (`@xstate/react`) — only for genuinely multi-state flows; a hover or a toast stays on `useState` |
| Routing                       | React Router 7                                                                                              |
| Styling                       | Tailwind 4                                                                                                  |
| Tests                         | Vitest + Testing Library                                                                                    |

### Pulling components

Use the CLI from `apps/web/` — never hand-copy code off a website:

```bash
npx shadcn@latest add button              # core primitives
npx shadcn@latest add @magicui/marquee    # a registry component
```

Configured registries: `@magicui` · `@cult` · `@animate-ui` · `@motion-primitives` · `@kokonutui`.
Components land in `src/components/ui/` as source you own and can edit freely.

Two already pulled as working examples: `card.jsx` (core) and `shimmer-button.jsx` (@magicui).

---

## 4. Design tokens — the one rule that saves me the most rework

**Never hardcode a colour.** Not `#2b57c4`, not `text-blue-600`, not `bg-slate-100`. Use the tokens
defined in `src/index.css` — they're shadcn's standard names, so any AI tool already knows them:

`bg-background` · `text-foreground` · `bg-card` · `text-muted-foreground` · `border-border` ·
`bg-primary` · `text-primary` · `ring-ring` · `bg-destructive` · `bg-accent`

Plus Canary's own, for trust levels: `text-band-high` · `bg-band-high-soft` · `text-band-med` ·
`bg-band-med-soft` · `bg-destructive-soft`.

**Why this matters more than anything else in this file:** I'm doing the real brand pass after the
demo — new colours, new type. If you used tokens, that's me editing one file. If you hardcoded
colours, it's me hunting through every screen you touched. This single rule is most of the reason
you're getting a brief instead of a one-line message.

**One trap.** In shadcn's vocabulary `--primary` is the brand action colour and `--accent` is a
_subtle hover surface_ — not what the word suggests. Brand blue is `bg-primary`. If something looks
washed out, you probably reached for `accent`.

Two more: `destructive` (red) is reserved for risk and low-trust states — never decorative. And the
type scale is `text-xs` → `text-3xl` as defined in `index.css`; don't invent sizes with arbitrary
values.

---

## 5. React conventions — so I can pick this up without a rewrite

Match what's already in `src/app/routes/JobDetail.jsx`; it's the reference.

- **Reuse the existing primitives** before building your own: `Button`, `Spinner`, `ErrorNotice`,
  `EmptyState`, `TrustBadge` in `src/components/ui/`. A new shared primitive goes in that same
  folder.
- **All data goes through `src/lib/api/*.js`**, which wraps `apiClient.js` (it handles CSRF and
  throws a typed `ApiError`). Never call `fetch` directly in a component — you'll bypass both.
  The wrappers already exist: `jobPosts.js`, `profiles.js`, `trustScores.js`, `proposals.js`,
  `outcomeReviews.js`, `engagements.js`, `auth.js`.
- **Every screen handles three states: loading, error, empty.** Not optional — the demo runs on real
  data and something will be slow or missing on stage. `Spinner`, `ErrorNotice`, and `EmptyState`
  exist precisely for this.
- **PropTypes on every component that takes props.** This repo is plain JavaScript, no TypeScript —
  PropTypes is the substitute, and it's used consistently. (Components you pull from a registry are
  exempt; the lint config already knows.)
- **Where files go:** screens in `src/app/routes/`, shared UI in `src/components/ui/`, API wrappers
  in `src/lib/api/`. **Don't create a `features/` folder** — an ESLint boundary rule guards it and
  it'll block your commit for no benefit on a one-day task.
- **Default export for components, named exports for helpers.**
- **Import with `@/`** (e.g. `import { cn } from '@/lib/utils'`) or a relative path — both work.

---

## 6. What the data actually holds — read before you design

You can't design around data that doesn't exist. Measured, not guessed:

- **Trust Scores are real** — score, band, and ranked risk signals, on ~80% of clients. This is the
  product; give it the visual weight on any screen it appears.
- **There are exactly four risk signals**, the same four for everyone: ghost rate, on-time rate,
  paid-in-full rate, scope-creep rate. Don't design a rich signal taxonomy — there isn't one.
- **Job titles, descriptions, cover letters and review text are placeholder text.** Ratings and
  dates are real; the words are filler. Design around the _structure_, and don't give a
  description block half the screen.
- **No data at all for:** review authenticity / fake-review flags, notifications, messages, saved
  jobs, client spend history, hire rates. Don't build UI for them.
- Reviews, outcomes, engagements and proposals are all real, with real lifecycle states.

---

## 7. How to actually build the UI (not "ask ChatGPT for a page")

You'll likely reach for an AI tool to generate markup. That's fine — but a raw "create me a UI for
X" prompt produces generic, templated output, and this project is explicitly trying not to look
templated. Before you generate anything for a screen, get clear (with your AI tool or on your own)
on:

- **Who's looking at this and why.** These screens are the moment a freelancer decides whether to
  trust a client (or vice versa) — the tone is _trustworthy, evidence-based, calm_, not a cheerful
  generic SaaS landing page. The Trust Score panel is the product; it should visually outweigh
  everything else on its screen, not sit as one card among equals.
- **What data is actually real vs. lorem.** Job titles/descriptions/review text are placeholder
  text right now — don't design around them looking meaningful. Design around the _structure_
  (score, signals, reviews, actions), not the placeholder words.

Before calling a screen done, check it against this generic-AI-output list and fix anything you
recognize:

- Purple/blue gradient hero, centered icon-in-a-circle cards in a row of 3
- Everything in rounded-2xl with a soft shadow and no other hierarchy signal
- Inter (or system-ui) at one weight everywhere — no type scale, nothing to anchor the eye
- Bouncy/springy animation on things that don't need motion (a card that scales on hover for no
  reason)
- Microcopy that says nothing ("Manage your work, all in one place")

If it looks like ten other AI-generated dashboards, redo it — don't ship the first draft.

---

## 8. Testing — yes, still required, and here's why it actually matters this time

We're building UI on **parallel branches** — you on yours, me on mine, same backend underneath.
There's a real chance something you build (a layout choice, an interaction, a piece of motion) is
good enough that I keep it in the real branded version later. Basic tests aren't bureaucracy here —
they're what lets me tell "this renders and works" from "this looks right in a screenshot but
breaks on click" when I'm evaluating your branch afterward.

Doesn't need to be exhaustive. Per `.ai/onboarding/tdd-quickstart.md`: one test per screen that
confirms it renders the key real data (score shows, reviews list, the submit button calls the
right endpoint), plus one for whatever the screen's primary interaction is (clicking "Submit
proposal", clicking a star rating). Red before green, like everywhere else in this repo.

---

## 9. Workflow

```bash
git checkout main && git pull
git checkout -b yourname/demo-ui
# ... build, commit small and often ...
git push -u origin yourname/demo-ui
# open PR on github.com, tag me, don't merge it yourself
```

CI (lint, format, tests) runs automatically on your PR — it must be green before I merge. If it's
red, fix it on your branch; don't ask for an override.

**Done for tomorrow means:** golden-path screens (job detail, briefing UI shell, record outcome)
built, tested, PR open, tagged for review. Trust Score detail is a stretch goal only if step 1
lands with time to spare.
