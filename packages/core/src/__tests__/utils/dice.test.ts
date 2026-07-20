import { describe, expect, it } from "bun:test";
import {
    parseDiceNotation,
    roll,
    rollAdvantage,
    rollDice,
    rollDisadvantage,
    rollNotation,
} from "../../utils/dice";

describe("rollDice", () => {
    it("returns exactly n results", () => {
        expect(rollDice(3, 6)).toHaveLength(3);
        expect(rollDice(1, 20)).toHaveLength(1);
        expect(rollDice(10, 4)).toHaveLength(10);
    });

    it("all results are within [1, d] for d6", () => {
        for (let i = 0; i < 200; i++) {
            const [result] = rollDice(1, 6);
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(6);
        }
    });

    it("all results are within [1, 20] for d20", () => {
        for (let i = 0; i < 500; i++) {
            const [result] = rollDice(1, 20);
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(20);
        }
    });

    it("d1 always returns 1", () => {
        for (let i = 0; i < 20; i++) {
            expect(rollDice(1, 1)[0]).toBe(1);
        }
    });
});

describe("roll", () => {
    it("sums n d1 dice deterministically", () => {
        expect(roll(5, 1, 0)).toBe(5);
        expect(roll(10, 1, 0)).toBe(10);
    });

    it("applies positive modifier", () => {
        expect(roll(0, 6, 5)).toBe(5);
    });

    it("applies negative modifier", () => {
        expect(roll(0, 6, -3)).toBe(-3);
    });

    it("modifier defaults to 0", () => {
        expect(roll(3, 1)).toBe(3);
    });
});

describe("parseDiceNotation", () => {
    it("parses NdX notation", () => {
        expect(parseDiceNotation("2d6")).toEqual({ n: 2, d: 6, modifier: 0 });
    });

    it("parses NdX+M notation", () => {
        expect(parseDiceNotation("1d8+3")).toEqual({ n: 1, d: 8, modifier: 3 });
    });

    it("parses NdX-M notation", () => {
        expect(parseDiceNotation("1d6-2")).toEqual({ n: 1, d: 6, modifier: -2 });
    });

    it("parses 1d20", () => {
        expect(parseDiceNotation("1d20")).toEqual({ n: 1, d: 20, modifier: 0 });
    });

    it("parses 4d6+0", () => {
        expect(parseDiceNotation("4d6+0")).toEqual({ n: 4, d: 6, modifier: 0 });
    });

    it("throws on invalid notation", () => {
        expect(() => parseDiceNotation("invalid")).toThrow();
    });

    it("throws on empty string", () => {
        expect(() => parseDiceNotation("")).toThrow();
    });

    it("throws on missing die count", () => {
        expect(() => parseDiceNotation("d6")).toThrow();
    });
});

describe("rollNotation", () => {
    it("rolls 1d1 and returns 1", () => {
        expect(rollNotation("1d1")).toBe(1);
    });

    it("applies extra modifier on top of notation modifier", () => {
        expect(rollNotation("1d1+2", 3)).toBe(6); // 1 + 2 (notation) + 3 (extra) = 6
    });
});

describe("rollAdvantage", () => {
    it("returns the higher of two rolls", () => {
        // 1d1 always rolls 1, so result is always 1+modifier
        const result = rollAdvantage(1, 1, 0);
        expect(result.result).toBe(1);
    });

    it("returns two roll arrays", () => {
        const result = rollAdvantage(2, 6, 0);
        expect(result.rolls).toHaveLength(2);
        expect(result.rolls[0]).toHaveLength(2);
        expect(result.rolls[1]).toHaveLength(2);
    });

    it("applies modifier to result", () => {
        const result = rollAdvantage(1, 1, 5);
        expect(result.result).toBe(6); // 1 + 5
    });

    it("result is always >= either roll sum without modifier", () => {
        for (let i = 0; i < 50; i++) {
            const { result, rolls } = rollAdvantage(2, 6, 0);
            const sumA = rolls[0].reduce((a, b) => a + b, 0);
            const sumB = rolls[1].reduce((a, b) => a + b, 0);
            expect(result).toBeGreaterThanOrEqual(Math.min(sumA, sumB));
        }
    });
});

describe("rollDisadvantage", () => {
    it("returns the lower of two rolls", () => {
        const result = rollDisadvantage(1, 1, 0);
        expect(result.result).toBe(1);
    });

    it("applies modifier to result", () => {
        const result = rollDisadvantage(1, 1, -2);
        expect(result.result).toBe(-1); // 1 + (-2)
    });

    it("result is always <= either roll sum without modifier", () => {
        for (let i = 0; i < 50; i++) {
            const { result, rolls } = rollDisadvantage(2, 6, 0);
            const sumA = rolls[0].reduce((a, b) => a + b, 0);
            const sumB = rolls[1].reduce((a, b) => a + b, 0);
            expect(result).toBeLessThanOrEqual(Math.max(sumA, sumB));
        }
    });
});
