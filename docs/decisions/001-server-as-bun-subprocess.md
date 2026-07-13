# 001 — Server as Bun Subprocess v1.0.0

## Status
Accepted

## Context

The game server needs to run somewhere on the DM's machine. It needs to run D&D mechanics, manage WebSocket connections, and coordinate the AI layer. The question was where that process should live in relation to Electron.

Electron's main process is already responsible for spawning sidecars (Postgres, Redis), managing `safeStorage`, running `electron-updater`, and handling IPC. Adding full game server logic on top of that creates one large process that handles everything — hard to test, hard to reason about, and tightly coupled to Electron's lifecycle.

The server also needs to be testable without launching a full Electron window.

## Decision

The game server runs as a spawned Bun subprocess — a third sidecar alongside the Postgres instances. Electron's main process starts it when the user clicks "Host Game" and shuts it down at session end. The server process runs `packages/network` + `packages/core` + `packages/ai` without any Electron dependency.

## Alternatives Considered

**In-process with Electron main** — The server runs as a module inside the main process. Rejected because: the main process is Node.js (Electron's bundled Node), not Bun. Running in-process would prevent using pure Bun APIs and runtime features. It also can't be tested headless without spinning up Electron.

**Separate always-on service** — A standalone server the user installs and manages independently of the Electron app. Rejected because it defeats the self-hosting simplicity goal. DMs should not be required to understand process management to run a campaign.

## Consequences

- Clean decoupling between the Electron app (UI, OS integration) and the game server (rules, networking, AI).
- Server can be started, tested, and developed without Electron — `bun run apps/server/src/index.ts` works standalone.
- Leaves a clear path to cloud hosting: the server subprocess is already self-contained and Electron-free.
- Electron main process still owns lifecycle (start/stop), which is acceptable since it already manages the other two sidecars the same way.
