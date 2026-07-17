/**
 * PostgresGameStateStore — IGameStateStore backed by byo20_server.
 *
 * All writes use upsert (INSERT … ON CONFLICT DO UPDATE) so callers don't need
 * to distinguish create vs. update. The engine always sends the full row.
 *
 * Append-only tables (event_log, combat_log, npc_dialogue_log, sessions,
 * party_chat_log) only ever receive INSERTs — no updates, no deletes.
 *
 * Row types use `Record<string, unknown>` as a temporary alias matching the
 * IGameStateStore interface. These will be replaced with concrete domain types
 * from @byo20/shared once @byo20/engine defines them.
 */
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { IGameStateStore } from '@byo20/shared'
import type { ServerDb } from './client'
import {
  campaigns, characters, character_campaign_state, character_classes,
} from './schema/server/game'
import {
  items, containers,
} from './schema/server/items'
import {
  npcs, factions, character_faction_reputation, faction_relationships,
  quests, world_zones, world_objects, campaign_agenda, campaign_milestones, narration_pool,
  campaign_snapshots,
} from './schema/server/world'
import { encounters, initiative_entries } from './schema/server/combat'
import { sessions, event_log, combat_log, npc_dialogue_log, party_chat_log } from './schema/server/log'
import { npc_memories, faction_events } from './schema/server/memory'

/** Drizzle DB reference for byo20_server. */
type Db = ServerDb['db']
/** Temporary alias for any DB row, matching IGameStateStore's Row. */
type Row = Record<string, unknown>

/**
 * Strip the `id` field from a row for use in ON CONFLICT SET clauses.
 * Prevents Drizzle from attempting to update the primary key.
 */
function withoutId(row: Row): Row {
  const { id: _id, ...rest } = row
  return rest
}

/** IGameStateStore implementation backed by byo20_server Postgres. */
export class PostgresGameStateStore implements IGameStateStore {
  constructor(private db: Db) {}

  // ── Campaigns ──────────────────────────────────────────────────────────────

