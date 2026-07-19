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
    actions_remaining: z.number().int().min(0).max(2),
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
