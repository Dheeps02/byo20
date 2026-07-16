/**
 * PostgresVectorStore — IVectorStore backed by pgvector in byo20_server.
 *
 * Similarity search uses pgvector's cosine distance operator `<=>`.
 * Lower <=> score = more similar. ORDER BY ASC + LIMIT topK gives the
 * closest matches.
 *
 * Embeddings are always 768-dimensional (nomic-embed-text via bundled Ollama).
 * The vector is serialized as '[0.1,0.2,...]' for the Postgres wire format.
 */
import { eq, sql } from 'drizzle-orm'
import type { IVectorStore } from '@byo20/shared'
import type { ServerDb } from './client'
import { npc_memories } from './schema/server/memory'
import { faction_events } from './schema/server/memory'

type Db = ServerDb['db']
type Row = Record<string, unknown>

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

export class PostgresVectorStore implements IVectorStore {
  constructor(private db: Db) {}

  // ── NPC memory ─────────────────────────────────────────────────────────────

  async upsertMemory(memory: Row): Promise<void> {
    const v = memory as typeof npc_memories.$inferInsert
    await this.db.insert(npc_memories).values(v)
      .onConflictDoUpdate({
        target: npc_memories.id,
        set: (({ id: _id, ...rest }) => rest)(memory) as typeof npc_memories.$inferInsert,
      })
  }

  async queryMemories(npcId: string, queryEmbedding: number[], topK: number): Promise<Row[]> {
    const vecLiteral = toVectorLiteral(queryEmbedding)
    // <=> is cosine distance; lower = more similar
    return this.db.select().from(npc_memories)
      .where(eq(npc_memories.npc_id, npcId))
      .orderBy(sql`${npc_memories.embedding} <=> ${vecLiteral}::vector`)
      .limit(topK) as Promise<Row[]>
  }

  // ── Faction event memory ───────────────────────────────────────────────────

  async upsertFactionEvent(event: Row): Promise<void> {
    const v = event as typeof faction_events.$inferInsert
    await this.db.insert(faction_events).values(v)
      .onConflictDoUpdate({
        target: faction_events.id,
        set: (({ id: _id, ...rest }) => rest)(event) as typeof faction_events.$inferInsert,
      })
  }

  async queryFactionEvents(factionId: string, queryEmbedding: number[], topK: number): Promise<Row[]> {
    const vecLiteral = toVectorLiteral(queryEmbedding)
    return this.db.select().from(faction_events)
      .where(eq(faction_events.faction_id, factionId))
      .orderBy(sql`${faction_events.embedding} <=> ${vecLiteral}::vector`)
      .limit(topK) as Promise<Row[]>
  }
}