  /** Fetch a campaign row by UUID. Throws if not found. */
  async getCampaign(id: string): Promise<Row> {
    const rows = await this.db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Campaign not found: ${id}`)
    return rows[0] as Row
  }

  /** Upsert a campaign row. */
  async saveCampaign(campaign: Row): Promise<void> {
    const v = campaign as typeof campaigns.$inferInsert
    await this.db.insert(campaigns).values(v)
      .onConflictDoUpdate({ target: campaigns.id, set: withoutId(campaign) as typeof campaigns.$inferInsert })
  }

  // ── Characters ─────────────────────────────────────────────────────────────

  /** Fetch a character row by UUID. Throws if not found. */
  async getCharacter(id: string): Promise<Row> {
    const rows = await this.db.select().from(characters).where(eq(characters.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Character not found: ${id}`)
    return rows[0] as Row
  }

  /** Upsert a character row. */
  async saveCharacter(character: Row): Promise<void> {
    const v = character as typeof characters.$inferInsert
    await this.db.insert(characters).values(v)
      .onConflictDoUpdate({ target: characters.id, set: withoutId(character) as typeof characters.$inferInsert })
  }

  // ── Character campaign state ───────────────────────────────────────────────

  /** Fetch a character campaign state row by its own UUID. Throws if not found. */
  async getCharacterCampaignState(id: string): Promise<Row> {
    const rows = await this.db.select().from(character_campaign_state)
      .where(eq(character_campaign_state.id, id)).limit(1)
    if (!rows[0]) throw new Error(`CharacterCampaignState not found: ${id}`)
    return rows[0] as Row
  }

  /** Upsert a character campaign state row. */
  async saveCharacterCampaignState(state: Row): Promise<void> {
    const v = state as typeof character_campaign_state.$inferInsert
    await this.db.insert(character_campaign_state).values(v)
      .onConflictDoUpdate({ target: character_campaign_state.id, set: withoutId(state) as typeof character_campaign_state.$inferInsert })
  }

  // ── Character classes ──────────────────────────────────────────────────────

  /** Fetch all class rows for a character_campaign_state UUID. */
  async getCharacterClasses(characterCampaignStateId: string): Promise<Row[]> {
    return this.db.select().from(character_classes)
      .where(eq(character_classes.character_campaign_state_id, characterCampaignStateId)) as Promise<Row[]>
  }

  /** Upsert a character class row. */
  async saveCharacterClass(cls: Row): Promise<void> {
    const v = cls as typeof character_classes.$inferInsert
    await this.db.insert(character_classes).values(v)
      .onConflictDoUpdate({ target: character_classes.id, set: withoutId(cls) as typeof character_classes.$inferInsert })
  }

  // ── Encounters ─────────────────────────────────────────────────────────────

  /** Fetch an encounter row by UUID. Throws if not found. */
  async getEncounter(id: string): Promise<Row> {
    const rows = await this.db.select().from(encounters).where(eq(encounters.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Encounter not found: ${id}`)
    return rows[0] as Row
  }

  /** Upsert an encounter row. */
  async saveEncounter(encounter: Row): Promise<void> {
    const v = encounter as typeof encounters.$inferInsert
    await this.db.insert(encounters).values(v)
      .onConflictDoUpdate({ target: encounters.id, set: withoutId(encounter) as typeof encounters.$inferInsert })
  }

  /** Fetch the single active encounter for a campaign, or null if not in combat. */
  async getActiveEncounter(campaignId: string): Promise<Row | null> {
    const rows = await this.db.select().from(encounters)
      .where(and(eq(encounters.campaign_id, campaignId), eq(encounters.status, 'active')))
      .limit(1)
    return (rows[0] as Row) ?? null
  }

  // ── Initiative entries ─────────────────────────────────────────────────────

  /** Fetch all initiative entries for an encounter. */
  async getInitiativeEntries(encounterId: string): Promise<Row[]> {
    return this.db.select().from(initiative_entries)
      .where(eq(initiative_entries.encounter_id, encounterId)) as Promise<Row[]>
  }

  /** Upsert an initiative entry row. */
  async saveInitiativeEntry(entry: Row): Promise<void> {
    const v = entry as typeof initiative_entries.$inferInsert
    await this.db.insert(initiative_entries).values(v)
      .onConflictDoUpdate({ target: initiative_entries.id, set: withoutId(entry) as typeof initiative_entries.$inferInsert })
  }

  // ── NPCs ───────────────────────────────────────────────────────────────────

  /** Fetch an NPC row by UUID. Throws if not found. */
  async getNPC(id: string): Promise<Row> {
    const rows = await this.db.select().from(npcs).where(eq(npcs.id, id)).limit(1)
    if (!rows[0]) throw new Error(`NPC not found: ${id}`)
    return rows[0] as Row
  }

  /** Upsert an NPC row. */
  async saveNPC(npc: Row): Promise<void> {
    const v = npc as typeof npcs.$inferInsert
    await this.db.insert(npcs).values(v)
      .onConflictDoUpdate({ target: npcs.id, set: withoutId(npc) as typeof npcs.$inferInsert })
  }

  /** Fetch all NPCs whose JSONB location->>'zone_id' matches zoneId within a campaign. */
  async getNPCsInZone(campaignId: string, zoneId: string): Promise<Row[]> {
    // location is JSONB — zone_id is stored as location->>'zone_id'
    return this.db.select().from(npcs)
      .where(and(
        eq(npcs.campaign_id, campaignId),
        sql`${npcs.location}->>'zone_id' = ${zoneId}`,
      )) as Promise<Row[]>
  }

  // ── Factions ───────────────────────────────────────────────────────────────

  /** Fetch a faction row by UUID. Throws if not found. */
  async getFaction(id: string): Promise<Row> {
    const rows = await this.db.select().from(factions).where(eq(factions.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Faction not found: ${id}`)
    return rows[0] as Row
  }

  /** Fetch a character's reputation row with a specific faction. Throws if not found. */
  async getFactionReputation(characterCampaignStateId: string, factionId: string): Promise<Row> {
    const rows = await this.db.select().from(character_faction_reputation)
      .where(and(
        eq(character_faction_reputation.character_campaign_state_id, characterCampaignStateId),
        eq(character_faction_reputation.faction_id, factionId),
      )).limit(1)
    if (!rows[0]) throw new Error(`FactionReputation not found for ccs=${characterCampaignStateId} faction=${factionId}`)
    return rows[0] as Row
  }

  /** Upsert a faction reputation row. */
  async saveFactionReputation(rep: Row): Promise<void> {
    const v = rep as typeof character_faction_reputation.$inferInsert
    await this.db.insert(character_faction_reputation).values(v)
      .onConflictDoUpdate({ target: character_faction_reputation.id, set: withoutId(rep) as typeof character_faction_reputation.$inferInsert })
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  /** Fetch all items owned by an entity within a campaign. */
  async getItems(campaignId: string, ownerId: string): Promise<Row[]> {
    return this.db.select().from(items)
      .where(and(eq(items.campaign_id, campaignId), eq(items.owner_id, ownerId))) as Promise<Row[]>
  }

  /** Upsert an item row. */
  async saveItem(item: Row): Promise<void> {
    const v = item as typeof items.$inferInsert
    await this.db.insert(items).values(v)
      .onConflictDoUpdate({ target: items.id, set: withoutId(item) as typeof items.$inferInsert })
  }

  /** Update an item's owner_id and owner_type — used for loot distribution and trades. */
  async transferItem(itemId: string, newOwnerId: string, newOwnerType: string): Promise<void> {
    await this.db.update(items)
      .set({ owner_id: newOwnerId, owner_type: newOwnerType })
      .where(eq(items.id, itemId))
  }

  // ── Quests ─────────────────────────────────────────────────────────────────

  /** Fetch a quest row by UUID. Throws if not found. */
  async getQuest(id: string): Promise<Row> {
    const rows = await this.db.select().from(quests).where(eq(quests.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Quest not found: ${id}`)
    return rows[0] as Row
  }

  /** Upsert a quest row. */
  async saveQuest(quest: Row): Promise<void> {
    const v = quest as typeof quests.$inferInsert
    await this.db.insert(quests).values(v)
      .onConflictDoUpdate({ target: quests.id, set: withoutId(quest) as typeof quests.$inferInsert })
  }

  /** Fetch all quests with state='active' for a campaign. */
  async getActiveQuests(campaignId: string): Promise<Row[]> {
    return this.db.select().from(quests)
      .where(and(eq(quests.campaign_id, campaignId), eq(quests.state, 'active'))) as Promise<Row[]>
  }

  // ── World zones ────────────────────────────────────────────────────────────

  /** Fetch a world zone row by UUID. Throws if not found. */
  async getWorldZone(id: string): Promise<Row> {
    const rows = await this.db.select().from(world_zones).where(eq(world_zones.id, id)).limit(1)
    if (!rows[0]) throw new Error(`WorldZone not found: ${id}`)
    return rows[0] as Row
  }

  /** Upsert a world zone row. */
  async saveWorldZone(zone: Row): Promise<void> {
    const v = zone as typeof world_zones.$inferInsert
    await this.db.insert(world_zones).values(v)
      .onConflictDoUpdate({ target: world_zones.id, set: withoutId(zone) as typeof world_zones.$inferInsert })
  }

  // ── World objects ──────────────────────────────────────────────────────────

  /** Fetch all world objects in a hex zone within a campaign. */
  async getWorldObjects(campaignId: string, zoneQ: number, zoneR: number): Promise<Row[]> {
    return this.db.select().from(world_objects).where(
      and(
        eq(world_objects.campaign_id, campaignId),
        eq(world_objects.zone_q, zoneQ),
        eq(world_objects.zone_r, zoneR),
      )
    ) as Promise<Row[]>
  }

  /** Upsert a world object row. */
  async saveWorldObject(obj: Row): Promise<void> {
    const v = obj as typeof world_objects.$inferInsert
    await this.db.insert(world_objects).values(v)
      .onConflictDoUpdate({ target: world_objects.id, set: withoutId(obj) as typeof world_objects.$inferInsert })
  }

  // ── Append-only logs ───────────────────────────────────────────────────────

  /** Append a world event row to event_log. Never updated or deleted. */
  async appendEventLog(entry: Row): Promise<void> {
    await this.db.insert(event_log).values(entry as typeof event_log.$inferInsert)
  }

  /** Append a combat action row to combat_log. Never updated or deleted. */
  async appendCombatLog(entry: Row): Promise<void> {
    await this.db.insert(combat_log).values(entry as typeof combat_log.$inferInsert)
  }

  /** Append an NPC dialogue row to npc_dialogue_log. Never updated or deleted. */
  async appendNPCDialogue(entry: Row): Promise<void> {
    await this.db.insert(npc_dialogue_log).values(entry as typeof npc_dialogue_log.$inferInsert)
  }

  /** Append an OOC chat row to party_chat_log. Never updated or deleted. */
  async appendPartyChat(entry: Row): Promise<void> {
    await this.db.insert(party_chat_log).values(entry as typeof party_chat_log.$inferInsert)
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  /** Insert a new session row for a campaign and return it. */
  async createSession(campaignId: string): Promise<Row> {
    const rows = await this.db.insert(sessions)
      .values({ campaign_id: campaignId })
      .returning()
    return rows[0] as Row
  }

  /** Set ended_at and summary on a session row. */
  async endSession(sessionId: string, summary: string): Promise<void> {
    await this.db.update(sessions)
      .set({ ended_at: new Date(), summary })
      .where(eq(sessions.id, sessionId))
  }

  // ── Campaign snapshots ─────────────────────────────────────────────────────

  /**
   * Snapshot the full mutable campaign state into a JSONB blob.
   * Maintains a rolling window of 10 — evicts the oldest snapshot if at capacity.
   * Runs inside a transaction: all sub-queries and the INSERT are atomic.
   */
  async createSnapshot(
    campaignId: string,
    triggerType: string,
    triggerRef: string | null,
    label: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Rolling window — delete oldest if at 10
      const existing = await tx.select({ id: campaign_snapshots.id })
        .from(campaign_snapshots)
        .where(eq(campaign_snapshots.campaign_id, campaignId))
        .orderBy(campaign_snapshots.created_at)
      if (existing.length >= 10) {
        await tx.delete(campaign_snapshots).where(eq(campaign_snapshots.id, existing[0].id))
      }

      // Collect sub-entity IDs needed for child table queries
      const ccsRows = await tx.select({ id: character_campaign_state.id })
        .from(character_campaign_state).where(eq(character_campaign_state.campaign_id, campaignId))
      const ccsIds = ccsRows.map(r => r.id)

      const npcRows = await tx.select({ id: npcs.id })
        .from(npcs).where(eq(npcs.campaign_id, campaignId))
      const npcIds = npcRows.map(r => r.id)

      const factionRows = await tx.select({ id: factions.id })
        .from(factions).where(eq(factions.campaign_id, campaignId))
      const factionIds = factionRows.map(r => r.id)

      const encounterRows = await tx.select({ id: encounters.id })
        .from(encounters).where(eq(encounters.campaign_id, campaignId))
      const encounterIds = encounterRows.map(r => r.id)

      // Build the full state JSONB
      const [
        campaignRow,
        ccsData, classData, repData, relData,
        npcData, factionData, questData, zoneData, objectData,
        agendaData, milestoneData, narrationData,
        encounterData, initData,
        memData, factionEventData,
        itemData, containerData,
      ] = await Promise.all([
        tx.select().from(campaigns).where(eq(campaigns.id, campaignId)),
        tx.select().from(character_campaign_state).where(eq(character_campaign_state.campaign_id, campaignId)),
        ccsIds.length ? tx.select().from(character_classes).where(inArray(character_classes.character_campaign_state_id, ccsIds)) : Promise.resolve([]),
        ccsIds.length ? tx.select().from(character_faction_reputation).where(inArray(character_faction_reputation.character_campaign_state_id, ccsIds)) : Promise.resolve([]),
        factionIds.length ? tx.select().from(faction_relationships).where(inArray(faction_relationships.faction_a_id, factionIds)) : Promise.resolve([]),
        tx.select().from(npcs).where(eq(npcs.campaign_id, campaignId)),
        tx.select().from(factions).where(eq(factions.campaign_id, campaignId)),
        tx.select().from(quests).where(eq(quests.campaign_id, campaignId)),
        tx.select().from(world_zones).where(eq(world_zones.campaign_id, campaignId)),
        tx.select().from(world_objects).where(eq(world_objects.campaign_id, campaignId)),
        tx.select().from(campaign_agenda).where(eq(campaign_agenda.campaign_id, campaignId)),
        tx.select().from(campaign_milestones).where(eq(campaign_milestones.campaign_id, campaignId)),
        tx.select().from(narration_pool).where(eq(narration_pool.campaign_id, campaignId)),
        tx.select().from(encounters).where(eq(encounters.campaign_id, campaignId)),
        encounterIds.length ? tx.select().from(initiative_entries).where(inArray(initiative_entries.encounter_id, encounterIds)) : Promise.resolve([]),
        npcIds.length ? tx.select().from(npc_memories).where(inArray(npc_memories.npc_id, npcIds)) : Promise.resolve([]),
        factionIds.length ? tx.select().from(faction_events).where(inArray(faction_events.faction_id, factionIds)) : Promise.resolve([]),
        tx.select().from(items).where(eq(items.campaign_id, campaignId)),
        tx.select().from(containers).where(eq(containers.campaign_id, campaignId)),
      ])

      const state = {
        campaigns: campaignRow[0],
        character_campaign_state: ccsData,
        character_classes: classData,
        character_faction_reputation: repData,
        faction_relationships: relData,
        npcs: npcData,
        factions: factionData,
        quests: questData,
        world_zones: zoneData,
        world_objects: objectData,
        campaign_agenda: agendaData,
        campaign_milestones: milestoneData,
        narration_pool: narrationData,
        encounters: encounterData,
        initiative_entries: initData,
        npc_memories: memData,
        faction_events: factionEventData,
        items: itemData,
        containers: containerData,
      }

      await tx.insert(campaign_snapshots).values({
        campaign_id: campaignId,
        trigger_type: triggerType,
        trigger_ref: triggerRef ?? undefined,
        label,
        state,
      })
    })
  }

  /** Fetch all snapshots for a campaign ordered oldest-first. */
  async getSnapshots(campaignId: string): Promise<Row[]> {
    return this.db.select().from(campaign_snapshots)
      .where(eq(campaign_snapshots.campaign_id, campaignId))
      .orderBy(campaign_snapshots.created_at) as Promise<Row[]>
  }

  /**
   * Restore campaign state from a snapshot.
   * Deletes all current mutable rows in FK-safe order, then re-inserts the snapshot data.
   * Append-only logs are never touched.
   */
  async rollbackToSnapshot(snapshotId: string): Promise<void> {
    const snapRows = await this.db.select().from(campaign_snapshots)
      .where(eq(campaign_snapshots.id, snapshotId)).limit(1)
    if (!snapRows[0]) throw new Error(`Snapshot not found: ${snapshotId}`)

    const snap = snapRows[0].state as Record<string, unknown>
    const campaignId = snapRows[0].campaign_id

    await this.db.transaction(async (tx) => {
      // Gather IDs for sub-entity deletes (using current DB state, not snapshot)
      const [ccsRows, npcRows, factionRows, encounterRows] = await Promise.all([
        tx.select({ id: character_campaign_state.id }).from(character_campaign_state).where(eq(character_campaign_state.campaign_id, campaignId)),
        tx.select({ id: npcs.id }).from(npcs).where(eq(npcs.campaign_id, campaignId)),
        tx.select({ id: factions.id }).from(factions).where(eq(factions.campaign_id, campaignId)),
        tx.select({ id: encounters.id }).from(encounters).where(eq(encounters.campaign_id, campaignId)),
      ])
      const ccsIds = ccsRows.map(r => r.id)
      const npcIds = npcRows.map(r => r.id)
      const factionIds = factionRows.map(r => r.id)
      const encounterIds = encounterRows.map(r => r.id)

      // Delete in FK-safe order (children first, then parents).
      // inArray with empty array is invalid SQL → guard with if (ids.length).
      // eq(col, value) is always valid even with 0 matching rows → no guard needed.
      if (npcIds.length) await tx.delete(npc_memories).where(inArray(npc_memories.npc_id, npcIds))
      if (factionIds.length) await tx.delete(faction_events).where(inArray(faction_events.faction_id, factionIds))
      if (encounterIds.length) await tx.delete(initiative_entries).where(inArray(initiative_entries.encounter_id, encounterIds))
      if (ccsIds.length) await tx.delete(character_classes).where(inArray(character_classes.character_campaign_state_id, ccsIds))
      if (ccsIds.length) await tx.delete(character_faction_reputation).where(inArray(character_faction_reputation.character_campaign_state_id, ccsIds))
      if (factionIds.length) await tx.delete(faction_relationships).where(inArray(faction_relationships.faction_a_id, factionIds))
      await tx.delete(quests).where(eq(quests.campaign_id, campaignId))
      await tx.delete(encounters).where(eq(encounters.campaign_id, campaignId))
      await tx.delete(character_campaign_state).where(eq(character_campaign_state.campaign_id, campaignId))
      await tx.delete(items).where(eq(items.campaign_id, campaignId))
      await tx.delete(containers).where(eq(containers.campaign_id, campaignId))
      await tx.delete(world_objects).where(eq(world_objects.campaign_id, campaignId))
      await tx.delete(world_zones).where(eq(world_zones.campaign_id, campaignId))
      await tx.delete(campaign_agenda).where(eq(campaign_agenda.campaign_id, campaignId))
      await tx.delete(campaign_milestones).where(eq(campaign_milestones.campaign_id, campaignId))
      await tx.delete(narration_pool).where(eq(narration_pool.campaign_id, campaignId))
      // factions.leader_npc_id → npcs: delete factions before npcs to satisfy FK
      await tx.delete(factions).where(eq(factions.campaign_id, campaignId))
      await tx.delete(npcs).where(eq(npcs.campaign_id, campaignId))

      // Restore campaign row
      const campaignData = snap.campaigns as typeof campaigns.$inferInsert
      await tx.update(campaigns).set(campaignData).where(eq(campaigns.id, campaignId))

      // Re-insert all snapshot rows
      const s = snap as Record<string, Row[]>
      if (s.npcs?.length) await tx.insert(npcs).values(s.npcs as typeof npcs.$inferInsert[])
      if (s.factions?.length) await tx.insert(factions).values(s.factions as typeof factions.$inferInsert[])
      if (s.character_campaign_state?.length) await tx.insert(character_campaign_state).values(s.character_campaign_state as typeof character_campaign_state.$inferInsert[])
      if (s.character_classes?.length) await tx.insert(character_classes).values(s.character_classes as typeof character_classes.$inferInsert[])
      if (s.character_faction_reputation?.length) await tx.insert(character_faction_reputation).values(s.character_faction_reputation as typeof character_faction_reputation.$inferInsert[])
      if (s.faction_relationships?.length) await tx.insert(faction_relationships).values(s.faction_relationships as typeof faction_relationships.$inferInsert[])
      if (s.quests?.length) await tx.insert(quests).values(s.quests as typeof quests.$inferInsert[])
      if (s.world_zones?.length) await tx.insert(world_zones).values(s.world_zones as typeof world_zones.$inferInsert[])
      if (s.world_objects?.length) await tx.insert(world_objects).values(s.world_objects as typeof world_objects.$inferInsert[])
      if (s.campaign_agenda?.length) await tx.insert(campaign_agenda).values(s.campaign_agenda as typeof campaign_agenda.$inferInsert[])
      if (s.campaign_milestones?.length) await tx.insert(campaign_milestones).values(s.campaign_milestones as typeof campaign_milestones.$inferInsert[])
      if (s.narration_pool?.length) await tx.insert(narration_pool).values(s.narration_pool as typeof narration_pool.$inferInsert[])
      if (s.encounters?.length) await tx.insert(encounters).values(s.encounters as typeof encounters.$inferInsert[])
      if (s.initiative_entries?.length) await tx.insert(initiative_entries).values(s.initiative_entries as typeof initiative_entries.$inferInsert[])
      if (s.items?.length) await tx.insert(items).values(s.items as typeof items.$inferInsert[])
      if (s.containers?.length) await tx.insert(containers).values(s.containers as typeof containers.$inferInsert[])
      if (s.npc_memories?.length) await tx.insert(npc_memories).values(s.npc_memories as typeof npc_memories.$inferInsert[])
      if (s.faction_events?.length) await tx.insert(faction_events).values(s.faction_events as typeof faction_events.$inferInsert[])
    })
  }
}
