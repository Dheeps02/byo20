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

> **Linux only.** The test suite uses `embedded-postgres` pointed at `/dev/shm/byo20-test-${process.pid}/` — a RAM-backed tmpfs path, zero disk writes, process-scoped to avoid worker collision when Bun runs test files in parallel. Cleaned up in `afterAll`. Windows is not supported for running tests. CI runs on Linux runners only.

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

When you host a campaign, Electron's main process automatically spawns four sidecars: Postgres (hosting both `byo20_server` and `byo20_local` databases on port `5433`), Redis (`6380`), Ollama (`11435`), and the Bun game server. You don't need to install or manage any of them manually — they're bundled. Postgres and Ollama also spin up in client-only (join) mode.
