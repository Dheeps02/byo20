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
import Redis from 'ioredis'

/** Safety-net TTL for combat keys. If an encounter or turn ends without the server
 * calling the clear* helpers (e.g. crash mid-combat), these keys auto-expire rather
 * than leaking in Redis forever. 24h is generous enough to survive any realistic
 * session pause; real cleanup always happens via clearEncounterEffects / clearTurnResources. */
const EFFECTS_TTL_SECONDS = 86_400
/** Safety-net TTL for turn resource keys. Matches EFFECTS_TTL_SECONDS for the same reason. */
const TURN_RESOURCES_TTL_SECONDS = 86_400

/** Create an ioredis client. Connects lazily on first command. */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,        // don't connect until first command
    maxRetriesPerRequest: 3,
  })
}

// ── Key builders ──────────────────────────────────────────────────────────────

/** Redis key for a campaign's villain agenda sorted set. */
export const agendaKey = (campaignId: string) => `campaign:${campaignId}:agenda`
/** Redis key for an encounter's active effects hash. */
export const effectsKey = (encounterId: string) => `encounter:${encounterId}:effects`
/** Redis key for a character's current-turn action resources hash. */
export const turnResourcesKey = (characterId: string) => `character:${characterId}:turn_resources`
/** Redis key for a campaign's world clock string. */
export const worldClockKey = (campaignId: string) => `world:${campaignId}:clock`

// ── World clock ───────────────────────────────────────────────────────────────

/** Read the current in-game world clock (minutes elapsed). Returns 0 if unset. */
export async function getWorldClock(redis: Redis, campaignId: string): Promise<number> {
  const val = await redis.get(worldClockKey(campaignId))
  return val ? parseInt(val, 10) : 0
}

/** Write the current in-game world clock (minutes elapsed). */
export async function setWorldClock(redis: Redis, campaignId: string, clock: number): Promise<void> {
  await redis.set(worldClockKey(campaignId), clock)
}

// ── Agenda sorted set ─────────────────────────────────────────────────────────

/** Add a single agenda event to the campaign's ZSET, scored by game-clock minutes. */
export async function scheduleAgendaEvent(
  redis: Redis,
  campaignId: string,
  eventId: string,
  firesAtClock: number,
): Promise<void> {
  await redis.zadd(agendaKey(campaignId), firesAtClock, eventId)
}

/** Return all event IDs whose fires_at_clock <= currentClock (due to fire). */
export async function pollDueAgendaEvents(
  redis: Redis,
  campaignId: string,
  currentClock: number,
): Promise<string[]> {
  return redis.zrangebyscore(agendaKey(campaignId), 0, currentClock)
}

/** Remove a single agenda event by ID after it has been successfully processed.
 * Prefer this over removeFiredAgendaEvents in the server tick loop — removes one
 * event at a time so a processing failure leaves unprocessed events in the set for
 * retry on the next tick. */
export async function removeAgendaEvent(
  redis: Redis,
  campaignId: string,
  eventId: string,
): Promise<void> {
  await redis.zrem(agendaKey(campaignId), eventId)
}

/** Bulk-remove all events up to and including upToClock. Only safe to call after
 * every event in the range has been processed successfully. Use removeAgendaEvent
 * per-event if partial failure is possible. */
export async function removeFiredAgendaEvents(
  redis: Redis,
  campaignId: string,
  upToClock: number,
): Promise<void> {
  await redis.zremrangebyscore(agendaKey(campaignId), 0, upToClock)
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
  const key = agendaKey(campaignId)
  await redis.del(key)
  if (pendingEvents.length === 0) return
  // zadd accepts score/member pairs as a flat list
  const args = pendingEvents.flatMap(e => [e.fires_at_clock, e.id]) as (string | number)[]
  await redis.zadd(key, ...args)
}

// ── Active effects (per encounter, per entity) ────────────────────────────────

/** Fetch the JSON-encoded active effect list for an entity in an encounter. Returns [] if none. */
export async function getEntityEffects(
  redis: Redis,
  encounterId: string,
  entityId: string,
): Promise<unknown[]> {
  const raw = await redis.hget(effectsKey(encounterId), entityId)
  if (!raw) return []
  try {
    return JSON.parse(raw) as unknown[]
  } catch {
    // Malformed data — treat as empty. Can happen if the process died mid-write.
    // The engine re-applies effects from its own state on the next action.
    return []
  }
}

/** Write the active effect list for an entity. Overwrites the previous value. */
export async function setEntityEffects(
  redis: Redis,
  encounterId: string,
  entityId: string,
  effects: unknown[],
): Promise<void> {
  const key = effectsKey(encounterId)
  const pipeline = redis.pipeline()
  pipeline.hset(key, entityId, JSON.stringify(effects))
  pipeline.expire(key, EFFECTS_TTL_SECONDS)
  await pipeline.exec()
}

/** Delete the entire effects hash for an encounter (called on encounter end). */
export async function clearEncounterEffects(redis: Redis, encounterId: string): Promise<void> {
  await redis.del(effectsKey(encounterId))
}

// ── Turn resources (per character) ────────────────────────────────────────────

/** Fetch a character's current-turn action resource hash. Returns {} if not set.
 * An empty object means all resources are available — the engine treats a missing
 * key as "at maximum". clearTurnResources deletes the hash rather than resetting
 * fields, which is equivalent to a full refresh by this convention. */
export async function getTurnResources(redis: Redis, characterId: string): Promise<Record<string, string>> {
  return redis.hgetall(turnResourcesKey(characterId))
}

/** Write a character's current-turn action resources. Overwrites the previous value. */
export async function setTurnResources(
  redis: Redis,
  characterId: string,
  resources: Record<string, string>,
): Promise<void> {
  const key = turnResourcesKey(characterId)
  const pipeline = redis.pipeline()
  pipeline.hset(key, resources)
  pipeline.expire(key, TURN_RESOURCES_TTL_SECONDS)
  await pipeline.exec()
}

/** Delete a character's turn resources hash (called on turn end). */
export async function clearTurnResources(redis: Redis, characterId: string): Promise<void> {
  await redis.del(turnResourcesKey(characterId))
}
