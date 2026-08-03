/**
 * Conditions subsystem for D&D 5.5e (2024 PHB).
 *
 * Owns all reads and writes for active conditions (Redis encounter effects hash)
 * and the exhaustion combat-session cache (Redis string). Provides a pure
 * `getModifiers` function the combat engine calls before every roll.
 *
 * Multi-source stacking: the same condition from different sources is stored as
 * separate `ActiveEffect` entries. Removal matches both conditionName and sourceId
 * so that clearing one source leaves the condition active while other sources remain.
 */
import type {
    ActiveEffect,
    ApplyConditionOptions,
    CheckType,
    ConditionName,
    GameRejection,
    IGameStateStore,
    ModifierResult,
    Result,
} from "@byo20/shared";
import { getLogger } from "../../logger";
import type { IConditionsSubsystem } from "./action-economy";

// ── Canonical condition list ───────────────────────────────────────────────────

/** Authoritative list of the 15 official 5.5e conditions in alphabetical order. */
export const CONDITIONS: readonly ConditionName[] = [
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
] as const;

// ── Internal rule tables ───────────────────────────────────────────────────────

/** Conditions whose incapacitated effect blocks all actions, bonus actions, and reactions. */
const INCAPACITATING: readonly ConditionName[] = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];

/** Conditions that reduce movement to 0. */
const ZERO_SPEED: readonly ConditionName[] = ["grappled", "paralyzed", "petrified", "restrained", "stunned", "unconscious"];

/**
 * Conditions that cause the entity to auto-fail STR and DEX saving throws.
 * Note: the engine caller is responsible for checking the ability being saved against;
 * this flag signals "would auto-fail a STR or DEX save" broadly.
 */
const AUTO_FAIL_CONDITIONS: readonly ConditionName[] = ["paralyzed", "petrified", "stunned", "unconscious"];

/**
 * Conditions that grant attackers an automatic critical hit on melee hits within 5 ft.
 * This is a property of the TARGET — the engine reads `autoCrit` from the target's modifier result.
 */
const AUTO_CRIT_TARGET: readonly ConditionName[] = ["paralyzed", "unconscious"];

// ── Dependency interfaces (implemented by storage layer, mocked in tests) ──────

/**
 * Active effects storage for a single encounter.
 * The implementation in apps/server wraps the Redis HASH at `encounter:{id}:effects`.
 * Every method is scoped to the encounter this store was created for.
 */
export interface EncounterEffectsStore {
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
     * Remove all effects for an entity where conditionName and sourceId both match.
     * @param entityId - Entity UUID.
     * @param conditionName - Condition name to remove.
     * @param sourceId - Source entity UUID (or `"system"`) to remove; other sources remain.
     */
    removeEntityEffectsBySource(entityId: string, conditionName: ConditionName, sourceId: string): Promise<void>;
}

/**
 * Exhaustion level cache for the duration of one combat encounter.
 * The implementation wraps the Redis STRING at `character:{id}:exhaustion`.
 */
export interface ExhaustionStore {
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

// ── Exhaustion level bounds ────────────────────────────────────────────────────

/** Minimum valid exhaustion level (none). */
const EXHAUSTION_MIN = 0;
/** Maximum valid exhaustion level (fatal per PHB). */
const EXHAUSTION_MAX = 6;

// ── ConditionsSubsystem ────────────────────────────────────────────────────────

/**
 * Manages active conditions and exhaustion for a single encounter.
 * Implements `IConditionsSubsystem` so it can be injected into `ActionEconomySubsystem`.
 *
 * Constructed per-encounter — the encounterId is baked in at construction time.
 * All Redis reads/writes are routed through the injected `EncounterEffectsStore`
 * and `ExhaustionStore` so the class is testable without a live Redis instance.
 */
export class ConditionsSubsystem implements IConditionsSubsystem {
    /**
     * @param effects - Per-encounter effects store (wraps Redis HASH).
     * @param exhaustion - Per-character exhaustion cache (wraps Redis STRING).
     * @param store - Game state store for flushing conditions and exhaustion to Postgres.
     * @param encounterId - UUID of the encounter this instance is bound to.
     */
    constructor(
        private readonly effects: EncounterEffectsStore,
        private readonly exhaustion: ExhaustionStore,
        private readonly store: IGameStateStore,
        private readonly encounterId: string,
    ) {}

    // ── IConditionsSubsystem (used by ActionEconomySubsystem) ─────────────────

    /**
     * Return the distinct condition names currently active for a combatant.
     * Multiple `ActiveEffect` entries for the same condition (from different sources)
     * are collapsed to a single `ConditionName` entry in the result.
     *
     * @param entityId - Combatant UUID.
     * @returns Deduplicated list of active `ConditionName` values.
     */
    async getActiveConditions(entityId: string): Promise<ConditionName[]> {
        const active = await this.effects.getActiveEffects(entityId);
        const seen = new Set<ConditionName>();
        for (const e of active) {
            seen.add(e.conditionName);
        }
        const result = [...seen];
        getLogger().debug({ encounterId: this.encounterId, entityId, conditions: result }, "getActiveConditions");
        return result;
    }

