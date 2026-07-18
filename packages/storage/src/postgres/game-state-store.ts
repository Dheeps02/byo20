/**
 * PostgresGameStateStore — IGameStateStore backed by byo20_server.
 *
 * All writes use upsert (INSERT … ON CONFLICT DO UPDATE) so callers don't need
 * to distinguish create vs. update. The engine always sends the full domain type.
 *
 * Row-to-domain mapping functions convert flat Drizzle rows to the nested domain
 * types expected by the engine. Domain-to-row mapping does the reverse for writes.
 *
 * Append-only tables (event_log, combat_log, npc_dialogue_log, sessions,
 * party_chat_log) only ever receive INSERTs — no updates, no deletes.
 */
import { eq, and, inArray, sql } from 'drizzle-orm'
import type {
  IGameStateStore,
  Campaign, Character, CharacterIdentity, CharacterCampaignState, CharacterClass, PendingLevelup,
  Encounter, InitiativeEntry,
  NPC, AbilityScores,
  Faction, FactionReputation,
  Item, Container, ArmorType, FocusType, RechargeType, ItemRarity,
  Quest, QuestDag,
  WorldZone, WorldObject,
  Session, Snapshot, SnapshotTrigger,
  EventLogEntry, CombatLogEntry, NPCDialogueEntry, PartyChatEntry,
} from '@byo20/shared'
import type { ServerDb } from './client'
import {
  campaigns, characters, character_campaign_state, character_classes,
} from './schema/server/game'
import {
  items, containers,
  melee_item_stats, ranged_item_stats, armor_stats,
  spell_focus_stats, consumable_stats, magic_item_stats,
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

// ── Row mapping helpers ────────────────────────────────────────────────────────

/** Map a row with flat stat_* columns to an AbilityScores object. */
function rowToAbilityScores(row: {
  stat_str: number; stat_dex: number; stat_con: number
  stat_int: number; stat_wis: number; stat_cha: number
}): AbilityScores {
  return {
    strength: row.stat_str,
    dexterity: row.stat_dex,
    constitution: row.stat_con,
    intelligence: row.stat_int,
    wisdom: row.stat_wis,
    charisma: row.stat_cha,
  }
}

/** AbilityScores → flat stat_* fields for DB writes. */
function abilityScoresToRow(stats: AbilityScores) {
  return {
    stat_str: stats.strength,
    stat_dex: stats.dexterity,
    stat_con: stats.constitution,
    stat_int: stats.intelligence,
    stat_wis: stats.wisdom,
    stat_cha: stats.charisma,
  }
}

/** Map a `game.characters` row to `CharacterIdentity`. */
function rowToCharacterIdentity(row: typeof characters.$inferSelect): CharacterIdentity {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    species: row.species,
    background: row.background,
    backstory: row.backstory ?? null,
    stats: rowToAbilityScores(row),
    createdAt: row.created_at,
  }
}

/** `CharacterIdentity` → `game.characters` insert shape. */
function characterIdentityToRow(identity: CharacterIdentity): typeof characters.$inferInsert {
  return {
    id: identity.id,
    owner_user_id: identity.ownerUserId,
    name: identity.name,
    species: identity.species,
    background: identity.background,
    backstory: identity.backstory ?? undefined,
    ...abilityScoresToRow(identity.stats),
    created_at: identity.createdAt,
  }
}

/** Map a `game.character_campaign_state` row to `CharacterCampaignState`. */
function rowToCharacterCampaignState(row: typeof character_campaign_state.$inferSelect): CharacterCampaignState {
  return {
    id: row.id,
    characterId: row.character_id,
    campaignId: row.campaign_id,
    level: row.level,
    xp: row.xp,
    hp: { current: row.hp_current, max: row.hp_max },
    hitDiceRemaining: row.hit_dice_remaining,
    spellSlots: row.spell_slots ?? null,
    conditions: row.conditions ?? [],
    deathSaves: row.death_saves ?? null,
    position: row.position as { x: number; y: number; z: number } | null,
    isActive: row.is_active,
    exhaustionLevel: row.exhaustion_level,
    tempHp: row.temp_hp,
    heroicInspiration: row.heroic_inspiration,
    classResources: row.class_resources ?? null,
    preparedSpells: row.prepared_spells ?? null,
    weaponMasteries: row.weapon_masteries ?? null,
    languages: row.languages ?? [],
    skillProficiencies: row.skill_proficiencies as Record<string, string> | null,
    savingThrowProfs: row.saving_throw_profs ?? [],
    featsTaken: row.feats_taken ?? [],
    concentratingOn: row.concentrating_on ?? null,
    toolProficiencies: row.tool_proficiencies ?? [],
    pendingLevelup: row.pending_levelup as PendingLevelup | null,
    updatedAt: row.updated_at,
  }
}

/** `CharacterCampaignState` → `game.character_campaign_state` insert shape. */
function characterCampaignStateToRow(
  state: CharacterCampaignState,
): typeof character_campaign_state.$inferInsert {
  return {
    id: state.id,
    character_id: state.characterId,
    campaign_id: state.campaignId,
    level: state.level,
    xp: state.xp,
    hp_current: state.hp.current,
    hp_max: state.hp.max,
    hit_dice_remaining: state.hitDiceRemaining,
    spell_slots: state.spellSlots ?? undefined,
    conditions: state.conditions,
    death_saves: state.deathSaves ?? undefined,
    position: state.position ?? undefined,
    is_active: state.isActive,
    exhaustion_level: state.exhaustionLevel,
    temp_hp: state.tempHp,
    heroic_inspiration: state.heroicInspiration,
    class_resources: state.classResources ?? undefined,
    prepared_spells: state.preparedSpells ?? undefined,
    weapon_masteries: state.weaponMasteries ?? undefined,
    languages: state.languages,
    skill_proficiencies: state.skillProficiencies ?? undefined,
    saving_throw_profs: state.savingThrowProfs,
    feats_taken: state.featsTaken,
    concentrating_on: state.concentratingOn ?? undefined,
    tool_proficiencies: state.toolProficiencies,
    pending_levelup: state.pendingLevelup ?? undefined,
    updated_at: state.updatedAt,
  }
}

