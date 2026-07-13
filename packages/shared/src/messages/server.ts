import { z } from 'zod'
import {
  ActionResourcesSchema,
  ConditionNameSchema,
  CoinBundleSchema,
  EntitySchema,
  FogStateSchema,
  InitiativeQueueSchema,
  LootItemSchema,
} from '../types/entities'
import {
  AbilityScoreSchema,
  DamageTypeSchema,
  DieTypeSchema,
  GamePhaseSchema,
  SystemEventSchema,
} from '../types/game'

/** Shared envelope fields present on every WS message. */
const messageBase = z.object({
  id: z.string().uuid(),
  timestamp: z.number(),
  to: z.array(z.string()),
})

/** A group of same-type dice and their rolled face values. Used in ROLL_RESULT and DICE_ROLL. */
const DiceGroupSchema = z.object({
  die: DieTypeSchema,
  count: z.number().int().min(1),
  faces: z.array(z.number().int().min(1)),
})

// ─── Combat ──────────────────────────────────────────────────────────────────

/** Zod schema for the combat start message — includes the initial initiative queue. */
export const CombatStartSchema = messageBase.extend({
  type: z.literal('COMBAT_START'),
  payload: z.object({ initiative_queue: InitiativeQueueSchema }),
})
/** Server signals combat has begun and delivers the initial initiative queue. */
export type CombatStart = z.infer<typeof CombatStartSchema>

/** Zod schema for the start of a combatant's turn. */
export const TurnStartSchema = messageBase.extend({
  type: z.literal('TURN_START'),
  payload: z.object({
    combatant_id: z.string().uuid(),
    round: z.number().int().min(1),
    resources: ActionResourcesSchema,
  }),
})
/** A new turn has started; includes the combatant's full action budget. */
export type TurnStart = z.infer<typeof TurnStartSchema>

/** Zod schema for a dice roll result. Supports multi-type rolls (e.g. 2d6 + 1d8). */
export const RollResultSchema = messageBase.extend({
  type: z.literal('ROLL_RESULT'),
  payload: z.object({
    dice: z.array(DiceGroupSchema),
    modifiers: z.array(z.number().int()),
    total: z.number().int(),
    seed: z.number(),
  }),
})
/** Full dice roll result including individual face values per die group and modifiers. */
export type RollResult = z.infer<typeof RollResultSchema>

/** Zod schema for the result of an attack roll. */
export const AttackResultSchema = messageBase.extend({
  type: z.literal('ATTACK_RESULT'),
  payload: z.object({
    attacker_id: z.string().uuid(),
    target_id: z.string().uuid(),
    hit: z.boolean(),
    ac: z.number().int(),
    roll_total: z.number().int(),
    critical: z.boolean(),
  }),
})
/** Whether an attack hit, missed, or critically hit, with the roll details. */
export type AttackResult = z.infer<typeof AttackResultSchema>

/** Zod schema for damage dealt to a target. */
export const DamageResultSchema = messageBase.extend({
  type: z.literal('DAMAGE_RESULT'),
  payload: z.object({
    target_id: z.string().uuid(),
    amount: z.number().int().min(0),
    type: DamageTypeSchema,
    hp_remaining: z.number().int(),
  }),
})
/** Damage dealt to a target, including type and remaining HP after the hit. */
export type DamageResult = z.infer<typeof DamageResultSchema>

/** Zod schema for a saving throw result. */
export const SavingThrowSchema = messageBase.extend({
  type: z.literal('SAVING_THROW'),
  payload: z.object({
    target_id: z.string().uuid(),
    ability: AbilityScoreSchema,
    dc: z.number().int().min(1),
    success: z.boolean(),
  }),
})
/** The outcome of a saving throw against a DC. */
export type SavingThrow = z.infer<typeof SavingThrowSchema>

/** Zod schema for a condition being applied to an entity. */
export const ConditionAppliedSchema = messageBase.extend({
  type: z.literal('CONDITION_APPLIED'),
  payload: z.object({
    target_id: z.string().uuid(),
    condition: ConditionNameSchema,
  }),
})
/** A D&D 5.5e condition was applied to an entity. */
export type ConditionApplied = z.infer<typeof ConditionAppliedSchema>

/** Zod schema for a condition being removed from an entity. */
export const ConditionRemovedSchema = messageBase.extend({
  type: z.literal('CONDITION_REMOVED'),
  payload: z.object({
    target_id: z.string().uuid(),
    condition: ConditionNameSchema,
  }),
})
/** A D&D 5.5e condition was removed from an entity. */
export type ConditionRemoved = z.infer<typeof ConditionRemovedSchema>

