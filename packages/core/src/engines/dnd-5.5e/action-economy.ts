import type { ActionResources, ConditionName, GameRejection, Result } from "@byo20/shared";
import { getLogger } from "../../logger";
import { computeSphere } from "../../utils/geometry";
import type { Vec3 } from "../../utils/geometry";

// ── Public types ──────────────────────────────────────────────────────────────

/** All action types the engine recognises. Each costs one action (see getResourceCost). */
export type ActionType =
    | "ATTACK"
    | "CAST_SPELL"
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

/** Resources that can be spent one unit at a time. */
export type SpendableResource = "action" | "bonus_action" | "reaction" | "free_interaction" | "attack";

/** A combatant eligible to make an opportunity attack. */
export interface OACandidate {
    combatantId: string;
}

/** Minimal per-combatant state needed for OA resolution. */
export interface CombatantState {
    id: string;
    position: Vec3;
    teamId: string;
    conditions: string[];
    reaction_used: boolean;
}

// ── Injectable interfaces ─────────────────────────────────────────────────────

/** Thin read/write interface over the turn-resources Redis HASH. */
export interface ActionResourceStore {
    getTurnResources(combatantId: string): Promise<ActionResources>;
    setTurnResources(combatantId: string, resources: ActionResources): Promise<void>;
}

/** Minimal conditions query needed by action validation. */
export interface ConditionsSubsystem {
    getActiveConditions(combatantId: string): Promise<string[]>;
}

// ── Internal constants ────────────────────────────────────────────────────────

const INCAPACITATING_CONDITIONS = new Set(["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]);

// ── Geometry helper (distance not exported from geometry.ts) ──────────────────

function dist3(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Maps an ActionType to the SpendableResource it consumes.
 * All current ActionTypes cost one action; this function exists as the extension
 * point for future actions that might cost a different resource (e.g., bonus_action).
 */
function getResourceCost(_action: ActionType): SpendableResource {
    return "action";
}

// ── Subsystem ─────────────────────────────────────────────────────────────────

export class ActionEconomySubsystem {
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

    /** Mark a boolean resource as spent or decrement a counter resource by 1. */
    async spendResource(combatantId: string, resource: SpendableResource): Promise<Result<void, GameRejection>> {
        const current = await this.store.getTurnResources(combatantId);
        let updated: ActionResources;

        switch (resource) {
            case "action":
                if (current.actions_remaining <= 0) {
                    getLogger().warn({ combatantId, resource }, "spendResource: no actions remaining");
                    return { ok: false, error: { reason: "No actions remaining.", action_type: resource } };
                }
                updated = { ...current, actions_remaining: current.actions_remaining - 1 };
                break;
            case "bonus_action":
                if (current.bonus_action_used) {
                    getLogger().warn({ combatantId, resource }, "spendResource: bonus action already used");
                    return {
                        ok: false,
                        error: { reason: "Bonus action already used this turn.", action_type: resource },
                    };
                }
                updated = { ...current, bonus_action_used: true };
                break;
            case "reaction":
                if (current.reaction_used) {
                    getLogger().warn({ combatantId, resource }, "spendResource: reaction already used");
                    return { ok: false, error: { reason: "Reaction already used this round.", action_type: resource } };
                }
                updated = { ...current, reaction_used: true };
                break;
            case "free_interaction":
                if (current.free_interaction_used) {
                    getLogger().warn({ combatantId, resource }, "spendResource: free interaction already used");
                    return {
                        ok: false,
                        error: { reason: "Free object interaction already used this turn.", action_type: resource },
                    };
                }
                updated = { ...current, free_interaction_used: true };
                break;
            case "attack":
                if (current.attacks_remaining <= 0) {
                    getLogger().warn({ combatantId, resource }, "spendResource: no attacks remaining");
                    return { ok: false, error: { reason: "No attacks remaining.", action_type: resource } };
                }
                updated = { ...current, attacks_remaining: current.attacks_remaining - 1 };
                break;
            default:
                getLogger().warn({ combatantId, resource }, "spendResource: unknown resource type");
                return { ok: false, error: { reason: "Unknown resource type.", action_type: resource } };
        }

        await this.store.setTurnResources(combatantId, updated);
        getLogger().debug({ combatantId, resource }, "spendResource");
        return { ok: true, value: undefined };
    }

    /** Deduct movement cost; difficult terrain doubles the foot cost. */
    async spendMovement(
        combatantId: string,
        feet: number,
        difficultTerrain: boolean,
    ): Promise<Result<void, GameRejection>> {
        const current = await this.store.getTurnResources(combatantId);
        const cost = difficultTerrain ? feet * 2 : feet;
        if (current.movement_remaining < cost) {
            getLogger().warn(
                { combatantId, feet, cost, available: current.movement_remaining },
                "spendMovement: insufficient movement",
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
        const updated: ActionResources = {
            ...current,
            movement_remaining: current.movement_remaining - cost,
        };
        await this.store.setTurnResources(combatantId, updated);
        getLogger().debug({ combatantId, feet, difficultTerrain, cost }, "spendMovement");
        return { ok: true, value: undefined };
    }

    /**
     * Pure function — returns all combatants eligible to make an opportunity attack
     * against `movingCombatantId` after it moved from prevPosition to newPosition.
     *
     * A candidate must: be within 5ft of prevPosition, have left their reach (not still
     * within 5ft at newPosition), be an enemy, have reaction available, and not be
     * incapacitated. If `canSee` is provided, visibility is also checked.
     */
    checkOpportunityAttacks(
        movingCombatantId: string,
        prevPosition: Vec3,
        newPosition: Vec3,
        combatants: CombatantState[],
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

            // Creature left this enemy's 5ft reach (1 world unit = 5ft).
            if (dist3(combatant.position, newPosition) <= 1) continue;

            if (combatant.teamId === moving.teamId) continue;
            if (combatant.reaction_used) continue;
            if (combatant.conditions.some((c) => INCAPACITATING_CONDITIONS.has(c))) continue;
            if (canSee && !canSee(combatant.id, movingCombatantId)) continue;

            result.push({ combatantId: combatant.id });
        }

        getLogger().debug({ movingCombatantId, candidateCount: result.length }, "checkOpportunityAttacks");
        return result;
    }
}
