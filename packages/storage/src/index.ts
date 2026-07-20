/**
 * @byo20/storage public API
 *
 * Exports are added here as each subsystem is implemented.
 * Import order follows the natural build sequence:
 *   schema → client → queries → stores → redis
 */

// Re-export interface contracts so engine/transport/ai can import them
// from either @byo20/shared (preferred) or @byo20/storage without the
// implementation details leaking.
export type { IGameStateStore, IVectorStore } from "@byo20/shared";

// DB init — call these once at server startup to get connection objects
export { createServerDb, createLocalDb, checkRulesetVersion } from "./postgres/client";
export type { ServerDb, LocalDb } from "./postgres/client";

// Store implementations
export { PostgresGameStateStore } from "./postgres/game-state-store";
export { PostgresVectorStore } from "./postgres/vector-store";

// Redis
export {
    createRedisClient,
    agendaKey,
    effectsKey,
    turnResourcesKey,
    worldClockKey,
    getWorldClock,
    setWorldClock,
    scheduleAgendaEvent,
    pollDueAgendaEvents,
    removeAgendaEvent,
    removeFiredAgendaEvents,
    rebuildAgendaFromDb,
    getEntityEffects,
    setEntityEffects,
    clearEncounterEffects,
    getTurnResources,
    setTurnResources,
    setTurnResourcesTyped,
    clearTurnResources,
} from "./redis/client";

// Test utilities (not imported in production — tree-shakeable)
export { setupTestDb, teardownTestDb, withRollback } from "./testing/setup";
export {
    campaignFactory,
    characterFactory,
    characterCampaignStateFactory,
    npcFactory,
    factionFactory,
    encounterFactory,
    sessionFactory,
    questFactory,
    worldZoneFactory,
    agendaEventFactory,
    worldObjectFactory,
    loreEntryFactory,
} from "./testing/factories";
