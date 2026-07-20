/**
 * @byo20/engine — D&D 5.5e rules engine.
 * Public API: the engine class, the IRulesEngine contract, all context/result types,
 * utility functions, and the canonical conditions list.
 */
import { initPackageLogger } from "./logger";

// ── Package initialisation ────────────────────────────────────────────────────

/** Initialise the engine package. Must be called after initLogger and before any engine use. */
export function initEngine(): void {
    initPackageLogger();
}

// ── Engine class and interface ────────────────────────────────────────────────
export { DnD5eRulesEngine } from "./engines/dnd-5.5e";
export type { IRulesEngine } from "./interfaces/rules-engine";

// ── Context / result types for all subsystems ─────────────────────────────────
export type {
    RollMode,
    DiceRoll,
    Ability,
    Skill,
    CheckType,
    AttackerType,
    TargetType,
    AttackContext,
    AttackResult,
    SavingThrowContext,
    SaveResult,
    DamageContext,
    DamageResult,
    Condition,
    ModifierResult,
    DeathSaveResult,
    WorldClockTickResult,
    XPAwardResult,
    LevelUpResult,
    TreasureTheme,
    TreasureType,
    LootManifest,
    LootClaim,
    LootDistributionResult,
    FogMode,
    ExplorationFog,
    CombatVision,
    VisibilityResult,
    AoEShape,
    AoEContext,
    AoEResult,
    SpellCastContext,
    SpellCastResult,
    SpellEffectPrimitive,
    EffectContext,
    EffectResult,
    ConcentrationResult,
    QuestGenContext,
    QuestGenResult,
    NodeResolutionContext,
    QuestNodeResult,
    RankedMemory,
    RankedMemoryResult,
} from "./interfaces/rules-engine";

// ── Utilities (also useful in apps/server and tests) ─────────────────────────
export {
    rollDice,
    roll,
    rollAdvantage,
    rollDisadvantage,
    parseDiceNotation,
    rollNotation,
} from "./utils/dice";

export {
    getModifier,
    getProficiencyBonus,
    getPassiveScore,
    getSpellSaveDC,
    getSpellAttackBonus,
    getTotalLevel,
} from "./utils/modifiers";

export {
    computeSphere,
    computeEmanation,
    computeCube,
    computeCone,
    computeLine,
    computeCylinder,
} from "./utils/geometry";
export type { Vec3, BoundedEntity } from "./utils/geometry";

// ── Conditions constant ────────────────────────────────────────────────────────
export { CONDITIONS } from "./engines/dnd-5.5e/conditions";

// ── Error class ───────────────────────────────────────────────────────────────
export { NotImplementedError } from "./errors";
