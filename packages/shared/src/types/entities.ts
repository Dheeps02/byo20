import { z } from "zod";

/** Zod schema for a position in 3D world space. */
export const PositionSchema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
});
/** A position in 3D world space. */
export type Position = z.infer<typeof PositionSchema>;

/** Zod schema for the 15 D&D 5.5e (2024) conditions. */
export const ConditionNameSchema = z.enum([
    "blinded",
    "charmed",
    "deafened",
    "exhaustion",
    "frightened",
    "grappled",
    "incapacitated",
    "invisible",
    "paralyzed",
    "petrified",
    "poisoned",
    "prone",
    "restrained",
    "stunned",
    "unconscious",
]);
/** A D&D 5.5e condition name. */
export type ConditionName = z.infer<typeof ConditionNameSchema>;

/**
 * Zod schema for a combatant's per-turn action budget.
 * Lives in Redis server-side; mirrored to the client on TURN_START.
 * actions_remaining: 0 = spent, 1 = normal turn, 2 = Action Surge / Haste.
 */
export const ActionResourcesSchema = z.object({
    movement_remaining: z.number(),
    actions_remaining: z.number().int().min(0).max(4),
    bonus_action_used: z.boolean(),
    reaction_used: z.boolean(),
    free_interaction_used: z.boolean(),
    attacks_remaining: z.number().int().min(0).max(255),
});
/** A combatant's per-turn action budget. */
export type ActionResources = z.infer<typeof ActionResourcesSchema>;

/**
 * Zod schema for the minimal entity shape sent to the renderer.
 * Server computes each player's visible entity set before sending —
 * hidden entities are filtered out entirely, never sent.
 */
export const EntitySchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(["player", "npc", "monster"]),
    position: PositionSchema,
    hp: z.number().int(),
    hp_max: z.number().int().min(0),
    conditions: z.array(ConditionNameSchema),
    exhaustion_level: z.number().int().min(0).max(6),
    is_alive: z.boolean(),
});
/** Minimal entity shape sent to the renderer. */
export type Entity = z.infer<typeof EntitySchema>;

/** Zod schema for a single node in the initiative doubly linked circular list. */
export const InitiativeNodeSchema = z.object({
    entityId: z.string().uuid(),
    next: z.string().uuid(),
    prev: z.string().uuid(),
});
/** A node in the initiative doubly linked circular list. next/prev are entity UUIDs. */
export type InitiativeNode = z.infer<typeof InitiativeNodeSchema>;

/**
 * Zod schema for the full initiative order as a doubly linked circular list.
 * The last node's next points back to the first — wrapping is O(1).
 * UI shows a 4–5 node sliding window; loops for small parties.
 */
export const InitiativeQueueSchema = z.object({
    nodes: z.record(z.string().uuid(), InitiativeNodeSchema),
    currentId: z.string().uuid(),
    round: z.number().int().min(1),
});
/** Initiative order as a doubly linked circular list keyed by entity UUID. */
export type InitiativeQueue = z.infer<typeof InitiativeQueueSchema>;

/**
 * Zod schema for fog-of-war state.
 * 'shared' = all players see the same revealed tiles.
 * 'per_player' = server sends each client a filtered entity set.
 */
export const FogStateSchema = z.object({
    mode: z.enum(["shared", "per_player"]),
    revealed: z.array(z.string()),
});
/** Fog-of-war state. */
export type FogState = z.infer<typeof FogStateSchema>;

/** Zod schema for a single loot item. */
export const LootItemSchema = z.object({
    item_id: z.string(),
    name: z.string(),
    quantity: z.number().int().min(1),
});
/** A single loot item. item_id is the SRD TEXT key or homebrew identifier. */
export type LootItem = z.infer<typeof LootItemSchema>;

/**
 * Zod schema for the lifetime scope of an active effect.
 * UPPERCASE discriminants — these are protocol-level values, not DB-stored condition names.
 */
export const EffectScopeSchema = z.enum(["COMBAT", "TIMED", "SUSTAINED"]);
/**
 * Lifetime scope of an active effect.
 * - `COMBAT` — cleared automatically when `COMBAT_ENDED` fires.
 * - `TIMED` — expires when the combat round reaches `expiresAtRound`.
 * - `SUSTAINED` — persists until an explicit counter-action (stand up, break grapple, etc.).
 */
export type EffectScope = z.infer<typeof EffectScopeSchema>;

/**
 * Zod schema for a single active condition effect stored in Redis.
 * Multiple `ActiveEffect` entries with the same `conditionName` but different `sourceId`
 * values are distinct — the condition persists while any source remains.
 */
