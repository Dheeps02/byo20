# BYO20

Open-source, self-hosted, free D&D 5.5e (2024 ruleset) VTT with an AI Dungeon Master.
One Electron binary, two modes: host and join. Video-game-style — not a spreadsheet tool.

## Repo Structure

```
apps/desktop/       — Electron app (main + preload + renderer)
apps/server/        — Bun game server (subprocess spawned by desktop/main)
packages/shared/    — types shared between renderer + server
packages/storage/   — Drizzle schema, migrations, seeds, Redis
packages/engine/    — D&D 5.5e rules engine, pure TS
packages/transport/ — WebSocket server, auth, routing
packages/ai/        — Event Evaluator, Orchestrator, Specialists, World Gen
docs/spec/          — full layer specs, read before implementing any subsystem
docs/decisions/     — ADRs
```

## Dependency Rules — Never Violate

```
@byo20/shared
    ↑
@byo20/storage
    ↑
@byo20/engine
    ↑
@byo20/transport    @byo20/ai
          ↑               ↑
          apps/server

apps/desktop/renderer → @byo20/shared ONLY
```

- `engine` and `ai` never import each other
- Renderer never imports storage, engine, transport, or ai
- No circular dependencies

## Commits

Conventional commits, scoped, one logical change per commit. No "and"s.

```
feat(engine): add advantage/disadvantage resolution
fix(transport): reconnect grace period timer not resetting
chore(storage): add migration for quests table
```

Valid scopes: `engine`, `transport`, `ai`, `storage`, `shared`, `server`, `desktop`, `renderer`, `preload`

## Branching

- `main` — stable, tagged, releases only
- `dev` — integration branch
- `feat/*` — one per workstream
- Never push directly to main

## Code Explanations — Required

The developer is learning TypeScript and frontend development. For every code change:

- Explain what the code does in plain English before or alongside writing it
- Explain WHY this approach was chosen, not just what it does
- Call out any TypeScript concepts that might be unfamiliar (generics, types, interfaces, etc.)
- If a pattern is idiomatic TS/React/Bun, say so and explain why it's the convention
- Keep explanations tight — not a tutorial, just enough to understand what's happening
- If a change touches multiple concepts, break the explanation down per concept

Never just drop code without explanation. Every diff should be understandable to someone
actively learning the stack.

## Specs

Read `docs/spec/` before implementing any subsystem. Designs are load-bearing.

| File | Covers |
|---|---|
| `storage-layer.md` | Postgres + Redis schemas |
| `transport-layer.md` | WS protocol, auth, message taxonomy |
| `game-engine.md` | Combat, conditions, spells, quests, XP, loot |
| `ai-layer.md` | Event Evaluator, Orchestrator, Specialists, World Gen |
| `frontend-layer.md` | Electron architecture, React/Babylon.js bridge, UI |
