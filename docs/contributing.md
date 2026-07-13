# Contributing v0.1.0

## Branch Strategy

- `main` — stable releases only. Never push directly.
- `dev` — integration branch. All feature work lands here first.
- `feat/*` — feature branches. Open PRs from `feat/*` into `dev`.

Releases: `dev` → `main` via PR, tagged with a version.

---

## Commit Convention

Conventional commits, always scoped:

```
feat(engine): add death save tracking to Redis
fix(transport): handle reconnect during AWAITING_REACTION
chore(repo): update biome config
docs(ai): clarify specialist routing table
```

Common scopes: `engine`, `transport`, `ai`, `storage`, `shared`, `desktop`, `server`, `repo`.

One logical change per commit. If you find yourself writing "and" in a commit message, split it into two commits.

---

## Code Style

Biome handles formatting and linting. Run it before committing:

```bash
bunx biome check --write .
```

No manual style decisions needed — just let Biome enforce them.

---

## PR Process

- Open PRs against `dev`, not `main`.
- This is a solo project for now, so a self-review checklist applies:
  - [ ] Does `bun test` pass?
  - [ ] Does `tsc --noEmit` pass?
  - [ ] Does `bunx biome check .` pass?
  - [ ] Does the change match the locked spec?
  - [ ] Is the PR description clear about what changed and why?

---

## Spec-First Rule

No implementation without a locked spec. If you're adding a feature, write the spec first and get it reviewed before touching any code. Spec files live in `docs/spec/`.

---

## PR Descriptions

Any non-trivial PR should explain what changed and why in the description body. The diff shows what; the description shows the reasoning. If it's just a mechanical change (dependency bump, rename, etc.), a one-liner is fine.

---

## License

By contributing, you agree that your contributions are licensed under AGPL-3.0.
