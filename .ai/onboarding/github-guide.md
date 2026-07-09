# GitHub guide — the ~7 things you actually need

**Mental model:** GitHub is a shared folder with a time machine and an undo button. Everyone copies
it, works on their own branch, and we merge changes back through a reviewed Pull Request.

```
main  ────●────────●─────────●────────●───►   (always works, nobody edits it directly)
           \        \                 ↑
 rudra/core ●──●──●   \   (PR merged)  │
                       \               │
 teammate2/landing      ●──●──●────────┘   (branch → commit → push → PR → merge)
```

## 1. Clone (once, per laptop)

```bash
git clone https://github.com/rudra-1402/canary.git
cd canary
```

## 2. Branch (before any new work)

```bash
git checkout main && git pull
git checkout -b yourname/what-it-is   # e.g. teammate2/landing-hero
```

## 3. Status & add

```bash
git status          # what did I change?
git add .            # or: git add path/to/file
```

## 4. Commit — small and often

```bash
git commit -m "Add landing page hero section"
```

The pre-commit hook auto-formats/lints staged files first — if it blocks you, fix the issue, don't
`--no-verify` around it (see `.ai/protocols/security.md`).

## 5. Push — at least once a day

```bash
git push -u origin yourname/what-it-is   # first push of a new branch
git push                                  # every push after
```

## 6. Pull — sync before you start, and before opening a PR

```bash
git checkout main && git pull
git checkout yourname/what-it-is && git merge main
```

## 7. Pull Request — how work joins `main`

1. `git push` your branch.
2. On github.com, click **"Compare & pull request."**
3. Write a one-line description of what changed → **Create pull request.**
4. CI runs automatically (lint + tests on both JS and Python sides — see
   `.ai/protocols/branching-and-review.md`). A green check is required before merge.
5. Someone glances at it and clicks **Merge**.

## Merge conflicts

Rare if everyone stays in their own slice (see `.ai/protocols/working-agreement.md`). If it
happens: git marks the spot with `<<<<<<<` / `=======` / `>>>>>>>` — open the file, keep the
correct combined version, delete the markers, `git add <file>`, then commit.

## The daily routine (this is 90% of git)

```bash
git checkout main && git pull                    # 1. get latest
git checkout my-branch && git merge main          # 2. update my branch
git add . && git commit -m "what I did"           # 3. save points, often
git push                                          # 4. upload my work
# 5. when a chunk is done: open a PR on github.com
```

## Golden rules

1. Never commit directly to `main`. Always branch → PR.
2. Pull before you start, push before you stop.
3. Commit small and often, with clear messages.
4. Only edit your own slice's folders — kills most conflicts before they happen.
5. Stuck? Ask in the team WhatsApp before forcing anything. Git rarely loses work.

> Kiro and Antigravity both have a "Source Control" panel that does steps 3-5 with buttons if you'd
> rather click than type.
