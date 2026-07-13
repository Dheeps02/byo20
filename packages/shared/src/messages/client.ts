import { z } from 'zod'
import { PositionSchema } from '../types/entities'

// Every WS message shares this envelope. .extend() merges these fields into
// each per-type schema without duplicating them.
const messageBase = z.object({
  id: z.string().uuid(),
  timestamp: z.number(),
  to: z.union([z.string(), z.array(z.string())]),
})

// Nested discriminated union on 'action' — each branch only carries the fields
// that action actually needs. TypeScript narrows correctly inside a switch.
const PlayerActionPayloadSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('move'), position: PositionSchema }),
  z.object({ action: z.literal('attack'), target_id: z.string() }),
  z.object({
    action: z.literal('cast_spell'),
    spell_id: z.string(),
    target_id: z.string().optional(),
    position: PositionSchema.optional(),
  }),
  z.object({ action: z.literal('interact'), target_id: z.string() }),
  z.object({
    action: z.literal('use_item'),
    item_id: z.string(),
    target_id: z.string().optional(),
  }),
])

export const PlayerActionSchema = messageBase.extend({
  type: z.literal('PLAYER_ACTION'),
  payload: PlayerActionPayloadSchema,
})
export type PlayerAction = z.infer<typeof PlayerActionSchema>

export const PlayerChatSchema = messageBase.extend({
  type: z.literal('PLAYER_CHAT'),
  payload: z.object({ text: z.string() }),
})
export type PlayerChat = z.infer<typeof PlayerChatSchema>

export const PlayerReconnectSchema = messageBase.extend({
  type: z.literal('PLAYER_RECONNECT'),
  payload: z.object({ token: z.string() }),
})
export type PlayerReconnect = z.infer<typeof PlayerReconnectSchema>

export const TurnEndSchema = messageBase.extend({
  type: z.literal('TURN_END'),
  payload: z.object({}),
})
export type TurnEnd = z.infer<typeof TurnEndSchema>

export const VoteCastSchema = messageBase.extend({
  type: z.literal('VOTE_CAST'),
  payload: z.object({ vote_id: z.string(), choice: z.boolean() }),
})
export type VoteCast = z.infer<typeof VoteCastSchema>

// The combined client schema. Pass raw WS message bytes here to validate and
// narrow to a specific ClientMessage variant.
export const ClientMessageSchema = z.discriminatedUnion('type', [
  PlayerActionSchema,
  PlayerChatSchema,
  PlayerReconnectSchema,
  TurnEndSchema,
  VoteCastSchema,
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>