/** Map a `game.character_classes` row to `CharacterClass`. */
function rowToCharacterClass(row: typeof character_classes.$inferSelect): CharacterClass {
  return {
    id: row.id,
    characterCampaignStateId: row.character_campaign_state_id,
    class: row.class,
    subclass: row.subclass ?? null,
    classLevel: row.class_level,
    preparedSpells: row.prepared_spells ?? null,
  }
}

/** `CharacterClass` → `game.character_classes` insert shape. */
function characterClassToRow(cls: CharacterClass): typeof character_classes.$inferInsert {
  return {
    id: cls.id,
    character_campaign_state_id: cls.characterCampaignStateId,
    class: cls.class,
    subclass: cls.subclass ?? undefined,
    class_level: cls.classLevel,
    prepared_spells: cls.preparedSpells ?? undefined,
  }
}

/** Assemble a merged `Character` from three separate row types. */
function rowsToCharacter(
  charRow: typeof characters.$inferSelect,
  ccsRow: typeof character_campaign_state.$inferSelect,
  classRows: (typeof character_classes.$inferSelect)[],
): Character {
  return {
    id: charRow.id,
    ownerUserId: charRow.owner_user_id,
    name: charRow.name,
    species: charRow.species,
    background: charRow.background,
    backstory: charRow.backstory ?? null,
    stats: rowToAbilityScores(charRow),
    campaignStateId: ccsRow.id,
    campaignId: ccsRow.campaign_id,
    level: ccsRow.level,
    xp: ccsRow.xp,
    hp: { current: ccsRow.hp_current, max: ccsRow.hp_max },
    hitDiceRemaining: ccsRow.hit_dice_remaining,
    spellSlots: ccsRow.spell_slots ?? null,
    conditions: ccsRow.conditions ?? [],
    deathSaves: ccsRow.death_saves ?? null,
    position: ccsRow.position as { x: number; y: number; z: number } | null,
    isActive: ccsRow.is_active,
    exhaustionLevel: ccsRow.exhaustion_level,
    tempHp: ccsRow.temp_hp,
    heroicInspiration: ccsRow.heroic_inspiration,
    classResources: ccsRow.class_resources ?? null,
    preparedSpells: ccsRow.prepared_spells ?? null,
    weaponMasteries: ccsRow.weapon_masteries ?? null,
    languages: ccsRow.languages ?? [],
    skillProficiencies: ccsRow.skill_proficiencies as Record<string, string> | null,
    savingThrowProfs: ccsRow.saving_throw_profs ?? [],
    featsTaken: ccsRow.feats_taken ?? [],
    concentratingOn: ccsRow.concentrating_on ?? null,
    toolProficiencies: ccsRow.tool_proficiencies ?? [],
    pendingLevelup: ccsRow.pending_levelup as PendingLevelup | null,
    updatedAt: ccsRow.updated_at,
    classes: classRows.map(rowToCharacterClass),
  }
}

/** Map a `game.campaigns` row to `Campaign`. */
function rowToCampaign(row: typeof campaigns.$inferSelect): Campaign {
  return {
    id: row.id,
    name: row.name,
    dmUserId: row.dm_user_id,
    status: row.status as Campaign['status'],
    phase: row.phase as Campaign['phase'],
    worldClock: row.world_clock,
    movementSystem: row.movement_system as Campaign['movementSystem'],
    fogMode: row.fog_mode as Campaign['fogMode'],
    hpOnLevelup: row.hp_on_levelup as Campaign['hpOnLevelup'],
    syncIntervalMins: row.sync_interval_mins,
    premise: row.premise ?? null,
    campaignLength: row.campaign_length as Campaign['campaignLength'],
    tone: row.tone,
    worldGenStatus: row.world_gen_status as Campaign['worldGenStatus'],
    campaignSeed: row.campaign_seed ?? null,
    heightmapResolution: row.heightmap_resolution ?? null,
    worldDepth: row.world_depth as Campaign['worldDepth'],
    libraryAccessUnlocked: row.library_access_unlocked,
    narrationMode: row.narration_mode as Campaign['narrationMode'],
    apiProvider: row.api_provider as Campaign['apiProvider'],
    apiKeyBlob: row.api_key_blob ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** `Campaign` → `game.campaigns` insert shape. */
function campaignToRow(campaign: Campaign): typeof campaigns.$inferInsert {
  return {
    id: campaign.id,
    name: campaign.name,
    dm_user_id: campaign.dmUserId,
    status: campaign.status,
    phase: campaign.phase,
    world_clock: campaign.worldClock,
    movement_system: campaign.movementSystem,
    fog_mode: campaign.fogMode,
    hp_on_levelup: campaign.hpOnLevelup,
    sync_interval_mins: campaign.syncIntervalMins,
    premise: campaign.premise ?? undefined,
    campaign_length: campaign.campaignLength,
    tone: campaign.tone,
    world_gen_status: campaign.worldGenStatus,
    campaign_seed: campaign.campaignSeed ?? undefined,
    heightmap_resolution: campaign.heightmapResolution ?? undefined,
    world_depth: campaign.worldDepth,
    library_access_unlocked: campaign.libraryAccessUnlocked,
    narration_mode: campaign.narrationMode,
    api_provider: campaign.apiProvider,
    api_key_blob: campaign.apiKeyBlob ?? undefined,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
  }
}

/** Map a `world.encounters` row to `Encounter`. */
function rowToEncounter(row: typeof encounters.$inferSelect): Encounter {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    status: row.status as Encounter['status'],
    round: row.round,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
  }
}

/** `Encounter` → `combat.encounters` insert shape. */
function encounterToRow(encounter: Encounter): typeof encounters.$inferInsert {
  return {
    id: encounter.id,
    campaign_id: encounter.campaignId,
    status: encounter.status,
    round: encounter.round,
    started_at: encounter.startedAt,
    ended_at: encounter.endedAt ?? undefined,
  }
}

/** Map a `combat.initiative_entries` row to `InitiativeEntry`. */
function rowToInitiativeEntry(row: typeof initiative_entries.$inferSelect): InitiativeEntry {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    initiativeRoll: row.initiative_roll,
    position: row.position,
    isCurrentTurn: row.is_current_turn,
    surprised: row.surprised,
  }
}

