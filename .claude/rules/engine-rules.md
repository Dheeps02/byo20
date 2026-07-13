---
paths:
  - "packages/engine/**"
---

# Engine Rules

## What This Package Owns
All D&D 5.5e rules math. Nothing else.
- Attack resolution (attack roll vs AC, saving throw vs DC)
- Damage pipeline (dice → modifiers → resistance/immunity/vulnerability)
- Condition system (`getModifiers()` query interface)
- Death saves, concentration, action economy
- XP, leveling, loot generation
- Fog of war geometry, AoE shapes
- Quest DAG traversal and edge matching
- World clock ticking

## What It Does Not Own
- WebSockets (transport)
- LLM calls (ai)
- DB writes (storage — engine reads state, emits events, never writes directly)
- Rendering (renderer)

## IRulesEngine Interface
All mechanics go through `IRulesEngine`. The v1 implementation is `DnD5eRulesEngine`.
Never add mechanics outside this interface — it must remain hot-swappable.

## Rules Source of Truth
Before implementing any mechanic, read `docs/spec/game-engine.md`.
Designs are load-bearing — don't invent rules not in the spec.
D&D rules come from SRD 5.2 (CC-BY-4.0) seeded into `srd.*` tables — not hardcoded.

## Testing
Every mechanic must be unit testable with `bun test` headless.
No Electron, no running Postgres, no Redis required to run engine tests.
Use the `IGameStateStore` interface with a mock if state reads are needed.
