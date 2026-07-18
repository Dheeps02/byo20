/**
 * Storage interface contracts — implemented by @byo20/storage, consumed by @byo20/engine.
 *
 * All `Row = Record<string, unknown>` placeholders have been replaced with the concrete
 * domain types from `./domain`. The storage layer is responsible for mapping between
 * flat Drizzle row shapes and these nested domain types.
 */
import type {
  Campaign,
  Character, CharacterIdentity, CharacterCampaignState, CharacterClass,
  Encounter, InitiativeEntry,
  NPC,
  Faction, FactionReputation,
  Item, Container,
  Quest,
  WorldZone, WorldObject,
  Session, Snapshot, SnapshotTrigger,
  EventLogEntry, CombatLogEntry, NPCDialogueEntry, PartyChatEntry,
} from './domain'
import type { NPCMemory, FactionEvent } from './domain'

// ── IGameStateStore ────────────────────────────────────────────────────────────

/**
 * Typed query interface over byo20_server Postgres.
 * Follows the write-through pattern: callers must await the save before emitting
 * any WS events — no state change reaches clients without a committed DB write.
 */
export interface IGameStateStore {
  // ── Campaigns ─────────────────────────────────────────────────────────────
  /** Fetch a campaign by UUID. Throws if not found. */
  getCampaign(id: string): Promise<Campaign>
  /** Upsert a campaign. INSERT … ON CONFLICT DO UPDATE. */
  saveCampaign(campaign: Campaign): Promise<void>

  // ── Characters — engine-facing merged view ────────────────────────────────
  /**
   * Fetch a character by UUID + campaign, returning the merged engine-facing type.
   * JOINs `characters` + `character_campaign_state` + `character_classes`.
   */
  getCharacter(id: string, campaignId: string): Promise<Character>
  /**
   * Upsert a character.
   * Splits the merged `Character` back into the three underlying tables and upserts each.
   */
  saveCharacter(character: Character): Promise<void>

  // ── Character identity (portable, pre-campaign) ───────────────────────────
  /** Fetch a character's portable identity by UUID. Throws if not found. */
  getCharacterIdentity(id: string): Promise<CharacterIdentity>
  /** Upsert a character identity row. */
  saveCharacterIdentity(identity: CharacterIdentity): Promise<void>

  // ── Character campaign state (standalone) ─────────────────────────────────
  /** Fetch a character campaign state by its own UUID. Throws if not found. */
  getCharacterCampaignState(id: string): Promise<CharacterCampaignState>
  /** Upsert a character campaign state row. */
  saveCharacterCampaignState(state: CharacterCampaignState): Promise<void>

  // ── Character classes ─────────────────────────────────────────────────────
  /** Fetch all class rows for a character_campaign_state UUID. */
  getCharacterClasses(characterCampaignStateId: string): Promise<CharacterClass[]>
  /** Upsert a character class row. */
  saveCharacterClass(cls: CharacterClass): Promise<void>

  // ── Encounters ────────────────────────────────────────────────────────────
  /** Fetch an encounter by UUID. Throws if not found. */
  getEncounter(id: string): Promise<Encounter>
  /** Upsert an encounter. */
  saveEncounter(encounter: Encounter): Promise<void>
  /** Fetch the active encounter for a campaign, or null if not in combat. */
  getActiveEncounter(campaignId: string): Promise<Encounter | null>

  // ── Initiative ────────────────────────────────────────────────────────────
  /** Fetch all initiative entries for an encounter. */
  getInitiativeEntries(encounterId: string): Promise<InitiativeEntry[]>
  /** Upsert an initiative entry. */
  saveInitiativeEntry(entry: InitiativeEntry): Promise<void>

  // ── NPCs ──────────────────────────────────────────────────────────────────
  /** Fetch an NPC by UUID. Throws if not found. */
  getNPC(id: string): Promise<NPC>
  /** Upsert an NPC. */
  saveNPC(npc: NPC): Promise<void>
  /** Fetch all NPCs whose JSONB location->>'zone_id' matches zoneId within a campaign. */
  getNPCsInZone(campaignId: string, zoneId: string): Promise<NPC[]>

  // ── Factions ──────────────────────────────────────────────────────────────
  /** Fetch a faction by UUID. Throws if not found. */
  getFaction(id: string): Promise<Faction>
  /** Fetch a character's reputation row with a specific faction. Throws if not found. */
  getFactionReputation(characterCampaignStateId: string, factionId: string): Promise<FactionReputation>
  /** Upsert a faction reputation row. */
  saveFactionReputation(rep: FactionReputation): Promise<void>

