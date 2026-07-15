/**
 * Test data factories.
 *
 * Each factory returns a minimal valid row with sensible defaults.
 * Override any field by passing a partial: factory({ name: 'Custom' }).
 *
 * Factories don't insert — they just return the row shape. Use them with
 * db.insert(...).values(factory()) in your test setup.
 *
 * IDs default to a stable deterministic UUID per factory so tests can
 * reference related rows without juggling dynamic IDs. Override when you
 * need multiple rows of the same type in one test.
 */
import { randomUUID } from 'crypto'

/** Recursive partial — every property at any depth is optional. Used to type factory overrides. */
type DeepPartial<T> = { [K in keyof T]?: T[K] }

// ── Campaigns ─────────────────────────────────────────────────────────────────

/** Build a minimal valid campaign row. Override any field via the overrides partial. */
export function campaignFactory(overrides: DeepPartial<Record<string, unknown>> = {}) {
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
    terrain_seed: 'test-seed',
    narration_mode: 'balanced',
    api_provider: 'ollama',
    api_key_blob: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

// ── Characters ────────────────────────────────────────────────────────────────

/** Build a minimal valid character row. Override any field via the overrides partial. */
export function characterFactory(overrides: DeepPartial<Record<string, unknown>> = {}) {
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
    ...overrides,
  }
}

// ── Character campaign state ───────────────────────────────────────────────────

/** Build a minimal valid character_campaign_state row linked to characterId and campaignId. */
export function characterCampaignStateFactory(
  characterId: string,
  campaignId: string,
  overrides: DeepPartial<Record<string, unknown>> = {},
) {
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
    conditions: [],
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
    skill_proficiencies: {},
    saving_throw_profs: [],
    feats_taken: [],
    concentrating_on: null,
    tool_proficiencies: [],
    pending_levelup: null,
    updated_at: new Date(),
    ...overrides,
  }
}

// ── NPCs ──────────────────────────────────────────────────────────────────────

/** Build a minimal valid NPC row linked to campaignId. */
export function npcFactory(campaignId: string, overrides: DeepPartial<Record<string, unknown>> = {}) {
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
    resistances: [],
    immunities: [],
    spells: null,
    senses: { passive_perception: 10 },
    languages: { common: true },
    legendary_resistances: null,
    treasure_type: 'none',
    updated_at: new Date(),
    ...overrides,
  }
}

// ── Factions ──────────────────────────────────────────────────────────────────

/** Build a minimal valid faction row linked to campaignId. */
export function factionFactory(campaignId: string, overrides: DeepPartial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    name: 'The Merchant Guild',
    description: 'A powerful trade organization controlling the river routes.',
    goals: ['control the trade routes'],
    leader_npc_id: null,
    territory: null,
    updated_at: new Date(),
    ...overrides,
  }
}

// ── Encounters ────────────────────────────────────────────────────────────────

/** Build a minimal valid encounter row linked to campaignId. */
export function encounterFactory(campaignId: string, overrides: DeepPartial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    status: 'active',
    round: 1,
    started_at: new Date(),
    ended_at: null,
    ...overrides,
  }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

/** Build a minimal valid session row linked to campaignId. */
export function sessionFactory(campaignId: string, overrides: DeepPartial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    campaign_id: campaignId,
    started_at: new Date(),
    ended_at: null,
    summary: null,
    ...overrides,
  }
}

// ── Quests ────────────────────────────────────────────────────────────────────

/** Build a minimal valid quest row linked to campaignId, with a single-node DAG. */
export function questFactory(campaignId: string, overrides: DeepPartial<Record<string, unknown>> = {}) {
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
    ...overrides,
  }
}
