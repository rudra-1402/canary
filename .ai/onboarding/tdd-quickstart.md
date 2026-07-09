# TDD quickstart — red, green, refactor, in this repo's actual stack

TDD sounds intimidating until you've done it once. It's three steps, repeated:

1. **Red** — write a test for behavior that doesn't exist yet. Run it. Watch it fail.
2. **Green** — write the _smallest_ amount of code that makes it pass. Nothing extra.
3. **Refactor** — clean up if needed, with the test still passing as your safety net.

That's it. The test comes _before_ the code, every time — not after, not "I'll add tests later."

## Why bother

Because "I tested it by clicking around" doesn't survive someone else changing the code next week.
A test does. And writing the test first forces you to decide what "done" actually means _before_
you start guessing at an implementation.

## A real worked example, in `apps/web`

Say you're building a `Greeting` component that shows a name.

**Step 1 — write the failing test first**, in `apps/web/tests/Greeting.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Greeting from '../src/components/Greeting.jsx';

describe('Greeting', () => {
  it('shows the given name', () => {
    render(<Greeting name="Ava" />);
    expect(screen.getByText('Hello, Ava!')).toBeInTheDocument();
  });
});
```

**Step 2 — run it, watch it fail** (the component doesn't exist yet):

```bash
cd apps/web && npx vitest run tests/Greeting.test.jsx
```

You'll see something like `Failed to resolve import "../src/components/Greeting.jsx"` — that's the
**red** step working correctly. If it doesn't fail here, your test isn't actually testing anything.

**Step 3 — write the smallest thing that makes it pass**, in `apps/web/src/components/Greeting.jsx`:

```jsx
export default function Greeting({ name }) {
  return <p>Hello, {name}!</p>;
}
```

**Step 4 — run it again, watch it pass:**

```bash
cd apps/web && npx vitest run tests/Greeting.test.jsx
```

Green. Done. Commit both files together.

## What actually counts as "a test" here

- **A React component** → does it render the right text/element for a given input? Use
  `@testing-library/react`'s `render` + `screen.getByText`/`getByRole`, like above. Test what a
  user would _see_, not internal implementation details.
- **A plain function** (validation, formatting, a calculation) → call it with an input, assert on
  the output. No rendering needed.
- **An Express route** (if your slice ever adds one) → use Supertest to hit the route and assert on
  the response shape/status.

## The rules that matter more than the ceremony

- Test **behavior**, not implementation. If you rewrite a component's internals but the rendered
  output is the same, the test shouldn't need to change.
- One assertion-worthy behavior per test, named so the failure message tells you what broke:
  `it('shows the given name')`, not `it('works')`.
- If you genuinely don't know what to test first, that's a sign the task isn't scoped clearly yet —
  ask, don't start writing code speculatively (see the behavioral playbook in
  `.ai/START-HERE.md`).
- **Don't skip red.** If you write the implementation first "because it's faster," you lose the one
  thing TDD actually buys you: proof the test can fail. A test that's never seen red might be
  testing nothing.

## Running the full suite

```bash
cd apps/web && npm test      # your slice
cd apps/api && npm test      # if you touch backend
```

CI runs both automatically on every PR — see `.ai/protocols/branching-and-review.md`.
