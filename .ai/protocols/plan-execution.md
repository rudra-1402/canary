# Plan execution — how to work from a plan you didn't design

Some features on this project (currently: Aryan's Slice 6 backend) aren't designed by the person
implementing them. Rudra writes a complete implementation plan first — using a rigorous
brainstorm → design → plan process — and hands you the finished plan file to execute. This is
different from normal TDD work where you decide what to build; here, the "what" and "how" are
already decided. Your job is disciplined execution, not redesign.

## The rules

1. **Read the entire plan before writing any code.** Plans are ordered — later tasks assume earlier
   ones are done exactly as specified. Skimming and starting halfway through breaks that.
2. **Execute tasks in order, top to bottom.** Don't reorder, skip, or combine tasks even if a
   shortcut looks obvious — the ordering usually encodes a dependency you may not see yet.
3. **Every task that includes a test: run it and watch it fail before writing the implementation,
   then run it again and confirm it passes** before moving to the next task. This is the same
   red-green discipline as `.ai/onboarding/tdd-quickstart.md` — a plan doesn't exempt you from TDD,
   it just tells you what the tests are.
4. **Don't change the design.** If a plan says to name a function `getIncomeForecast`, don't rename
   it to something you'd prefer. If you spot a real problem with the plan (a step that can't work,
   a contradiction, a missing piece), stop and ask — don't silently "fix" it by improvising your own
   approach. See `.ai/protocols/working-agreement.md` Rule 4 (foundations are frozen, changes are
   deliberate).
5. **Don't add anything the plan didn't ask for.** No extra validation, no extra endpoint, no
   "while I'm here" refactor — even if it seems like an obvious improvement. Small, isolated,
   exactly-what-was-asked changes are the whole point of this model; see `.ai/START-HERE.md`'s
   "don't add abstractions for hypothetical future needs."
6. **If a task is unclear or seems wrong, ask — don't guess.** Post in the team WhatsApp group and
   tag Rudra, the same escalation path as any other blocker (`.ai/START-HERE.md`'s behavioral
   playbook: stuck more than ~30 minutes → ask).
7. **Commit at the point each task says to commit**, not in one giant commit at the end. Small,
   reviewable commits are how Rudra (or CI) catches a problem early instead of after everything's
   tangled together.

## What this is not

This is not "read the plan once for inspiration and then build it your own way" — that reintroduces
exactly the design-taste and consistency risk this model exists to avoid. If you genuinely think a
different approach is better, that's a real conversation to have _before_ you deviate — raise it,
don't silently take it.

## A worked example of what a task looks like

Every task in a plan you receive follows this shape:

    ### Task 3: Payment CSV import endpoint

    **Files:**
    - Create: `apps/api/src/payments/payments.routes.js`
    - Test: `apps/api/tests/payments/payments.routes.test.js`

    - [ ] Step 1: Write the failing test
    - [ ] Step 2: Run it, confirm it fails for the right reason
    - [ ] Step 3: Write the minimal implementation
    - [ ] Step 4: Run it, confirm it passes
    - [ ] Step 5: Commit

Work through the checkboxes in order. When every checkbox in every task is checked, the feature is
done — not before.
