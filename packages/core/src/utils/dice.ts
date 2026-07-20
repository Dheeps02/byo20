/**
 * Dice rolling utilities — pure functions, no side effects.
 *
 * Uses Math.random() for now. When the campaign seed system lands, the seeded
 * PRNG will be injected via a parameter rather than changing these call sites.
 * Server rolls are authoritative; Babylon.js dice physics on the client are visual only.
 */
import { getLogger } from "../logger";

function guardDice(n: number, d: number): void {
    if (n < 0) {
        getLogger().error({ n, d }, "[invariant] rollDice: negative die count");
        throw new Error("[invariant] rollDice: negative die count");
    }
    if (n > 100) {
        getLogger().error({ n, d }, "[invariant] rollDice: die count exceeds 100");
        throw new Error("[invariant] rollDice: die count exceeds 100");
    }
    if (d < 1) {
        getLogger().error({ n, d }, "[invariant] rollDice: die sides must be >= 1");
        throw new Error("[invariant] rollDice: die sides must be >= 1");
    }
    if (d > 1000) {
        getLogger().error({ n, d }, "[invariant] rollDice: die sides exceeds 1000");
        throw new Error("[invariant] rollDice: die sides exceeds 1000");
    }
}

/**
 * Roll n dice with d sides each. Returns individual die results as an array.
 * n=0 is valid and returns an empty array (0-damage scenarios).
 */
export function rollDice(n: number, d: number): number[] {
    guardDice(n, d);
    return Array.from({ length: n }, () => Math.floor(Math.random() * d) + 1);
}

/**
 * Sum of rolling n dice with d sides, plus an optional flat modifier.
 */
export function roll(n: number, d: number, modifier = 0): number {
    return rollDice(n, d).reduce((a, b) => a + b, 0) + modifier;
}

/**
 * Roll with advantage: roll twice, take the higher result.
 * Returns both roll arrays so callers can display which dice were kept.
 */
export function rollAdvantage(n: number, d: number, modifier = 0): { result: number; rolls: number[][] } {
    const a = rollDice(n, d);
    const b = rollDice(n, d);
    const sumA = a.reduce((x, y) => x + y, 0);
    const sumB = b.reduce((x, y) => x + y, 0);
    return sumA >= sumB ? { result: sumA + modifier, rolls: [a, b] } : { result: sumB + modifier, rolls: [b, a] };
}

/**
 * Roll with disadvantage: roll twice, take the lower result.
 * Returns both roll arrays so callers can display which dice were kept.
 */
export function rollDisadvantage(n: number, d: number, modifier = 0): { result: number; rolls: number[][] } {
    const a = rollDice(n, d);
    const b = rollDice(n, d);
    const sumA = a.reduce((x, y) => x + y, 0);
    const sumB = b.reduce((x, y) => x + y, 0);
    return sumA <= sumB ? { result: sumA + modifier, rolls: [a, b] } : { result: sumB + modifier, rolls: [b, a] };
}

/**
 * Parse a dice notation string like "2d6" or "1d8+3" into its components.
 * Throws with [invariant] prefix if the string is not valid notation.
 */
export function parseDiceNotation(notation: string): { n: number; d: number; modifier: number } {
    const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match) {
        getLogger().error({ notation }, "[invariant] parseDiceNotation: invalid dice notation");
        throw new Error(`[invariant] parseDiceNotation: invalid dice notation: ${notation}`);
    }
    const n = Number.parseInt(match[1], 10);
    const d = Number.parseInt(match[2], 10);
    guardDice(n, d);
    return {
        n,
        d,
        modifier: match[3] ? Number.parseInt(match[3], 10) : 0,
    };
}

/**
 * Roll from a dice notation string, with an optional additional modifier.
 * Example: rollNotation("2d6", 3) rolls 2d6 and adds 3 on top of any built-in modifier.
 */
export function rollNotation(notation: string, modifier = 0): number {
    const parsed = parseDiceNotation(notation);
    return roll(parsed.n, parsed.d, parsed.modifier + modifier);
}
