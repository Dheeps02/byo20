/**
 * D&D 5.5e (2024) modifier and bonus calculation — pure math, no side effects.
 */
import { getLogger } from "../logger";

/**
 * Standard D&D ability modifier formula: floor((score − 10) / 2).
 * Score 10–11 → +0, 12–13 → +1, 8–9 → −1, and so on.
 * Valid D&D ability scores are 1–30.
 */
export function getModifier(score: number): number {
    if (score < 1 || score > 30) {
        getLogger().error({ score }, "[invariant] getModifier: ability score out of range 1–30");
        throw new Error("[invariant] getModifier: ability score out of range 1–30");
    }
    return Math.floor((score - 10) / 2);
}

/**
 * Proficiency bonus by total character level (2024 rules).
 * Levels 1–4: +2 | 5–8: +3 | 9–12: +4 | 13–16: +5 | 17–20: +6
 */
export function getProficiencyBonus(level: number): number {
    if (level < 1 || level > 20) {
        getLogger().error({ level }, "[invariant] getProficiencyBonus: level out of range 1–20");
        throw new Error("[invariant] getProficiencyBonus: level out of range 1–20");
    }
    return Math.ceil(level / 4) + 1;
}

/**
 * Passive score = 10 + modifier + proficiency bonus (if proficient).
 * Used for passive Perception, passive Investigation, etc.
 */
export function getPassiveScore(modifier: number, proficient: boolean, proficiencyBonus: number): number {
    return 10 + modifier + (proficient ? proficiencyBonus : 0);
}

/**
 * Spell save DC = 8 + proficiency bonus + spellcasting ability modifier.
 */
export function getSpellSaveDC(proficiencyBonus: number, spellcastingModifier: number): number {
    return 8 + proficiencyBonus + spellcastingModifier;
}

/**
 * Spell attack bonus = proficiency bonus + spellcasting ability modifier.
 */
export function getSpellAttackBonus(proficiencyBonus: number, spellcastingModifier: number): number {
    return proficiencyBonus + spellcastingModifier;
}

/**
 * Total character level across all classes — needed for multiclassing.
 * Passes through the class array so callers stay agnostic of the source.
 * Total must not exceed 20.
 */
export function getTotalLevel(classes: Array<{ classLevel: number }>): number {
    const total = classes.reduce((sum, c) => sum + c.classLevel, 0);
    if (total > 20) {
        getLogger().error({ total, classes }, "[invariant] getTotalLevel: total level exceeds 20");
        throw new Error("[invariant] getTotalLevel: total level exceeds 20");
    }
    return total;
}
