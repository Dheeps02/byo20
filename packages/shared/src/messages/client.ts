import { z } from 'zod'
import { PositionSchema } from '../types/entities'

/** Shared envelope fields present on every WS message. */
const messageBase = z.object({
  id: z.string().uuid(),
  timestamp: z.number(),
  to: z.array(z.string()),
})

/**
 * Nested discriminated union on 'action' — each branch only carries the fields
 * that specific action needs. TypeScript narrows correctly inside a switch.
 */
const PlayerActionPayloadSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('move'), position: PositionSchema }),
  z.object({ action: z.literal('attack'), target_id: z.string().uuid() }),
  z.object({
    action: z.literal('cast_spell'),
    spell_id: z.string(),
    target_id: z.string().uuid().optional(),
    position: PositionSchema.optional(),
  }),
  z.object({ action: z.literal('interact'), target_id: z.string().uuid() }),
  z.object({
    action: z.literal('use_item'),
    item_id: z.string(),
    target_id: z.string().uuid().optional(),
  }),
])

/** Zod schema for a player action (move, attack, cast, interact, use item). */
export const PlayerActionSchema = messageBase.extend({
  type: z.literal('PLAYER_ACTION'),
  payload: PlayerActionPayloadSchema,
})
/** A player action message. */
export type PlayerAction = z.infer<typeof PlayerActionSchema>

/** Zod schema for an out-of-character chat message. */
export const PlayerChatSchema = messageBase.extend({
  type: z.literal('PLAYER_CHAT'),
  payload: z.object({ text: z.string() }),
})
/** An OOC chat message from a player. */
export type PlayerChat = z.infer<typeof PlayerChatSchema>

/** Zod schema for a token-based reconnect request. */
export const PlayerReconnectSchema = messageBase.extend({
  type: z.literal('PLAYER_RECONNECT'),
  payload: z.object({ token: z.string() }),
})
/** Token-based reconnect request sent after a dropped connection. */
export type PlayerReconnect = z.infer<typeof PlayerReconnectSchema>

/** Zod schema for the lobby readiness signal. */
export const PlayerReadySchema = messageBase.extend({
  type: z.literal('PLAYER_READY'),
  payload: z.object({}),
})
/** Player signals they are ready to start the session from the lobby. */
export type PlayerReady = z.infer<typeof PlayerReadySchema>

/** Zod schema for a player ending their turn. */
export const TurnEndSchema = messageBase.extend({
  type: z.literal('TURN_END'),
  payload: z.object({}),
})
/** Player signals the end of their turn. */
export type TurnEnd = z.infer<typeof TurnEndSchema>

/** Zod schema for a rest proposal — triggers a party vote. */
export const RestRequestSchema = messageBase.extend({
  type: z.literal('REST_REQUEST'),
  payload: z.object({ rest_type: z.enum(['short', 'long']) }),
})
/** Player proposes a rest; server initiates a party vote before proceeding. */
export type RestRequest = z.infer<typeof RestRequestSchema>

/**
 * Zod schema for level-up choice submission.
 * Payload shape is a placeholder — finalize against game-engine spec during
 * engine implementation.
 */
export const LevelUpChoiceSchema = messageBase.extend({
  type: z.literal('LEVEL_UP_CHOICE'),
  payload: z.object({
    character_id: z.string().uuid(),
    choices: z.record(z.string(), z.unknown()),
  }),
})
/** Player submits their level-up selections (feat, spells, subclass, etc.). */
export type LevelUpChoice = z.infer<typeof LevelUpChoiceSchema>

/** Zod schema for a vote submission. */
export const VoteCastSchema = messageBase.extend({
  type: z.literal('VOTE_CAST'),
  payload: z.object({ vote_id: z.string().uuid(), choice: z.boolean() }),
})
/** A player's yes/no vote response. */
export type VoteCast = z.infer<typeof VoteCastSchema>

/** Zod schema for a narration stream acknowledgement. */
export const NarrationAckSchema = messageBase.extend({
  type: z.literal('NARRATION_ACK'),
  payload: z.object({ sequence_id: z.string().uuid() }),
})
/** Client confirms all tokens for a narration sequence were received. */
export type NarrationAck = z.infer<typeof NarrationAckSchema>

/**
 * Zod schema for a narration stream negative acknowledgement.
 * Sent when token count mismatches total_tokens on final, or when the
 * 2-second silence timeout fires before final: true arrives.
 * Server retransmits the full sequence in a burst; client renders immediately.
 */
export const NarrationNackSchema = messageBase.extend({
  type: z.literal('NARRATION_NACK'),
  payload: z.object({ sequence_id: z.string().uuid() }),
})
/** Client reports a missing or incomplete narration sequence. */
export type NarrationNack = z.infer<typeof NarrationNackSchema>

/**
 * Combined client message schema. Pass any raw incoming WS message here on the
 * server side to validate and narrow to a specific ClientMessage variant.
 */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  PlayerActionSchema,
  PlayerChatSchema,
  PlayerReconnectSchema,
  PlayerReadySchema,
  TurnEndSchema,
  RestRequestSchema,
  LevelUpChoiceSchema,
  VoteCastSchema,
  NarrationAckSchema,
  NarrationNackSchema,
])
/** Any valid client → server WebSocket message. */
export type ClientMessage = z.infer<typeof ClientMessageSchema>
