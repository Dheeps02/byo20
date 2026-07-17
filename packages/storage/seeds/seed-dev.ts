/**
 * Dev seed — creates a realistic sample campaign in byo20_server for local
 * development and manual testing. Not run in CI or production.
 *
 *   bun run seed:dev
 *
 * Expects SERVER_DB_URL and LOCAL_DB_URL env vars.
 * Safe to re-run — campaign is identified by a fixed dev UUID, which means
 * the second run will fail gracefully on the unique campaign name check
 * (or you can drop the dev DB and start fresh).
 */
import { createServerDb } from '../src/postgres/client'
import {
  campaigns, characters, character_campaign_state, character_classes,
} from '../src/postgres/schema/server/game'
import { npcs, factions, quests, world_zones } from '../src/postgres/schema/server/world'
import { sessions } from '../src/postgres/schema/server/log'

/**
 * Fixed UUIDs for the dev seed so re-runs produce consistent cross-table references.
 * Override individual fields when inserting if you need variation.
 */
const DEV = {
  campaignId:  '00000000-0000-0000-0000-000000000001',
  char1Id:     '00000000-0000-0000-0000-000000000010',
  char2Id:     '00000000-0000-0000-0000-000000000011',
  ccs1Id:      '00000000-0000-0000-0000-000000000020',
  ccs2Id:      '00000000-0000-0000-0000-000000000021',
  factionId:   '00000000-0000-0000-0000-000000000030',
  npcId:       '00000000-0000-0000-0000-000000000040',
  questId:     '00000000-0000-0000-0000-000000000050',
  zoneId:      '00000000-0000-0000-0000-000000000060',
}

