/**
 * Storage interface contracts — implemented by @byo20/storage, consumed by @byo20/engine.
 *
 * Return types use `Row` (a plain record) as a temporary alias. Each will be replaced
 * with a concrete domain type during the schema implementation step, once Drizzle
 * infers the column shapes. TypeScript's structural typing means the implementation
 * will satisfy these interfaces as long as the shapes match — no explicit mapping needed.
 *
 * IDs are always `string` (UUID) — that part is typed correctly now.
 */

/** Temporary alias for a fully-typed DB row. Replaced with concrete domain types once Drizzle column shapes are inferred. */
type Row = Record<string, unknown>

// ── IGameStateStore ────────────────────────────────────────────────────────────

/**
 * Typed query interface over byo20_server Postgres.
 * Follows the write-through pattern: callers must await the save before emitting
 * any WS events — no state change reaches clients without a committed DB write.
 */
export interface IGameStateStore {
  // Campaigns
  /** Fetch a campaign row by UUID. Throws if not found. */
  getCampaign(id: string): Promise<Row>
  /** Upsert a campaign row. INSERT … ON CONFLICT DO UPDATE — no need to distinguish create vs. update. */
  saveCampaign(campaign: Row): Promise<void>

  // Characters
  /** Fetch a character row by UUID. Throws if not found. */
  getCharacter(id: string): Promise<Row>
  /** Upsert a character row. */
  saveCharacter(character: Row): Promise<void>

  // Character campaign state
  /** Fetch a character's campaign state by its own UUID. Throws if not found. */
  getCharacterCampaignState(id: string): Promise<Row>
  /** Upsert a character campaign state row. */
  saveCharacterCampaignState(state: Row): Promise<void>

  // Character classes (one row per class the character has levels in)
  /** Fetch all class rows for a given character_campaign_state UUID. */
  getCharacterClasses(characterCampaignStateId: string): Promise<Row[]>
  /** Upsert a character class row. */
  saveCharacterClass(cls: Row): Promise<void>

  // Encounters
  /** Fetch an encounter row by UUID. Throws if not found. */
  getEncounter(id: string): Promise<Row>
  /** Upsert an encounter row. */
  saveEncounter(encounter: Row): Promise<void>
  /** Fetch the single active encounter for a campaign, or null if not in combat. */
  getActiveEncounter(campaignId: string): Promise<Row | null>

  // Initiative entries (one row per combatant)
  /** Fetch all initiative entries for an encounter, ordered by position. */
  getInitiativeEntries(encounterId: string): Promise<Row[]>
  /** Upsert an initiative entry row. */
  saveInitiativeEntry(entry: Row): Promise<void>

  // NPCs
  /** Fetch an NPC row by UUID. Throws if not found. */
  getNPC(id: string): Promise<Row>
  /** Upsert an NPC row. */
  saveNPC(npc: Row): Promise<void>
  /** Fetch all NPCs whose JSONB location->>'zone_id' matches zoneId within a campaign. */
  getNPCsInZone(campaignId: string, zoneId: string): Promise<Row[]>

  // Factions
  /** Fetch a faction row by UUID. Throws if not found. */
  getFaction(id: string): Promise<Row>
  /** Fetch a character's reputation row with a specific faction. Throws if not found. */
  getFactionReputation(characterCampaignStateId: string, factionId: string): Promise<Row>
  /** Upsert a faction reputation row. */
  saveFactionReputation(rep: Row): Promise<void>

  // Items
  /** Fetch all items owned by an entity within a campaign. */
  getItems(campaignId: string, ownerId: string): Promise<Row[]>
  /** Upsert an item row. */
  saveItem(item: Row): Promise<void>
  /** Update an item's owner_id and owner_type — used for loot distribution and trades. */
  transferItem(itemId: string, newOwnerId: string, newOwnerType: string): Promise<void>

  // Quests
  /** Fetch a quest row by UUID. Throws if not found. */
  getQuest(id: string): Promise<Row>
  /** Upsert a quest row. */
  saveQuest(quest: Row): Promise<void>
  /** Fetch all quests with state='active' for a campaign. */
  getActiveQuests(campaignId: string): Promise<Row[]>

  // World zones
  /** Fetch a world zone row by UUID. Throws if not found. */
  getWorldZone(id: string): Promise<Row>
  /** Upsert a world zone row. */
  saveWorldZone(zone: Row): Promise<void>

  // World objects
  /** Fetch all world objects in a hex zone within a campaign. */
  getWorldObjects(campaignId: string, zoneQ: number, zoneR: number): Promise<Row[]>
  /** Upsert a world object row. */
  saveWorldObject(obj: Row): Promise<void>

  // Append-only logs — these methods INSERT only, never UPDATE or DELETE
  /** Append a row to event_log. Never updated or deleted. */
  appendEventLog(entry: Row): Promise<void>
  /** Append a row to combat_log. Never updated or deleted. */
  appendCombatLog(entry: Row): Promise<void>
  /** Append a row to npc_dialogue_log. Never updated or deleted. */
  appendNPCDialogue(entry: Row): Promise<void>
  /** Append a row to party_chat_log. Never updated or deleted. */
  appendPartyChat(entry: Row): Promise<void>

  // Campaign snapshots (rolling window of 10, used for DM rollback)
  /** Snapshot the full mutable campaign state. Evicts the oldest if the rolling window of 10 is full. */
  createSnapshot(campaignId: string, triggerType: string, triggerRef: string | null, label: string): Promise<void>
  /** Fetch all snapshots for a campaign, oldest first. */
  getSnapshots(campaignId: string): Promise<Row[]>
  /** Restore campaign state from a snapshot. Deletes all current mutable state then re-inserts snapshot rows in FK order. */
  rollbackToSnapshot(snapshotId: string): Promise<void>

  // Sessions
  /** Insert a new session row and return it. */
  createSession(campaignId: string): Promise<Row>
  /** Set ended_at and summary on a session row. */
  endSession(sessionId: string, summary: string): Promise<void>
}

// ── IVectorStore ───────────────────────────────────────────────────────────────

/**
 * Vector similarity search interface over pgvector columns.
 * All embeddings are 768-dimensional — generated by BYO20's bundled Ollama
 * instance using nomic-embed-text. The implementation never calls an LLM provider.
 */
export interface IVectorStore {
  // NPC memory — semantic recall for the NPC Specialist
  /** Upsert an NPC memory row including its 768-dim embedding. */
  upsertMemory(memory: Row): Promise<void>
  /** Return the topK most semantically similar NPC memories by cosine distance. */
  queryMemories(npcId: string, queryEmbedding: number[], topK: number): Promise<Row[]>

  // Faction event memory — semantic recall for faction context
  /** Upsert a faction event row including its 768-dim embedding. */
  upsertFactionEvent(event: Row): Promise<void>
  /** Return the topK most semantically similar faction events by cosine distance. */
  queryFactionEvents(factionId: string, queryEmbedding: number[], topK: number): Promise<Row[]>

  // Lore entries — Epic campaigns only; queried by the Orchestrator for Specialist context
  /** Upsert a lore entry row including its 768-dim embedding. */
  upsertLoreEntry(entry: Row): Promise<void>
  /** Return the topK most semantically relevant lore entries for a campaign by cosine distance. */
  queryLoreEntries(campaignId: string, queryEmbedding: number[], topK: number): Promise<Row[]>
}
