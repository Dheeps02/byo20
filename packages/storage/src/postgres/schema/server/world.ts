/**
 * world.* schema — byo20_server
 *
 * NPCs, factions, reputation, quests, hex grid, villain agenda,
 * campaign milestones, narration pool, and campaign snapshots.
 */
import { boolean, integer, jsonb, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { campaigns } from './game'

/** Drizzle schema handle for the `world` Postgres schema. */
export const world = pgSchema('world')

/** NPC identity and stat block for a campaign. faction_id is a plain uuid — FK deferred below to break the circular reference with factions. */
export const npcs = world.table('npcs', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  name: text('name').notNull(),
  faction_id: uuid('faction_id'),                         // FK set after factions table created; circular ref handled below
  location: jsonb('location'),                             // { x, y, z } or zone id
  status: text('status').notNull().default('alive'),       // alive | dead | fled | unknown
  schedule: jsonb('schedule'),
  stat_str: integer('stat_str').notNull(),
  stat_dex: integer('stat_dex').notNull(),
  stat_con: integer('stat_con').notNull(),
  stat_int: integer('stat_int').notNull(),
  stat_wis: integer('stat_wis').notNull(),
  stat_cha: integer('stat_cha').notNull(),
  ac: integer('ac').notNull(),
  speed: integer('speed').notNull(),
  cr: text('cr').notNull(),                                // "1/4" | "1" | "10" etc
  hp_current: integer('hp_current').notNull(),
  hp_max: integer('hp_max').notNull(),
  proficiency_bonus: integer('proficiency_bonus').notNull(),
  traits: jsonb('traits'),
  actions: jsonb('actions'),
  resistances: text('resistances').array(),
  immunities: text('immunities').array(),
  spells: jsonb('spells'),                                 // null for non-spellcaster NPCs
  senses: jsonb('senses'),
  languages: jsonb('languages'),
  legendary_resistances: integer('legendary_resistances'), // null for non-boss NPCs
  treasure_type: text('treasure_type').notNull().default('none'), // individual | hoard | none
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Factions reference their leader NPC — both tables reference each other.
 * Drizzle handles this with a deferred FK; faction_id on npcs is a plain uuid above.
 */
export const factions = world.table('factions', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  name: text('name').notNull(),
  description: text('description'),
  goals: jsonb('goals'),                                   // ["control the trade routes", ...]
  leader_npc_id: uuid('leader_npc_id').references(() => npcs.id),
  territory: jsonb('territory'),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Per-character standing with each faction. reputation ranges -100 to 100. */
export const character_faction_reputation = world.table('character_faction_reputation', {
  id: uuid('id').primaryKey().defaultRandom(),
  character_campaign_state_id: uuid('character_campaign_state_id').notNull(),
  faction_id: uuid('faction_id').notNull().references(() => factions.id),
  reputation: integer('reputation').notNull().default(0),  // -100 to 100
  attitude: text('attitude').notNull().default('indifferent'), // friendly | indifferent | hostile
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Faction-to-faction relationships. Enforce faction_a_id < faction_b_id at the app layer. */
export const faction_relationships = world.table('faction_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  faction_a_id: uuid('faction_a_id').notNull().references(() => factions.id),
  faction_b_id: uuid('faction_b_id').notNull().references(() => factions.id),
  relationship: text('relationship').notNull(),             // ally | rival | enemy | neutral
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Party-wide quest log. Nodes are a DAG stored as JSONB. */
export const quests = world.table('quests', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  title: text('title').notNull(),
  source_type: text('source_type').notNull(),               // npc | world_event | bounty_board | faction | found | companion | rumor
  state: text('state').notNull().default('available'),      // available | active | completed | failed | abandoned
  faction_id: uuid('faction_id').references(() => factions.id), // nullable — loose coupling
  nodes: jsonb('nodes').notNull(),                          // QuestNode array with objectives, edges, terminal payloads
  current_node_id: text('current_node_id').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Hex grid. One row per hex. Surrogate UUID PK used as FK target — avoids 3-column composite FKs.
 * (campaign_id, hex_q, hex_r) is a UNIQUE constraint, not the PK.
 */
export const world_zones = world.table('world_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  hex_q: integer('hex_q').notNull(),                        // axial coordinate q
  hex_r: integer('hex_r').notNull(),                        // axial coordinate r
  gen_state: text('gen_state').notNull().default('ungenerated'), // ungenerated | partial | full
  zone_type: text('zone_type'),                             // wilderness | town | dungeon | coastal | mountain | forest
  content: jsonb('content'),                                // populated on full gen
  generated_at: timestamp('generated_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('world_zones_campaign_hex_unique').on(t.campaign_id, t.hex_q, t.hex_r),
])

/**
 * Villain / world events scheduled at campaign gen. Fires on world_clock_tick.
 * Also tracked in Redis as a sorted set for fast O(log N) lookup by clock value.
 */
export const campaign_agenda = world.table('campaign_agenda', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  fires_at_clock: integer('fires_at_clock').notNull(),       // game-time minutes
  fired: boolean('fired').notNull().default(false),
  fired_at: timestamp('fired_at', { withTimezone: true }),   // null until fired
  world_mutations: jsonb('world_mutations'),                  // fixed-vocab mutation instructions
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Required narrative gates and major story beats. */
export const campaign_milestones = world.table('campaign_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  title: text('title').notNull(),
  description: text('description'),
  required: boolean('required').notNull().default(false),
  completed: boolean('completed').notNull().default(false),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  triggers_pool_refresh: boolean('triggers_pool_refresh').notNull().default(false),
  order_hint: integer('order_hint'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Pre-generated narration strings. Refreshed in background on milestone completion. */
export const narration_pool = world.table('narration_pool', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  event_type: text('event_type').notNull(),                   // attack_hit | attack_miss | movement | etc.
  content: text('content').notNull(),
  generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Rolling window of full campaign state snapshots. Max 10 per campaign.
 * Mutable game state only — append-only logs are never snapshotted.
 */
export const campaign_snapshots = world.table('campaign_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  trigger_type: text('trigger_type').notNull(),               // encounter_end | milestone | rest | quest_transition | session_start | session_end
  trigger_ref: uuid('trigger_ref'),                           // FK to relevant row; nullable
  label: text('label').notNull(),
  state: jsonb('state').notNull(),                            // full mutable campaign state dump
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
