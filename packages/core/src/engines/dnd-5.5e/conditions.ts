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
import type {
    Condition,
    CheckType as EngineCheckType,
    ModifierResult as EngineModifierResult,
    RollMode,
} from "../../interfaces/rules-engine";
import { getLogger } from "../../logger";
import type { IConditionsSubsystem, IEncounterEffectsStore, IExhaustionStore } from "./interfaces";

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
const ZERO_SPEED: readonly ConditionName[] = [
    "grappled",
    "paralyzed",
    "petrified",
    "restrained",
    "stunned",
    "unconscious",
];

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
        private readonly effects: IEncounterEffectsStore,
        private readonly exhaustion: IExhaustionStore,
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
            seen.add(e.name as ConditionName);
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
        if (opts.scope === "TIMED" && opts.expiresAtRound === null && opts.expiresAtTime === null) {
            return {
                ok: false,
                error: {
                    reason: "TIMED effects must specify expiresAtRound or expiresAtTime.",
                    action_type: "CONDITION_APPLY",
                    context: { conditionName: opts.conditionName, scope: opts.scope },
                },
            };
        }
        if (
            (opts.scope === "COMBAT" || opts.scope === "SUSTAINED") &&
            (opts.expiresAtRound !== null || opts.expiresAtTime !== null)
        ) {
            return {
                ok: false,
                error: {
                    reason: `${opts.scope} effects must have both expiry fields null.`,
                    action_type: "CONDITION_APPLY",
                    context: { conditionName: opts.conditionName, scope: opts.scope },
                },
            };
        }

        // Idempotency: return existing effect if same (conditionName, sourceId) already active
        const current = await this.effects.getActiveEffects(opts.entityId);
        const existing = current.find((e) => e.name === opts.conditionName && e.sourceId === opts.sourceId);
        if (existing) {
            getLogger().debug(
                {
                    encounterId: this.encounterId,
                    entityId: opts.entityId,
                    conditionName: opts.conditionName,
                    sourceId: opts.sourceId,
                },
                "applyCondition: idempotent — effect already present",
            );
            return { ok: true, value: existing };
        }

        const effect: ActiveEffect = {
            id: crypto.randomUUID(),
            name: opts.conditionName,
            targetId: opts.entityId,
            sourceId: opts.sourceId,
            scope: opts.scope,
            expiresAtRound: opts.expiresAtRound,
            expiresAtTime: opts.expiresAtTime ?? null,
        };

        await this.effects.addEntityEffect(opts.entityId, effect);
        getLogger().debug(
            {
                encounterId: this.encounterId,
                entityId: opts.entityId,
                conditionName: opts.conditionName,
                effectId: effect.id,
            },
            "applyCondition",
        );
        return { ok: true, value: effect };
    }

    /**
     * Remove `ActiveEffect` entries for a condition from an entity.
     * When `sourceId` is provided, only the matching (conditionName, sourceId) entry is removed;
     * other sources applying the same condition remain active.
     * When `sourceId` is omitted, all effects for that condition name are removed regardless of source.
     *
     * @param entityId - Entity UUID.
     * @param conditionName - Condition to remove.
     * @param sourceId - Optional. The specific source to remove; omit to clear all sources.
     * @returns Ok on success.
     */
    async removeCondition(
        entityId: string,
        conditionName: ConditionName,
        sourceId?: string,
    ): Promise<Result<void, GameRejection>> {
        if (sourceId !== undefined) {
            await this.effects.removeEntityEffectsBySource(entityId, conditionName, sourceId);
        } else {
            await this.effects.removeAllEffectsByCondition(entityId, conditionName);
        }
        getLogger().debug({ encounterId: this.encounterId, entityId, conditionName, sourceId }, "removeCondition");
        return { ok: true, value: undefined };
    }

    /**
     * Remove all `ActiveEffect` entries applied by a single source, across all condition names.
     * Used when Dispel Magic or a similar effect removes everything a caster applied.
     *
     * @param entityId - Entity UUID.
     * @param sourceId - The source whose effects to clear entirely.
     * @returns Ok on success.
     */
    async removeConditionsBySource(entityId: string, sourceId: string): Promise<Result<void, GameRejection>> {
        await this.effects.removeAllEffectsBySource(entityId, sourceId);
        getLogger().debug({ encounterId: this.encounterId, entityId, sourceId }, "removeConditionsBySource");
        return { ok: true, value: undefined };
    }

    /**
     * Remove all active effects for an entity unconditionally.
     * Called at `COMBAT_ENDED` to clear COMBAT-scoped effects before persisting.
     *
     * @param entityId - Entity UUID.
     * @returns Ok on success.
     */
    async clearAllConditions(entityId: string): Promise<Result<void, GameRejection>> {
        await this.effects.clearAllEffects(entityId);
        getLogger().debug({ encounterId: this.encounterId, entityId }, "clearAllConditions");
        return { ok: true, value: undefined };
    }

    /**
     * Remove all effects whose `expiresAtRound` ≤ `currentRound` or `expiresAtTime` ≤ `currentClockMinutes`.
     * Called at the start of each round by the combat engine.
     *
     * @param entityId - Entity UUID.
     * @param currentClockMinutes - Current world-clock value in integer minutes.
     * @param currentRound - The round number that has just started.
     * @returns Array of expired condition names (deduplicated); empty if nothing expired.
     */
    async tickExpirations(
        entityId: string,
        currentClockMinutes: number,
        currentRound: number,
    ): Promise<ConditionName[]> {
        const all = await this.effects.getActiveEffects(entityId);
        const expired = all.filter(
            (e) =>
                (e.expiresAtRound !== null && e.expiresAtRound <= currentRound) ||
                (e.expiresAtTime !== null && e.expiresAtTime <= currentClockMinutes),
        );
        const expiredNames = [...new Set(expired.map((e) => e.name as ConditionName))];
        for (const e of expired) {
            await this.effects.removeEntityEffectsBySource(entityId, e.name, e.sourceId);
        }
        getLogger().debug(
            { encounterId: this.encounterId, entityId, currentClockMinutes, currentRound, expired: expired.length },
            "tickExpirations",
        );
        return expiredNames;
    }

    /**
     * Increment a character's exhaustion level by 1, capped at `EXHAUSTION_MAX` (6).
     *
     * @param characterId - Character UUID.
     * @returns Ok with the new level; err if already at maximum.
     */
    async incrementExhaustion(characterId: string): Promise<Result<number, GameRejection>> {
        const current = await this.exhaustion.getExhaustionLevel(characterId);
        if (current >= EXHAUSTION_MAX) {
            return {
                ok: false,
                error: {
                    reason: `Exhaustion already at maximum (${EXHAUSTION_MAX}).`,
                    action_type: "EXHAUSTION_SET",
                    context: { characterId, level: current },
                },
            };
        }
        const next = current + 1;
        await this.exhaustion.setExhaustionLevel(characterId, next);
        getLogger().debug({ characterId, from: current, to: next }, "incrementExhaustion");
        return { ok: true, value: next };
    }

    /**
     * Decrement a character's exhaustion level by 1, floored at `EXHAUSTION_MIN` (0).
     *
     * @param characterId - Character UUID.
     * @returns Ok with the new level; err if already at minimum.
     */
    async decrementExhaustion(characterId: string): Promise<Result<number, GameRejection>> {
        const current = await this.exhaustion.getExhaustionLevel(characterId);
        if (current <= EXHAUSTION_MIN) {
            return {
                ok: false,
                error: {
                    reason: `Exhaustion already at minimum (${EXHAUSTION_MIN}).`,
                    action_type: "EXHAUSTION_SET",
                    context: { characterId, level: current },
                },
            };
        }
        const next = current - 1;
        await this.exhaustion.setExhaustionLevel(characterId, next);
        getLogger().debug({ characterId, from: current, to: next }, "decrementExhaustion");
        return { ok: true, value: next };
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
     * Pure static function — no I/O. Called by the combat engine before every roll.
     *
     * Advantage and disadvantage from separate conditions stack independently on their
     * respective sides; the engine applies the standard PHB cancellation rule
     * (any advantage + any disadvantage → single d20) when consuming this result.
     *
     * @param conditions - Active condition names for the entity making (or receiving) the roll.
     * @param exhaustionLevel - Current exhaustion level 0-6; contributes -2 per level to `flatBonus`.
     * @param checkType - Category of the roll being made.
     * @returns Modifier profile covering advantage, disadvantage, autoCrit, autoFail, speed, and blocked actions.
     */
    static getModifiers(conditions: ConditionName[], exhaustionLevel: number, checkType: CheckType): ModifierResult {
        const set = new Set(conditions);
        const sources = new Set<ConditionName>();
        let advantage = false;
        let disadvantage = false;
        let autoCrit = false;
        let autoFail = false;
        let speedOverride: number | null = null;
        let actionsBlocked = false;

        // ── flatBonus: exhaustion — 2024 PHB: -2 per level to all d20 tests ───
        const flatBonus = exhaustionLevel > 0 ? -(2 * exhaustionLevel) : 0;

        // ── actionsBlocked: Incapacitated + supersets ──────────────────────────
        for (const c of INCAPACITATING) {
            if (set.has(c)) {
                actionsBlocked = true;
                sources.add(c);
            }
        }

        // ── speedOverride: zero-speed conditions set it to 0 ──────────────────
        for (const c of ZERO_SPEED) {
            if (set.has(c)) {
                speedOverride = 0;
                sources.add(c);
            }
        }

        // ── autoFail: per-ability saves — PHB: paralyzed/petrified/stunned/unconscious auto-fail STR and DEX ──
        if (checkType === "SAVE_STR" || checkType === "SAVE_DEX") {
            for (const c of AUTO_FAIL_CONDITIONS) {
                if (set.has(c)) {
                    autoFail = true;
                    sources.add(c);
                }
            }
        }

        // ── autoCrit: paralyzed/unconscious grant auto-crits to melee attackers within 5 ft ──
        // Evaluated when this entity is the ATTACK_ROLL_TARGET.
        if (checkType === "ATTACK_ROLL_TARGET") {
            for (const c of AUTO_CRIT_TARGET) {
                if (set.has(c)) {
                    autoCrit = true;
                    sources.add(c);
                }
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
        if (checkType === "ABILITY_CHECK") {
            for (const c of ["frightened", "poisoned"] as const) {
                if (set.has(c)) {
                    disadvantage = true;
                    sources.add(c);
                }
            }
        }
        // Restrained imposes disadvantage on DEX saves specifically (PHB).
        if (checkType === "SAVE_DEX" && set.has("restrained")) {
            disadvantage = true;
            sources.add("restrained");
        }

        return {
            advantage,
            disadvantage,
            autoCrit,
            autoFail,
            flatBonus,
            speedOverride,
            speedReduction: 0,
            actionsBlocked,
            sources: [...sources],
        };
    }

    /**
     * Return whether a condition list includes any incapacitating condition.
     * Pure static function — takes conditions already loaded by the caller.
     * Use `isEntityIncapacitated` when you only have an entityId and want a single async call.
     *
     * @param conditions - Active condition names for the entity.
     * @returns True if any incapacitating condition is present.
     */
    static isIncapacitated(conditions: ConditionName[]): boolean {
        return INCAPACITATING.some((c) => conditions.includes(c));
    }

    /**
     * Async convenience wrapper: reads active conditions from the store and checks incapacitation.
     * Prefer `isIncapacitated` (static) when conditions are already available to avoid extra I/O.
     *
     * @param entityId - Entity UUID.
     * @returns True if the entity is incapacitated.
     */
    async isEntityIncapacitated(entityId: string): Promise<boolean> {
        const conditions = await this.getActiveConditions(entityId);
        return ConditionsSubsystem.isIncapacitated(conditions);
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
            {
                encounterId: this.encounterId,
                entityId,
                characterCampaignStateId,
                conditions: activeConditions,
                exhaustionLevel,
            },
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

// ── Standalone evaluateConditions (for IRulesEngine.evaluateConditions) ────────

/**
 * Evaluate a set of conditions and produce the engine-internal modifier profile.
 * Called by `DnD5eRulesEngine.evaluateConditions` — bridges engine-internal types
 * (`Condition[]`, engine `CheckType`) to the PHB condition rules.
 *
 * Advantage and disadvantage from separate conditions cancel out per standard PHB rules.
 *
 * @param conds - Active conditions as engine-internal `Condition` values.
 * @param checkType - Engine-internal check type discriminant (`"ability" | "skill" | "saving_throw" | "attack"`).
 * @returns Engine-internal `ModifierResult` covering roll modes, movement, and action availability.
 */
export function evaluateConditions(conds: Condition[], checkType: EngineCheckType): EngineModifierResult {
    // Condition and ConditionName are structurally identical string literal unions.
    const set = new Set(conds as unknown as ConditionName[]);

    const incapacitated = INCAPACITATING.some((c) => set.has(c));
    const zeroSpeed = ZERO_SPEED.some((c) => set.has(c));
    const grantsCriticalHits = AUTO_CRIT_TARGET.some((c) => set.has(c));
    const autoFailStrDex = checkType === "saving_throw" && AUTO_FAIL_CONDITIONS.some((c) => set.has(c));

    // ── Attack roll mode: advantage/disadvantage cancel per PHB ───────────────
    let attackRollMode: RollMode = "normal";
    if (checkType === "attack") {
        const adv = set.has("invisible");
        const dis = (["blinded", "frightened", "poisoned", "prone", "restrained"] as const).some((c) => set.has(c));
        if (adv && !dis) attackRollMode = "advantage";
        else if (!adv && dis) attackRollMode = "disadvantage";
    }

    // ── Ability/skill check mode ──────────────────────────────────────────────
    let abilityCheckMode: RollMode = "normal";
    if (checkType === "ability" || checkType === "skill") {
        if ((["frightened", "poisoned"] as const).some((c) => set.has(c))) abilityCheckMode = "disadvantage";
    }

    // ── Saving throw mode: restrained → disadvantage on DEX saves ────────────
    let savingThrowMode: RollMode = "normal";
    if (checkType === "saving_throw" && set.has("restrained")) savingThrowMode = "disadvantage";

    return {
        attackRollMode,
        abilityCheckMode,
        savingThrowMode,
        canMove: !zeroSpeed,
        canTakeActions: !incapacitated,
        canTakeBonusActions: !incapacitated,
        canTakeReactions: !incapacitated,
        autoFailStrDex,
        criticalHitRangeExtension: 0,
        grantsCriticalHits,
        speedMultiplier: zeroSpeed ? 0 : 1,
    };
}