    // ── Full subsystem surface ─────────────────────────────────────────────────

    /**
     * Apply a condition to an entity.
     * Idempotent per (conditionName, sourceId) pair — if the same source has already
     * applied this condition the existing `ActiveEffect` is returned without duplication.
     *
     * @param opts - All parameters needed to create the `ActiveEffect`.
     * @returns Ok with the created (or existing) `ActiveEffect`, or err if validation fails.
     */
    async applyCondition(opts: ApplyConditionOptions): Promise<Result<ActiveEffect, GameRejection>> {
        if (opts.scope === "TIMED" && opts.expiresAtRound === null) {
            return {
                ok: false,
                error: {
                    reason: "TIMED effects must specify expiresAtRound.",
                    action_type: "CONDITION_APPLY",
                    context: { conditionName: opts.conditionName, scope: opts.scope },
                },
            };
        }
        if ((opts.scope === "COMBAT" || opts.scope === "SUSTAINED") && opts.expiresAtRound !== null) {
            return {
                ok: false,
                error: {
                    reason: `${opts.scope} effects must have expiresAtRound = null.`,
                    action_type: "CONDITION_APPLY",
                    context: { conditionName: opts.conditionName, scope: opts.scope },
                },
            };
        }

        // Idempotency: return existing effect if same (conditionName, sourceId) already active
        const current = await this.effects.getActiveEffects(opts.entityId);
        const existing = current.find(
            (e) => e.conditionName === opts.conditionName && e.sourceId === opts.sourceId,
        );
        if (existing) {
            getLogger().debug(
                { encounterId: this.encounterId, entityId: opts.entityId, conditionName: opts.conditionName, sourceId: opts.sourceId },
                "applyCondition: idempotent — effect already present",
            );
            return { ok: true, value: existing };
        }

        const effect: ActiveEffect = {
            id: crypto.randomUUID(),
            causeId: opts.causeId,
            conditionName: opts.conditionName,
            targetId: opts.entityId,
            sourceId: opts.sourceId,
            sourceKind: opts.sourceKind,
            scope: opts.scope,
            expiresAtRound: opts.expiresAtRound,
        };

        await this.effects.addEntityEffect(opts.entityId, effect);
        getLogger().debug(
            { encounterId: this.encounterId, entityId: opts.entityId, conditionName: opts.conditionName, effectId: effect.id },
            "applyCondition",
        );
        return { ok: true, value: effect };
    }

    /**
     * Remove all `ActiveEffect` entries for (conditionName, sourceId) from an entity.
     * If another source has applied the same condition, it remains active.
     *
     * @param entityId - Entity UUID.
     * @param conditionName - Condition to remove.
     * @param sourceId - The specific source to remove (other sources remain).
     * @returns Ok on success.
     */
    async removeCondition(
        entityId: string,
        conditionName: ConditionName,
        sourceId: string,
    ): Promise<Result<void, GameRejection>> {
        await this.effects.removeEntityEffectsBySource(entityId, conditionName, sourceId);
        getLogger().debug(
            { encounterId: this.encounterId, entityId, conditionName, sourceId },
            "removeCondition",
        );
        return { ok: true, value: undefined };
    }

    /**
     * Fetch the raw `ActiveEffect` list for an entity (all sources, all conditions).
     *
     * @param entityId - Entity UUID.
     * @returns All active effects for the entity.
     */
    async getActiveEffects(entityId: string): Promise<ActiveEffect[]> {
        return this.effects.getActiveEffects(entityId);
    }

