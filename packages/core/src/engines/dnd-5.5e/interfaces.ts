/**
 * Shared interface contracts for the D&D 5.5e subsystems.
 *
 * Lives here — not in either subsystem file — so that subsystem files can both
 * depend on this file without depending on each other.
 * Follows the same pattern as `../../interfaces/rules-engine.ts` at the engine level.
 */
import type { ActionResources, ActiveEffect, ConditionName } from "@byo20/shared";

/**
 * Minimal conditions query needed by `ActionEconomySubsystem` for action validation.
 * The full implementation is `ConditionsSubsystem`; `StubConditionsSubsystem` satisfies
 * it for code paths where conditions are not yet tracked.
 */
export interface IConditionsSubsystem {
    /**
     * Return the active condition names for a combatant from the encounter effects store.
     * @param combatantId - Combatant UUID.
     * @returns Array of active `ConditionName` values.
     */
    getActiveConditions(combatantId: string): Promise<ConditionName[]>;
}

/**
 * Active effects storage for a single encounter.
 * The implementation in apps/server wraps the Redis HASH at `encounter:{id}:effects`.
 * Every method is scoped to the encounter this store was created for.
 */
export interface IEncounterEffectsStore {
    /**
     * Fetch all validated `ActiveEffect` entries for an entity.
     * @param entityId - Entity UUID.
     * @returns Active effects list; empty if none stored.
     */
    getActiveEffects(entityId: string): Promise<ActiveEffect[]>;
    /**
     * Append a single effect to an entity's list.
     * @param entityId - Entity UUID.
     * @param effect - The effect to append.
     */
    addEntityEffect(entityId: string, effect: ActiveEffect): Promise<void>;
    /**
     * Remove all effects for an entity where name and sourceId both match.
     * @param entityId - Entity UUID.
     * @param name - Effect name to remove.
     * @param sourceId - Source entity UUID (or `"system"`) to remove; other sources remain.
     */
    removeEntityEffectsBySource(entityId: string, name: string, sourceId: string): Promise<void>;
    /**
     * Remove all effects for an entity where sourceId matches, regardless of effect name.
     * Used to clear all conditions a single source applied (e.g. Dispel Magic on a caster).
     * @param entityId - Entity UUID.
     * @param sourceId - Source entity UUID (or `"system"`) whose effects to remove.
     */
    removeAllEffectsBySource(entityId: string, sourceId: string): Promise<void>;
    /**
     * Remove all effects for an entity, unconditionally.
     * Used at COMBAT_ENDED to wipe COMBAT-scoped effects.
     * @param entityId - Entity UUID.
     */
    clearAllEffects(entityId: string): Promise<void>;
}

/**
 * Exhaustion level cache for the duration of one combat encounter.
 * The implementation wraps the Redis STRING at `character:{id}:exhaustion`.
 */
export interface IExhaustionStore {
    /**
     * Read the current exhaustion level for a character.
     * Returns 0 if the key is absent; always seed from Postgres at COMBAT_START.
     * @param characterId - Character UUID.
     * @returns Exhaustion level 0-6.
     */
    getExhaustionLevel(characterId: string): Promise<number>;
    /**
     * Write the exhaustion level for a character.
     * @param characterId - Character UUID.
     * @param level - Exhaustion level 0-6.
     */
    setExhaustionLevel(characterId: string, level: number): Promise<void>;
}

/**
 * Thin read/write interface over the turn-resources Redis HASH.
 * The implementation in apps/server wraps the Redis HASH at `character:{id}:turn_resources`.
 */
export interface IActionResourceStore {
    /**
     * Fetch the current-turn resource budget for a combatant.
     * Returns max-budget defaults when no key exists (e.g. before the first reset).
     * @param combatantId - Combatant UUID.
     * @returns The combatant's current ActionResources.
     */
    getTurnResources(combatantId: string): Promise<ActionResources>;
    /**
     * Write the current-turn resource budget for a combatant.
     * @param combatantId - Combatant UUID.
     * @param resources - New resource values to persist.
     */
    setTurnResources(combatantId: string, resources: ActionResources): Promise<void>;
}
