/**
 * D&D 5.5e (2024) modifier and bonus calculation — pure math, no side effects.
 */

/**
 * Standard D&D ability modifier formula: floor((score − 10) / 2).
 * Score 10–11 → +0, 12–13 → +1, 8–9 → −1, and so on.
 */
export function getModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Proficiency bonus by total character level (2024 rules).
 * Levels 1–4: +2 | 5–8: +3 | 9–12: +4 | 13–16: +5 | 17–20: +6
 */
export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1
}

/**
 * Passive score = 10 + modifier + proficiency bonus (if proficient).
 * Used for passive Perception, passive Investigation, etc.
 */
export function getPassiveScore(
  modifier: number,
  proficient: boolean,
  proficiencyBonus: number,
): number {
  return 10 + modifier + (proficient ? proficiencyBonus : 0)
}

/**
 * Spell save DC = 8 + proficiency bonus + spellcasting ability modifier.
 */
export function getSpellSaveDC(proficiencyBonus: number, spellcastingModifier: number): number {
  return 8 + proficiencyBonus + spellcastingModifier
}

/**
 * Spell attack bonus = proficiency bonus + spellcasting ability modifier.
 */
export function getSpellAttackBonus(proficiencyBonus: number, spellcastingModifier: number): number {
  return proficiencyBonus + spellcastingModifier
}

/**
 * Total character level across all classes — needed for multiclassing.
 * Passes through the class array so callers stay agnostic of the source.
 */
export function getTotalLevel(classes: Array<{ classLevel: number }>): number {
  return classes.reduce((sum, c) => sum + c.classLevel, 0)
}