    /**
     * Compute the modifier profile for a set of conditions and a specific roll type.
     * Pure function — no I/O. Called by the combat engine before every roll.
     *
     * Advantage and disadvantage from separate conditions stack independently on their
     * respective sides; the engine applies the standard PHB cancellation rule
     * (any advantage + any disadvantage → single d20) when consuming this result.
     *
     * @param conditions - Active condition names for the entity making (or receiving) the roll.
     * @param checkType - Category of the roll being made.
     * @returns Modifier profile covering advantage, disadvantage, autoCrit, autoFail, speed, and blocked actions.
     */
    getModifiers(conditions: ConditionName[], checkType: CheckType): ModifierResult {
        const set = new Set(conditions);
        const sources = new Set<ConditionName>();
        let advantage = false;
        let disadvantage = false;
        let autoCrit = false;
        let autoFail = false;
        let speedMultiplier = 1;
        let actionsBlocked = false;

        // ── actionsBlocked: Incapacitated + supersets ──────────────────────────
        for (const c of INCAPACITATING) {
            if (set.has(c)) {
                actionsBlocked = true;
                sources.add(c);
            }
        }

        // ── speedMultiplier: zero-speed conditions ─────────────────────────────
        for (const c of ZERO_SPEED) {
            if (set.has(c)) {
                speedMultiplier = 0;
                sources.add(c);
            }
        }

        // ── autoFail: STR/DEX saving throws ───────────────────────────────────
        if (checkType === "SAVING_THROW") {
            for (const c of AUTO_FAIL_CONDITIONS) {
                if (set.has(c)) {
                    autoFail = true;
                    sources.add(c);
                }
            }
        }

        // ── autoCrit: paralyzed/unconscious grant auto-crits to attackers ──────
        // This flag is read by the engine when this entity is the ATTACK TARGET.
        for (const c of AUTO_CRIT_TARGET) {
            if (set.has(c)) {
                autoCrit = true;
                sources.add(c);
            }
        }

        // ── Advantage sources ──────────────────────────────────────────────────
        if (checkType === "ATTACK_ROLL" && set.has("invisible")) {
            advantage = true;
            sources.add("invisible");
        }

        // ── Disadvantage sources ───────────────────────────────────────────────
        if (checkType === "ATTACK_ROLL") {
            for (const c of ["blinded", "frightened", "poisoned", "prone", "restrained"] as const) {
                if (set.has(c)) {
                    disadvantage = true;
                    sources.add(c);
                }
            }
        }
        if (checkType === "ABILITY_CHECK" || checkType === "SKILL_CHECK") {
            for (const c of ["frightened", "poisoned"] as const) {
                if (set.has(c)) {
                    disadvantage = true;
                    sources.add(c);
                }
            }
        }
        if (checkType === "SAVING_THROW" && set.has("restrained")) {
            // Restrained imposes disadvantage on DEX saves; the engine knows the ability
            disadvantage = true;
            sources.add("restrained");
        }

        return {
            advantage,
            disadvantage,
            autoCrit,
            autoFail,
            speedMultiplier,
            actionsBlocked,
            sources: [...sources],
        };
    }

    /**
     * Return whether the entity is incapacitated (unable to act).
     * Incapacitated is implied by Paralyzed, Petrified, Stunned, and Unconscious.
     *
     * @param conditions - Active condition names for the entity.
     * @returns True if any incapacitating condition is present.
     */
    isIncapacitated(conditions: ConditionName[]): boolean {
        return INCAPACITATING.some((c) => conditions.includes(c));
    }

    /**
     * Read a character's exhaustion level from the combat-session cache.
     * Always seed the cache from Postgres at COMBAT_START before calling this.
     *
     * @param characterId - Character UUID.
     * @returns Exhaustion level 0-6; 0 if the key is absent.
     */
    async getExhaustionLevel(characterId: string): Promise<number> {
        return this.exhaustion.getExhaustionLevel(characterId);
    }

    /**
     * Set a character's exhaustion level in the combat-session cache.
     * Returns a rejection if the level is outside the valid 0-6 range.
     *
     * @param characterId - Character UUID.
     * @param level - New exhaustion level.
     * @returns Ok on success, err if level is out of range.
     */
    async setExhaustionLevel(characterId: string, level: number): Promise<Result<void, GameRejection>> {
        if (!Number.isInteger(level) || level < EXHAUSTION_MIN || level > EXHAUSTION_MAX) {
            return {
                ok: false,
                error: {
                    reason: `Exhaustion level must be an integer 0-6; got ${level}.`,
                    action_type: "EXHAUSTION_SET",
                    context: { characterId, level },
                },
            };
        }
        await this.exhaustion.setExhaustionLevel(characterId, level);
        getLogger().debug({ characterId, level }, "setExhaustionLevel");
        return { ok: true, value: undefined };
    }

    /**
     * Flush the current Redis condition and exhaustion state for one entity to Postgres.
     * Called at COMBAT_ENDED (or mid-combat for long-running encounters that checkpoint).
     *
     * Reads the deduplicated condition list and exhaustion level from the combat-session
     * cache, then writes them to the `character_campaign_state` row via the game state store.
     *
     * @param entityId - Character UUID (used as both the encounter entity ID and the exhaustion cache key).
     * @param characterCampaignStateId - UUID of the `character_campaign_state` row to update.
     */
    async flushConditionsToPostgres(entityId: string, characterCampaignStateId: string): Promise<void> {
        const [activeConditions, exhaustionLevel, state] = await Promise.all([
            this.getActiveConditions(entityId),
            this.exhaustion.getExhaustionLevel(entityId),
            this.store.getCharacterCampaignState(characterCampaignStateId),
        ]);

        await this.store.saveCharacterCampaignState({
            ...state,
            conditions: activeConditions,
            exhaustionLevel,
        });

        getLogger().debug(
            { encounterId: this.encounterId, entityId, characterCampaignStateId, conditions: activeConditions, exhaustionLevel },
            "flushConditionsToPostgres",
        );
    }
}

// ── Stub for use before the full subsystem is wired up ────────────────────────

/**
 * No-op stub that satisfies `IConditionsSubsystem` without any I/O.
 * Used by tests and by code paths where conditions aren't yet tracked.
 */
export class StubConditionsSubsystem implements IConditionsSubsystem {
    /**
     * Always returns an empty condition list.
     * @param _entityId - Ignored.
     * @returns Empty array.
     */
    async getActiveConditions(_entityId: string): Promise<ConditionName[]> {
        return [];
    }
}
