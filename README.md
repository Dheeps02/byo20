# BYO20 v0.1.0

Self-hosted, open-source D&D 5.5e (2024 ruleset) virtual tabletop with an AI Dungeon Master.

BYO20 is a video game-style VTT — think Baldur's Gate 3 or TaleSpire, not a digital character sheet. The DM self-hosts the server. You bring your own LLM API key (Claude, GPT, Gemini, or local Ollama).

> **Status:** Early development. Not yet usable.

---

## What it is

A VTT where the Dungeon Master is an AI. The AI runs the whole campaign — generating quests, voicing NPCs, narrating events, and advancing the world on a villain agenda even when the party is dicking around in a tavern. Human DM mode is also supported, where the AI handles narration and NPC dialogue only.

The renderer is 3D Babylon.js with Havok physics. Dice physically tumble and land on the correct face. The SRD 5.2 content is baked in under CC-BY-4.0. Campaigns are fully portable — export a Postgres dump and hand the whole thing to another player to host.

---

## Key Features

- **AI DM** — multi-agent system: orchestrator + DM, NPC, and Narration specialists
- **3D renderer** — Babylon.js with WebGPU backend and Havok physics for seed-driven deterministic dice
- **XP-based leveling** — deterministic progression, DM can award bonus XP or grant levels directly
- **NPC memory + faction reputation** — pgvector semantic search with decay-weighted ranking
- **Villain agenda** — the world advances on a clock regardless of party action
- **Campaign seed system** — procedural heightmap, hex-grid world, staged lazy generation
- **SRD 5.2 baked in** — CC-BY-4.0, seeded into Postgres on first launch
- **Bring your own key** — Claude, GPT, Gemini, or local Ollama
- **Portable campaigns** — full Postgres dump, host handoff with no lock-in

---

## Monorepo Structure

```
apps/
├── desktop/        Electron app — main process (sidecars, safeStorage, tunnel) and renderer
│                   process (React + Babylon.js + Zustand + WS client)
└── server/         Game server — Bun subprocess spawned by Electron on host launch

packages/
├── shared/         Shared types, WS message envelope contracts, constants
├── storage/        Postgres abstractions (IGameStateStore, IVectorStore), Redis session store
├── core/           IRulesEngine + DnD5eRulesEngine, all D&D mechanic subsystems
├── network/        WebSocket server, message routing, Cloudflare Tunnel init, auth
└── ai/             Event Evaluator, Orchestrator, Specialist agents, MCP tools, LLM adapter
```

---

## Documentation

- [Architecture](docs/architecture.md) — system overview, layers, data flows
- [Setup](docs/setup.md) — getting the project running locally
- [Contributing](docs/contributing.md) — branch strategy, commit convention, PR process

---

## License

AGPL-3.0. See [LICENSE](LICENSE).
