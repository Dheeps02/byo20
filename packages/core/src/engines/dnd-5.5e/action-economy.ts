import type { ActionResources, ConditionName, GameRejection, Result } from "@byo20/shared";
import { getLogger } from "../../logger";
import { computeSphere } from "../../utils/geometry";
import { distance } from "../../utils/math";
import type { Vec3 } from "../../utils/math";

// ── Public types ──────────────────────────────────────────────────────────────

/** All action types the engine recognises. Each costs one action (see getResourceCost). */
export type ActionType =
    | "ATTACK"
    | "DASH"
    | "DISENGAGE"
    | "DODGE"
    | "HELP"
    | "HIDE"
    | "IMPROVISED"
    | "INFLUENCE"
    | "MAGIC"
    | "READY"
    | "SEARCH"
    | "STUDY"
    | "UTILIZE";

/** Resources that can be spent one unit at a time (boolean flags or integer counters). */
export type SpendableResource = "action" | "bonus_action" | "reaction" | "free_interaction" | "attack";

/**
 * Discriminated union for spendResource options.
 * The "movement" arm carries the additional feet and terrain data needed to compute cost;
 * all other resources are identified by name alone.
 */
export type SpendOptions =
    | { resource: SpendableResource }
    | { resource: "movement"; feet: number; difficultTerrain?: boolean };

/** A combatant eligible to make an opportunity attack. */
export interface OACandidate {
    /** UUID of the combatant eligible to make the opportunity attack. */
    combatantId: string;
}

/** Minimal per-combatant state needed for OA resolution. */
export interface CombatantState {
    /** Combatant UUID. */
    id: string;
    /** Current world position; 1 unit = 5 ft. */
    position: Vec3;
    /** Team identifier; combatants on the same team are allies. */
    teamId: string;
    /** Active condition names (lowercase, storage-boundary values). */
    conditions: string[];
    /** Whether the reaction has been spent this round. */
    reaction_used: boolean;
    /** True when a charm or domination effect makes this combatant attack its own team. */
    friendlyFire: boolean;
}

// ── Injectable interfaces ─────────────────────────────────────────────────────

