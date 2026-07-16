/**
 * srd.* schema — byo20_local
 *
 * Static SRD 5.2 (CC-BY-4.0) reference data. Seeded once on first app launch,
 * never mutated during gameplay. All IDs are TEXT — SRD keys like "fireball",
 * "longsword", "fighter" rather than generated UUIDs.
 *
 * ruleset_version is a single-row table checked against IRulesEngine on every
 * server startup. Mismatch = hard fail, not a warning.
 */
import { boolean, integer, jsonb, numeric, pgSchema, text } from 'drizzle-orm/pg-core'

export const srd = pgSchema('srd')

export const species = srd.table('species', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  size: text('size'),
  speed: integer('speed'),
  traits: jsonb('traits'),
})

export const backgrounds = srd.table('backgrounds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  ability_scores: jsonb('ability_scores'),
  skill_profs: jsonb('skill_profs'),
  tool_profs: jsonb('tool_profs'),
  feat: text('feat'),
  languages: text('languages').array(),
  equipment: jsonb('equipment'),
})

export const classes = srd.table('classes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  hit_die: text('hit_die').notNull(),          // d6 | d8 | d10 | d12
  primary_ability: text('primary_ability'),
  saving_throw_profs: jsonb('saving_throw_profs'),
  armor_profs: jsonb('armor_profs'),
  weapon_profs: jsonb('weapon_profs'),
  skill_choices: jsonb('skill_choices'),        // options + how many to pick
  spell_slot_table: jsonb('spell_slot_table'),  // slots per level
  features_table: jsonb('features_table'),      // what you get at each level
})

export const subclasses = srd.table('subclasses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  class_id: text('class_id').notNull().references(() => classes.id),
  level_gained: integer('level_gained').notNull().default(3), // always 3 in 5.5e
  features: jsonb('features'),
})

export const feats = srd.table('feats', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(),         // origin | general | fighting_style | epic_boon
  prerequisite: jsonb('prerequisite'),
  ability_score_increase: jsonb('ability_score_increase'),
  benefits: jsonb('benefits'),
})

export const spells = srd.table('spells', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  level: integer('level').notNull(),            // 0 = cantrip
  school: text('school'),
  casting_time: text('casting_time'),
  range: text('range'),
  components: jsonb('components'),              // { v, s, m, material }
  duration: text('duration'),
  concentration: boolean('concentration').notNull().default(false),
  ritual: boolean('ritual').notNull().default(false),
  classes: text('classes').array(),
  area_of_effect: jsonb('area_of_effect'),
  damage: jsonb('damage'),
  save: text('save'),
  effects: jsonb('effects'),                    // ordered array of effect primitives
})

export const monsters = srd.table('monsters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  size: text('size'),
  type: text('type'),
  alignment: text('alignment'),
  ac: integer('ac'),
  speed: jsonb('speed'),                        // { walk, fly, swim, climb, burrow }
  hp_average: integer('hp_average'),
  hp_die: text('hp_die'),
  stat_str: integer('stat_str'),
  stat_dex: integer('stat_dex'),
  stat_con: integer('stat_con'),
  stat_int: integer('stat_int'),
  stat_wis: integer('stat_wis'),
  stat_cha: integer('stat_cha'),
  saving_throws: jsonb('saving_throws'),
  skills: jsonb('skills'),
  damage_resistances: jsonb('damage_resistances'),
  damage_immunities: jsonb('damage_immunities'),
  condition_immunities: text('condition_immunities').array(),
  senses: jsonb('senses'),
  languages: text('languages'),
  cr: text('cr'),
  xp: integer('xp'),
  traits: jsonb('traits'),
  actions: jsonb('actions'),
  bonus_actions: jsonb('bonus_actions'),
  reactions: jsonb('reactions'),
  legendary_actions: jsonb('legendary_actions'),
  treasure_type: text('treasure_type').default('none'), // individual | hoard | none
})

export const srd_items = srd.table('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  item_type: text('item_type'),                 // weapon | armor | gear | tool
  cost: integer('cost'),                        // in copper pieces
  weight: numeric('weight'),                    // in lbs
  properties: jsonb('properties'),
})

export const magic_items = srd.table('magic_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  rarity: text('rarity'),
  item_type: text('item_type'),                 // weapon | armor | wondrous | ring | rod | staff | wand | potion | scroll
  attunement: boolean('attunement').default(false),
  charges_max: integer('charges_max'),
  recharge: text('recharge'),
  properties: jsonb('properties'),
})

export const conditions = srd.table('conditions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  effects: jsonb('effects'),
})

export const weapon_masteries = srd.table('weapon_masteries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  applicable_weapons: jsonb('applicable_weapons'),
  effect: text('effect'),
})

// XP-to-level lookup. 20 rows, hand-written in the seed script.
export const xp_thresholds = srd.table('xp_thresholds', {
  level: integer('level').primaryKey(),         // 1–20
  xp_required: integer('xp_required').notNull(),
})

// BYO20's loot tables (not DMG content — custom equivalent).
export const loot_tables = srd.table('loot_tables', {
  id: text('id').primaryKey(),
  treasure_type: text('treasure_type').notNull(), // individual | hoard
  theme: text('theme'),                           // arcana | armaments | implements | relics — null for individual
  cr_band: text('cr_band').notNull(),
  coin_range: jsonb('coin_range'),
  item_pool: jsonb('item_pool'),                  // weighted pool of srd.items / srd.magic_items IDs
  item_count_range: jsonb('item_count_range'),
})

// Single-row table. Checked against IRulesEngine on every server startup.
export const ruleset_version = srd.table('ruleset_version', {
  ruleset_id: text('ruleset_id').primaryKey(),   // e.g. 'dnd-5.5e-2024'
  srd_version: text('srd_version').notNull(),    // e.g. '5.2.1'
})
