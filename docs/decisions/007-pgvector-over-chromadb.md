# 007 — pgvector over ChromaDB v1.0.0

## Status
Accepted

## Context

BYO20 needs vector similarity search for two purposes: NPC memory retrieval (the NPC Specialist queries an NPC's memory store by semantic similarity when generating dialogue) and faction event memory (similar semantic recall for faction context). Both use decay-weighted ranking computed at query time over `vector(1536)` embeddings.

The question was where to run that vector search — in the existing Postgres instance or in a separate dedicated vector database.

## Decision

pgvector extension inside the existing `byo20_server` Postgres instance. The `npc_memories` and `faction_events` tables carry a `vector(1536)` embedding column. Similarity search runs as a Postgres query with cosine distance ordering.

## Alternatives Considered

**ChromaDB** — A dedicated vector database. Rejected because it would be a fourth sidecar process the Electron main process needs to spawn, monitor, and clean up. BYO20 already manages three sidecars (`byo20_server` Postgres, `byo20_local` Postgres, Redis). Adding a fourth increases operational complexity for self-hosters and adds another thing that can fail. The query volume doesn't justify it — NPC memory lookups are infrequent relative to a production RAG pipeline.

## Consequences

- One fewer sidecar. Electron main process has three to manage, not four.
- Vector search is co-located with relational data — a single Postgres query can join NPC records, their memories, and apply decay-weighted ranking in one round-trip.
- pgvector's performance at the expected scale (hundreds to low thousands of memory entries per NPC) is sufficient. Approximate nearest-neighbor indexes (IVFFlat, HNSW) are available if needed at larger scale.
- Simpler self-hosting story: one Postgres instance holds game state, relational data, and vector search. No separate vector DB to explain or troubleshoot.