/** Thin read/write interface over the turn-resources Redis HASH. */
export interface ActionResourceStore {
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

/** Minimal conditions query needed by action validation. */
export interface ConditionsSubsystem {
    /**
     * Return the active condition names for a combatant.
     * @param combatantId - Combatant UUID.
     * @returns Array of lowercase condition name strings.
     */
    getActiveConditions(combatantId: string): Promise<string[]>;
}

// ── Internal constants ────────────────────────────────────────────────────────

/** Condition names whose incapacitated effect blocks all actions. */
const INCAPACITATING_CONDITIONS = new Set(["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]);

/**
 * Maps an ActionType to the SpendableResource it consumes.
 * All current ActionTypes cost one action; this function exists as the extension
 * point for future actions that might cost a different resource (e.g., bonus_action).
 * @param _action - The action type being validated.
 * @returns The resource that must be available for the action to proceed.
 */
function getResourceCost(_action: ActionType): SpendableResource {
    return "action";
}

// ── Subsystem ─────────────────────────────────────────────────────────────────

/**
 * Manages per-turn action resources for all combatants.
 * Validates action legality, spends resources, and computes opportunity attack eligibility.
 * Stateless beyond its injected store and conditions query — all mutable state lives in Redis.
 */
export class ActionEconomySubsystem {
    /**
     * @param store - Redis-backed store for per-turn action budgets.
     * @param conditions - Query interface for a combatant's active conditions.
     */
    constructor(
        private readonly store: ActionResourceStore,
        private readonly conditions: ConditionsSubsystem,
    ) {}

    /**
     * Reset all per-turn resources for a combatant.
     * Used at combat start (preserveReaction: false) and TURN_TRANSITION (preserveReaction: true).
     * At combat start the store key does not yet exist — getTurnResources returns safe defaults,
     * so no special handling is needed.
     * `actions_remaining` is 1 + count of `grant_action` primitives in activeEffects.
     * @param combatantId - Combatant UUID.
     * @param baseSpeed - Movement speed in feet for this turn.
     * @param attacksTotal - Number of attacks granted by Extra Attack or similar.
     * @param activeEffects - Current active effects; grant_action entries add extra actions.
     * @param preserveReaction - If true, carry over reaction_used from the previous turn.
     */
    async resetTurnResources(
        combatantId: string,
        baseSpeed: number,
        attacksTotal: number,
        activeEffects: unknown[],
        preserveReaction: boolean,
    ): Promise<void> {
        const current = await this.store.getTurnResources(combatantId);
        const grantActionCount = activeEffects.filter((e) => (e as { type?: string }).type === "grant_action").length;
        const resources: ActionResources = {
            movement_remaining: baseSpeed,
            actions_remaining: 1 + grantActionCount,
            bonus_action_used: false,
            reaction_used: preserveReaction ? current.reaction_used : false,
            free_interaction_used: false,
            attacks_remaining: attacksTotal,
        };
        await this.store.setTurnResources(combatantId, resources);
        getLogger().debug(
            { combatantId, baseSpeed, attacksTotal, grantActionCount, preserveReaction },
            "resetTurnResources",
        );
    }

    /**
     * Reset only reaction_used to false.
     * Called at the start of ACTIVE_TURN — PHB: reaction resets at the start of your own turn.
     * @param combatantId - Combatant UUID.
     */
    async resetReaction(combatantId: string): Promise<void> {
        const current = await this.store.getTurnResources(combatantId);
        await this.store.setTurnResources(combatantId, { ...current, reaction_used: false });
        getLogger().debug({ combatantId }, "resetReaction");
    }

    /**
     * Six-step validation (spec § Action Economy → Validation Flow).
     * Step 5 (target/range/LOS) is handled by the combat engine — this subsystem
     * validates only resource availability and condition legality.
     * @param combatantId - The combatant attempting the action.
     * @param action - The action type being attempted.
     * @param currentCombatantId - The combatant whose turn it currently is.
     * @param conditions - Conditions currently active on the combatant (merged with stored).
     * @returns Ok if the action is legal; a GameRejection describing the failure otherwise.
     */
    async validateAction(
        combatantId: string,
        action: ActionType,
        currentCombatantId: string,
        conditions: ConditionName[],
    ): Promise<Result<void, GameRejection>> {
        // Step 1: Is it this combatant's turn?
        if (combatantId !== currentCombatantId) {
            getLogger().debug({ combatantId, currentCombatantId }, "validateAction: not this combatant's turn");
            return {
                ok: false,
                error: {
                    reason: "It is not your turn.",
                    action_type: action,
                    context: { currentCombatantId },
                },
            };
        }

        // Steps 2 & 3: Resource cost check.
        const resources = await this.store.getTurnResources(combatantId);

        switch (getResourceCost(action)) {
            case "action":
                if (resources.actions_remaining <= 0) {
                    getLogger().debug({ combatantId, action }, "validateAction: no actions remaining");
                    return {
                        ok: false,
                        error: {
                            reason: "No actions remaining.",
                            action_type: action,
                            context: { actions_remaining: resources.actions_remaining },
                        },
                    };
                }
                break;
        }

        // Step 4: Condition legality — all ActionTypes are blocked by incapacitation.
        const storedConditions = await this.conditions.getActiveConditions(combatantId);
        const allConditions = [...new Set([...conditions, ...storedConditions])];
        const isIncapacitated = allConditions.some((c) => INCAPACITATING_CONDITIONS.has(c));

        if (isIncapacitated) {
            getLogger().debug({ combatantId, action, allConditions }, "validateAction: incapacitated");
            return {
                ok: false,
                error: {
                    reason: "Cannot act while incapacitated.",
                    action_type: action,
                    context: { conditions: allConditions },
                },
            };
        }

        // Step 5: target/LOS/range — delegated to combat engine (out of scope here).
        getLogger().debug({ combatantId, action }, "validateAction: ok");
        return { ok: true, value: undefined };
    }

    /**
     * Spend one unit of a resource, or deduct movement feet.
     * getTurnResources always returns a fresh object (Redis parses on every read),
     * so mutating `current` before passing it to setTurnResources is safe.
     * @param combatantId - Combatant UUID.
     * @param options - Which resource to spend; the "movement" arm adds feet and terrain.
     * @returns Ok on success; a GameRejection if the resource is already exhausted.
     */
    async spendResource(combatantId: string, options: SpendOptions): Promise<Result<void, GameRejection>> {
        const current = await this.store.getTurnResources(combatantId);

        switch (options.resource) {
            case "action":
                if (current.actions_remaining <= 0) {
                    getLogger().warn({ combatantId }, "spendResource: no actions remaining");
                    return { ok: false, error: { reason: "No actions remaining.", action_type: "action" } };
                }
                current.actions_remaining -= 1;
                break;
            case "bonus_action":
                if (current.bonus_action_used) {
                    getLogger().warn({ combatantId }, "spendResource: bonus action already used");
                    return {
                        ok: false,
                        error: { reason: "Bonus action already used this turn.", action_type: "bonus_action" },
                    };
                }
                current.bonus_action_used = true;
                break;
            case "reaction":
                if (current.reaction_used) {
                    getLogger().warn({ combatantId }, "spendResource: reaction already used");
                    return {
                        ok: false,
                        error: { reason: "Reaction already used this round.", action_type: "reaction" },
                    };
                }
                current.reaction_used = true;
                break;
            case "free_interaction":
                if (current.free_interaction_used) {
                    getLogger().warn({ combatantId }, "spendResource: free interaction already used");
                    return {
                        ok: false,
                        error: {
                            reason: "Free object interaction already used this turn.",
                            action_type: "free_interaction",
                        },
                    };
                }
                current.free_interaction_used = true;
                break;
            case "attack":
                if (current.attacks_remaining <= 0) {
                    getLogger().warn({ combatantId }, "spendResource: no attacks remaining");
                    return { ok: false, error: { reason: "No attacks remaining.", action_type: "attack" } };
                }
                current.attacks_remaining -= 1;
                break;
            case "movement": {
                const cost = options.difficultTerrain ? options.feet * 2 : options.feet;
                if (current.movement_remaining < cost) {
                    getLogger().warn(
                        { combatantId, feet: options.feet, cost, available: current.movement_remaining },
                        "spendResource: insufficient movement",
                    );
                    return {
                        ok: false,
                        error: {
                            reason: "Insufficient movement remaining.",
                            action_type: "movement",
                            context: { requested: cost, available: current.movement_remaining },
                        },
                    };
                }
                current.movement_remaining -= cost;
                break;
            }
        }

        await this.store.setTurnResources(combatantId, current);
        getLogger().debug({ combatantId, resource: options.resource }, "spendResource");
        return { ok: true, value: undefined };
    }

    /**
     * Returns all combatants eligible to make an opportunity attack against
     * `movingCombatantId` after it moved from prevPosition to newPosition.
     *
     * A candidate must: be within 5ft of prevPosition, have left the candidate's reach,
     * have reaction available, not be incapacitated, and be hostile to the mover.
     * A combatant is hostile if on a different team, OR pvpEnabled is true, OR
     * combatant.friendlyFire is true (charm/domination forcing same-team attacks).
     * If `canSee` is provided, visibility is also checked.
     * @param movingCombatantId - UUID of the combatant that moved.
     * @param prevPosition - The mover's position before the move.
     * @param newPosition - The mover's position after the move.
     * @param combatants - All combatants currently in the encounter.
     * @param pvpEnabled - Whether player-vs-player attacks are allowed in this campaign.
     * @param canSee - Optional visibility predicate; (observerId, targetId) → boolean.
     * @returns Array of OACandidates eligible to trigger an opportunity attack.
     */
    checkOpportunityAttacks(
        movingCombatantId: string,
        prevPosition: Vec3,
        newPosition: Vec3,
        combatants: CombatantState[],
        pvpEnabled: boolean,
        canSee?: (observerId: string, targetId: string) => boolean,
    ): OACandidate[] {
        const moving = combatants.find((c) => c.id === movingCombatantId);
        if (!moving) {
            getLogger().warn({ movingCombatantId }, "checkOpportunityAttacks: moving combatant not found");
            return [];
        }

        const others = combatants.filter((c) => c.id !== movingCombatantId);

        // Compute who is within 5ft of prevPosition using the geometry utility.
        const withinFiveOfPrev = new Set(
            computeSphere(
                prevPosition,
                5,
                others.map((c) => ({ id: c.id, position: c.position, boundingRadius: 0 })),
            ),
        );

        const result: OACandidate[] = [];

        for (const combatant of others) {
            if (!withinFiveOfPrev.has(combatant.id)) continue;

            // Creature left this combatant's 5ft reach (1 world unit = 5ft).
            if (distance(combatant.position, newPosition) <= 1) continue;

            // Skip allies unless pvpEnabled or friendlyFire overrides the team filter.
            const isAlly = combatant.teamId === moving.teamId;
            if (isAlly && !combatant.friendlyFire && !pvpEnabled) continue;

            if (combatant.reaction_used) continue;
            if (combatant.conditions.some((c) => INCAPACITATING_CONDITIONS.has(c))) continue;
            if (canSee && !canSee(combatant.id, movingCombatantId)) continue;

            result.push({ combatantId: combatant.id });
        }

        getLogger().debug({ movingCombatantId, candidateCount: result.length }, "checkOpportunityAttacks");
        return result;
    }
}
