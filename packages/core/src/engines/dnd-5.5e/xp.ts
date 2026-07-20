/** XP award and level-up stubs. */
import type { Character, Encounter } from "@byo20/shared";
import { NotImplementedError } from "../../errors";
import type { LevelUpResult, XPAwardResult } from "../../interfaces/rules-engine";

/**
 * Calculate XP for clearing an encounter and split it evenly across the party.
 * Uses the encounter's monster CR values to determine total encounter XP.
 */
export function awardXP(encounter: Encounter, characters: Character[]): XPAwardResult {
    throw new NotImplementedError("awardXP");
}

/**
 * Advance a character by one level, rolling or taking fixed HP, and producing
 * the set of player choices that must be resolved before the level-up completes.
 */
export function resolveLevelUp(character: Character, hpOnLevelup: "roll" | "fixed"): LevelUpResult {
    throw new NotImplementedError("resolveLevelUp");
}
