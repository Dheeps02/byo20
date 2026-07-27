import type { ActionResources, GameRejection, Result } from "@byo20/shared";
import { createLogger } from "@byo20/logger";
import { computeSphere } from "../../utils/geometry";
import type { Vec3 } from "../../utils/geometry";

const logger = createLogger("action-economy");

// ── Public types ──────────────────────────────────────────────────────────────

/** All action types the engine recognises. */
export type ActionType =
    | "ATTACK"
    | "DASH"
    | "DISENGAGE"
    | "DODGE"
    | "HELP"
    | "HIDE"
    | "INFLUENCE"
    | "MAGIC"
    | "READY"
    | "SEARCH"
    | "STUDY"
    | "UTILIZE"
    | "IMPROVISED"
    | "BONUS_ACTION"
    | "REACTION"
    | "FREE_INTERACTION";

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

const INCAPACITATING_CONDITIONS = new Set([
    "incapacitated",
    "paralyzed",
    "petrified",
    "stunned",
    "unconscious",
]);

const ACTION_CONSUMING_TYPES = new Set<ActionType>([
    "ATTACK",
    "DASH",
    "DISENGAGE",
    "DODGE",
    "HELP",
    "HIDE",
    "INFLUENCE",
    "MAGIC",
    "READY",
    "SEARCH",
    "STUDY",
    "UTILIZE",
    "IMPROVISED",
]);

// ── Geometry helper (distance not exported from geometry.ts) ──────────────────