/** Zod schema for an automatic death saving throw result. */
export const DeathSaveResultSchema = messageBase.extend({
  type: z.literal('DEATH_SAVE_RESULT'),
  payload: z.object({
    character_id: z.string().uuid(),
    successes: z.number().int().min(0).max(3),
    failures: z.number().int().min(0).max(3),
    stabilized: z.boolean(),
  }),
})
/** Server-rolled death save result. 3 successes = stable, 3 failures = dead. */
export type DeathSaveResult = z.infer<typeof DeathSaveResultSchema>

/**
 * Zod schema for server-side turn end confirmation.
 * Carries combatant_id to confirm whose turn ended.
 * The client-side TURN_END (in client.ts) is an empty player signal.
 */
export const TurnEndSchema = messageBase.extend({
  type: z.literal('TURN_END'),
  payload: z.object({ combatant_id: z.string().uuid() }),
})
/** Server confirms a combatant's turn has ended. */
export type TurnEnd = z.infer<typeof TurnEndSchema>

/** Zod schema for a skipped turn (e.g. incapacitated combatant). */
export const TurnSkippedSchema = messageBase.extend({
  type: z.literal('TURN_SKIPPED'),
  payload: z.object({ combatant_id: z.string().uuid() }),
})
/** A combatant's turn was skipped. */
export type TurnSkipped = z.infer<typeof TurnSkippedSchema>

/** Zod schema for combat end. */
export const CombatEndSchema = messageBase.extend({
  type: z.literal('COMBAT_END'),
  payload: z.object({
    outcome: z.enum(['victory', 'tpk', 'retreat', 'dm_ended']),
  }),
})
/** Combat has ended. outcome: victory, tpk (total party kill), retreat, or dm_ended. */
export type CombatEnd = z.infer<typeof CombatEndSchema>

// ─── World ────────────────────────────────────────────────────────────────────

/** Zod schema for a skill check result. */
export const SkillCheckResultSchema = messageBase.extend({
  type: z.literal('SKILL_CHECK_RESULT'),
  payload: z.object({
    character_id: z.string().uuid(),
    skill: z.string(),
    roll_total: z.number().int(),
    dc: z.number().int().min(1),
    success: z.boolean(),
    secret: z.boolean(),
  }),
})
/** Skill check result. secret: true means only the DM/AI sees the outcome. */
export type SkillCheckResult = z.infer<typeof SkillCheckResultSchema>

/** Zod schema for XP grants to one or more characters. */
export const XpGrantedSchema = messageBase.extend({
  type: z.literal('XP_GRANTED'),
  payload: z.object({
    grants: z.array(z.object({ character_id: z.string().uuid(), amount: z.number().int().min(0) })),
    reason: z.string(),
  }),
})
/** XP awarded to one or more characters with a reason for the session log. */
export type XpGranted = z.infer<typeof XpGrantedSchema>

/** Zod schema for loot granted to the party. */
export const LootGrantedSchema = messageBase.extend({
  type: z.literal('LOOT_GRANTED'),
  payload: z.object({
    items: z.array(LootItemSchema),
    coins: CoinBundleSchema,
  }),
})
/** Loot (items + coins) granted to the party after an encounter or discovery. */
export type LootGranted = z.infer<typeof LootGrantedSchema>

/** Zod schema for a character level-up notification. */
export const LevelUpSchema = messageBase.extend({
  type: z.literal('LEVEL_UP'),
  payload: z.object({
    character_id: z.string().uuid(),
    new_level: z.number().int().min(1).max(20),
    pending_choices: z.boolean(),
  }),
})
/** A character levelled up. pending_choices: true means LEVEL_UP_CHOICE is required. */
export type LevelUp = z.infer<typeof LevelUpSchema>

/** Zod schema for the result of a short or long rest. */
export const RestResultSchema = messageBase.extend({
  type: z.literal('REST_RESULT'),
  payload: z.object({
    rest_type: z.enum(['short', 'long']),
    hp_restored: z.record(z.string().uuid(), z.number().int()),
    slots_restored: z.record(z.string().uuid(), z.number().int()),
  }),
})
/** HP and spell slots restored after a rest, keyed by character UUID. */
export type RestResult = z.infer<typeof RestResultSchema>

// ─── Narrative ────────────────────────────────────────────────────────────────

/**
 * Zod schema for a single streamed AI narration token.
 * Tokens arrive in order (TCP). Accumulate by sequence_id for the full text.
 * On final: true, total_tokens is included — client compares against received
 * count and sends NARRATION_ACK (match) or NARRATION_NACK (mismatch).
 * Client 2s silence timeout: auto-NACK if final: true never arrives.
 */
export const NarrationSchema = messageBase.extend({
  type: z.literal('NARRATION'),
  payload: z.object({
    token: z.string(),
    sequence_id: z.string().uuid(),
    final: z.boolean(),
    total_tokens: z.number().int().min(1).optional(),
  }),
})
/** A single AI narration token. Accumulate by sequence_id for the full text. */
export type Narration = z.infer<typeof NarrationSchema>

