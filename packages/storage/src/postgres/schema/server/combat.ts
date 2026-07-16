/**
 * combat.* schema — byo20_server
 *
 * Encounters and initiative entries. One encounter per combat (supports
 * split party with parallel encounters). Initiative entries are one row
 * per combatant.
 */
import { boolean, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { campaigns } from './game'

export const combat = pgSchema('combat')

// One row per combat encounter. Supports parallel encounters for split parties.
export const encounters = combat.table('encounters', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => campaigns.id),
  status: text('status').notNull().default('active'),      // active | completed
  round: integer('round').notNull().default(1),
  started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  ended_at: timestamp('ended_at', { withTimezone: true }),
})

// One row per combatant in an encounter (player, NPC, or AI player).
export const initiative_entries = combat.table('initiative_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  encounter_id: uuid('encounter_id').notNull().references(() => encounters.id),
  entity_id: uuid('entity_id').notNull(),
  entity_type: text('entity_type').notNull(),              // player | npc | ai_player
  initiative_roll: integer('initiative_roll').notNull(),
  position: integer('position').notNull(),                  // order in turn sequence
  is_current_turn: boolean('is_current_turn').notNull().default(false),
  surprised: boolean('surprised').notNull().default(false), // cleared after initiative is rolled
})