/** `InitiativeEntry` → `combat.initiative_entries` insert shape. */
function initiativeEntryToRow(entry: InitiativeEntry): typeof initiative_entries.$inferInsert {
  return {
    id: entry.id,
    encounter_id: entry.encounterId,
    entity_id: entry.entityId,
    entity_type: entry.entityType,
    initiative_roll: entry.initiativeRoll,
    position: entry.position,
    is_current_turn: entry.isCurrentTurn,
    surprised: entry.surprised,
  }
}

/** Map a `world.npcs` row to `NPC`. */
function rowToNPC(row: typeof npcs.$inferSelect): NPC {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    factionId: row.faction_id ?? null,
    location: row.location as NPC['location'],
    status: row.status as NPC['status'],
    schedule: (row.schedule ?? []) as NPC['schedule'],
    stats: rowToAbilityScores(row),
    ac: row.ac,
    speed: row.speed,
    cr: row.cr,
    hp: { current: row.hp_current, max: row.hp_max },
    proficiencyBonus: row.proficiency_bonus,
    traits: row.traits,
    actions: row.actions,
    resistances: row.resistances ?? [],
    immunities: row.immunities ?? [],
    spells: row.spells as NPC['spells'],
    senses: row.senses as NPC['senses'],
    languages: row.languages,
    legendaryResistances: row.legendary_resistances ?? null,
    treasureType: row.treasure_type as NPC['treasureType'],
    updatedAt: row.updated_at,
  }
}

/** `NPC` → `world.npcs` insert shape. */
function npcToRow(npc: NPC): typeof npcs.$inferInsert {
  return {
    id: npc.id,
    campaign_id: npc.campaignId,
    name: npc.name,
    faction_id: npc.factionId ?? undefined,
    location: npc.location ?? undefined,
    status: npc.status,
    schedule: npc.schedule as typeof npcs.$inferInsert['schedule'],
    ...abilityScoresToRow(npc.stats),
    ac: npc.ac,
    speed: npc.speed,
    cr: npc.cr,
    hp_current: npc.hp.current,
    hp_max: npc.hp.max,
    proficiency_bonus: npc.proficiencyBonus,
    traits: npc.traits ?? undefined,
    actions: npc.actions ?? undefined,
    resistances: npc.resistances,
    immunities: npc.immunities,
    spells: npc.spells ?? undefined,
    senses: npc.senses as typeof npcs.$inferInsert['senses'],
    languages: npc.languages ?? undefined,
    legendary_resistances: npc.legendaryResistances ?? undefined,
    treasure_type: npc.treasureType,
    updated_at: npc.updatedAt,
  }
}

/** Map a `world.factions` row to `Faction`. */
function rowToFaction(row: typeof factions.$inferSelect): Faction {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description ?? null,
    goals: row.goals,
    leaderNpcId: row.leader_npc_id ?? null,
    territory: row.territory,
    updatedAt: row.updated_at,
  }
}

/** Map a `world.character_faction_reputation` row to `FactionReputation`. */
function rowToFactionReputation(
  row: typeof character_faction_reputation.$inferSelect,
): FactionReputation {
  return {
    id: row.id,
    characterCampaignStateId: row.character_campaign_state_id,
    factionId: row.faction_id,
    reputation: row.reputation,
    attitude: row.attitude as FactionReputation['attitude'],
    updatedAt: row.updated_at,
  }
}

/** `FactionReputation` → `world.character_faction_reputation` insert shape. */
function factionReputationToRow(
  rep: FactionReputation,
): typeof character_faction_reputation.$inferInsert {
  return {
    id: rep.id,
    character_campaign_state_id: rep.characterCampaignStateId,
    faction_id: rep.factionId,
    reputation: rep.reputation,
    attitude: rep.attitude,
    updated_at: rep.updatedAt,
  }
}

/** Map a `world.quests` row to `Quest`. */
function rowToQuest(row: typeof quests.$inferSelect): Quest {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    title: row.title,
    sourceType: row.source_type as Quest['sourceType'],
    state: row.state as Quest['state'],
    factionId: row.faction_id ?? null,
    dag: row.nodes as QuestDag,
    currentNodeId: row.current_node_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** `Quest` → `world.quests` insert shape. */
function questToRow(quest: Quest): typeof quests.$inferInsert {
  return {
    id: quest.id,
    campaign_id: quest.campaignId,
    title: quest.title,
    source_type: quest.sourceType,
    state: quest.state,
    faction_id: quest.factionId ?? undefined,
    nodes: quest.dag as typeof quests.$inferInsert['nodes'],
    current_node_id: quest.currentNodeId,
    created_at: quest.createdAt,
    updated_at: quest.updatedAt,
  }
}

/** Map a `world.world_zones` row to `WorldZone`. */
function rowToWorldZone(row: typeof world_zones.$inferSelect): WorldZone {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    hexQ: row.hex_q,
    hexR: row.hex_r,
    genState: row.gen_state as WorldZone['genState'],
    zoneType: (row.zone_type as WorldZone['zoneType']) ?? null,
    heightmapChunk: row.heightmap_chunk ?? null,
    content: row.content as WorldZone['content'],
    generatedAt: row.generated_at ?? null,
    updatedAt: row.updated_at,
  }
}

/** `WorldZone` → `world.world_zones` insert shape. */
function worldZoneToRow(zone: WorldZone): typeof world_zones.$inferInsert {
  return {
    id: zone.id,
    campaign_id: zone.campaignId,
    hex_q: zone.hexQ,
    hex_r: zone.hexR,
    gen_state: zone.genState,
    zone_type: zone.zoneType ?? undefined,
    heightmap_chunk: zone.heightmapChunk as Buffer | undefined ?? undefined,
    content: zone.content ?? undefined,
    generated_at: zone.generatedAt ?? undefined,
    updated_at: zone.updatedAt,
  }
}

