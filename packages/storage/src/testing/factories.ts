/**
 * Test data factories.
 *
 * Each factory returns a minimal valid row with sensible defaults.
 * Override any field by passing a partial: factory({ name: 'Custom' }).
 *
 * IDs are random UUIDs on every call — parallel-safe (no PK clashes between
 * workers). Capture the return value when you need to reference the ID in a
 * related row.
 *
 * Factories don't insert — they just return the row shape. Use them with
 * db.insert(...).values(factory()) in your test setup.
 *
 * Overrides are shallow-merged. Passing a partial JSONB value (e.g.
 * { death_saves: { success: 1 } }) replaces the whole field, not just
 * the nested key. Pass the full object when overriding JSONB fields.
 *
 * Note: character class is in the separate `character_classes` table, not on
 * `characters`. Use a `characterClassesFactory` insert alongside `characterFactory`.
 */
import { randomUUID } from 'crypto'

// ── Campaigns ─────────────────────────────────────────────────────────────────

function campaignDefaults() {
  return {
    id: randomUUID(),
    name: 'Test Campaign',
    dm_user_id: 'dm-user-1',
    status: 'active',
    phase: 'exploration',
    world_clock: 0,
    movement_system: 'hex',
    fog_mode: 'shared',
    hp_on_levelup: 'fixed',
    sync_interval_mins: 5,
    premise: null,
    campaign_length: 'medium',
    tone: 'high_fantasy',
    world_gen_status: 'complete',
    campaign_seed: 'test-seed',
    heightmap_resolution: 10,
    world_depth: 'standard',
    library_access_unlocked: false,
    narration_mode: 'balanced',
    api_provider: 'ollama',
    api_key_blob: null,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

/** Build a minimal valid campaign row. Override any field via the overrides partial. */
export function campaignFactory(overrides: Partial<ReturnType<typeof campaignDefaults>> = {}) {
  return { ...campaignDefaults(), ...overrides }
}

// ── Characters ────────────────────────────────────────────────────────────────

function characterDefaults() {
  return {
    id: randomUUID(),
    owner_user_id: 'player-user-1',
    name: 'Aetherion Brightblade',
    species: 'human',
    background: 'soldier',
    backstory: 'A veteran of many campaigns.',
    stat_str: 16,
    stat_dex: 12,
    stat_con: 14,
    stat_int: 10,
    stat_wis: 13,
    stat_cha: 8,
    created_at: new Date(),
  }
}

/** Build a minimal valid character row. Override any field via the overrides partial. */
export function characterFactory(overrides: Partial<ReturnType<typeof characterDefaults>> = {}) {
  return { ...characterDefaults(), ...overrides }
}

// ── Character campaign state ───────────────────────────────────────────────────

function characterCampaignStateDefaults(characterId: string, campaignId: string) {
  return {
    id: randomUUID(),
    character_id: characterId,
    campaign_id: campaignId,
    level: 1,
    xp: 0,
    hp_current: 10,
    hp_max: 10,
    hit_dice_remaining: 1,
    spell_slots: null,
    conditions: [] as string[],
    death_saves: { success: 0, failure: 0 },
    position: { x: 0, y: 0, z: 0 },
    is_active: true,
    exhaustion_level: 0,
    temp_hp: 0,
    heroic_inspiration: false,
    class_resources: null,
    prepared_spells: null,
    weapon_masteries: null,
    languages: ['common'],
    skill_proficiencies: {} as Record<string, string>,
    saving_throw_profs: [] as string[],
    feats_taken: [] as string[],
    concentrating_on: null,
    tool_proficiencies: [] as string[],
    pending_levelup: null,
    updated_at: new Date(),
  }
}

/** Build a minimal valid character_campaign_state row linked to characterId and campaignId. */
export function characterCampaignStateFactory(
  characterId: string,
  campaignId: string,
  overrides: Partial<ReturnType<typeof characterCampaignStateDefaults>> = {},
) {
  return { ...characterCampaignStateDefaults(characterId, campaignId), ...overrides }
}

// ── NPCs ──────────────────────────────────────────────────────────────────────

function npcDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    name: 'Garrick the Innkeeper',
    faction_id: null,
    location: { zone_id: null },
    status: 'alive',
    schedule: null,
    stat_str: 10,
    stat_dex: 10,
    stat_con: 10,
    stat_int: 10,
    stat_wis: 10,
    stat_cha: 12,
    ac: 10,
    speed: 30,
    cr: '0',
    hp_current: 4,
    hp_max: 4,
    proficiency_bonus: 2,
    traits: null,
    actions: null,
    resistances: [] as string[],
    immunities: [] as string[],
    spells: null,
    senses: { passive_perception: 10 },
    languages: { common: true } as Record<string, boolean>,
    legendary_resistances: null,
    treasure_type: 'none',
    updated_at: new Date(),
  }
}

