import { beforeAll, describe, expect, test } from "bun:test";
import { initEngine } from "../../index";
import {
    getModifier,
    getPassiveScore,
    getProficiencyBonus,
    getSpellAttackBonus,
    getSpellSaveDC,
    getTotalLevel,
} from "../../utils/modifiers";

beforeAll(() => {
    initEngine();
});

describe("getModifier", () => {
    // Full table verification per 2024 PHB
    const cases: [number, number][] = [
        [1, -5],
        [2, -4],
        [3, -4],
        [4, -3],
        [5, -3],
        [6, -2],
        [7, -2],
        [8, -1],
        [9, -1],
        [10, 0],
        [11, 0],
        [12, 1],
        [13, 1],
        [14, 2],
        [15, 2],
        [16, 3],
        [17, 3],
        [18, 4],
        [19, 4],
        [20, 5],
        [24, 7],
        [30, 10],
    ];

    for (const [score, expected] of cases) {
        test(`score ${score} → ${expected >= 0 ? "+" : ""}${expected}`, () => {
            expect(getModifier(score)).toBe(expected);
        });
    }

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws on score 0", () => {
        expect(() => getModifier(0)).toThrow("[invariant]");
    });

    test("throws on score 31", () => {
        expect(() => getModifier(31)).toThrow("[invariant]");
    });
});

describe("getProficiencyBonus", () => {
    const cases: [number, number][] = [
        [1, 2],
        [2, 2],
        [3, 2],
        [4, 2],
        [5, 3],
        [6, 3],
        [7, 3],
        [8, 3],
        [9, 4],
        [10, 4],
        [11, 4],
        [12, 4],
        [13, 5],
        [14, 5],
        [15, 5],
        [16, 5],
        [17, 6],
        [18, 6],
        [19, 6],
        [20, 6],
    ];

    for (const [level, expected] of cases) {
        test(`level ${level} → +${expected}`, () => {
            expect(getProficiencyBonus(level)).toBe(expected);
        });
    }

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws on level 0", () => {
        expect(() => getProficiencyBonus(0)).toThrow("[invariant]");
    });

    test("throws on level 21", () => {
        expect(() => getProficiencyBonus(21)).toThrow("[invariant]");
    });
});

describe("getPassiveScore", () => {
    test("non-proficient: 10 + modifier", () => {
        expect(getPassiveScore(3, false, 2)).toBe(13);
    });

    test("proficient: 10 + modifier + proficiency bonus", () => {
        expect(getPassiveScore(3, true, 2)).toBe(15);
    });

    test("passive Perception for +0 modifier, proficient, +2 prof = 12", () => {
        expect(getPassiveScore(0, true, 2)).toBe(12);
    });

    test("passive Perception for +3 modifier, not proficient = 13", () => {
        expect(getPassiveScore(3, false, 3)).toBe(13);
    });
});

describe("getSpellSaveDC", () => {
    test("8 + proficiency + spellcasting modifier", () => {
        expect(getSpellSaveDC(3, 4)).toBe(15);
    });

    test("level 1 cleric with +3 WIS and +2 prof = DC 13", () => {
        expect(getSpellSaveDC(2, 3)).toBe(13);
    });
});

describe("getSpellAttackBonus", () => {
    test("proficiency + spellcasting modifier", () => {
        expect(getSpellAttackBonus(3, 4)).toBe(7);
    });

    test("level 1 wizard with +3 INT and +2 prof = +5", () => {
        expect(getSpellAttackBonus(2, 3)).toBe(5);
    });
});

describe("getTotalLevel", () => {
    test("single class", () => {
        expect(getTotalLevel([{ classLevel: 7 }])).toBe(7);
    });

    test("two-class multiclass sums correctly", () => {
        expect(getTotalLevel([{ classLevel: 6 }, { classLevel: 4 }])).toBe(10);
    });

    test("three-class multiclass", () => {
        expect(getTotalLevel([{ classLevel: 3 }, { classLevel: 3 }, { classLevel: 4 }])).toBe(10);
    });

    test("empty array returns 0", () => {
        expect(getTotalLevel([])).toBe(0);
    });

    test("level 20 is valid", () => {
        expect(getTotalLevel([{ classLevel: 20 }])).toBe(20);
    });

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws when total exceeds 20", () => {
        expect(() => getTotalLevel([{ classLevel: 15 }, { classLevel: 6 }])).toThrow("[invariant]");
    });
});