function dist3(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Subsystem ─────────────────────────────────────────────────────────────────

export class ActionEconomySubsystem {
    constructor(
        private readonly store: ActionResourceStore,
        private readonly conditions: ConditionsSubsystem,
    ) {}

    /** Write a fresh full-budget resource set at the start of a combatant's first turn. */
    async initTurnResources(combatantId: string, baseSpeed: number, attacksTotal: number): Promise<void> {
        const resources: ActionResources = {
            movement_remaining: baseSpeed,
            actions_remaining: 1,
            bonus_action_used: false,
            reaction_used: false,
            free_interaction_used: false,
            attacks_remaining: attacksTotal,
        };
        await this.store.setTurnResources(combatantId, resources);
        logger.debug({ combatantId, baseSpeed, attacksTotal }, "initTurnResources");
    }

    /**
     * Reset all per-turn resources for the next turn, preserving `reaction_used`
     * (reaction is per-round, resets at the START of the creature's own turn via resetReaction).
     * `actions_remaining` is set to 1 + count of `grant_action` primitives in activeEffects.
     */
    async resetBetweenTurns(
        combatantId: string,
        baseSpeed: number,
        attacksTotal: number,
        activeEffects: unknown[],
    ): Promise<void> {
        const current = await this.store.getTurnResources(combatantId);
        const grantActionCount = activeEffects.filter(
            (e) => (e as { type?: string }).type === "grant_action",
        ).length;
        const resources: ActionResources = {
            movement_remaining: baseSpeed,
            actions_remaining: 1 + grantActionCount,
            bonus_action_used: false,
            reaction_used: current.reaction_used,
            free_interaction_used: false,
            attacks_remaining: attacksTotal,
        };
        await this.store.setTurnResources(combatantId, resources);
        logger.debug({ combatantId, baseSpeed, attacksTotal, grantActionCount }, "resetBetweenTurns");
    }

    /**
     * Reset only reaction_used to false.
     * Called when ACTIVE_TURN begins — PHB: reaction resets at the start of your own turn.
     */
    async resetReaction(combatantId: string): Promise<void> {
        const current = await this.store.getTurnResources(combatantId);
        await this.store.setTurnResources(combatantId, { ...current, reaction_used: false });
        logger.debug({ combatantId }, "resetReaction");
    }

    /** Increment actions_remaining by 1 (Action Surge, Haste mid-turn grant). */
    async grantAdditionalAction(combatantId: string): Promise<void> {
        const current = await this.store.getTurnResources(combatantId);
        await this.store.setTurnResources(combatantId, {
            ...current,
            actions_remaining: current.actions_remaining + 1,
        });
        logger.debug({ combatantId }, "grantAdditionalAction");
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
        conditions: string[],
    ): Promise<Result<void, GameRejection>> {
        // Step 1: Is it this combatant's turn?
        if (combatantId !== currentCombatantId) {
            logger.debug({ combatantId, currentCombatantId }, "validateAction: not this combatant's turn");
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

        if (ACTION_CONSUMING_TYPES.has(action)) {
            if (resources.actions_remaining <= 0) {
                logger.debug({ combatantId, action }, "validateAction: no actions remaining");
                return {
                    ok: false,
                    error: {
                        reason: "No actions remaining.",
                        action_type: action,
                        context: { actions_remaining: resources.actions_remaining },
                    },
                };
            }
        } else if (action === "BONUS_ACTION") {
            if (resources.bonus_action_used) {
                logger.debug({ combatantId, action }, "validateAction: bonus action already used");
                return {
                    ok: false,
                    error: { reason: "Bonus action already used this turn.", action_type: action },
                };
            }
        } else if (action === "REACTION") {
            if (resources.reaction_used) {
                logger.debug({ combatantId, action }, "validateAction: reaction already used");
                return {
                    ok: false,
                    error: { reason: "Reaction already used this round.", action_type: action },
                };
            }
        } else if (action === "FREE_INTERACTION") {
            if (resources.free_interaction_used) {
                logger.debug({ combatantId, action }, "validateAction: free interaction already used");
                return {
                    ok: false,
                    error: { reason: "Free object interaction already used this turn.", action_type: action },
                };
            }
        }

        // Step 4: Condition legality.
        const storedConditions = await this.conditions.getActiveConditions(combatantId);
        const allConditions = [...new Set([...conditions, ...storedConditions])];
        const isIncapacitated = allConditions.some((c) => INCAPACITATING_CONDITIONS.has(c));

        if (
            isIncapacitated &&
            (ACTION_CONSUMING_TYPES.has(action) || action === "BONUS_ACTION" || action === "REACTION")
        ) {
            logger.debug({ combatantId, action, allConditions }, "validateAction: incapacitated");
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
        logger.debug({ combatantId, action }, "validateAction: ok");
        return { ok: true, value: undefined };
    }

    /** Mark a boolean resource as spent or decrement a counter resource by 1. */
    async spendResource(combatantId: string, resource: SpendableResource): Promise<void> {
        const current = await this.store.getTurnResources(combatantId);
        let updated: ActionResources;

        switch (resource) {
            case "action":
                updated = { ...current, actions_remaining: Math.max(0, current.actions_remaining - 1) };
                break;
            case "bonus_action":
                updated = { ...current, bonus_action_used: true };
                break;
            case "reaction":
                updated = { ...current, reaction_used: true };
                break;
            case "free_interaction":
                updated = { ...current, free_interaction_used: true };
                break;
            case "attack":
                updated = { ...current, attacks_remaining: Math.max(0, current.attacks_remaining - 1) };
                break;
            default:
                logger.warn({ combatantId, resource }, "spendResource: unknown resource type");
                return;
        }

        await this.store.setTurnResources(combatantId, updated);
        logger.debug({ combatantId, resource }, "spendResource");
    }

    /** Deduct movement cost; difficult terrain doubles the foot cost. */
    async spendMovement(combatantId: string, feet: number, difficultTerrain: boolean): Promise<void> {
        const current = await this.store.getTurnResources(combatantId);
        const cost = difficultTerrain ? feet * 2 : feet;
        const updated: ActionResources = {
            ...current,
            movement_remaining: Math.max(0, current.movement_remaining - cost),
        };
        await this.store.setTurnResources(combatantId, updated);
        logger.debug({ combatantId, feet, difficultTerrain, cost }, "spendMovement");
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
            logger.warn({ movingCombatantId }, "checkOpportunityAttacks: moving combatant not found");
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

        logger.debug({ movingCombatantId, candidateCount: result.length }, "checkOpportunityAttacks");
        return result;
    }
}
