/**
 * local.* schema — byo20_local
 *
 * Characters created locally before joining any campaign.
 * Column shape is identical to game.characters in byo20_server.
 * The row migrates to the server unchanged when the player joins a campaign.
 */
import { integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const local = pgSchema('local')

export const local_characters = local.table('characters', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner_user_id: text('owner_user_id').notNull(),
  name: text('name').notNull(),
  species: text('species').notNull(),
  background: text('background').notNull(),
  backstory: text('backstory'),
  stat_str: integer('stat_str').notNull(),
  stat_dex: integer('stat_dex').notNull(),
  stat_con: integer('stat_con').notNull(),
  stat_int: integer('stat_int').notNull(),
  stat_wis: integer('stat_wis').notNull(),
  stat_cha: integer('stat_cha').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
