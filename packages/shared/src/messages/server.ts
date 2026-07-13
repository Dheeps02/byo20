import { z } from 'zod'
import {
  ActionResourcesSchema,
  ConditionNameSchema,
  CoinBundleSchema,
  EntitySchema,
  FogStateSchema,
  LootItemSchema,
} from '../types/entities'
import {
  AbilityScoreSchema,
  DamageTypeSchema,
  DieTypeSchema,
  GamePhaseSchema,
  SystemEventSchema,
} from '../types/game'

const messageBase = z.object({
  id: z.string().uuid(),
  timestamp: z.number(),
  to: z.union([z.string(), z.array(z.string())]),
})

// ─── Combat ──────────────────────────────────────────────────────────────────

export const CombatStartSchema = messageBase.extend({
  type: z.literal('COMBAT_START'),
  payload: z.object({ initiative_order: z.array(z.string()) }),
})
export type CombatStart = z.infer<typeof CombatStartSchema>

export const TurnStartSchema = messageBase.extend({
  type: z.literal('TURN_START'),
  payload: z.object({
    combatant_id: z.string(),
    round: z.number().int().min(1),
    resources: ActionResourcesSchema,
  }),
})
export type TurnStart = z.infer<typeof TurnStartSchema>

export const RollResultSchema = messageBase.extend({
  type: z.literal('ROLL_RESULT'),
  payload: z.object({
    die: DieTypeSchema,
    faces: z.array(z.number().int().min(1)),
    modifiers: z.array(z.number().int()),
    total: z.number().int(),
    seed: z.number(),
  }),
})
export type RollResult = z.infer<typeof RollResultSchema>

export const AttackResultSchema = messageBase.extend({
  type: z.literal('ATTACK_RESULT'),
  payload: z.object({
    attacker_id: z.string(),
    target_id: z.string(),
    hit: z.boolean(),
    ac: z.number().int(),
    roll_total: z.number().int(),
    critical: z.boolean(),
  }),
})
export type AttackResult = z.infer<typeof AttackResultSchema>

export const DamageResultSchema = messageBase.extend({
  type: z.literal('DAMAGE_RESULT'),
  payload: z.object({
    target_id: z.string(),
    amount: z.number().int().min(0),
    type: DamageTypeSchema,
    hp_remaining: z.number().int(),
  }),
})
export type DamageResult = z.infer<typeof DamageResultSchema>

export const SavingThrowSchema = messageBase.extend({
  type: z.literal('SAVING_THROW'),
  payload: z.object({
    target_id: z.string(),
    ability: AbilityScoreSchema,
    dc: z.number().int().min(1),
    success: z.boolean(),
  }),
})
export type SavingThrow = z.infer<typeof SavingThrowSchema>

export const ConditionAppliedSchema = messageBase.extend({
  type: z.literal('CONDITION_APPLIED'),
  payload: z.object({
    target_id: z.string(),
    condition: ConditionNameSchema,
  }),
})
export type ConditionApplied = z.infer<typeof ConditionAppliedSchema>

export const ConditionRemovedSchema = messageBase.extend({
  type: z.literal('CONDITION_REMOVED'),
  payload: z.object({
    target_id: z.string(),
    condition: ConditionNameSchema,
  }),
})
export type ConditionRemoved = z.infer<typeof ConditionRemovedSchema>

export const DeathSaveResultSchema = messageBase.extend({
  type: z.literal('DEATH_SAVE_RESULT'),
  payload: z.object({
    character_id: z.string(),
    successes: z.number().int().min(0).max(3),
    failures: z.number().int().min(0).max(3),
    stabilized: z.boolean(),
  }),
})
export type DeathSaveResult = z.infer<typeof DeathSaveResultSchema>

// Server-side TURN_END carries the combatant ID (confirms whose turn ended).
// Client-side TURN_END is just an empty signal — same wire type, different role.
export const TurnEndSchema = messageBase.extend({
  type: z.literal('TURN_END'),
  payload: z.object({ combatant_id: z.string() }),
})
export type TurnEnd = z.infer<typeof TurnEndSchema>

export const TurnSkippedSchema = messageBase.extend({
  type: z.literal('TURN_SKIPPED'),
  payload: z.object({ combatant_id: z.string() }),
})
export type TurnSkipped = z.infer<typeof TurnSkippedSchema>

export const CombatEndSchema = messageBase.extend({
  type: z.literal('COMBAT_END'),
  payload: z.object({
    outcome: z.enum(['victory', 'tpk', 'retreat', 'dm_ended']),
  }),
})
export type CombatEnd = z.infer<typeof CombatEndSchema>

// ─── World ────────────────────────────────────────────────────────────────────

export const SkillCheckResultSchema = messageBase.extend({
  type: z.literal('SKILL_CHECK_RESULT'),
  payload: z.object({
    character_id: z.string(),
    skill: z.string(),
    roll_total: z.number().int(),
    dc: z.number().int().min(1),
    success: z.boolean(),
    secret: z.boolean(),
  }),
})
export type SkillCheckResult = z.infer<typeof SkillCheckResultSchema>

export const XpGrantedSchema = messageBase.extend({
  type: z.literal('XP_GRANTED'),
  payload: z.object({
    grants: z.array(z.object({ character_id: z.string(), amount: z.number().int().min(0) })),
    reason: z.string(),
  }),
})
export type XpGranted = z.infer<typeof XpGrantedSchema>