/** Build a minimal valid NPC row linked to campaignId. */
export function npcFactory(campaignId: string, overrides: Partial<ReturnType<typeof npcDefaults>> = {}) {
  return { ...npcDefaults(campaignId), ...overrides }
}

// ── Factions ──────────────────────────────────────────────────────────────────

function factionDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    name: 'The Merchant Guild',
    description: 'A powerful trade organization controlling the river routes.',
    goals: ['control the trade routes'],
    leader_npc_id: null,
    territory: null,
    updated_at: new Date(),
  }
}

/** Build a minimal valid faction row linked to campaignId. */
export function factionFactory(campaignId: string, overrides: Partial<ReturnType<typeof factionDefaults>> = {}) {
  return { ...factionDefaults(campaignId), ...overrides }
}

// ── Encounters ────────────────────────────────────────────────────────────────

function encounterDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    status: 'active',
    round: 1,
    started_at: new Date(),
    ended_at: null,
  }
}

/** Build a minimal valid encounter row linked to campaignId. */
export function encounterFactory(campaignId: string, overrides: Partial<ReturnType<typeof encounterDefaults>> = {}) {
  return { ...encounterDefaults(campaignId), ...overrides }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

function sessionDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    started_at: new Date(),
    ended_at: null,
    summary: null,
  }
}

/** Build a minimal valid session row linked to campaignId. */
export function sessionFactory(campaignId: string, overrides: Partial<ReturnType<typeof sessionDefaults>> = {}) {
  return { ...sessionDefaults(campaignId), ...overrides }
}

// ── Quests ────────────────────────────────────────────────────────────────────

function questDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    title: 'Investigate the Old Mill',
    source_type: 'npc',
    state: 'active',
    faction_id: null,
    nodes: [{ id: 'start', objective: 'Travel to the old mill', edges: [], terminal: false }],
    current_node_id: 'start',
    created_at: new Date(),
    updated_at: new Date(),
  }
}

/** Build a minimal valid quest row linked to campaignId, with a single-node DAG. */
export function questFactory(campaignId: string, overrides: Partial<ReturnType<typeof questDefaults>> = {}) {
  return { ...questDefaults(campaignId), ...overrides }
}

// ── World zones ───────────────────────────────────────────────────────────────

function worldZoneDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    hex_q: 0,
    hex_r: 0,
    gen_state: 'ungenerated',
    zone_type: null,
    content: null,
    generated_at: null,
    updated_at: new Date(),
  }
}

/** Build a minimal valid world_zone row linked to campaignId. */
export function worldZoneFactory(campaignId: string, overrides: Partial<ReturnType<typeof worldZoneDefaults>> = {}) {
  return { ...worldZoneDefaults(campaignId), ...overrides }
}

// ── Agenda events ─────────────────────────────────────────────────────────────

function agendaEventDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    title: 'Test Event',
    description: 'A test agenda event.',
    fires_at_clock: 100,
    fired: false,
    fired_at: null,
    world_mutations: null,
    created_at: new Date(),
  }
}

/** Build a minimal valid agenda_event row linked to campaignId. */
export function agendaEventFactory(campaignId: string, overrides: Partial<ReturnType<typeof agendaEventDefaults>> = {}) {
  return { ...agendaEventDefaults(campaignId), ...overrides }
}

// ── World objects ─────────────────────────────────────────────────────────────

function worldObjectDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    zone_q: 0,
    zone_r: 0,
    name: 'The Old Mill',
    object_type: 'structure',
    status: 'intact',
    position: { x: 0, y: 0, z: 0 },
    owner_type: null,
    owner_id: null,
    properties: null,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

/** Build a minimal valid world_object row linked to campaignId. */
export function worldObjectFactory(campaignId: string, overrides: Partial<ReturnType<typeof worldObjectDefaults>> = {}) {
  return { ...worldObjectDefaults(campaignId), ...overrides }
}

// ── Lore entries ──────────────────────────────────────────────────────────────

function loreEntryDefaults(campaignId: string) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    title: 'The Fall of the Ember Throne',
    content: 'A test lore entry.',
    embedding: Array.from({ length: 768 }, () => 0) as number[],
    category: 'world_history',
    source_id: null,
    source_type: null,
    created_at: new Date(),
  }
}

/** Build a minimal valid lore_entry row linked to campaignId. Epic campaigns only. */
export function loreEntryFactory(campaignId: string, overrides: Partial<ReturnType<typeof loreEntryDefaults>> = {}) {
  return { ...loreEntryDefaults(campaignId), ...overrides }
}