/** Connect to byo20_server and insert a sample campaign, characters, NPC, faction, quest, and session. */
async function main() {
  const serverUrl = process.env.SERVER_DB_URL
  if (!serverUrl) {
    console.error('SERVER_DB_URL is not set. Export it and re-run.')
    process.exit(1)
  }

  console.log('Seeding dev data into byo20_server...\n')
  const { db, sql } = await createServerDb(serverUrl)

  try {
    // Campaign
    await db.insert(campaigns).values({
      id: DEV.campaignId,
      name: 'The Sunken Citadel',
      dm_user_id: 'dev-dm',
      status: 'active',
      phase: 'exploration',
      world_clock: 480,        // 8 hours into the first in-game day
      movement_system: 'hex',
      fog_mode: 'shared',
      hp_on_levelup: 'fixed',
      sync_interval_mins: 5,
      premise: 'A long-forgotten citadel has risen from a coastal swamp. Locals report strange lights at night and missing livestock.',
      campaign_length: 'medium',
      tone: 'high_fantasy',
      world_gen_status: 'complete',
      campaign_seed: 'dev-seed-42',
      narration_mode: 'balanced',
      api_provider: 'ollama',
      api_key_blob: null,
    }).onConflictDoNothing()
    console.log('  ✓ campaign: The Sunken Citadel')

    // Characters
    await db.insert(characters).values([
      {
        id: DEV.char1Id,
        owner_user_id: 'dev-player-1',
        name: 'Aetherion Brightblade',
        species: 'human',
        background: 'soldier',
        backstory: 'A veteran of the Estmarch border wars, now seeking purpose in adventure.',
        stat_str: 16, stat_dex: 12, stat_con: 14,
        stat_int: 10, stat_wis: 13, stat_cha: 8,
      },
      {
        id: DEV.char2Id,
        owner_user_id: 'dev-player-2',
        name: 'Sylvara Moonwhisper',
        species: 'elf',
        background: 'sage',
        backstory: 'A scholar of ancient ruins who believes the citadel holds pre-Sundering secrets.',
        stat_str: 8,  stat_dex: 14, stat_con: 12,
        stat_int: 16, stat_wis: 15, stat_cha: 11,
      },
    ]).onConflictDoNothing()
    console.log('  ✓ characters: 2')

    // Character campaign state
    await db.insert(character_campaign_state).values([
      {
        id: DEV.ccs1Id,
        character_id: DEV.char1Id,
        campaign_id: DEV.campaignId,
        level: 3,
        xp: 1200,
        hp_current: 26,
        hp_max: 28,
        hit_dice_remaining: 2,
        spell_slots: null,
        conditions: [],
        death_saves: { success: 0, failure: 0 },
        position: { x: 4, y: 2, z: 0 },
        is_active: true,
        exhaustion_level: 0,
        temp_hp: 0,
        heroic_inspiration: false,
        class_resources: { second_wind: 1, action_surge: 1 },
        prepared_spells: null,
        weapon_masteries: ['longsword', 'shield'],
        languages: ['common', 'dwarvish'],
        skill_proficiencies: { athletics: 'proficient', intimidation: 'proficient', perception: 'proficient', survival: 'proficient' },
        saving_throw_profs: ['str', 'con'],
        feats_taken: ['tough'],
        concentrating_on: null,
        tool_proficiencies: ["smith's tools"],
        pending_levelup: null,
      },
      {
        id: DEV.ccs2Id,
        character_id: DEV.char2Id,
        campaign_id: DEV.campaignId,
        level: 3,
        xp: 1100,
        hp_current: 18,
        hp_max: 18,
        hit_dice_remaining: 3,
        spell_slots: { 1: { max: 4, used: 1 }, 2: { max: 2, used: 0 } },
        conditions: [],
        death_saves: { success: 0, failure: 0 },
        position: { x: 4, y: 3, z: 0 },
        is_active: true,
        exhaustion_level: 0,
        temp_hp: 0,
        heroic_inspiration: true,
        class_resources: null,
        prepared_spells: ['fireball', 'fly', 'mage-armor', 'magic-missile', 'shield', 'detect-magic'],
        weapon_masteries: null,
        languages: ['common', 'elvish', 'draconic', 'primordial'],
        skill_proficiencies: { arcana: 'expertise', history: 'proficient', investigation: 'proficient' },
        saving_throw_profs: ['int', 'wis'],
        feats_taken: ['magic-initiate-wizard'],
        concentrating_on: null,
        tool_proficiencies: [],
        pending_levelup: null,
      },
    ]).onConflictDoNothing()
    console.log('  ✓ character campaign states: 2')

    // Character classes
    await db.insert(character_classes).values([
      {
        character_campaign_state_id: DEV.ccs1Id,
        class: 'fighter',
        subclass: 'champion',
        class_level: 3,
        prepared_spells: null,
      },
      {
        character_campaign_state_id: DEV.ccs2Id,
        class: 'wizard',
        subclass: 'school-of-evocation',
        class_level: 3,
        prepared_spells: ['fireball', 'fly', 'mage-armor', 'magic-missile', 'shield', 'detect-magic'],
      },
    ]).onConflictDoNothing()
    console.log('  ✓ character classes: 2')

    // Faction
    await db.insert(factions).values({
      id: DEV.factionId,
      campaign_id: DEV.campaignId,
      name: 'The Saltmarsh Watchers',
      description: 'A loose coalition of local militia and fishermen who keep watch over the coastal approach.',
      goals: ['protect Saltmarsh from the citadel threat', 'recover missing livestock'],
      leader_npc_id: DEV.npcId,
      territory: null,
    }).onConflictDoNothing()
    console.log('  ✓ faction: The Saltmarsh Watchers')

    // NPC
    await db.insert(npcs).values({
      id: DEV.npcId,
      campaign_id: DEV.campaignId,
      name: 'Captain Elara Marsh',
      faction_id: DEV.factionId,
      location: { zone_id: DEV.zoneId },
      status: 'alive',
      schedule: null,
      stat_str: 14, stat_dex: 12, stat_con: 13,
      stat_int: 11, stat_wis: 14, stat_cha: 15,
      ac: 14,
      speed: 30,
      cr: '2',
      hp_current: 45,
      hp_max: 45,
      proficiency_bonus: 2,
      traits: [{ name: 'Tactical Mind', description: 'She can use Help as a bonus action.' }],
      actions: [{ name: 'Shortsword', description: 'Melee attack: +4 to hit, 1d6+2 piercing.' }],
      resistances: [],
      immunities: [],
      spells: null,
      senses: { passive_perception: 14 },
      languages: { common: true, elvish: true },
      legendary_resistances: null,
      treasure_type: 'none',
    }).onConflictDoNothing()
    console.log('  ✓ NPC: Captain Elara Marsh')

    // World zone
    await db.insert(world_zones).values({
      id: DEV.zoneId,
      campaign_id: DEV.campaignId,
      hex_q: 0,
      hex_r: 0,
      gen_state: 'full',
      zone_type: 'wilderness',
      heightmap_chunk: null,
      content: {
        world_object_ids: [],
        npc_ids: [DEV.npcId],
        encounter_zones: [],
        quest_hooks: [DEV.questId],
      },
      generated_at: new Date(),
    }).onConflictDoNothing()
    console.log('  ✓ world zone: Approach to the Sunken Citadel')

    // Quest
    await db.insert(quests).values({
      id: DEV.questId,
      campaign_id: DEV.campaignId,
      title: 'Silence the Citadel',
      source_type: 'npc',
      state: 'active',
      faction_id: DEV.factionId,
      nodes: [
        { id: 'start', objective: 'Investigate the lights seen near the citadel at night', edges: ['find-source'], terminal: false },
        { id: 'find-source', objective: 'Locate what is causing the disturbance', edges: ['confront-threat'], terminal: false },
        { id: 'confront-threat', objective: 'Neutralize the threat by any means', edges: ['report-back'], terminal: false },
        { id: 'report-back', objective: 'Return to Captain Marsh with news', edges: [], terminal: true },
      ],
      current_node_id: 'start',
    }).onConflictDoNothing()
    console.log('  ✓ quest: Silence the Citadel')

    // Session (in progress)
    await db.insert(sessions).values({
      campaign_id: DEV.campaignId,
      started_at: new Date('2025-01-01T18:00:00Z'),
      ended_at: null,
      summary: null,
    }).onConflictDoNothing()
    console.log('  ✓ session: open')

    console.log('\nDev seed complete. Start the server and connect as dev-dm.')
  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
