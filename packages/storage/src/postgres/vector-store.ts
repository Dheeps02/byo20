import type { FactionEvent, IVectorStore, LoreEntry, NPCMemory } from "@byo20/shared";
/**
 * PostgresVectorStore — IVectorStore backed by pgvector in byo20_server.
 *
 * Similarity search uses pgvector's cosine distance operator `<=>`.
 * Lower <=> score = more similar. ORDER BY ASC + LIMIT topK gives the closest matches.
 *
 * Embeddings are always 768-dimensional (nomic-embed-text via bundled Ollama).
 * The `vector` custom type already deserializes wire format to `number[]`.
 *
 * Query methods accept a `context` string per the IVectorStore interface.
 * Embedding generation is not yet implemented — these methods currently return
 * rows ordered by creation time until the Ollama embedding helper is wired up.
 * TODO: inject an embedding fn and replace the fallback ordering with cosine search.
 *
 * Lore entry methods (`upsertLoreEntry`, `queryLoreEntries`) are NOT part of
 * IVectorStore — they are available on this class directly for direct use by
 * the world-gen pipeline until the interface is extended.
 */
import { desc, eq, sql } from "drizzle-orm";
import type { ServerDb } from "./client";
import { faction_events, lore_entries, npc_memories } from "./schema/server/memory";

/** Drizzle DB reference for byo20_server. */
type Db = ServerDb["db"];

/** Serialize a float array to pgvector's '[x,y,z,...]' wire format. */
function toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
}

/** Map a `memory.npc_memories` row to `NPCMemory`. */
function rowToNPCMemory(row: typeof npc_memories.$inferSelect): NPCMemory {
    return {
        id: row.id,
        npcId: row.npc_id,
        eventLogId: row.event_log_id,
        questId: row.quest_id ?? null,
        embedding: row.embedding,
        sentiment: row.sentiment as NPCMemory["sentiment"],
        significance: row.significance,
        createdAtClock: row.created_at_clock,
    };
}

/** Map a `memory.faction_events` row to `FactionEvent`. */
function rowToFactionEvent(row: typeof faction_events.$inferSelect): FactionEvent {
    return {
        id: row.id,
        factionId: row.faction_id,
        eventLogId: row.event_log_id,
        questId: row.quest_id ?? null,
        embedding: row.embedding,
        repDelta: row.rep_delta,
        createdAtClock: row.created_at_clock,
    };
}

/** Map a `memory.lore_entries` row to `LoreEntry`. */
function rowToLoreEntry(row: typeof lore_entries.$inferSelect): LoreEntry {
    return {
        id: row.id,
        campaignId: row.campaign_id,
        title: row.title,
        content: row.content,
        embedding: row.embedding,
        category: row.category as LoreEntry["category"],
        sourceId: row.source_id ?? null,
        sourceType: (row.source_type as LoreEntry["sourceType"]) ?? null,
        createdAt: row.created_at,
    };
}

/** IVectorStore implementation backed by pgvector cosine similarity search. */
export class PostgresVectorStore implements IVectorStore {
    constructor(private db: Db) {}

    // ── NPC memory ─────────────────────────────────────────────────────────────

    /** Upsert an NPC memory row. Conflict target is the row's own UUID. */
    async upsertMemory(memory: NPCMemory): Promise<void> {
        const row: typeof npc_memories.$inferInsert = {
            id: memory.id,
            npc_id: memory.npcId,
            event_log_id: memory.eventLogId,
            quest_id: memory.questId ?? undefined,
            embedding: memory.embedding,
            sentiment: memory.sentiment,
            significance: memory.significance,
            created_at_clock: memory.createdAtClock,
        };
        const { id: _id, ...rest } = row;
        await this.db.insert(npc_memories).values(row).onConflictDoUpdate({ target: npc_memories.id, set: rest });
    }

