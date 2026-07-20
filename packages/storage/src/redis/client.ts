import type { ActionResources } from "@byo20/shared";
/**
 * Redis client and typed helpers for BYO20's session state.
 *
 * Redis holds live-session data that needs sub-millisecond access during combat.
 * Nothing here is source of truth — everything is rebuildable from Postgres.
 *
 * Key schema:
 *   campaign:{id}:agenda          → ZSET scored by fires_at_clock (game-time minutes)
 *   encounter:{id}:effects        → HASH keyed by entity_id → JSON effect list
 *   character:{id}:turn_resources → HASH, ActionResources shape (see @byo20/shared)
 *   world:{id}:clock              → STRING integer — in-game minutes elapsed
 *
 * IMPORTANT: EXPIREAT is wall-clock and must never be used for game-time events.
 * Agenda timers use ZRANGEBYSCORE on the game clock value, not wall time.
 */
import Redis from "ioredis";
import { getLogger } from "../logger";

/** Safety-net TTL for combat keys. If an encounter or turn ends without the server
 * calling the clear* helpers (e.g. crash mid-combat), these keys auto-expire rather
 * than leaking in Redis forever. 24h is generous enough to survive any realistic
 * session pause; real cleanup always happens via clearEncounterEffects / clearTurnResources. */
const EFFECTS_TTL_SECONDS = 86_400;
/** Safety-net TTL for turn resource keys. Matches EFFECTS_TTL_SECONDS for the same reason. */
const TURN_RESOURCES_TTL_SECONDS = 86_400;

/** Create an ioredis client. Connects lazily on first command. */
export function createRedisClient(url: string): Redis {
    const client = new Redis(url, {
        lazyConnect: true, // don't connect until first command
        maxRetriesPerRequest: 3,
    });
    client.on("error", (err: Error) => {
        getLogger().error({ err: err.message }, "redis connection error");
    });
    return client;
}

// ── Key builders ──────────────────────────────────────────────────────────────

/** Redis key for a campaign's villain agenda sorted set. */
export const agendaKey = (campaignId: string) => `campaign:${campaignId}:agenda`;
/** Redis key for an encounter's active effects hash. */
export const effectsKey = (encounterId: string) => `encounter:${encounterId}:effects`;
/** Redis key for a character's current-turn action resources hash. */
export const turnResourcesKey = (characterId: string) => `character:${characterId}:turn_resources`;
/** Redis key for a campaign's world clock string. */
export const worldClockKey = (campaignId: string) => `world:${campaignId}:clock`;

// ── World clock ───────────────────────────────────────────────────────────────

/** Read the current in-game world clock (minutes elapsed). Returns 0 if unset. */
export async function getWorldClock(redis: Redis, campaignId: string): Promise<number> {
    const val = await redis.get(worldClockKey(campaignId));
    const clock = val ? Number.parseInt(val, 10) : 0;
    getLogger().debug({ campaignId, clock }, "getWorldClock");
    return clock;
}

/** Write the current in-game world clock (minutes elapsed). */
export async function setWorldClock(redis: Redis, campaignId: string, clock: number): Promise<void> {
    await redis.set(worldClockKey(campaignId), clock);
    getLogger().debug({ campaignId, clock }, "setWorldClock");
}

// ── Agenda sorted set ─────────────────────────────────────────────────────────

/** Add a single agenda event to the campaign's ZSET, scored by game-clock minutes. */
export async function scheduleAgendaEvent(
    redis: Redis,
    campaignId: string,
    eventId: string,
    firesAtClock: number,
): Promise<void> {
    await redis.zadd(agendaKey(campaignId), firesAtClock, eventId);
    getLogger().debug({ campaignId, eventId, firesAtClock }, "scheduleAgendaEvent");
}

/** Return all event IDs whose fires_at_clock <= currentClock (due to fire). */
export async function pollDueAgendaEvents(redis: Redis, campaignId: string, currentClock: number): Promise<string[]> {
    return redis.zrangebyscore(agendaKey(campaignId), 0, currentClock);
}

/** Remove a single agenda event by ID after it has been successfully processed.
 * Prefer this over removeFiredAgendaEvents in the server tick loop — removes one
 * event at a time so a processing failure leaves unprocessed events in the set for
 * retry on the next tick. */
export async function removeAgendaEvent(redis: Redis, campaignId: string, eventId: string): Promise<void> {
    await redis.zrem(agendaKey(campaignId), eventId);
}

/** Bulk-remove all events up to and including upToClock. Only safe to call after
 * every event in the range has been processed successfully. Use removeAgendaEvent
 * per-event if partial failure is possible. */
export async function removeFiredAgendaEvents(redis: Redis, campaignId: string, upToClock: number): Promise<void> {
    await redis.zremrangebyscore(agendaKey(campaignId), 0, upToClock);
}

