import { beforeAll, describe, expect, test } from "bun:test";
import { initEngine } from "../../index";
import { parseDiceNotation, roll, rollAdvantage, rollDice, rollDisadvantage, rollNotation } from "../../utils/dice";

beforeAll(() => {
    initEngine();
});

describe("rollDice", () => {
    test("returns n results each in range [1, d]", () => {
        const results = rollDice(4, 6);
        expect(results).toHaveLength(4);
        for (const r of results) {
            expect(r).toBeGreaterThanOrEqual(1);
            expect(r).toBeLessThanOrEqual(6);
        }
    });

    test("all results within [1, 20] for d20", () => {
        for (let i = 0; i < 100; i++) {
            const [result] = rollDice(1, 20);
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(20);
        }
    });

    test("d1 always returns 1", () => {
        for (let i = 0; i < 20; i++) {
            expect(rollDice(1, 1)[0]).toBe(1);
        }
    });

    test("n=0 returns empty array", () => {
        expect(rollDice(0, 6)).toEqual([]);
    });

    // ── Invalid input guards ───────────────────────────────────────────────────

    test("throws on negative n", () => {
        expect(() => rollDice(-1, 6)).toThrow("[invariant]");
    });

    test("throws on d < 1", () => {
        expect(() => rollDice(1, 0)).toThrow("[invariant]");
    });

    test("throws on n > 100", () => {
        expect(() => rollDice(101, 6)).toThrow("[invariant]");
    });

    test("throws on d > 1000", () => {
        expect(() => rollDice(1, 1001)).toThrow("[invariant]");
    });
});

describe("roll", () => {
    test("sums dice + modifier", () => {
        const result = roll(2, 6, 3);
        expect(result).toBeGreaterThanOrEqual(5); // 2*1 + 3
        expect(result).toBeLessThanOrEqual(15); // 2*6 + 3
    });

    test("sums n d1 dice deterministically", () => {
        expect(roll(5, 1, 0)).toBe(5);
        expect(roll(10, 1, 0)).toBe(10);
    });

    test("applies positive modifier", () => {
        expect(roll(0, 6, 5)).toBe(5);
    });

    test("applies negative modifier", () => {
        expect(roll(0, 6, -3)).toBe(-3);
    });

    test("modifier defaults to 0", () => {
        expect(roll(3, 1)).toBe(3);
    });

    test("inherits guard from rollDice", () => {
        expect(() => roll(-1, 6)).toThrow("[invariant]");
    });
});

describe("rollAdvantage / rollDisadvantage", () => {
    test("rollAdvantage result in range", () => {
        const { result } = rollAdvantage(1, 20);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(20);
    });

    test("rollAdvantage returns two roll arrays", () => {
        const { rolls } = rollAdvantage(2, 6, 0);
        expect(rolls).toHaveLength(2);
        expect(rolls[0]).toHaveLength(2);
        expect(rolls[1]).toHaveLength(2);
    });

    test("rollAdvantage applies modifier to result", () => {
        const { result } = rollAdvantage(1, 1, 5);
        expect(result).toBe(6); // 1 + 5
    });

    test("rollAdvantage result is always >= min of both rolls", () => {
        for (let i = 0; i < 50; i++) {
            const { result, rolls } = rollAdvantage(2, 6, 0);
            const sumA = rolls[0].reduce((a, b) => a + b, 0);
            const sumB = rolls[1].reduce((a, b) => a + b, 0);
            expect(result).toBeGreaterThanOrEqual(Math.min(sumA, sumB));
        }
    });

    test("rollDisadvantage d1 returns 1", () => {
        const { result } = rollDisadvantage(1, 1, 0);
        expect(result).toBe(1);
    });

    test("rollDisadvantage applies modifier", () => {
        const { result } = rollDisadvantage(1, 1, -2);
        expect(result).toBe(-1); // 1 + (-2)
    });

    test("rollDisadvantage result is always <= max of both rolls", () => {
        for (let i = 0; i < 50; i++) {
            const { result, rolls } = rollDisadvantage(2, 6, 0);
            const sumA = rolls[0].reduce((a, b) => a + b, 0);
            const sumB = rolls[1].reduce((a, b) => a + b, 0);
            expect(result).toBeLessThanOrEqual(Math.max(sumA, sumB));
        }
    });

    test("rollDisadvantage inherits guard", () => {
        expect(() => rollDisadvantage(1, 0)).toThrow("[invariant]");
    });
});

describe("parseDiceNotation", () => {
    test("parses '2d6'", () => {
        expect(parseDiceNotation("2d6")).toEqual({ n: 2, d: 6, modifier: 0 });
    });

    test("parses '1d8+3'", () => {
        expect(parseDiceNotation("1d8+3")).toEqual({ n: 1, d: 8, modifier: 3 });
    });

    test("parses '1d6-2'", () => {
        expect(parseDiceNotation("1d6-2")).toEqual({ n: 1, d: 6, modifier: -2 });
    });

    test("parses '1d20'", () => {
        expect(parseDiceNotation("1d20")).toEqual({ n: 1, d: 20, modifier: 0 });
    });

    test("throws on invalid notation", () => {
        expect(() => parseDiceNotation("bad")).toThrow("[invariant]");
        expect(() => parseDiceNotation("")).toThrow("[invariant]");
        expect(() => parseDiceNotation("d6")).toThrow("[invariant]");
    });

    test("throws on out-of-range parsed values", () => {
        expect(() => parseDiceNotation("101d6")).toThrow("[invariant]");
        expect(() => parseDiceNotation("1d1001")).toThrow("[invariant]");
    });
});

describe("rollNotation", () => {
    test("rolls 1d1 and returns 1", () => {
        expect(rollNotation("1d1")).toBe(1);
    });

    test("applies extra modifier on top of notation modifier", () => {
        expect(rollNotation("1d1+2", 3)).toBe(6); // 1 + 2 (notation) + 3 (extra) = 6
    });

    test("rolls and applies notation modifier", () => {
        const result = rollNotation("1d6+2");
        expect(result).toBeGreaterThanOrEqual(3);
        expect(result).toBeLessThanOrEqual(8);
    });
});
