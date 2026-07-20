import { describe, expect, it } from "bun:test";
import {
    getModifier,
    getPassiveScore,
    getProficiencyBonus,
    getSpellAttackBonus,
    getSpellSaveDC,
    getTotalLevel,
} from "../../utils/modifiers";

describe("getModifier", () => {
    // Full table verification per 2024 PHB
    const cases: [number, number][] = [
        [1, -5], [2, -4], [3, -4], [4, -3], [5, -3],
        [6, -2], [7, -2], [8, -1], [9, -1], [10, 0],
        [11, 0], [12, 1], [13, 1], [14, 2], [15, 2],
        [16, 3], [17, 3], [18, 4], [19, 4], [20, 5],
        [24, 7], [30, 10],
    ];

    for (const [score, expected] of cases) {
        it(`score ${score} → ${expected >= 0 ? "+" : ""}${expected}`, () => {
            expect(getModifier(score)).toBe(expected);
        });
    }
});

describe("getProficiencyBonus", () => {
    const cases: [number, number][] = [
        [1, 2], [2, 2], [3, 2], [4, 2],
        [5, 3], [6, 3], [7, 3], [8, 3],
        [9, 4], [10, 4], [11, 4], [12, 4],
        [13, 5], [14, 5], [15, 5], [16, 5],
        [17, 6], [18, 6], [19, 6], [20, 6],
    ];

    for (const [level, expected] of cases) {
        it(`level ${level} → +${expected}`, () => {
            expect(getProficiencyBonus(level)).toBe(expected);
        });
    }
});

describe("getPassiveScore", () => {
    it("non-proficient: 10 + modifier", () => {
        expect(getPassiveScore(3, false, 2)).toBe(13);
    });

    it("proficient: 10 + modifier + proficiency bonus", () => {
        expect(getPassiveScore(3, true, 2)).toBe(15);
    });

    it("passive Perception for +0 WIS, proficient, +2 prof = 12", () => {
        expect(getPassiveScore(0, true, 2)).toBe(12);
    });

    it("passive Perception for +3 WIS, not proficient = 13", () => {
        expect(getPassiveScore(3, false, 3)).toBe(13);
    });
});

describe("getSpellSaveDC", () => {
    it("8 + proficiency + spellcasting modifier", () => {
        expect(getSpellSaveDC(3, 4)).toBe(15);
    });

    it("level 1 cleric with +3 WIS and +2 prof = DC 13", () => {
        expect(getSpellSaveDC(2, 3)).toBe(13);
    });
});

describe("getSpellAttackBonus", () => {
    it("proficiency + spellcasting modifier", () => {
        expect(getSpellAttackBonus(3, 4)).toBe(7);
    });

    it("level 1 wizard with +3 INT and +2 prof = +5", () => {
        expect(getSpellAttackBonus(2, 3)).toBe(5);
    });
});

describe("getTotalLevel", () => {
    it("single class", () => {
        expect(getTotalLevel([{ classLevel: 7 }])).toBe(7);
    });

    it("two-class multiclass sums correctly", () => {
        expect(getTotalLevel([{ classLevel: 6 }, { classLevel: 4 }])).toBe(10);
    });

    it("three-class multiclass", () => {
        expect(getTotalLevel([{ classLevel: 3 }, { classLevel: 3 }, { classLevel: 4 }])).toBe(10);
    });

    it("empty array returns 0", () => {
        expect(getTotalLevel([])).toBe(0);
    });
});
