/**
 * items.* schema — byo20_server
 *
 * Every item in the campaign world, plus per-type stat tables.
 * `items` is the base record (ownership, location, quantity).
 * Each item_type gets its own stat extension table with item_id as PK FK.
 *
 * Ownership tracks who holds the item. Containers are just a location
 * type — items retain their owner even when stored in a container.
 */
import { boolean, integer, jsonb, numeric, pgSchema, text, uuid } from 'drizzle-orm/pg-core'
import { campaigns } from './game'

export const items_schema = pgSchema('items')

// Base item record — every item in the campaign world lives here.
export const items = items_schema.table('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  item_id: text('item_id').notNull(),              // SRD item key or homebrew ID
  item_type: text('item_type').notNull(),           // melee | ranged | armor | focus | consumable | magic
  description: text('description'),
  base_value: integer('base_value'),                // in copper pieces
  unit: text('unit'),                               // lb | sq_yd | piece | head — null for most items
  owner_type: text('owner_type').notNull(),          // player | npc | merchant | world
  owner_id: uuid('owner_id'),
  location_type: text('location_type').notNull(),   // equipped | backpack | container | ground
  location_id: uuid('location_id'),                 // points to containers.id if location_type=container
  quantity: integer('quantity').notNull().default(1),
})

// Chests, bags, crates — a location that items can be stored in.
export const containers = items_schema.table('containers', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  name: text('name').notNull(),
  location: jsonb('location'),                      // { x, y, z } or zone id
  owner_type: text('owner_type').notNull(),          // player | npc | world
  owner_id: uuid('owner_id'),                       // null if owned by the world
})

export const melee_item_stats = items_schema.table('melee_item_stats', {
  item_id: uuid('item_id').primaryKey().references(() => items.id),
  damage_die: text('damage_die').notNull(),          // e.g. '1d8'
  damage_type: text('damage_type').notNull(),        // slashing | piercing | bludgeoning
  properties: jsonb('properties'),                   // ["finesse", "versatile"]
})

export const ranged_item_stats = items_schema.table('ranged_item_stats', {
  item_id: uuid('item_id').primaryKey().references(() => items.id),
  damage_die: text('damage_die').notNull(),
  damage_type: text('damage_type').notNull(),
  range_normal: integer('range_normal').notNull(),   // ft
  range_long: integer('range_long').notNull(),        // ft
  ammo_type: text('ammo_type'),                       // arrow | bolt | dart etc
})

export const armor_stats = items_schema.table('armor_stats', {
  item_id: uuid('item_id').primaryKey().references(() => items.id),
  ac: integer('ac').notNull(),
  armor_type: text('armor_type').notNull(),           // light | medium | heavy | shield
  stealth_disadvantage: boolean('stealth_disadvantage').notNull().default(false),
  str_requirement: integer('str_requirement'),        // null if none
})

export const spell_focus_stats = items_schema.table('spell_focus_stats', {
  item_id: uuid('item_id').primaryKey().references(() => items.id),
  focus_type: text('focus_type').notNull(),           // arcane | druidic | holy_symbol
})

export const consumable_stats = items_schema.table('consumable_stats', {
  item_id: uuid('item_id').primaryKey().references(() => items.id),
  effect: jsonb('effect').notNull(),
  charges_max: integer('charges_max').notNull(),
  charges_current: integer('charges_current'),        // null if no charges
  recharge: text('recharge').notNull(),               // dawn | dusk | never
})

export const magic_item_stats = items_schema.table('magic_item_stats', {
  item_id: uuid('item_id').primaryKey().references(() => items.id),
  custom_name: text('custom_name'),
  rarity: text('rarity').notNull(),                   // common | uncommon | rare | very_rare | legendary | artifact
  attunement: boolean('attunement').notNull().default(false),
  attuned: boolean('attuned').notNull().default(false),
  bonus: integer('bonus'),                             // +1/+2/+3; null if no bonus
  charges_max: integer('charges_max'),                 // null if no charges
  charges_current: integer('charges_current'),         // null if no charges
  recharge: text('recharge'),                          // dawn | dusk | roll | never
  properties: jsonb('properties'),
})

// Needed only for numeric weight in srd.items — re-exported so srd.ts can use same type.
export { numeric }
