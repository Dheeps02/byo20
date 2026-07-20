import { beforeAll, describe, expect, test } from "bun:test";
import { initEngine } from "../../index";
import type { BoundedEntity, Vec3 } from "../../utils/geometry";
import {
    computeCone,
    computeCube,
    computeCylinder,
    computeEmanation,
    computeLine,
    computeSphere,
} from "../../utils/geometry";

beforeAll(() => {
    initEngine();
});

const origin: Vec3 = { x: 0, y: 0, z: 0 };
const zero: Vec3 = { x: 0, y: 0, z: 0 };

function entity(id: string, position: Vec3, boundingRadius = 0.5): BoundedEntity {
    return { id, position, boundingRadius };
}

describe("computeSphere", () => {
    test("includes entities within radius", () => {
        const candidates = [
            entity("a", { x: 1, y: 0, z: 0 }), // 5ft, inside 10ft sphere
            entity("b", { x: 3, y: 0, z: 0 }), // 15ft, outside 10ft sphere
        ];
        const result = computeSphere(origin, 10, candidates);
        expect(result).toContain("a");
        expect(result).not.toContain("b");
    });

    test("excludes entity beyond radius + boundingRadius", () => {
        const candidates = [entity("a", { x: 10, y: 0, z: 0 }, 0.5)];
        expect(computeSphere(origin, 5, candidates)).not.toContain("a");
    });

    test("includes entity exactly on boundary", () => {
        const candidates = [entity("a", { x: 1.5, y: 0, z: 0 }, 0.5)];
        expect(computeSphere(origin, 5, candidates)).toContain("a");
    });

    test("returns empty array when no entities", () => {
        expect(computeSphere(origin, 20, [])).toEqual([]);
    });

    test("includes multiple entities within radius", () => {
        const candidates = [
            entity("a", { x: 1, y: 0, z: 0 }),
            entity("b", { x: 0, y: 1, z: 0 }),
            entity("c", { x: 100, y: 0, z: 0 }),
        ];
        const result = computeSphere(origin, 20, candidates);
        expect(result).toContain("a");
        expect(result).toContain("b");
        expect(result).not.toContain("c");
    });

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws when radiusFt <= 0", () => {
        expect(() => computeSphere(origin, 0, [])).toThrow("[invariant]");
        expect(() => computeSphere(origin, -5, [])).toThrow("[invariant]");
    });
});

describe("computeEmanation", () => {
    test("excludes the source entity", () => {
        const candidates = [entity("source", origin), entity("target", { x: 1, y: 0, z: 0 })];
        const result = computeEmanation(origin, "source", 10, candidates);
        expect(result).not.toContain("source");
        expect(result).toContain("target");
    });

    test("includes entities within radius excluding source", () => {
        const candidates = [
            entity("source", origin),
            entity("a", { x: 0, y: 0, z: 1 }),
            entity("b", { x: 100, y: 0, z: 0 }),
        ];
        const result = computeEmanation(origin, "source", 10, candidates);
        expect(result).toContain("a");
        expect(result).not.toContain("b");
        expect(result).not.toContain("source");
    });

    test("inherits sphere guard", () => {
        expect(() => computeEmanation(origin, "src", 0, [])).toThrow("[invariant]");
    });
});

describe("computeCube", () => {
    test("includes entities inside the cube", () => {
        const candidates = [entity("inside", { x: 1, y: 1, z: 1 }), entity("outside", { x: 5, y: 5, z: 5 })];
        const result = computeCube(origin, 10, candidates);
        expect(result).toContain("inside");
    });

    test("excludes entity outside cube", () => {
        const candidates = [entity("a", { x: 3, y: 0, z: 0 }, 0)];
        expect(computeCube(origin, 10, candidates)).not.toContain("a");
    });

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws when sizeFt <= 0", () => {
        expect(() => computeCube(origin, 0, [])).toThrow("[invariant]");
    });
});

describe("computeCone", () => {
    const direction: Vec3 = { x: 1, y: 0, z: 0 };

    test("includes entities within cone", () => {
        const candidates = [
            entity("ahead", { x: 4, y: 0, z: 0 }), // 20ft ahead, within 30ft cone
        ];
        const result = computeCone(origin, direction, 30, candidates);
        expect(result).toContain("ahead");
    });

    test("excludes entity beyond cone range", () => {
        const candidates = [entity("far", { x: 100, y: 0, z: 0 })];
        expect(computeCone(origin, direction, 30, candidates)).not.toContain("far");
    });

    test("excludes entity behind caster", () => {
        const candidates = [entity("behind", { x: -2, y: 0, z: 0 })];
        expect(computeCone(origin, direction, 30, candidates)).not.toContain("behind");
    });

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws when direction vector has zero length", () => {
        expect(() => computeCone(origin, zero, 30, [])).toThrow("[invariant]");
    });

    test("throws when lengthFt <= 0", () => {
        expect(() => computeCone(origin, direction, 0, [])).toThrow("[invariant]");
    });
});

describe("computeLine", () => {
    const direction: Vec3 = { x: 1, y: 0, z: 0 };

    test("includes entities within line box", () => {
        const candidates = [
            entity("inline", { x: 3, y: 0, z: 0 }), // 15ft along, within 30ft line
        ];
        const result = computeLine(origin, direction, 30, 5, candidates);
        expect(result).toContain("inline");
    });

    test("excludes entity beyond line length", () => {
        const candidates = [entity("far", { x: 100, y: 0, z: 0 }, 0)];
        expect(computeLine(origin, direction, 30, 5, candidates)).not.toContain("far");
    });

    test("excludes entity too far to the side", () => {
        const candidates = [entity("side", { x: 3, y: 2, z: 0 }, 0)];
        expect(computeLine(origin, direction, 30, 5, candidates)).not.toContain("side");
    });

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws when direction vector has zero length", () => {
        expect(() => computeLine(origin, zero, 30, 5, [])).toThrow("[invariant]");
    });

    test("throws when lengthFt <= 0", () => {
        expect(() => computeLine(origin, direction, 0, 5, [])).toThrow("[invariant]");
    });
});

describe("computeCylinder", () => {
    test("includes entities within cylinder", () => {
        const candidates = [
            entity("inside", { x: 1, y: 0.5, z: 0 }), // 5ft horizontal, 2.5ft vertical
        ];
        const result = computeCylinder(origin, 10, 10, candidates);
        expect(result).toContain("inside");
    });

    test("excludes entity within height but outside radius", () => {
        const candidates = [entity("out", { x: 10, y: 0, z: 0 }, 0)];
        expect(computeCylinder(origin, 10, 20, candidates)).not.toContain("out");
    });

    test("excludes entity within radius but above height", () => {
        const candidates = [entity("above", { x: 0, y: 5, z: 0 }, 0)];
        expect(computeCylinder(origin, 10, 20, candidates)).not.toContain("above");
    });

    // ── Invalid input guards ───────────────────────────────────────────────────
    test("throws when radiusFt <= 0", () => {
        expect(() => computeCylinder(origin, 0, 10, [])).toThrow("[invariant]");
    });

    test("throws when heightFt <= 0", () => {
        expect(() => computeCylinder(origin, 10, 0, [])).toThrow("[invariant]");
    });
});