/** Map a `world.world_objects` row to `WorldObject`. */
function rowToWorldObject(row: typeof world_objects.$inferSelect): WorldObject {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    zoneQ: row.zone_q,
    zoneR: row.zone_r,
    name: row.name,
    objectType: row.object_type as WorldObject['objectType'],
    status: row.status as WorldObject['status'],
    position: row.position as { x: number; y: number; z: number },
    ownerType: (row.owner_type as WorldObject['ownerType']) ?? null,
    ownerId: row.owner_id ?? null,
    properties: row.properties,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** `WorldObject` → `world.world_objects` insert shape. */
function worldObjectToRow(obj: WorldObject): typeof world_objects.$inferInsert {
  return {
    id: obj.id,
    campaign_id: obj.campaignId,
    zone_q: obj.zoneQ,
    zone_r: obj.zoneR,
    name: obj.name,
    object_type: obj.objectType,
    status: obj.status,
    position: obj.position as typeof world_objects.$inferInsert['position'],
    owner_type: obj.ownerType ?? undefined,
    owner_id: obj.ownerId ?? undefined,
    properties: obj.properties ?? undefined,
    created_at: obj.createdAt,
    updated_at: obj.updatedAt,
  }
}

/** Map a `log.sessions` row to `Session`. */
function rowToSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    summary: row.summary ?? null,
  }
}

/** Map a `world.campaign_snapshots` row to `Snapshot`. */
function rowToSnapshot(row: typeof campaign_snapshots.$inferSelect): Snapshot {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    triggerType: row.trigger_type as SnapshotTrigger,
    triggerRef: row.trigger_ref ?? null,
    label: row.label,
    state: row.state,
    createdAt: row.created_at,
  }
}

/** Map a `log.event_log` row to `EventLogEntry`. */
function rowToEventLogEntry(row: typeof event_log.$inferSelect): EventLogEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id ?? null,
    eventType: row.event_type as EventLogEntry['eventType'],
    payload: row.payload,
    summary: row.summary ?? null,
    embedding: row.embedding ?? null,
    timestamp: row.timestamp,
  }
}

/** Map a `log.combat_log` row to `CombatLogEntry`. */
function rowToCombatLogEntry(row: typeof combat_log.$inferSelect): CombatLogEntry {
  return {
    id: row.id,
    encounterId: row.encounter_id,
    sessionId: row.session_id ?? null,
    round: row.round,
    actorId: row.actor_id,
    actionType: row.action_type as CombatLogEntry['actionType'],
    payload: row.payload,
    result: row.result ?? null,
    summary: row.summary ?? null,
    embedding: row.embedding ?? null,
    timestamp: row.timestamp,
  }
}

/** Map a `log.npc_dialogue_log` row to `NPCDialogueEntry`. */
function rowToNPCDialogueEntry(row: typeof npc_dialogue_log.$inferSelect): NPCDialogueEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    npcId: row.npc_id,
    sessionId: row.session_id ?? null,
    speakerType: row.speaker_type,
    speakerId: row.speaker_id,
    content: row.content,
    timestamp: row.timestamp,
  }
}

/** Map a `log.party_chat_log` row to `PartyChatEntry`. */
function rowToPartyChatEntry(row: typeof party_chat_log.$inferSelect): PartyChatEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id ?? null,
    speakerId: row.speaker_id,
    content: row.content,
    timestamp: row.timestamp,
  }
}

/** Map a `items.containers` row to `Container`. */
function rowToContainer(row: typeof containers.$inferSelect): Container {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    location: row.location,
    ownerType: row.owner_type as Container['ownerType'],
    ownerId: row.owner_id ?? null,
  }
}

/** `Container` → `items.containers` insert shape. */
function containerToRow(container: Container): typeof containers.$inferInsert {
  return {
    id: container.id,
    campaign_id: container.campaignId,
    name: container.name,
    location: container.location ?? undefined,
    owner_type: container.ownerType,
    owner_id: container.ownerId ?? undefined,
  }
}

/**
 * Assemble an `Item` discriminated union from a base row plus its stats row.
 * The stats row must match the item_type of the base row — callers guarantee this.
 */
function rowToItem(
  base: typeof items.$inferSelect,
  statsRow: unknown,
): Item {
  const common = {
    id: base.id,
    campaignId: base.campaign_id,
    srdItemId: base.item_id,
    description: base.description ?? null,
    baseValue: base.base_value ?? null,
    unit: base.unit ?? null,
    ownerType: base.owner_type as Item['ownerType'],
    ownerId: base.owner_id ?? null,
    locationType: base.location_type as Item['locationType'],
    locationId: base.location_id ?? null,
    quantity: base.quantity,
  }
  switch (base.item_type) {
    case 'melee': {
      const s = statsRow as typeof melee_item_stats.$inferSelect
      return { ...common, itemType: 'melee', stats: { damageDie: s.damage_die, damageType: s.damage_type, properties: s.properties } }
    }
    case 'ranged': {
      const s = statsRow as typeof ranged_item_stats.$inferSelect
      return { ...common, itemType: 'ranged', stats: { damageDie: s.damage_die, damageType: s.damage_type, rangeNormal: s.range_normal, rangeLong: s.range_long, ammoType: s.ammo_type ?? null } }
    }
    case 'armor': {
      const s = statsRow as typeof armor_stats.$inferSelect
      return { ...common, itemType: 'armor', stats: { ac: s.ac, armorType: s.armor_type as ArmorType, stealthDisadvantage: s.stealth_disadvantage, strRequirement: s.str_requirement ?? null } }
    }
    case 'focus': {
      const s = statsRow as typeof spell_focus_stats.$inferSelect
      return { ...common, itemType: 'focus', stats: { focusType: s.focus_type as FocusType } }
    }
    case 'consumable': {
      const s = statsRow as typeof consumable_stats.$inferSelect
      return { ...common, itemType: 'consumable', stats: { effect: s.effect, chargesMax: s.charges_max, chargesCurrent: s.charges_current ?? null, recharge: s.recharge as RechargeType } }
    }
    case 'magic': {
      const s = statsRow as typeof magic_item_stats.$inferSelect
      return { ...common, itemType: 'magic', stats: { customName: s.custom_name ?? null, rarity: s.rarity as ItemRarity, attunement: s.attunement, attuned: s.attuned, bonus: s.bonus ?? null, chargesMax: s.charges_max ?? null, chargesCurrent: s.charges_current ?? null, recharge: (s.recharge as RechargeType) ?? null, properties: s.properties } }
    }
    default:
      throw new Error(`Unknown item_type: ${base.item_type}`)
  }
}