    /**
     * Return the topK NPC memories for an NPC, ordered by cosine distance to context.
     * Falls back to most-recent ordering until embedding generation is wired.
     * TODO: generate embedding from context string via Ollama, then use <=> cosine search.
     */
    async queryMemories(npcId: string, _context: string, topK: number): Promise<NPCMemory[]> {
        const rows = await this.db
            .select()
            .from(npc_memories)
            .where(eq(npc_memories.npc_id, npcId))
            .orderBy(desc(npc_memories.created_at_clock))
            .limit(topK);
        return rows.map(rowToNPCMemory);
    }

    /** Cosine search NPC memories using a pre-computed embedding. */
    async queryMemoriesByEmbedding(npcId: string, queryEmbedding: number[], topK: number): Promise<NPCMemory[]> {
        const vecLiteral = toVectorLiteral(queryEmbedding);
        const rows = await this.db
            .select()
            .from(npc_memories)
            .where(eq(npc_memories.npc_id, npcId))
            .orderBy(sql`${npc_memories.embedding} <=> ${vecLiteral}::vector`)
            .limit(topK);
        return rows.map(rowToNPCMemory);
    }

    // ── Faction event memory ───────────────────────────────────────────────────

    /** Upsert a faction event row. Conflict target is the row's own UUID. */
    async upsertFactionEvent(event: FactionEvent): Promise<void> {
        const row: typeof faction_events.$inferInsert = {
            id: event.id,
            faction_id: event.factionId,
            event_log_id: event.eventLogId,
            quest_id: event.questId ?? undefined,
            embedding: event.embedding,
            rep_delta: event.repDelta,
            created_at_clock: event.createdAtClock,
        };
        const { id: _id, ...rest } = row;
        await this.db.insert(faction_events).values(row).onConflictDoUpdate({ target: faction_events.id, set: rest });
    }

    /**
     * Return the topK faction events for a faction, ordered by cosine distance to context.
     * Falls back to most-recent ordering until embedding generation is wired.
     * TODO: generate embedding from context string via Ollama, then use <=> cosine search.
     */
    async queryFactionEvents(factionId: string, _context: string, topK: number): Promise<FactionEvent[]> {
        const rows = await this.db
            .select()
            .from(faction_events)
            .where(eq(faction_events.faction_id, factionId))
            .orderBy(desc(faction_events.created_at_clock))
            .limit(topK);
        return rows.map(rowToFactionEvent);
    }

    /** Cosine search faction events using a pre-computed embedding. */
    async queryFactionEventsByEmbedding(
        factionId: string,
        queryEmbedding: number[],
        topK: number,
    ): Promise<FactionEvent[]> {
        const vecLiteral = toVectorLiteral(queryEmbedding);
        const rows = await this.db
            .select()
            .from(faction_events)
            .where(eq(faction_events.faction_id, factionId))
            .orderBy(sql`${faction_events.embedding} <=> ${vecLiteral}::vector`)
            .limit(topK);
        return rows.map(rowToFactionEvent);
    }

    // ── Lore entries (Epic campaigns only) ────────────────────────────────────

    /** Upsert a lore entry row. Conflict target is the row's own UUID. */
    async upsertLoreEntry(entry: LoreEntry): Promise<void> {
        const row: typeof lore_entries.$inferInsert = {
            id: entry.id,
            campaign_id: entry.campaignId,
            title: entry.title,
            content: entry.content,
            embedding: entry.embedding,
            category: entry.category,
            source_id: entry.sourceId ?? undefined,
            source_type: entry.sourceType ?? undefined,
            created_at: entry.createdAt,
        };
        const { id: _id, ...rest } = row;
        await this.db.insert(lore_entries).values(row).onConflictDoUpdate({ target: lore_entries.id, set: rest });
    }

    /** Return the topK lore entries for a campaign closest to queryEmbedding by cosine distance. */
    async queryLoreEntries(campaignId: string, queryEmbedding: number[], topK: number): Promise<LoreEntry[]> {
        const vecLiteral = toVectorLiteral(queryEmbedding);
        const rows = await this.db
            .select()
            .from(lore_entries)
            .where(eq(lore_entries.campaign_id, campaignId))
            .orderBy(sql`${lore_entries.embedding} <=> ${vecLiteral}::vector`)
            .limit(topK);
        return rows.map(rowToLoreEntry);
    }
}
