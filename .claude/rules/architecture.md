# Architecture Rules

## Package Responsibilities

### `@byo20/shared`
Types only. No logic, no DB, no runtime concerns.
- WS message taxonomy + Zod schemas
- Zustand store shape types
- Core game entity types

### `@byo20/storage`
Everything database.
- Drizzle schema (byo20_server + byo20_local)
- Typed query functions per domain
- Redis client
- `IGameStateStore` and `IVectorStore` interfaces
- Migrations in `migrations/`
- SRD seed data in `seeds/srd/`

### `@byo20/engine`
D&D rules engine. Pure TypeScript, no side effects.
- `IRulesEngine` interface
- `dnd5e/` implementation
- Must be testable headless: `bun test packages/engine` with no running processes

### `@byo20/transport`
WebSocket server and message layer only.
- WS server, token auth, invite codes
- In-memory connection map
- `send()` routing

### `@byo20/ai`
AI orchestration only.
- Event Evaluator, Orchestrator, 3 Specialists
- World Gen pipeline
- Smart narration tier
- Vercel AI SDK — never call LLM providers directly

### `apps/server`
Composition root only. No game logic.
- Wires engine + transport + ai + storage
- Sets up EventEmitter hooks between engine and ai
- Manages DB connections

### `apps/desktop/main`
Thin supervisor only.
- Spawns Postgres, Redis, Bun server sidecars
- safeStorage — decrypt API key, pass as env var to Bun server at spawn
- 4 IPC channels: `server:start`, `server:ready`, `tunnel:url`, `update:available`
- electron-updater
- Zero game logic, zero game state, zero WS handling

### `apps/desktop/preload`
contextBridge only.
- Exposes typed read functions on `window.localDb`
- Read-only — renderer never writes through preload

### `apps/desktop/renderer`
Dumb display layer.
- React + Babylon.js + Zustand
- Imports ONLY from `@byo20/shared`
- No Node.js APIs, no DB access, no game logic
- Connects to game server via WS same as any player

## Key Architectural Facts

- Server is a Bun subprocess — Bun cannot be the Electron runtime
- API key: decrypted in Electron main via safeStorage, passed as env var at spawn, never logged
- Zustand is live session state, NOT a cache — no TTL, no invalidation
- Babylon.js internals (meshes, scene, camera) never go into Zustand
- Server always re-validates — client validation is UX feedback only
- Preload data flow is one-way: server writes cache.*, renderer reads via preload
