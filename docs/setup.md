# Setup v0.1.0

## Prerequisites

- **Bun** (latest) — used as the package manager and runtime for `apps/server`
- **Git**

You do not need a separate Node.js install to run the app — Electron bundles its own Node. If you want to package the app with `electron-builder`, you'll need Node installed separately for that step.

---

## Getting Started

```bash
git clone <repo-url>
cd byo20
bun install
```

---

## Dev Mode

TODO — fill in during implementation.

---

## Tests

```bash
bun test
```

---

## Type Checking

```bash
tsc --noEmit
```

---

## Linting and Formatting

BYO20 uses [Biome](https://biomejs.dev) for both formatting and linting. No manual config needed — it reads `biome.json` at the root.

```bash
bunx biome check .
bunx biome format --write .
```

---

## Sidecars

When you host a campaign, Electron's main process automatically spawns three sidecars: a `byo20_server` Postgres instance, a `byo20_local` Postgres instance, and a Redis process. You don't need to install or manage any of them manually — they're bundled. `byo20_local` also spins up on client-only (join) mode.
