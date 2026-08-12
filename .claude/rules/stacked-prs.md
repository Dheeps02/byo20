# Stacked Pull Requests

BYO20 uses GitHub's native stacked PR workflow (`gh stack`) for all work that has
sequential dependencies between layers. Use stacked PRs when one piece of work
depends on another that hasn't merged yet. Use a standalone PR when the change is
small and fully independent.

## Prerequisites

The `gh stack` extension must be installed before running any `gh stack` commands:

```bash
gh extension install github/gh-stack
```

## Stack trunk

The stack trunk is always `dev` — never `main`. The bottom PR in a stack targets
`dev`.

## When to use a stack

Use a stack when:
- The changes form a clear dependency chain (e.g. type cleanup → engine implementation → docs)
- One layer genuinely cannot be reviewed without the layer below it

Use a standalone PR when:
- The change is independent of any in-flight work
- It is a small focused fix or chore with no dependents

## Workflow

### Starting a new stack

```bash
# From dev — gh stack init creates and checks out the first branch
gh stack init <first-branch-name>

# ... make commits on first branch ...

# Add next layer on top
gh stack add <second-branch-name>

# ... make commits on second branch ...

# Repeat for each additional layer
gh stack add <third-branch-name>

# ... make commits ...

# Push all branches and create all PRs in one shot
gh stack submit
```

`gh stack init` and `gh stack add` handle branch creation and targeting automatically.
Do not manually set PR base branches — `gh stack` sets them correctly.

### Navigating between layers

```bash
gh stack up    # move to the layer above current
gh stack down  # move to the layer below current
gh stack view  # inspect the full stack and its status
```

### Keeping a stack in sync

```bash
gh stack rebase  # cascade rebase through the whole stack
gh stack push    # push all branches to remote
gh stack sync    # fetch, rebase, push, and sync state in one step
```

When a lower layer is reviewed and changes are requested, check out that branch, fix
it, then run `gh stack rebase` to cascade the changes upward through dependent layers.

### After a lower layer merges

GitHub auto-rebases the remaining layers when a lower PR merges. No manual rebase
needed in most cases. Run `gh stack sync` if anything looks out of sync.

## Branch naming

Follow the existing convention: `feat/<feature>`, `fix/<thing>`, `chore/<thing>`,
`docs/<thing>`. Each layer in a stack gets its own name reflecting its concern.

## PR descriptions

Each PR description should explain only the diff for that layer. Reference the layer
below with "Stacks on #<PR-number>" so reviewers have context. Do not re-explain the
full feature in every layer.

## Never

- Never use `gh stack init` targeting `main` — always target `dev`
- Never manually rebase stack branches without running `gh stack rebase` afterward
- Never open a standalone PR for a branch that is part of a stack
