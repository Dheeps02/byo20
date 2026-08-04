/**
 * Shared interface contracts for the D&D 5.5e subsystems.
 *
 * Lives here — not in either subsystem file — so that `action-economy.ts` and
 * `conditions.ts` can both depend on this file without depending on each other.
 * Follows the same pattern as `../../interfaces/rules-engine.ts` at the engine level.
 */
import type { ConditionName } from "@byo20/shared";

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
