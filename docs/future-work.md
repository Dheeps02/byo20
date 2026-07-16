# Future Work

Things identified during implementation that are intentionally deferred.
Update this file as items are resolved or new ones are found.

---

## `@byo20/storage`

### Replace `Row` placeholder with concrete domain types
**Where:** `src/postgres/game-state-store.ts`, `src/postgres/vector-store.ts`, `@byo20/shared` interfaces

**What:** `IGameStateStore` and `IVectorStore` currently use `Row = Record<string, unknown>` as method parameter/return types because the concrete domain types (`Campaign`, `NPC`, `Faction`, etc.) don't exist yet. The `as typeof table.$inferInsert` casts in `game-state-store.ts` are load-bearing but temporary.

**When to fix:** After `@byo20/engine` is scaffolded and domain types are moved into `@byo20/shared`. Steps:
1. Define concrete types (`Campaign`, `Character`, `NPC`, etc.) in `@byo20/shared`
2. Update `IGameStateStore` and `IVectorStore` in `@byo20/shared` to use them
3. Remove `Row` alias and `as typeof` casts in `game-state-store.ts`

### Add typed query functions per domain
**Where:** `src/postgres/queries/` (directory doesn't exist yet)

**What:** The spec calls for one query file per domain (e.g. `queries/campaigns.ts`, `queries/npcs.ts`). These would expose specific read patterns — e.g. `getActiveQuestsForCampaign`, `getNPCsByFaction` — beyond what the store's generic get/save methods cover.

**When to fix:** When `@byo20/engine` or `@byo20/transport` start needing queries that the store methods don't cleanly support.

### Populate SRD JSON stubs before first launch
**Where:** `seeds/srd/*.json` — all API-fetched files currently contain `[]`

**What:** Run `bun run seeds/scripts/fetch-srd.ts` once to hit `dnd5eapi.co` and populate the stubs. Then commit the populated JSON files so the app is fully offline after that.

**When to fix:** Before the first playable build. Not needed until `apps/server` is wired up.

### NPC overworld position — Redis vs Postgres write strategy
**Where:** `src/redis/client.ts`, `src/postgres/game-state-store.ts`, `npcs.location` column

**What:** The current spec treats `npcs.location` (JSONB) in Postgres as the source of truth for NPC zone position, and `saveNPC` writes to Postgres on every change. But NPCs move every world clock tick on their daily schedules — potentially 20+ UPDATE queries per tick. This is unnecessary churn for data that only matters at a coarse level.

**Proposed pattern:**
- Redis holds the current NPC zone during active play (fast, low-cost reads for "who's in this zone?")
- Postgres is only written when something meaningful happens: party enters the NPC's zone (potential encounter), a snapshot is created, or the session ends
- On server restart, Redis is rebuilt from `npcs.location` in Postgres (same pattern as agenda/effects)

**Decision needed:** Before implementing the world tick in `@byo20/engine`, decide whether to add NPC position keys to the Redis schema (currently only agenda, effects, turn resources, world clock are specced), or accept the Postgres write-per-tick cost for simplicity.

**Likely outcome:** Postgres-only is probably fine. A self-hosted game with 30 NPCs doing 30 UPDATEs every 5 in-game minutes is negligible load. Only pursue the Redis path if profiling shows tick writes are actually a bottleneck. If so, rework is isolated to `src/redis/client.ts` (new key helpers) and `saveNPC` in `game-state-store.ts` (split position updates from full saves).

---

## `@byo20/shared`

### Update `IGameStateStore` / `IVectorStore` method signatures
**Where:** `src/types/stores.ts` (or wherever the interfaces live in shared)

**What:** Both interfaces currently use `Record<string, unknown>` in all method signatures. Once concrete domain types exist in `@byo20/shared`, update the signatures to use them. This is the same work as the storage item above — they're done together.

---

## `@byo20/engine`

### Declare `RULESET_ID` constant
**Where:** `@byo20/engine` entry point

**What:** `apps/server` calls `checkRulesetVersion(localDb, engine.RULESET_ID)`. The engine needs to export a constant like `export const RULESET_ID = 'dnd-5.5e-2024'` so `apps/server` can pass it down without hardcoding the string.

---

## `apps/server`

### Wire `checkRulesetVersion` at boot
**Where:** `apps/server` startup sequence

**What:** After `createLocalDb`, call `await checkRulesetVersion(localDb.db, engine.RULESET_ID)` before accepting any connections. This is the safety check that prevents schema/data mismatches from silently corrupting game state.

### Wire `rebuildAgendaFromDb` on restart
**Where:** `apps/server` startup sequence

**What:** After Redis connects and the server DB is ready, call `rebuildAgendaFromDb` for every active campaign to restore the agenda ZSET from Postgres. Otherwise the game clock timer events are lost across restarts.