/**
 * Rebuild the agenda sorted set from Postgres rows on server restart.
 * Clears the existing key first, then bulk-inserts all pending events.
 */
export async function rebuildAgendaFromDb(
    redis: Redis,
    campaignId: string,
    pendingEvents: Array<{ id: string; fires_at_clock: number }>,
): Promise<void> {
    const key = agendaKey(campaignId);
    await redis.del(key);
    if (pendingEvents.length === 0) return;
    // zadd accepts score/member pairs as a flat list
    const args = pendingEvents.flatMap((e) => [e.fires_at_clock, e.id]) as (string | number)[];
    await redis.zadd(key, ...args);
    getLogger().debug({ campaignId, count: pendingEvents.length }, "rebuildAgendaFromDb");
}

// ── Active effects (per encounter, per entity) ────────────────────────────────

/** Fetch the JSON-encoded active effect list for an entity in an encounter. Returns [] if none. */
export async function getEntityEffects(redis: Redis, encounterId: string, entityId: string): Promise<unknown[]> {
    const raw = await redis.hget(effectsKey(encounterId), entityId);
    if (!raw) {
        getLogger().debug({ encounterId, entityId }, "getEntityEffects: no effects found");
        return [];
    }
    try {
        const effects = JSON.parse(raw) as unknown[];
        getLogger().debug({ encounterId, entityId, count: effects.length }, "getEntityEffects");
        return effects;
    } catch {
        // Malformed data — treat as empty. Can happen if the process died mid-write.
        // The engine re-applies effects from its own state on the next action.
        return [];
    }
}

/** Write the active effect list for an entity. Overwrites the previous value. */
export async function setEntityEffects(
    redis: Redis,
    encounterId: string,
    entityId: string,
    effects: unknown[],
): Promise<void> {
    const key = effectsKey(encounterId);
    const pipeline = redis.pipeline();
    pipeline.hset(key, entityId, JSON.stringify(effects));
    pipeline.expire(key, EFFECTS_TTL_SECONDS);
    await pipeline.exec();
    getLogger().debug({ encounterId, entityId, count: effects.length }, "setEntityEffects");
}

/** Delete the entire effects hash for an encounter (called on encounter end). */
export async function clearEncounterEffects(redis: Redis, encounterId: string): Promise<void> {
    await redis.del(effectsKey(encounterId));
}

// ── Turn resources (per character) ────────────────────────────────────────────

/**
 * Fetch a character's current-turn action resource hash and parse it into `ActionResources`.
 * Redis stores all hash values as strings; this function coerces them to the typed shape.
 * Returns max-budget defaults when the key is absent (cleared between turns).
 */
export async function getTurnResources(redis: Redis, characterId: string): Promise<ActionResources> {
    const raw = await redis.hgetall(turnResourcesKey(characterId));
    if (Object.keys(raw).length === 0) {
        getLogger().warn({ characterId }, "getTurnResources: key absent — returning defaults");
    } else {
        getLogger().debug({ characterId }, "getTurnResources");
    }
    return {
        movement_remaining: raw.movement_remaining !== undefined ? Number(raw.movement_remaining) : 0,
        actions_remaining: raw.actions_remaining !== undefined ? Number(raw.actions_remaining) : 1,
        bonus_action_used: raw.bonus_action_used === "true",
        reaction_used: raw.reaction_used === "true",
        free_interaction_used: raw.free_interaction_used === "true",
        attacks_remaining: raw.attacks_remaining !== undefined ? Number(raw.attacks_remaining) : 0,
    };
}

/** Write a character's current-turn action resources. Stringifies all values for Redis HSET. */
export async function setTurnResourcesTyped(
    redis: Redis,
    characterId: string,
    resources: ActionResources,
): Promise<void> {
    const stringified: Record<string, string> = {
        movement_remaining: String(resources.movement_remaining),
        actions_remaining: String(resources.actions_remaining),
        bonus_action_used: String(resources.bonus_action_used),
        reaction_used: String(resources.reaction_used),
        free_interaction_used: String(resources.free_interaction_used),
        attacks_remaining: String(resources.attacks_remaining),
    };
    await setTurnResources(redis, characterId, stringified);
}

/** Write a character's current-turn action resources. Overwrites the previous value. */
export async function setTurnResources(
    redis: Redis,
    characterId: string,
    resources: Record<string, string>,
): Promise<void> {
    const key = turnResourcesKey(characterId);
    const pipeline = redis.pipeline();
    pipeline.hset(key, resources);
    pipeline.expire(key, TURN_RESOURCES_TTL_SECONDS);
    await pipeline.exec();
    getLogger().debug({ characterId }, "setTurnResources");
}

/** Delete a character's turn resources hash (called on turn end). */
export async function clearTurnResources(redis: Redis, characterId: string): Promise<void> {
    await redis.del(turnResourcesKey(characterId));
}