  // ── Items ─────────────────────────────────────────────────────────────────
  /** Fetch all items owned by an entity within a campaign. */
  getItems(campaignId: string, ownerId: string): Promise<Item[]>
  /** Upsert an item (base row + stats extension row). */
  saveItem(item: Item): Promise<void>
  /** Update an item's owner_id and owner_type. Used for loot distribution and trades. */
  transferItem(itemId: string, newOwnerId: string, newOwnerType: string): Promise<void>

  // ── Containers ────────────────────────────────────────────────────────────
  /** Fetch a container by UUID. Throws if not found. */
  getContainer(id: string): Promise<Container>
  /** Upsert a container. */
  saveContainer(container: Container): Promise<void>

  // ── Quests ────────────────────────────────────────────────────────────────
  /** Fetch a quest by UUID. Throws if not found. */
  getQuest(id: string): Promise<Quest>
  /** Upsert a quest. */
  saveQuest(quest: Quest): Promise<void>
  /** Fetch all quests with state='active' for a campaign. */
  getActiveQuests(campaignId: string): Promise<Quest[]>

  // ── World zones ───────────────────────────────────────────────────────────
  /** Fetch a world zone by UUID. Throws if not found. */
  getWorldZone(id: string): Promise<WorldZone>
  /** Upsert a world zone. */
  saveWorldZone(zone: WorldZone): Promise<void>

  // ── World objects ─────────────────────────────────────────────────────────
  /** Fetch all world objects in a hex zone within a campaign. */
  getWorldObjects(campaignId: string, zoneQ: number, zoneR: number): Promise<WorldObject[]>
  /** Upsert a world object. */
  saveWorldObject(obj: WorldObject): Promise<void>

  // ── Append-only logs ──────────────────────────────────────────────────────
  /** Append a row to event_log. Never updated or deleted. */
  appendEventLog(entry: EventLogEntry): Promise<void>
  /** Append a row to combat_log. Never updated or deleted. */
  appendCombatLog(entry: CombatLogEntry): Promise<void>
  /** Append a row to npc_dialogue_log. Never updated or deleted. */
  appendNPCDialogue(entry: NPCDialogueEntry): Promise<void>
  /** Append a row to party_chat_log. Never updated or deleted. */
  appendPartyChat(entry: PartyChatEntry): Promise<void>

  // ── Snapshots ─────────────────────────────────────────────────────────────
  /**
   * Snapshot the full mutable campaign state.
   * Maintains a rolling window of 10 — evicts the oldest if at capacity.
   */
  createSnapshot(campaignId: string, trigger: SnapshotTrigger, triggerRef: string | null, label: string): Promise<void>
  /** Fetch all snapshots for a campaign, oldest first. */
  getSnapshots(campaignId: string): Promise<Snapshot[]>
  /**
   * Restore campaign state from a snapshot.
   * Deletes all current mutable state then re-inserts snapshot rows in FK order.
   */
  rollbackToSnapshot(snapshotId: string): Promise<void>

  // ── Sessions ──────────────────────────────────────────────────────────────
  /** Insert a new session row and return it. */
  createSession(campaignId: string): Promise<Session>
  /** Set ended_at and summary on a session row. */
  endSession(sessionId: string, summary: string): Promise<void>
}

// ── IVectorStore ───────────────────────────────────────────────────────────────

/**
 * Vector similarity search interface over pgvector columns.
 * All embeddings are 768-dimensional (nomic-embed-text via bundled Ollama).
 *
 * Query methods accept a `context` string rather than a pre-computed embedding —
 * the implementation is responsible for generating the embedding via Ollama before
 * running the cosine search. This keeps embedding logic out of callers.
 */
export interface IVectorStore {
  // ── NPC memory ─────────────────────────────────────────────────────────────
  /** Upsert an NPC memory row including its 768-dim embedding. */
  upsertMemory(memory: NPCMemory): Promise<void>
  /** Return the topK most semantically similar NPC memories by cosine distance. */
  queryMemories(npcId: string, context: string, topK: number): Promise<NPCMemory[]>

  // ── Faction event memory ───────────────────────────────────────────────────
  /** Upsert a faction event row including its 768-dim embedding. */
  upsertFactionEvent(event: FactionEvent): Promise<void>
  /** Return the topK most semantically similar faction events by cosine distance. */
  queryFactionEvents(factionId: string, context: string, topK: number): Promise<FactionEvent[]>
}
