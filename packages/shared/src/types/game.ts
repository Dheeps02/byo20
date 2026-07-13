import { z } from 'zod'

/** Zod schema for the current phase of the game session. */
export const GamePhaseSchema = z.enum([
  'lobby',
  'exploration',
  'combat',
  'short_rest',
  'long_rest',
  'session_ended',
])
/** The current phase of the game session. */
export type GamePhase = z.infer<typeof GamePhaseSchema>

/** Zod schema for D&D 5.5e damage types. */
export const DamageTypeSchema = z.enum([
  'bludgeoning',
  'piercing',
  'slashing',
  'acid',
  'cold',
  'fire',
  'lightning',
  'thunder',
  'force',
  'necrotic',
  'psychic',
  'radiant',
  'poison',
])
/** A D&D 5.5e damage type. */
export type DamageType = z.infer<typeof DamageTypeSchema>

/** Zod schema for standard polyhedral die types. */
export const DieTypeSchema = z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'])
/** A standard polyhedral die type. */
export type DieType = z.infer<typeof DieTypeSchema>

/** Zod schema for the six D&D ability scores. */
export const AbilityScoreSchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
/** One of the six D&D ability scores. */
export type AbilityScore = z.infer<typeof AbilityScoreSchema>

/** Zod schema for meta lifecycle events sent in SYSTEM messages. */
export const SystemEventSchema = z.enum([
  'paused',
  'resumed',
  'session_ended',
  'kicked',
  'player_joined',
  'player_disconnected',
  'player_reconnected',
  'world_gen_stage',
  'turn_skipped',
])
/** A meta lifecycle event sent in a SYSTEM message. */
export type SystemEvent = z.infer<typeof SystemEventSchema>
