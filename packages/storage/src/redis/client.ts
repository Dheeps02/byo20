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

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,        // don't connect until first command
    maxRetriesPerRequest: 3,
  })
}

// ── Key builders ──────────────────────────────────────────────────────────────

export const agendaKey = (campaignId: string) => `campaign:${campaignId}:agenda`
export const effectsKey = (encounterId: string) => `encounter:${encounterId}:effects`
export const turnResourcesKey = (characterId: string) => `character:${characterId}:turn_resources`
export const worldClockKey = (campaignId: string) => `world:${campaignId}:clock`

// ── World clock ───────────────────────────────────────────────────────────────

export async function getWorldClock(redis: Redis, campaignId: string): Promise<number> {
  const val = await redis.get(worldClockKey(campaignId))
  return val ? parseInt(val, 10) : 0
}

export async function setWorldClock(redis: Redis, campaignId: string, clock: number): Promise<void> {
  await redis.set(worldClockKey(campaignId), clock)
}

// ── Agenda sorted set ─────────────────────────────────────────────────────────

// Add a single agenda event to the sorted set.
export async function scheduleAgendaEvent(
  redis: Redis,
  campaignId: string,
  eventId: string,
  firesAtClock: number,
): Promise<void> {
  await redis.zadd(agendaKey(campaignId), firesAtClock, eventId)
}

// Return all event IDs whose fires_at_clock <= currentClock (i.e. due to fire).
export async function pollDueAgendaEvents(
  redis: Redis,
  campaignId: string,
  currentClock: number,
): Promise<string[]> {
  return redis.zrangebyscore(agendaKey(campaignId), 0, currentClock)
}

// Remove fired events from the sorted set.
export async function removeFiredAgendaEvents(
  redis: Redis,
  campaignId: string,
  upToClock: number,
): Promise<void> {
  await redis.zremrangebyscore(agendaKey(campaignId), 0, upToClock)
}

// Rebuild the sorted set from Postgres rows on server restart.
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

export async function getEntityEffects(
  redis: Redis,
  encounterId: string,
  entityId: string,
): Promise<unknown[]> {
  const raw = await redis.hget(effectsKey(encounterId), entityId)
  return raw ? (JSON.parse(raw) as unknown[]) : []
}

export async function setEntityEffects(
  redis: Redis,
  encounterId: string,
  entityId: string,
  effects: unknown[],
): Promise<void> {
  await redis.hset(effectsKey(encounterId), entityId, JSON.stringify(effects))
}

export async function clearEncounterEffects(redis: Redis, encounterId: string): Promise<void> {
  await redis.del(effectsKey(encounterId))
}

// ── Turn resources (per character) ────────────────────────────────────────────

export async function getTurnResources(redis: Redis, characterId: string): Promise<Record<string, string>> {
  return redis.hgetall(turnResourcesKey(characterId))
}

export async function setTurnResources(
  redis: Redis,
  characterId: string,
  resources: Record<string, string>,
): Promise<void> {
  await redis.hset(turnResourcesKey(characterId), resources)
}

export async function clearTurnResources(redis: Redis, characterId: string): Promise<void> {
  await redis.del(turnResourcesKey(characterId))
}
