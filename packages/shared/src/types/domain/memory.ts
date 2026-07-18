/**
 * Domain types for AI semantic memory tables.
 *
 * All embeddings are 768-dimensional (nomic-embed-text via bundled Ollama).
 * The `vector` custom type in storage already deserializes from Postgres wire
 * format to `number[]`, so this type uses `number[]` directly.
 */

/** Sentiment polarity attached to an NPC memory. */
export type MemorySentiment = 'positive' | 'negative' | 'neutral'

/** Category of a lore entry — drives which AI context slot it fills. */
export type LoreCategory =
  | 'faction_history'
  | 'world_history'
  | 'location_lore'
  | 'npc_backstory'
  | 'prophecy'

/**
 * Maps to `memory.npc_memories`.
 * `significance = true` pins the memory — it skips the temporal decay filter.
 * `createdAtClock` is the in-game world clock (minutes) at creation, used for decay.
 */
export interface NPCMemory {
  id: string
  npcId: string
  eventLogId: string
  questId: string | null
  /** 768-dim embedding (nomic-embed-text). Deserialized to number[] by the vector custom type. */
  embedding: number[]
  sentiment: MemorySentiment
  /** true = pin; skips temporal decay in recall queries. */
  significance: boolean
  createdAtClock: number
}

/**
 * Maps to `memory.faction_events`.
 * `repDelta` tracks reputation change caused by this event — used by the drift computation.
 */
export interface FactionEvent {
  id: string
  factionId: string
  eventLogId: string
  questId: string | null
  /** 768-dim embedding. */
  embedding: number[]
  repDelta: number
  createdAtClock: number
}

/**
 * Maps to `memory.lore_entries`.
 * Only populated for `world_depth = 'epic'` campaigns.
 * The Orchestrator queries this table to inject relevant lore into Specialist calls.
 */
export interface LoreEntry {
  id: string
  campaignId: string
  title: string
  content: string
  /** 768-dim embedding. */
  embedding: number[]
  category: LoreCategory
  sourceId: string | null
  sourceType: 'faction' | 'npc' | 'zone' | null
  createdAt: Date
}
