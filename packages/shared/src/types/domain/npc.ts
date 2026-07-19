/**
 * Domain types for non-player characters.
 *
 * NPCs have a full D&D stat block (stored flat in the DB as stat_str, etc.)
 * which the domain type nests under `stats: AbilityScores`.
 *
 * `schedule` and `senses` are JSONB — their shapes are defined here for type safety.
 * `languages` is JSONB (not a text array) in the DB.
 */
import type { AbilityScores } from './character'

/** Lifecycle state of an NPC. */
export type NPCStatus = 'alive' | 'dead' | 'fled' | 'unknown'

/** One window in an NPC's daily routine. `startMinute`/`endMinute` are in-game minutes from midnight. */
export interface NPCScheduleWindow {
  startMinute: number
  endMinute: number
  /** Zone id or world_object id the NPC is at during this window. */
  locationId: string
  activity: string
}

/** Per-spell usage tracking for spellcasting NPCs. */
export interface NPCSpells {
  [spellId: string]: { usesPerDay: number; usesRemaining: number }
}

/** NPC perception and special senses. `passivePerception` is always present. */
export interface NPCSenses {
  darkvision?: number
  blindsight?: number
  tremorsense?: number
  truesight?: number
  passivePerception: number
}

/**
 * Maps to `world.npcs`.
 * `stats` nests the six flat `stat_*` DB columns into an `AbilityScores` object.
 * `location` is JSONB — either a 3D world position or a zone reference.
 * `languages` is JSONB in the DB (not a text array).
 */
export interface NPC {
  id: string
  campaignId: string
  name: string
  factionId: string | null
  /** Either a precise world position or a zone id. */
  location: { x: number; y: number; z: number } | { zoneId: string } | null
  status: NPCStatus
  schedule: NPCScheduleWindow[]
  stats: AbilityScores
  ac: number
  speed: number
  /** Challenge rating string: "1/4" | "1" | "10" etc. */
  cr: string
  hp: { current: number; max: number }
  proficiencyBonus: number
  /** JSONB — shape varies by NPC type (traits like Undead Fortitude, Pack Tactics, etc.). */
  traits: unknown
  /** JSONB — shape varies by NPC type (multiattack, special attacks, etc.). */
  actions: unknown
  resistances: string[]
  immunities: string[]
  /** Null for non-spellcaster NPCs. */
  spells: NPCSpells | null
  senses: NPCSenses
  /** JSONB in DB — list of language names. */
  languages: unknown
  /** Number of legendary resistance uses per day. Null for non-boss NPCs. */
  legendaryResistances: number | null
  treasureType: 'individual' | 'hoard' | 'none'
  updatedAt: Date
}