export const ActiveEffectSchema = z.object({
    /** UUID uniquely identifying this effect instance. */
    id: z.string().uuid(),
    /** UUID grouping all effects emitted from one orchestrator invocation. */
    causeId: z.string().uuid(),
    /** The D&D 5.5e condition this effect represents. */
    conditionName: ConditionNameSchema,
    /** UUID of the entity the effect is applied to. */
    targetId: z.string().uuid(),
    /** UUID of the entity that applied the effect, or `"system"` for engine-internal sources. */
    sourceId: z.string(),
    /** Broad category of the source — used for UI tooltips and log descriptions. */
    sourceKind: z.enum(["spell", "ability", "environment", "system"]),
    /** Lifetime scope of the effect. */
    scope: EffectScopeSchema,
    /**
     * Combat round number at which this effect expires.
     * `null` when `scope` is `COMBAT` (cleared at combat end) or `SUSTAINED` (counter-action required).
     */
    expiresAtRound: z.number().int().min(1).nullable(),
});
/** A single active condition effect stored in the Redis encounter effects hash. */
export type ActiveEffect = z.infer<typeof ActiveEffectSchema>;

/**
 * Zod schema for the check types used when computing condition modifiers.
 * UPPERCASE discriminants — engine protocol vocabulary, not DB values.
 */
export const CheckTypeSchema = z.enum(["ABILITY_CHECK", "SKILL_CHECK", "SAVING_THROW", "ATTACK_ROLL"]);
/** The category of d20 roll being made — determines which conditions apply modifiers. */
export type CheckType = z.infer<typeof CheckTypeSchema>;

/**
 * Zod schema for the modifier result returned by `ConditionsSubsystem.getModifiers`.
 * Consumed by the combat engine before every roll and by the GUI for tooltip text.
 */
export const ModifierResultSchema = z.object({
    /** True when at least one active condition grants Advantage on this roll. */
    advantage: z.boolean(),
    /** True when at least one active condition imposes Disadvantage on this roll. */
    disadvantage: z.boolean(),
    /** True when any melee hit against the entity is an automatic critical hit (Paralyzed, Unconscious within 5 ft). */
    autoCrit: z.boolean(),
    /** True when the entity automatically fails this type of save (STR/DEX saves vs Paralyzed etc.). */
    autoFail: z.boolean(),
    /**
     * Multiplier applied to the entity's base speed.
     * `0` = fully immobilised (Grappled, Restrained, Paralyzed, etc.), `1` = normal speed.
     */
    speedMultiplier: z.number().min(0).max(1),
    /** True when the entity cannot take actions or bonus actions (Incapacitated and its supersets). */
    actionsBlocked: z.boolean(),
    /** Which conditions contributed to the non-neutral fields above — used for GUI tooltips and combat log. */
    sources: z.array(ConditionNameSchema),
});
/** Computed modifier result from active conditions for a single roll context. */
export type ModifierResult = z.infer<typeof ModifierResultSchema>;

/**
 * Zod schema for the options bag passed to `ConditionsSubsystem.applyCondition`.
 * Groups everything the subsystem needs to create and persist an `ActiveEffect`.
 */
export const ApplyConditionOptionsSchema = z.object({
    /** UUID of the encounter the combatant belongs to. */
    encounterId: z.string().uuid(),
    /** UUID of the entity receiving the condition. */
    entityId: z.string().uuid(),
    /** The D&D 5.5e condition to apply. */
    conditionName: ConditionNameSchema,
    /** UUID of the entity applying the condition, or `"system"`. */
    sourceId: z.string(),
    /** Broad source category for tooltip and log display. */
    sourceKind: z.enum(["spell", "ability", "environment", "system"]),
    /** Lifetime scope of the effect. */
    scope: EffectScopeSchema,
    /**
     * Combat round at which the effect expires.
     * Required when `scope` is `TIMED`; must be `null` for `COMBAT` and `SUSTAINED`.
     */
    expiresAtRound: z.number().int().min(1).nullable(),
    /** Orchestrator cause UUID to stamp on the resulting `ActiveEffect`. */
    causeId: z.string().uuid(),
});
/** Options bag for `ConditionsSubsystem.applyCondition`. */
export type ApplyConditionOptions = z.infer<typeof ApplyConditionOptionsSchema>;

/** Zod schema for a bundle of coins across all five D&D denominations. */
export const CoinBundleSchema = z.object({
    cp: z.number().int().min(0),
    sp: z.number().int().min(0),
    ep: z.number().int().min(0),
    gp: z.number().int().min(0),
    pp: z.number().int().min(0),
});
/** A bundle of coins: copper, silver, electrum, gold, platinum. */
export type CoinBundle = z.infer<typeof CoinBundleSchema>;