/** Zod schema for NPC spoken dialogue. */
export const NpcDialogueSchema = messageBase.extend({
  type: z.literal('NPC_DIALOGUE'),
  payload: z.object({
    npc_id: z.string().uuid(),
    npc_name: z.string(),
    text: z.string(),
    target_player_id: z.string().uuid().optional(),
  }),
})
/** NPC dialogue — optionally targeted at a specific player for private exchanges. */
export type NpcDialogue = z.infer<typeof NpcDialogueSchema>

// ─── Votes ────────────────────────────────────────────────────────────────────

/** Zod schema for a vote request sent to all players. */
export const VoteRequestedSchema = messageBase.extend({
  type: z.literal('VOTE_REQUESTED'),
  payload: z.object({
    vote_id: z.string().uuid(),
    question: z.string(),
    timeout_ms: z.number().int().min(0),
  }),
})
/** Server requests a party vote with a question and optional timeout. */
export type VoteRequested = z.infer<typeof VoteRequestedSchema>

/** Zod schema for a resolved vote result. */
export const VoteResolvedSchema = messageBase.extend({
  type: z.literal('VOTE_RESOLVED'),
  payload: z.object({
    vote_id: z.string().uuid(),
    outcome: z.boolean(),
    tally: z.object({
      yes: z.number().int().min(0),
      no: z.number().int().min(0),
    }),
  }),
})
/** A vote has been resolved — includes outcome and full yes/no tally. */
export type VoteResolved = z.infer<typeof VoteResolvedSchema>

// ─── Meta / System ────────────────────────────────────────────────────────────

/**
 * Internal payload schema for STATE_SNAPSHOT, extracted so STATE_DELTA can call
 * .partial() on it without duplicating the field list.
 */
const StateSnapshotPayloadSchema = z.object({
  game_phase: GamePhaseSchema,
  entities: z.record(z.string().uuid(), EntitySchema),
  initiative_queue: InitiativeQueueSchema,
  fog_state: FogStateSchema,
  world_clock: z.number(),
})

/** Zod schema for a full game state snapshot. Sent on connect and reconnect. */
export const StateSnapshotSchema = messageBase.extend({
  type: z.literal('STATE_SNAPSHOT'),
  payload: StateSnapshotPayloadSchema,
})
/** Full game state snapshot — entities, initiative queue, fog state, world clock. */
export type StateSnapshot = z.infer<typeof StateSnapshotSchema>

/** Zod schema for an incremental state patch. */
export const StateDeltaSchema = messageBase.extend({
  type: z.literal('STATE_DELTA'),
  payload: z.object({ patch: StateSnapshotPayloadSchema.partial() }),
})
/** Partial game state update — only changed fields included. */
export type StateDelta = z.infer<typeof StateDeltaSchema>

/** Zod schema for an immediate action acknowledgement. */
export const ActionReceivedSchema = messageBase.extend({
  type: z.literal('ACTION_RECEIVED'),
  payload: z.object({ action_id: z.string().uuid() }),
})
/** Server received the action and is processing it. */
export type ActionReceived = z.infer<typeof ActionReceivedSchema>

/** Zod schema for an action rejection. */
export const ActionRejectedSchema = messageBase.extend({
  type: z.literal('ACTION_REJECTED'),
  payload: z.object({
    action_id: z.string().uuid(),
    reason: z.string(),
  }),
})
/** Server rejected an invalid action. Client re-enables the button and shows reason. */
export type ActionRejected = z.infer<typeof ActionRejectedSchema>

/**
 * Zod schema for the cosmetic dice animation trigger.
 * Server has already applied the result to game state — this drives the
 * Babylon.js physics animation so it resolves to the correct face.
 */
export const DiceRollSchema = messageBase.extend({
  type: z.literal('DICE_ROLL'),
  payload: z.object({
    dice: z.array(DiceGroupSchema),
    total: z.number().int().min(1),
    seed: z.number(),
  }),
})
/** Triggers the client dice animation. Result already committed server-side. */
export type DiceRoll = z.infer<typeof DiceRollSchema>

/** Zod schema for a meta/infrastructure system event. */
export const SystemSchema = messageBase.extend({
  type: z.literal('SYSTEM'),
  payload: z.object({
    event: SystemEventSchema,
    message: z.string().optional(),
  }),
})
/** A meta lifecycle event (paused, player joined, session ended, etc.). */
export type System = z.infer<typeof SystemSchema>

/**
 * Combined server message schema. Validate every incoming WS message on the
 * client side against this. discriminatedUnion routes on 'type' in O(1).
 */
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
  ActionRejectedSchema,
  DiceRollSchema,
  SystemSchema,
])
/** Any valid server → client WebSocket message. */
export type ServerMessage = z.infer<typeof ServerMessageSchema>