export const LootGrantedSchema = messageBase.extend({
  type: z.literal('LOOT_GRANTED'),
  payload: z.object({
    items: z.array(LootItemSchema),
    coins: CoinBundleSchema,
  }),
})
export type LootGranted = z.infer<typeof LootGrantedSchema>

export const LevelUpSchema = messageBase.extend({
  type: z.literal('LEVEL_UP'),
  payload: z.object({
    character_id: z.string(),
    new_level: z.number().int().min(1).max(20),
    pending_choices: z.boolean(),
  }),
})
export type LevelUp = z.infer<typeof LevelUpSchema>

export const RestResultSchema = messageBase.extend({
  type: z.literal('REST_RESULT'),
  payload: z.object({
    rest_type: z.enum(['short', 'long']),
    hp_restored: z.record(z.string(), z.number().int()),
    slots_restored: z.record(z.string(), z.number().int()),
  }),
})
export type RestResult = z.infer<typeof RestResultSchema>

// ─── Narrative ────────────────────────────────────────────────────────────────

// NARRATION is streamed token-by-token from the AI layer. sequence_id groups
// tokens belonging to the same narration event; final: true signals the stream
// is complete so the renderer can stop its loading indicator.
export const NarrationSchema = messageBase.extend({
  type: z.literal('NARRATION'),
  payload: z.object({
    token: z.string(),
    sequence_id: z.string(),
    final: z.boolean(),
  }),
})
export type Narration = z.infer<typeof NarrationSchema>

export const NpcDialogueSchema = messageBase.extend({
  type: z.literal('NPC_DIALOGUE'),
  payload: z.object({
    npc_id: z.string(),
    npc_name: z.string(),
    text: z.string(),
    target_player_id: z.string().optional(),
  }),
})
export type NpcDialogue = z.infer<typeof NpcDialogueSchema>

// ─── Votes ────────────────────────────────────────────────────────────────────

export const VoteRequestedSchema = messageBase.extend({
  type: z.literal('VOTE_REQUESTED'),
  payload: z.object({
    vote_id: z.string(),
    question: z.string(),
    timeout_ms: z.number().int().min(0),
  }),
})
export type VoteRequested = z.infer<typeof VoteRequestedSchema>

export const VoteResolvedSchema = messageBase.extend({
  type: z.literal('VOTE_RESOLVED'),
  payload: z.object({
    vote_id: z.string(),
    outcome: z.boolean(),
    tally: z.object({
      yes: z.number().int().min(0),
      no: z.number().int().min(0),
    }),
  }),
})
export type VoteResolved = z.infer<typeof VoteResolvedSchema>

// ─── Meta / System ────────────────────────────────────────────────────────────

// STATE_SNAPSHOT payload is extracted so STATE_DELTA can call .partial() on it,
// giving us Partial<StateSnapshotPayload> without duplicating the field list.
const StateSnapshotPayloadSchema = z.object({
  game_phase: GamePhaseSchema,
  entities: z.record(z.string(), EntitySchema),
  initiative_order: z.array(z.string()),
  fog_state: FogStateSchema,
  world_clock: z.number(),
})

export const StateSnapshotSchema = messageBase.extend({
  type: z.literal('STATE_SNAPSHOT'),
  payload: StateSnapshotPayloadSchema,
})
export type StateSnapshot = z.infer<typeof StateSnapshotSchema>

export const StateDeltaSchema = messageBase.extend({
  type: z.literal('STATE_DELTA'),
  payload: z.object({ patch: StateSnapshotPayloadSchema.partial() }),
})
export type StateDelta = z.infer<typeof StateDeltaSchema>

export const ActionReceivedSchema = messageBase.extend({
  type: z.literal('ACTION_RECEIVED'),
  payload: z.object({ action_id: z.string() }),
})
export type ActionReceived = z.infer<typeof ActionReceivedSchema>

// DICE_ROLL is a cosmetic message — the server already computed the result and
// applied it to game state. This triggers the client's dice animation in sync.
export const DiceRollSchema = messageBase.extend({
  type: z.literal('DICE_ROLL'),
  payload: z.object({
    result: z.number().int().min(1),
    die: DieTypeSchema,
    seed: z.number(),
  }),
})
export type DiceRoll = z.infer<typeof DiceRollSchema>

export const SystemSchema = messageBase.extend({
  type: z.literal('SYSTEM'),
  payload: z.object({
    event: SystemEventSchema,
    message: z.string().optional(),
  }),
})
export type System = z.infer<typeof SystemSchema>

// The combined server schema. Validate every incoming WS message against this
// on the client side; discriminatedUnion routes on 'type' in O(1).
export const ServerMessageSchema = z.discriminatedUnion('type', [
  CombatStartSchema,
  TurnStartSchema,
  RollResultSchema,
  AttackResultSchema,
  DamageResultSchema,
  SavingThrowSchema,
  ConditionAppliedSchema,
  ConditionRemovedSchema,
  DeathSaveResultSchema,
  TurnEndSchema,
  TurnSkippedSchema,
  CombatEndSchema,
  SkillCheckResultSchema,
  XpGrantedSchema,
  LootGrantedSchema,
  LevelUpSchema,
  RestResultSchema,
  NarrationSchema,
  NpcDialogueSchema,
  VoteRequestedSchema,
  VoteResolvedSchema,
  StateSnapshotSchema,
  StateDeltaSchema,
  ActionReceivedSchema,
  DiceRollSchema,
  SystemSchema,
])
export type ServerMessage = z.infer<typeof ServerMessageSchema>
