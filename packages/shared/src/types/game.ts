import { z } from 'zod'

// z.enum([...]) creates both a Zod validator and, via z.infer<>, a TypeScript
// union type. One source of truth — the array — drives both the runtime check
// and the compile-time type.

export const GamePhaseSchema = z.enum([
  'lobby',
  'exploration',
  'combat',
  'short_rest',
  'long_rest',
  'session_ended',
])
export type GamePhase = z.infer<typeof GamePhaseSchema>

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
export type DamageType = z.infer<typeof DamageTypeSchema>

export const DieTypeSchema = z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'])
export type DieType = z.infer<typeof DieTypeSchema>

export const AbilityScoreSchema = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha'])
export type AbilityScore = z.infer<typeof AbilityScoreSchema>

// Used in the SYSTEM server message — covers all meta lifecycle events.
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
export type SystemEvent = z.infer<typeof SystemEventSchema>
