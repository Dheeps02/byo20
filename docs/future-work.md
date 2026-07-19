# Future Work

Items identified during implementation that are intentionally deferred.
Organized by the implementation phase where they must be resolved.
Update this file as items are resolved or new ones are found.

---

## Phase: `@byo20/storage`

### Add typed query functions per domain
**Where:** `src/postgres/queries/` (directory doesn't exist yet)

**What:** The spec calls for one query file per domain (e.g. `queries/campaigns.ts`, `queries/npcs.ts`). These would expose specific read patterns — e.g. `getActiveQuestsForCampaign`, `getNPCsByFaction` — beyond what the store's generic get/save methods cover.

**When to fix:** When `@byo20/engine` or `@byo20/transport` start needing queries that the store methods don't cleanly support.

### Add `getWorldZoneByCoords(campaignId, q, r)`
**Where:** `src/postgres/game-state-store.ts`, `IGameStateStore`

**What:** `WorldZone` has `q` and `r` hex-grid coordinates. The world tick and World Gen will frequently look up a zone by position rather than by UUID — `getWorldZone(id)` isn't useful when you only have coordinates. Add `getWorldZoneByCoords(campaignId: string, q: number, r: number): Promise<WorldZone | null>` to the interface and store.

**When to fix:** Before the world clock or world gen pipelines are implemented.

### NPC overworld position — Redis vs Postgres write strategy
**Where:** `src/redis/client.ts`, `src/postgres/game-state-store.ts`, `npcs.location` column

**What:** The current spec treats `npcs.location` (JSONB) in Postgres as the source of truth for NPC zone position, and `saveNPC` writes to Postgres on every change. But NPCs move every world clock tick on their daily schedules — potentially 20+ UPDATE queries per tick.

**Proposed pattern:**
- Redis holds the current NPC zone during active play (fast, low-cost reads for "who's in this zone?")
- Postgres is only written when something meaningful happens: party enters the NPC's zone, a snapshot is created, or the session ends
- On server restart, Redis is rebuilt from `npcs.location` in Postgres (same pattern as agenda/effects)

**Decision needed:** Before implementing the world tick in `@byo20/engine`, decide whether to add NPC position keys to the Redis schema or accept the Postgres write-per-tick cost for simplicity.

**Likely outcome:** Postgres-only is probably fine for a self-hosted game. Only pursue the Redis path if profiling shows tick writes are actually a bottleneck.

---

## Phase: `@byo20/engine`

### Declare `RULESET_ID` constant
**Where:** `@byo20/engine` entry point

**What:** `apps/server` calls `checkRulesetVersion(localDb, engine.RULESET_ID)`. The engine needs to export a constant like `export const RULESET_ID = 'dnd-5.5e-2024'` so `apps/server` can pass it down without hardcoding the string.

---

## Phase: `apps/server`

### Wire `checkRulesetVersion` at boot
**Where:** `apps/server` startup sequence

**What:** After `createLocalDb`, call `await checkRulesetVersion(localDb.db, engine.RULESET_ID)` before accepting any connections. This is the safety check that prevents schema/data mismatches from silently corrupting game state.

### Implement per-event agenda processing loop
**Where:** `apps/server` world tick handler

**What:** The server tick loop must process agenda events one at a time and remove each individually using `removeAgendaEvent` after successful processing — not bulk-remove with `removeFiredAgendaEvents`. This ensures a failure mid-tick leaves unprocessed events in the ZSET for retry on the next tick.

```typescript
const due = await pollDueAgendaEvents(redis, campaignId, currentClock)
for (const eventId of due) {
  await processAgendaEvent(eventId)
  await removeAgendaEvent(redis, campaignId, eventId)
}
```

Only use `removeFiredAgendaEvents` (bulk) when you can guarantee the entire batch succeeded — e.g. inside a transaction where failure rolls back everything.

### Wire `rebuildAgendaFromDb` on restart
**Where:** `apps/server` startup sequence

**What:** After Redis connects and the server DB is ready, call `rebuildAgendaFromDb` for every active campaign to restore the agenda ZSET from Postgres. Otherwise game clock timer events are lost across restarts.

### Populate SRD JSON stubs before first launch
**Where:** `seeds/srd/*.json` — all API-fetched files currently contain `[]`

**What:** Run `bun run seeds/scripts/fetch-srd.ts` once to hit `dnd5eapi.co` and populate the stubs. Then commit the populated JSON files so the app is fully offline after that.

**When to fix:** Before the first playable build.

---

## Phase: `@byo20/ai` (before Specialists)

### Mark rolled-back log entries to prevent ghost AI recall
**Where:** `src/postgres/schema/server/log.ts`, `rollbackToSnapshot` in storage, `@byo20/ai` recall queries

**What:** Log tables are append-only — rollbacks don't delete rows. After a DM rollback, `event_log` contains events from the rewound timeline. Semantic recall queries will surface these "ghost" events and inject them into Specialist context — an NPC could reference a battle the party technically never fought.

**Storage side:**
- Add `rolled_back_at TIMESTAMPTZ` (nullable) to `event_log`. Null = canon event.
- Add `invalidated BOOLEAN DEFAULT false` to `npc_memories` and `faction_events`.
- `rollbackToSnapshot` sets `rolled_back_at = now()` on all `event_log` rows with `timestamp > snapshot.created_at`, and `invalidated = true` on all `npc_memories` / `faction_events` rows whose source `event_id` is now rolled back.

**AI side:**
- Every recall query reading `event_log` adds `WHERE rolled_back_at IS NULL`.
- Every query reading `npc_memories` or `faction_events` adds `WHERE invalidated = false`.

**Decision needed:** Needs an ADR. What about nested rollbacks? Does the DM UI show rolled-back events differently, or hide them?

**When to fix:** Before `@byo20/ai` semantic recall is wired. Retrofitting after Specialists are in use means auditing every recall call site.

### `IVectorStore.queryMemories` and `queryFactionEvents` missing similarity score
**Where:** `packages/shared/src/types/interfaces.ts`, `packages/storage/src/postgres/vector-store.ts`

**What:** Both interface methods return `NPCMemory[]` / `FactionEvent[]` with no way for the Orchestrator to know how relevant each result actually is. A similarity score (0–1, cosine) on each returned item lets the Orchestrator apply a relevance threshold — e.g. discard results below 0.7 rather than blindly injecting all topK results.

**Proposed shape:**
```typescript
interface ScoredMemory { memory: NPCMemory; score: number }
interface ScoredFactionEvent { event: FactionEvent; score: number }
```

Or simpler: add an optional `score?: number` field to `NPCMemory` and `FactionEvent` themselves.

**When to fix:** Before the Orchestrator is implemented. Decide on the shape before locking the interface.

### `queryLoreEntries` is not on `IVectorStore`
**Where:** `packages/storage/src/postgres/vector-store.ts`, `packages/shared/src/types/interfaces.ts`

**What:** `PostgresVectorStore` has `upsertLoreEntry` and `queryLoreEntries` as concrete class methods, not on `IVectorStore`. This means callers in `@byo20/ai` must depend on the concrete implementation rather than the interface — which breaks the storage abstraction.

**Resolution options:**
1. Add `upsertLoreEntry` / `queryLoreEntries` to `IVectorStore` (brings lore on par with memories and faction events).
2. Keep lore off the interface and access it via a dedicated `ILoreStore` or by extending `IGameStateStore`. Justify the asymmetry in an ADR.

**When to fix:** Before `@byo20/ai` Specialists are implemented. Specialists will need lore retrieval.

---

## Deferred / Post-v1

### Make agenda poll + remove atomic (Lua script)
**Where:** `src/redis/client.ts`

**What:** `pollDueAgendaEvents` and `removeAgendaEvent` are two separate Redis round-trips. If the server crashes between them, the event fires again on restart (double-fire). A Lua script executes atomically inside Redis — poll and remove in a single operation.

```lua
local events = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1])
for _, id in ipairs(events) do
  redis.call('ZREM', KEYS[1], id)
end
return events
```

**When to fix:** Before production. For dev/testing, double-fire on crash is acceptable.

### Rebuild effects and turn resources from Postgres on crash recovery
**Where:** `src/redis/client.ts`, `apps/server` startup

**What:** `rebuildAgendaFromDb` exists for the agenda, but there is no equivalent for encounter effects or turn resources. After a crash with AOF disabled or corrupted, these are lost.

**Decision needed:** Whether to checkpoint live effect state to Postgres during combat, or accept that a crash mid-combat resets that combat round. Log the decision in an ADR when the server combat loop is designed.

### Rollback-aware semantic recall
**Where:** All semantic recall query call sites in `@byo20/ai`

**What:** Once the storage-side ghost event marking (see Phase: `@byo20/ai` above) is in place, every `queryMemories`, `queryFactionEvents`, and future recall helper must respect the `invalidated` and `rolled_back_at` flags. This entry tracks the AI-side enforcement once the storage changes exist.

### `Entity.type` missing `'ai_player'`
**Where:** `packages/shared/src/types/entities.ts`, `EntitySchema`

**What:** The `Entity.type` discriminant currently allows `'player' | 'npc' | 'monster'`. An AI-controlled player character (e.g. a party member run by the DM AI when a player disconnects) doesn't fit cleanly into any of these. Adding `'ai_player'` would let the renderer and engine distinguish AI-piloted PCs from human-controlled ones.

**When to fix:** When the AI Specialist layer is designed. Needs a decision on whether `'ai_player'` maps to the existing character sheet system or requires separate handling.

---

## Resolved

### ~~Replace `Row` placeholder with concrete domain types~~ — `feat/shared-domain-types`
`IGameStateStore` and `IVectorStore` now use concrete domain types from `@byo20/shared/types/domain`. All `Row = Record<string, unknown>` aliases and `as typeof table.$inferInsert` casts removed. Row-to-domain mapping functions handle the translation between flat Drizzle rows and nested domain types.

### ~~Return typed `ActionResources` from `getTurnResources`~~ — `feat/shared-domain-types`
`getTurnResources` now returns `Promise<ActionResources>`, parsing raw Redis HASH strings into the typed shape from `@byo20/shared`. `setTurnResourcesTyped` is the new typed write helper.

### ~~Update `IGameStateStore` / `IVectorStore` method signatures~~ — `feat/shared-domain-types`
Both interfaces now use concrete domain types throughout. `IGameStateStore` gains `getCharacterIdentity`, `saveCharacterIdentity`, `getContainer`, `saveContainer`, and `saveFaction`. `IVectorStore.queryMemories` and `queryFactionEvents` accept `context: string` rather than a pre-computed embedding.

### ~~Type `Faction.goals` as `string[]`~~ — `feat/shared-domain-types`
Was `unknown` (raw JSONB). Fixed to `string[]` with a narrowing cast in `rowToFaction`.
