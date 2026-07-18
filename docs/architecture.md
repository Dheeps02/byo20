# BYO20 Architecture v0.1.0

## Overview

BYO20 is a monorepo Electron desktop app. The DM's machine runs two Postgres instances (one for the campaign server, one for local player data), a Redis session store, and a game server as a Bun subprocess — all spawned automatically on host launch. Players connect over WebSocket via a Cloudflare Tunnel URL. The game engine owns all D&D rules and state. The AI layer sits between the engine and transport, consuming targeted engine events and producing structured world mutations and streamed narration prose. The renderer is a React + Babylon.js frontend that never talks to the engine directly — it connects via WebSocket like any other player.

---

## Layers

| Layer | Package(s) | Responsibility |
|---|---|---|
| Shared | `packages/shared` | Shared types, WS message envelope contracts, constants — imported by every other package |
| Storage | `packages/storage` | `IGameStateStore` and `IVectorStore` abstractions over Postgres + pgvector; Redis session client |
| Engine | `packages/core` | `IRulesEngine` interface + `DnD5eRulesEngine` implementation; all D&D mechanic subsystems |
| Transport | `packages/network` | WebSocket server, message routing, auth token validation, Cloudflare Tunnel init |
| AI | `packages/ai` | Event Evaluator, Orchestrator, Specialist agents (DM, NPC, Narration), MCP tools, Vercel AI SDK adapter |
| Server app | `apps/server` | Bun subprocess entry point — wires engine, transport, and AI together |
| Desktop app | `apps/desktop` | Electron main process (sidecar spawning, safeStorage, IPC) + renderer process (React + Babylon.js + Zustand + WS client) |

### Dependency Flow

```
packages/shared
      ↑
packages/storage
      ↑
packages/core
      ↑              ↑
packages/network   packages/ai
      ↑______________↑
         apps/server

apps/desktop/renderer ──→ packages/shared only
```

The renderer never imports from `core`, `network`, or `ai`. It communicates exclusively over WebSocket.

---

## Package Map

### `packages/shared`

Shared TypeScript types and the WS message envelope schema. Everything else imports from here; this package imports nothing internal.

### `packages/storage`

`IGameStateStore` and `IVectorStore` interfaces with a single Postgres + pgvector implementation. Owns two Postgres databases:

- **`byo20_server`** — campaign source of truth, active only when hosting. Schemas: `game.*`, `items.*`, `world.*`, `combat.*`, `log.*`, `memory.*`
- **`byo20_local`** — always active on every machine. Schemas: `srd.*` (SRD 5.2 reference data), `local.*` (pre-campaign characters), `cache.*` (synced player slice of server data)

Redis is used for live session state during combat (initiative order, active effects, turn resources, world clock). Never touches the renderer.

### `packages/core`

`IRulesEngine` is the single interface all game logic calls through. The v1 implementation is `DnD5eRulesEngine`. Hot-swappable — a `DnD6eRulesEngine` or homebrew variant can be dropped in by config.

Mechanic subsystems (called on-demand by the orchestration layer):

- State machine (game phases: LOBBY, EXPLORATION, COMBAT, SHORT_REST, LONG_REST, SESSION_ENDED)
- Combat engine (attack roll, saving throw, damage pipeline)
- Action economy (turn resource tracking and validation)
- Conditions (15 conditions, modifier query interface)
- Death saves
- World clock
- XP + leveling
- Loot
- Fog of war (exploration fog + combat vision)
- AoE geometry (all six 2024 shapes)
- Spells (casting validation, concentration, effect primitives, persistent zones)
- Quests (DAG structure, edge matching, dynamic node live-handoff)

### `packages/network`

WebSocket server with an in-memory `Map<player_id, WebSocket>` routing table. No pub/sub, no Redis — single server process. Cloudflare Tunnel is started here on host launch and provides the public URL players connect to. Auth: invite-code on first join, campaign-scoped Postgres token on reconnect.

### `packages/ai`

