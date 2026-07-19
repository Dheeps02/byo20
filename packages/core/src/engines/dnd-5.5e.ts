import type { Logger } from "@byo20/logger";
import type {
    Character,
    Encounter,
    GameRejection,
    IGameStateStore,
    NPC,
    Result,
    WorldMutationInstruction,
} from "@byo20/shared";
/**
 * DnD5eRulesEngine — the concrete implementation of IRulesEngine for D&D 5.5e (2024).
 *
 * This class is intentionally thin: it only delegates to the per-subsystem
 * files in engines/dnd-5.5e/. All logic lives in those files.
 */
import type { IRulesEngine } from "../interfaces/rules-engine";
import type {
    AoEContext,
    AoEResult,
    AttackContext,
    AttackResult,
    CheckType,
    CombatVision,
    ConcentrationResult,
    Condition,
    DamageContext,
    DamageResult,
    DeathSaveResult,
    EffectContext,
    EffectResult,
    ExplorationFog,
    LevelUpResult,
    LootClaim,
    LootDistributionResult,
    LootManifest,
    ModifierResult,
    NodeResolutionContext,
    QuestGenContext,
    QuestGenResult,
    QuestNodeResult,
    RankedMemoryResult,
    SaveResult,
    SavingThrowContext,
    SpellCastContext,
    SpellCastResult,
    SpellEffectPrimitive,
    TreasureTheme,
    VisibilityResult,
    WorldClockTickResult,
    XPAwardResult,
} from "../interfaces/rules-engine";

import * as aoe from "./dnd-5.5e/aoe";
import * as combat from "./dnd-5.5e/combat";
import * as conditions from "./dnd-5.5e/conditions";
import * as deathSaves from "./dnd-5.5e/death-saves";
import * as fog from "./dnd-5.5e/fog";
import * as loot from "./dnd-5.5e/loot";
import * as quests from "./dnd-5.5e/quests";
import * as spells from "./dnd-5.5e/spells";
import * as clock from "./dnd-5.5e/world-clock";
import * as xp from "./dnd-5.5e/xp";

/** D&D 5.5e (2024 PHB) rules engine implementation. */
export class DnD5eRulesEngine implements IRulesEngine {
    readonly RULESET_ID = "dnd-5.5e-2024";

    constructor(
        private readonly store: IGameStateStore,
        private readonly logger: Logger,
    ) {}

    resolveAttack(context: AttackContext): Result<AttackResult, GameRejection> {
        return combat.resolveAttack(context);
    }

    resolveSavingThrow(context: SavingThrowContext): SaveResult {
        return combat.resolveSavingThrow(context);
    }

    calculateDamage(context: DamageContext): DamageResult {
        return combat.calculateDamage(context);
    }

    evaluateConditions(conds: Condition[], checkType: CheckType): ModifierResult {
        return conditions.evaluateConditions(conds, checkType);
    }

    rollDeathSave(entity: Character): DeathSaveResult {
        return deathSaves.rollDeathSave(entity);
    }

    tickWorldClock(campaignId: string, minutes: number): Promise<WorldClockTickResult> {
        return clock.tickWorldClock(campaignId, minutes);
    }

    awardXP(encounter: Encounter, characters: Character[]): XPAwardResult {
        return xp.awardXP(encounter, characters);
    }

    resolveLevelUp(character: Character, hpOnLevelup: "roll" | "fixed"): LevelUpResult {
        return xp.resolveLevelUp(character, hpOnLevelup);
    }

    generateLoot(encounter: Encounter, theme: TreasureTheme): LootManifest {
        return loot.generateLoot(encounter, theme);
    }

    resolveLootClaims(claims: LootClaim[], manifest: LootManifest): LootDistributionResult {
        return loot.resolveLootClaims(claims, manifest);
    }

    computeVisibility(observer: Character | NPC, mode: ExplorationFog | CombatVision): Promise<VisibilityResult> {
        return fog.computeVisibility(observer, mode);
    }

    resolveAoE(context: AoEContext): AoEResult {
        return aoe.resolveAoE(context);
    }

    castSpell(context: SpellCastContext): Promise<Result<SpellCastResult, GameRejection>> {
        return spells.castSpell(context);
    }

    resolveSpellEffect(effect: SpellEffectPrimitive, context: EffectContext): EffectResult {
        return spells.resolveSpellEffect(effect, context);
    }

    checkConcentration(caster: Character | NPC, damage: number): ConcentrationResult {
        return spells.checkConcentration(caster, damage);
    }

    generateQuest(context: QuestGenContext): Promise<QuestGenResult> {
        return quests.generateQuest(context);
    }

    applyWorldMutations(campaignId: string, instructions: WorldMutationInstruction[]): Promise<void> {
        return quests.applyWorldMutations(campaignId, instructions);
    }

    resolveQuestNode(resolution: NodeResolutionContext): Promise<QuestNodeResult> {
        return quests.resolveQuestNode(resolution);
    }

    queryMemories(npcId: string, context: string, topK: number): Promise<RankedMemoryResult> {
        return quests.queryMemories(npcId, context, topK);
    }

    computeFactionRepDrift(factionId: string, characterCampaignStateId: string, currentClock: number): number {
        return quests.computeFactionRepDrift(factionId, characterCampaignStateId, currentClock);
    }
}
