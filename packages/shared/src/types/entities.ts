import { z } from 'zod'

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
})
export type Position = z.infer<typeof PositionSchema>

// D&D 5.5e (2024) conditions, as a Zod enum so the wire format is validated.
export const ConditionNameSchema = z.enum([
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
])
export type ConditionName = z.infer<typeof ConditionNameSchema>

// Per-turn action budget. Lives in Redis server-side; mirrored to the client
// on each TURN_START so the UI can grey out unavailable actions.
export const ActionResourcesSchema = z.object({
  movement_remaining: z.number(),
  action_used: z.boolean(),
  bonus_action_used: z.boolean(),
  reaction_used: z.boolean(),
  free_interaction_used: z.boolean(),
  attacks_remaining: z.number().int().min(0).max(255),
})
export type ActionResources = z.infer<typeof ActionResourcesSchema>

// Minimal entity shape the renderer needs. Server filters is_visible per fog
// state before sending — the renderer never sees entities hidden from a player.
export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['player', 'npc', 'monster']),
  position: PositionSchema,
  hp: z.number().int(),
  hp_max: z.number().int().min(0),
  conditions: z.array(ConditionNameSchema),
  exhaustion_level: z.number().int().min(0).max(6),
  is_visible: z.boolean(),
  is_alive: z.boolean(),
})
export type Entity = z.infer<typeof EntitySchema>

// Fog-of-war state. 'shared' means everyone sees the same revealed tiles;
// 'per_player' means each client gets a filtered view.
export const FogStateSchema = z.object({
  mode: z.enum(['shared', 'per_player']),
  revealed: z.array(z.string()),
})
export type FogState = z.infer<typeof FogStateSchema>

export const LootItemSchema = z.object({
  item_id: z.string(),
  name: z.string(),
  quantity: z.number().int().min(1),
})
export type LootItem = z.infer<typeof LootItemSchema>

export const CoinBundleSchema = z.object({
  cp: z.number().int().min(0),
  sp: z.number().int().min(0),
  ep: z.number().int().min(0),
  gp: z.number().int().min(0),
  pp: z.number().int().min(0),
})
export type CoinBundle = z.infer<typeof CoinBundleSchema>