- **Event Evaluator** — deterministic gate, zero LLM cost. Reads game state and classifies each event into a tier: `skip`, `narration:pool`, `narration:cheap`, `narration:frontier`, or `full`.
- **Orchestrator** — assembles specialist context, selects skill files, routes output (structured JSON to engine, prose streamed to transport).
- **Specialist agents** — DM Specialist (world decisions, encounter/quest generation, adjudication), NPC Specialist (in-character dialogue, scoped per NPC per call), Narration Specialist (out-of-character prose, always streamed).
- **MCP tools** — deterministic read/write operations (query memories, place encounters, write quest nodes, fire world events, etc.). Never LLM calls.
- **LLM adapter** — Vercel AI SDK wrapper. Supports Anthropic, OpenAI, Google, and Ollama.
- **Smart narration tiers** — tier 1: pre-generated pool (zero cost), tier 2: cheap model, tier 3: frontier model.

### `apps/server`

The game server runs as a Bun subprocess spawned by the Electron main process on host launch. Owns the engine + transport + AI runtime. Can run headless for testing without Electron.

### `apps/desktop`

The Electron app has two processes:

**Main process** — owns all OS-level concerns:
- Spawning four sidecars on host launch: Postgres (port `5433`), Redis (`6380`), BYO20 Ollama (`11435`), and the Bun game server. Postgres and Ollama also spawn in join-only mode.
- Starting Cloudflare Tunnel on host launch
- `safeStorage` for API key encryption/decryption
- `electron-updater` for silent background app updates
- Four IPC channels: `server:start`, `server:ready`, `tunnel:url`, `update:available`

**Renderer process** — owns all UI concerns:
- React + Babylon.js (WebGPU backend) + Zustand
- WebSocket client — connects to the game server the same way any other player does, even on the host machine
- Reads from `byo20_local` directly via a preload script (`queryDB(sql)`) — no IPC round-trip per query

No game state flows through IPC. The renderer never talks to the engine directly.

---

## Key Data Flows

### Player action → state delta → clients

```
Player sends PLAYER_ACTION over WebSocket
  → packages/network routes to apps/server
  → packages/core validates and resolves action
  → packages/storage writes new state (Postgres + Redis, transactional)
  → packages/core emits result events
  → packages/network dispatches STATE_DELTA / result messages to clients
```

### WS message → Zustand → React + Babylon.js

```
WS message arrives in renderer
  → WS handler writes to Zustand store
  → React components re-render via selectors (affected components only)
  → Babylon.js reads updated values via getState() inside runRenderLoop
```

### Engine event → AI layer → prose stream

```
Game engine emits targeted AI hook (e.g. combat_ended, npc_addressed)
  → Event Evaluator classifies tier
  → Orchestrator assembles context, selects specialist + skill file
  → Specialist invokes LLM via Vercel AI SDK
  → Structured JSON output → validated by Zod → written to engine via MCP tools
  → Prose output → streamed token-by-token → NARRATION WS message → clients
```

---

## AI Architecture

```
Game Engine
    │  (targeted EventEmitter hooks)
    ▼
Event Evaluator ──── skip / tier selection
    │  (full / narration:*)
    ▼
Orchestrator
    ├── context assembly
    ├── skill file injection
    └── specialist routing
          ├── DM Specialist       (world decisions, generation, adjudication)
          ├── NPC Specialist      (in-character dialogue, per-NPC scoped context)
          └── Narration Specialist (prose output, always streamed)
                    │
              Output Validator (Zod, .strict())
                    │
          ┌─────────┴──────────┐
    MCP write tools       Transport (prose stream)
    (engine / Postgres)   (NARRATION WS message)
```

MCP tools give specialists deterministic read/write access to game state mid-generation. All reasoning and generation is LLM work; all reads/writes to Postgres go through MCP tools, not direct calls.

---

## Port Reference

BYO20 sidecars use non-default ports to avoid conflicting with anything the user already has running.

| Process | Port | Notes |
|---|---|---|
| System Postgres | 5432 | Never touched — BYO20 avoids this port |
| BYO20 Postgres | 5433 | Single instance hosting both `byo20_server` and `byo20_local` databases |
| System Redis | 6379 | Never touched |
| BYO20 Redis | 6380 | Session state and agenda timers |
| System Ollama | 11434 | Never touched |
| BYO20 Ollama | 11435 | Dedicated instance under `~/.byo20/ollama/`, embeddings only |