// ── Store implementation ───────────────────────────────────────────────────────

/** IGameStateStore implementation backed by byo20_server Postgres. */
export class PostgresGameStateStore implements IGameStateStore {
  constructor(private db: Db) {}

  // ── Campaigns ──────────────────────────────────────────────────────────────

  /** Fetch a campaign by UUID. Throws if not found. */
  async getCampaign(id: string): Promise<Campaign> {
    const rows = await this.db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Campaign not found: ${id}`)
    return rowToCampaign(rows[0])
  }

  /** Upsert a campaign. */
  async saveCampaign(campaign: Campaign): Promise<void> {
    const row = campaignToRow(campaign)
    const { id: _id, ...rest } = row
    await this.db.insert(campaigns).values(row)
      .onConflictDoUpdate({ target: campaigns.id, set: rest })
  }

  // ── Characters — engine-facing merged view ─────────────────────────────────

  /**
   * Fetch the merged Character by character UUID + campaign UUID.
   * JOINs characters + character_campaign_state + character_classes.
   */
  async getCharacter(id: string, campaignId: string): Promise<Character> {
    const [charRows, ccsRows] = await Promise.all([
      this.db.select().from(characters).where(eq(characters.id, id)).limit(1),
      this.db.select().from(character_campaign_state)
        .where(and(eq(character_campaign_state.character_id, id), eq(character_campaign_state.campaign_id, campaignId)))
        .limit(1),
    ])
    if (!charRows[0]) throw new Error(`Character not found: ${id}`)
    if (!ccsRows[0]) throw new Error(`CharacterCampaignState not found: char=${id} campaign=${campaignId}`)

    const classRows = await this.db.select().from(character_classes)
      .where(eq(character_classes.character_campaign_state_id, ccsRows[0].id))

    return rowsToCharacter(charRows[0], ccsRows[0], classRows)
  }

  /**
   * Upsert a merged Character.
   * Splits into characters + character_campaign_state + character_classes and upserts each.
   */
  async saveCharacter(character: Character): Promise<void> {
    const charRow = {
      id: character.id,
      owner_user_id: character.ownerUserId,
      name: character.name,
      species: character.species,
      background: character.background,
      backstory: character.backstory ?? undefined,
      ...abilityScoresToRow(character.stats),
    }
    const ccsRow = characterCampaignStateToRow({
      id: character.campaignStateId,
      characterId: character.id,
      campaignId: character.campaignId,
      level: character.level,
      xp: character.xp,
      hp: character.hp,
      hitDiceRemaining: character.hitDiceRemaining,
      spellSlots: character.spellSlots,
      conditions: character.conditions,
      deathSaves: character.deathSaves,
      position: character.position,
      isActive: character.isActive,
      exhaustionLevel: character.exhaustionLevel,
      tempHp: character.tempHp,
      heroicInspiration: character.heroicInspiration,
      classResources: character.classResources,
      preparedSpells: character.preparedSpells,
      weaponMasteries: character.weaponMasteries,
      languages: character.languages,
      skillProficiencies: character.skillProficiencies,
      savingThrowProfs: character.savingThrowProfs,
      featsTaken: character.featsTaken,
      concentratingOn: character.concentratingOn,
      toolProficiencies: character.toolProficiencies,
      pendingLevelup: character.pendingLevelup,
      updatedAt: character.updatedAt,
    })
    const { id: _cid, ...ccsRest } = ccsRow
    const { id: _charid, ...charRest } = charRow

    await this.db.transaction(async (tx) => {
      await tx.insert(characters).values(charRow)
        .onConflictDoUpdate({ target: characters.id, set: charRest })
      await tx.insert(character_campaign_state).values(ccsRow)
        .onConflictDoUpdate({ target: character_campaign_state.id, set: ccsRest })
      for (const cls of character.classes) {
        const clsRow = characterClassToRow(cls)
        const { id: _id, ...clsRest } = clsRow
        await tx.insert(character_classes).values(clsRow)
          .onConflictDoUpdate({ target: character_classes.id, set: clsRest })
      }
    })
  }

  // ── Character identity ─────────────────────────────────────────────────────

  /** Fetch a character's portable identity by UUID. Throws if not found. */
  async getCharacterIdentity(id: string): Promise<CharacterIdentity> {
    const rows = await this.db.select().from(characters).where(eq(characters.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Character not found: ${id}`)
    return rowToCharacterIdentity(rows[0])
  }

  /** Upsert a character identity row. */
  async saveCharacterIdentity(identity: CharacterIdentity): Promise<void> {
    const row = characterIdentityToRow(identity)
    const { id: _id, ...rest } = row
    await this.db.insert(characters).values(row)
      .onConflictDoUpdate({ target: characters.id, set: rest })
  }

  // ── Character campaign state ───────────────────────────────────────────────

  /** Fetch a character campaign state by its own UUID. Throws if not found. */
  async getCharacterCampaignState(id: string): Promise<CharacterCampaignState> {
    const rows = await this.db.select().from(character_campaign_state)
      .where(eq(character_campaign_state.id, id)).limit(1)
    if (!rows[0]) throw new Error(`CharacterCampaignState not found: ${id}`)
    return rowToCharacterCampaignState(rows[0])
  }

  /** Upsert a character campaign state row. */
  async saveCharacterCampaignState(state: CharacterCampaignState): Promise<void> {
    const row = characterCampaignStateToRow(state)
    const { id: _id, ...rest } = row
    await this.db.insert(character_campaign_state).values(row)
      .onConflictDoUpdate({ target: character_campaign_state.id, set: rest })
  }

  // ── Character classes ──────────────────────────────────────────────────────

  /** Fetch all class rows for a character_campaign_state UUID. */
  async getCharacterClasses(characterCampaignStateId: string): Promise<CharacterClass[]> {
    const rows = await this.db.select().from(character_classes)
      .where(eq(character_classes.character_campaign_state_id, characterCampaignStateId))
    return rows.map(rowToCharacterClass)
  }

  /** Upsert a character class row. */
  async saveCharacterClass(cls: CharacterClass): Promise<void> {
    const row = characterClassToRow(cls)
    const { id: _id, ...rest } = row
    await this.db.insert(character_classes).values(row)
      .onConflictDoUpdate({ target: character_classes.id, set: rest })
  }

  // ── Encounters ─────────────────────────────────────────────────────────────

  /** Fetch an encounter by UUID. Throws if not found. */
  async getEncounter(id: string): Promise<Encounter> {
    const rows = await this.db.select().from(encounters).where(eq(encounters.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Encounter not found: ${id}`)
    return rowToEncounter(rows[0])
  }

  /** Upsert an encounter. */
  async saveEncounter(encounter: Encounter): Promise<void> {
    const row = encounterToRow(encounter)
    const { id: _id, ...rest } = row
    await this.db.insert(encounters).values(row)
      .onConflictDoUpdate({ target: encounters.id, set: rest })
  }

  /** Fetch the single active encounter for a campaign, or null if not in combat. */
  async getActiveEncounter(campaignId: string): Promise<Encounter | null> {
    const rows = await this.db.select().from(encounters)
      .where(and(eq(encounters.campaign_id, campaignId), eq(encounters.status, 'active')))
      .limit(1)
    return rows[0] ? rowToEncounter(rows[0]) : null
  }

  // ── Initiative entries ─────────────────────────────────────────────────────

  /** Fetch all initiative entries for an encounter. */
  async getInitiativeEntries(encounterId: string): Promise<InitiativeEntry[]> {
    const rows = await this.db.select().from(initiative_entries)
      .where(eq(initiative_entries.encounter_id, encounterId))
    return rows.map(rowToInitiativeEntry)
  }

  /** Upsert an initiative entry. */
  async saveInitiativeEntry(entry: InitiativeEntry): Promise<void> {
    const row = initiativeEntryToRow(entry)
    const { id: _id, ...rest } = row
    await this.db.insert(initiative_entries).values(row)
      .onConflictDoUpdate({ target: initiative_entries.id, set: rest })
  }

  // ── NPCs ───────────────────────────────────────────────────────────────────

  /** Fetch an NPC by UUID. Throws if not found. */
  async getNPC(id: string): Promise<NPC> {
    const rows = await this.db.select().from(npcs).where(eq(npcs.id, id)).limit(1)
    if (!rows[0]) throw new Error(`NPC not found: ${id}`)
    return rowToNPC(rows[0])
  }

  /** Upsert an NPC. */
  async saveNPC(npc: NPC): Promise<void> {
    const row = npcToRow(npc)
    const { id: _id, ...rest } = row
    await this.db.insert(npcs).values(row)
      .onConflictDoUpdate({ target: npcs.id, set: rest })
  }

  /** Fetch all NPCs whose JSONB location->>'zone_id' matches zoneId within a campaign. */
  async getNPCsInZone(campaignId: string, zoneId: string): Promise<NPC[]> {
    const rows = await this.db.select().from(npcs)
      .where(and(
        eq(npcs.campaign_id, campaignId),
        sql`${npcs.location}->>'zone_id' = ${zoneId}`,
      ))
    return rows.map(rowToNPC)
  }

  // ── Factions ───────────────────────────────────────────────────────────────

  /** Fetch a faction by UUID. Throws if not found. */
  async getFaction(id: string): Promise<Faction> {
    const rows = await this.db.select().from(factions).where(eq(factions.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Faction not found: ${id}`)
    return rowToFaction(rows[0])
  }

  /** Fetch a character's reputation with a specific faction. Throws if not found. */
  async getFactionReputation(characterCampaignStateId: string, factionId: string): Promise<FactionReputation> {
    const rows = await this.db.select().from(character_faction_reputation)
      .where(and(
        eq(character_faction_reputation.character_campaign_state_id, characterCampaignStateId),
        eq(character_faction_reputation.faction_id, factionId),
      )).limit(1)
    if (!rows[0]) throw new Error(`FactionReputation not found for ccs=${characterCampaignStateId} faction=${factionId}`)
    return rowToFactionReputation(rows[0])
  }

  /** Upsert a faction reputation row. */
  async saveFactionReputation(rep: FactionReputation): Promise<void> {
    const row = factionReputationToRow(rep)
    const { id: _id, ...rest } = row
    await this.db.insert(character_faction_reputation).values(row)
      .onConflictDoUpdate({ target: character_faction_reputation.id, set: rest })
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  /**
   * Fetch all items owned by an entity in a campaign.
   * Groups base rows by item_type and batch-fetches their stats tables.
   */
  async getItems(campaignId: string, ownerId: string): Promise<Item[]> {
    const baseRows = await this.db.select().from(items)
      .where(and(eq(items.campaign_id, campaignId), eq(items.owner_id, ownerId)))
    if (baseRows.length === 0) return []

    const byType = new Map<string, (typeof items.$inferSelect)[]>()
    for (const row of baseRows) {
      const group = byType.get(row.item_type) ?? []
      group.push(row)
      byType.set(row.item_type, group)
    }
    const ids = (type: string) => byType.get(type)?.map(r => r.id) ?? []

    const [meleeStats, rangedStats, armorSts, focusStats, consumableStats2, magicStats] = await Promise.all([
      ids('melee').length ? this.db.select().from(melee_item_stats).where(inArray(melee_item_stats.item_id, ids('melee'))) : Promise.resolve([]),
      ids('ranged').length ? this.db.select().from(ranged_item_stats).where(inArray(ranged_item_stats.item_id, ids('ranged'))) : Promise.resolve([]),
      ids('armor').length ? this.db.select().from(armor_stats).where(inArray(armor_stats.item_id, ids('armor'))) : Promise.resolve([]),
      ids('focus').length ? this.db.select().from(spell_focus_stats).where(inArray(spell_focus_stats.item_id, ids('focus'))) : Promise.resolve([]),
      ids('consumable').length ? this.db.select().from(consumable_stats).where(inArray(consumable_stats.item_id, ids('consumable'))) : Promise.resolve([]),
      ids('magic').length ? this.db.select().from(magic_item_stats).where(inArray(magic_item_stats.item_id, ids('magic'))) : Promise.resolve([]),
    ])

    const statsById = new Map<string, unknown>()
    for (const s of [...meleeStats, ...rangedStats, ...armorSts, ...focusStats, ...consumableStats2, ...magicStats]) {
      statsById.set((s as { item_id: string }).item_id, s)
    }

    return baseRows.map(base => rowToItem(base, statsById.get(base.id)))
  }

  /** Upsert an item (base row + stats extension row). */
  async saveItem(item: Item): Promise<void> {
    const baseRow: typeof items.$inferInsert = {
      id: item.id,
      campaign_id: item.campaignId,
      item_id: item.srdItemId,
      item_type: item.itemType,
      description: item.description ?? undefined,
      base_value: item.baseValue ?? undefined,
      unit: item.unit ?? undefined,
      owner_type: item.ownerType,
      owner_id: item.ownerId ?? undefined,
      location_type: item.locationType,
      location_id: item.locationId ?? undefined,
      quantity: item.quantity,
    }
    const { id: _id, ...baseRest } = baseRow

    await this.db.transaction(async (tx) => {
      await tx.insert(items).values(baseRow)
        .onConflictDoUpdate({ target: items.id, set: baseRest })

      switch (item.itemType) {
        case 'melee': {
          const s = item.stats
          const statsRow: typeof melee_item_stats.$inferInsert = { item_id: item.id, damage_die: s.damageDie, damage_type: s.damageType, properties: s.properties ?? undefined }
          const { item_id: _sid, ...statsRest } = statsRow
          await tx.insert(melee_item_stats).values(statsRow).onConflictDoUpdate({ target: melee_item_stats.item_id, set: statsRest })
          break
        }
        case 'ranged': {
          const s = item.stats
          const statsRow: typeof ranged_item_stats.$inferInsert = { item_id: item.id, damage_die: s.damageDie, damage_type: s.damageType, range_normal: s.rangeNormal, range_long: s.rangeLong, ammo_type: s.ammoType ?? undefined }
          const { item_id: _sid, ...statsRest } = statsRow
          await tx.insert(ranged_item_stats).values(statsRow).onConflictDoUpdate({ target: ranged_item_stats.item_id, set: statsRest })
          break
        }
        case 'armor': {
          const s = item.stats
          const statsRow: typeof armor_stats.$inferInsert = { item_id: item.id, ac: s.ac, armor_type: s.armorType, stealth_disadvantage: s.stealthDisadvantage, str_requirement: s.strRequirement ?? undefined }
          const { item_id: _sid, ...statsRest } = statsRow
          await tx.insert(armor_stats).values(statsRow).onConflictDoUpdate({ target: armor_stats.item_id, set: statsRest })
          break
        }
        case 'focus': {
          const s = item.stats
          const statsRow: typeof spell_focus_stats.$inferInsert = { item_id: item.id, focus_type: s.focusType }
          const { item_id: _sid, ...statsRest } = statsRow
          await tx.insert(spell_focus_stats).values(statsRow).onConflictDoUpdate({ target: spell_focus_stats.item_id, set: statsRest })
          break
        }
        case 'consumable': {
          const s = item.stats
          const statsRow: typeof consumable_stats.$inferInsert = { item_id: item.id, effect: s.effect as typeof consumable_stats.$inferInsert['effect'], charges_max: s.chargesMax, charges_current: s.chargesCurrent ?? undefined, recharge: s.recharge }
          const { item_id: _sid, ...statsRest } = statsRow
          await tx.insert(consumable_stats).values(statsRow).onConflictDoUpdate({ target: consumable_stats.item_id, set: statsRest })
          break
        }
        case 'magic': {
          const s = item.stats
          const statsRow: typeof magic_item_stats.$inferInsert = { item_id: item.id, custom_name: s.customName ?? undefined, rarity: s.rarity, attunement: s.attunement, attuned: s.attuned, bonus: s.bonus ?? undefined, charges_max: s.chargesMax ?? undefined, charges_current: s.chargesCurrent ?? undefined, recharge: s.recharge ?? undefined, properties: s.properties ?? undefined }
          const { item_id: _sid, ...statsRest } = statsRow
          await tx.insert(magic_item_stats).values(statsRow).onConflictDoUpdate({ target: magic_item_stats.item_id, set: statsRest })
          break
        }
      }
    })
  }

  /** Update an item's owner_id and owner_type. Used for loot distribution and trades. */
  async transferItem(itemId: string, newOwnerId: string, newOwnerType: string): Promise<void> {
    await this.db.update(items)
      .set({ owner_id: newOwnerId, owner_type: newOwnerType })
      .where(eq(items.id, itemId))
  }

  // ── Containers ─────────────────────────────────────────────────────────────

  /** Fetch a container by UUID. Throws if not found. */
  async getContainer(id: string): Promise<Container> {
    const rows = await this.db.select().from(containers).where(eq(containers.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Container not found: ${id}`)
    return rowToContainer(rows[0])
  }

  /** Upsert a container. */
  async saveContainer(container: Container): Promise<void> {
    const row = containerToRow(container)
    const { id: _id, ...rest } = row
    await this.db.insert(containers).values(row)
      .onConflictDoUpdate({ target: containers.id, set: rest })
  }

  // ── Quests ─────────────────────────────────────────────────────────────────

  /** Fetch a quest by UUID. Throws if not found. */
  async getQuest(id: string): Promise<Quest> {
    const rows = await this.db.select().from(quests).where(eq(quests.id, id)).limit(1)
    if (!rows[0]) throw new Error(`Quest not found: ${id}`)
    return rowToQuest(rows[0])
  }

  /** Upsert a quest. */
  async saveQuest(quest: Quest): Promise<void> {
    const row = questToRow(quest)
    const { id: _id, ...rest } = row
    await this.db.insert(quests).values(row)
      .onConflictDoUpdate({ target: quests.id, set: rest })
  }

  /** Fetch all quests with state='active' for a campaign. */
  async getActiveQuests(campaignId: string): Promise<Quest[]> {
    const rows = await this.db.select().from(quests)
      .where(and(eq(quests.campaign_id, campaignId), eq(quests.state, 'active')))
    return rows.map(rowToQuest)
  }

  // ── World zones ────────────────────────────────────────────────────────────

  /** Fetch a world zone by UUID. Throws if not found. */
  async getWorldZone(id: string): Promise<WorldZone> {
    const rows = await this.db.select().from(world_zones).where(eq(world_zones.id, id)).limit(1)
    if (!rows[0]) throw new Error(`WorldZone not found: ${id}`)
    return rowToWorldZone(rows[0])
  }

  /** Upsert a world zone. */
  async saveWorldZone(zone: WorldZone): Promise<void> {
    const row = worldZoneToRow(zone)
    const { id: _id, ...rest } = row
    await this.db.insert(world_zones).values(row)
      .onConflictDoUpdate({ target: world_zones.id, set: rest })
  }

  // ── World objects ──────────────────────────────────────────────────────────

  /** Fetch all world objects in a hex zone within a campaign. */
  async getWorldObjects(campaignId: string, zoneQ: number, zoneR: number): Promise<WorldObject[]> {
    const rows = await this.db.select().from(world_objects).where(
      and(
        eq(world_objects.campaign_id, campaignId),
        eq(world_objects.zone_q, zoneQ),
        eq(world_objects.zone_r, zoneR),
      )
    )
    return rows.map(rowToWorldObject)
  }

  /** Upsert a world object. */
  async saveWorldObject(obj: WorldObject): Promise<void> {
    const row = worldObjectToRow(obj)
    const { id: _id, ...rest } = row
    await this.db.insert(world_objects).values(row)
      .onConflictDoUpdate({ target: world_objects.id, set: rest })
  }

  // ── Append-only logs ───────────────────────────────────────────────────────

  /** Append a world event row to event_log. Never updated or deleted. */
  async appendEventLog(entry: EventLogEntry): Promise<void> {
    await this.db.insert(event_log).values({
      id: entry.id,
      campaign_id: entry.campaignId,
      session_id: entry.sessionId ?? undefined,
      event_type: entry.eventType,
      payload: entry.payload as typeof event_log.$inferInsert['payload'],
      summary: entry.summary ?? undefined,
      embedding: entry.embedding ?? undefined,
      timestamp: entry.timestamp,
    })
  }

  /** Append a combat action row to combat_log. Never updated or deleted. */
  async appendCombatLog(entry: CombatLogEntry): Promise<void> {
    await this.db.insert(combat_log).values({
      id: entry.id,
      encounter_id: entry.encounterId,
      session_id: entry.sessionId ?? undefined,
      round: entry.round,
      actor_id: entry.actorId,
      action_type: entry.actionType,
      payload: entry.payload as typeof combat_log.$inferInsert['payload'],
      result: entry.result ?? undefined,
      summary: entry.summary ?? undefined,
      embedding: entry.embedding ?? undefined,
      timestamp: entry.timestamp,
    })
  }

  /** Append an NPC dialogue row to npc_dialogue_log. Never updated or deleted. */
  async appendNPCDialogue(entry: NPCDialogueEntry): Promise<void> {
    await this.db.insert(npc_dialogue_log).values({
      id: entry.id,
      campaign_id: entry.campaignId,
      npc_id: entry.npcId,
      session_id: entry.sessionId ?? undefined,
      speaker_type: entry.speakerType,
      speaker_id: entry.speakerId,
      content: entry.content,
      timestamp: entry.timestamp,
    })
  }

  /** Append an OOC chat row to party_chat_log. Never updated or deleted. */
  async appendPartyChat(entry: PartyChatEntry): Promise<void> {
    await this.db.insert(party_chat_log).values({
      id: entry.id,
      campaign_id: entry.campaignId,
      session_id: entry.sessionId ?? undefined,
      speaker_id: entry.speakerId,
      content: entry.content,
      timestamp: entry.timestamp,
    })
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  /** Insert a new session row for a campaign and return it. */
  async createSession(campaignId: string): Promise<Session> {
    const rows = await this.db.insert(sessions)
      .values({ campaign_id: campaignId })
      .returning()
    return rowToSession(rows[0])
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
    trigger: SnapshotTrigger,
    triggerRef: string | null,
    label: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.select({ id: campaign_snapshots.id })
        .from(campaign_snapshots)
        .where(eq(campaign_snapshots.campaign_id, campaignId))
        .orderBy(campaign_snapshots.created_at)
      if (existing.length >= 10) {
        await tx.delete(campaign_snapshots).where(eq(campaign_snapshots.id, existing[0].id))
      }

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
        trigger_type: trigger,
        trigger_ref: triggerRef ?? undefined,
        label,
        state,
      })
    })
  }

  /** Fetch all snapshots for a campaign ordered oldest-first. */
  async getSnapshots(campaignId: string): Promise<Snapshot[]> {
    const rows = await this.db.select().from(campaign_snapshots)
      .where(eq(campaign_snapshots.campaign_id, campaignId))
      .orderBy(campaign_snapshots.created_at)
    return rows.map(rowToSnapshot)
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
      await tx.delete(factions).where(eq(factions.campaign_id, campaignId))
      await tx.delete(npcs).where(eq(npcs.campaign_id, campaignId))

      const campaignData = snap.campaigns as typeof campaigns.$inferInsert
      await tx.update(campaigns).set(campaignData).where(eq(campaigns.id, campaignId))

      type Rows<T> = T[]
      const s = snap as Record<string, Rows<unknown>>
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
