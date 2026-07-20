import { describe, expect, it } from "bun:test";
import {
    computeCone,
    computeCube,
    computeCylinder,
    computeEmanation,
    computeLine,
    computeSphere,
} from "../../utils/geometry";
import type { BoundedEntity } from "../../utils/geometry";

// ── Helpers ──────────────────────────────────────────────────────────────────

function entity(id: string, x: number, y: number, z: number, r = 0.5): BoundedEntity {
    return { id, position: { x, y, z }, boundingRadius: r };
}

const ORIGIN = { x: 0, y: 0, z: 0 };
const NORTH = { x: 0, y: 0, z: -1 };  // -Z is north in world space

// ── Sphere ───────────────────────────────────────────────────────────────────

describe("computeSphere", () => {
    it("includes entity within radius", () => {
        const entities = [entity("a", 1, 0, 0)];
        expect(computeSphere(ORIGIN, 10, entities)).toContain("a");
    });

    it("excludes entity beyond radius + boundingRadius", () => {
        const entities = [entity("a", 10, 0, 0, 0.5)];
        // radius = 5ft / 5 = 1 world unit; entity at x=10, bounding=0.5 → dist=10, exceeds 1.5
        expect(computeSphere(ORIGIN, 5, entities)).not.toContain("a");
    });

    it("includes entity exactly on boundary (bounding sphere touches radius)", () => {
        // entity at x=1.5, bounding=0.5 → closest point = 1.0 which == radius (1 unit = 5ft)
        const entities = [entity("a", 1.5, 0, 0, 0.5)];
        expect(computeSphere(ORIGIN, 5, entities)).toContain("a");
    });

    it("returns empty array when no entities", () => {
        expect(computeSphere(ORIGIN, 20, [])).toEqual([]);
    });

    it("includes multiple entities within radius", () => {
        const entities = [entity("a", 1, 0, 0), entity("b", 0, 1, 0), entity("c", 100, 0, 0)];
        const result = computeSphere(ORIGIN, 20, entities);
        expect(result).toContain("a");
        expect(result).toContain("b");
        expect(result).not.toContain("c");
    });
});

// ── Emanation ────────────────────────────────────────────────────────────────

describe("computeEmanation", () => {
    it("excludes source entity", () => {
        const entities = [entity("source", 0, 0, 0), entity("target", 1, 0, 0)];
        const result = computeEmanation(ORIGIN, "source", 20, entities);
        expect(result).not.toContain("source");
        expect(result).toContain("target");
    });

    it("includes entities within radius excluding source", () => {
        const entities = [
            entity("source", 0, 0, 0),
            entity("a", 0, 0, 1),
            entity("b", 100, 0, 0),
        ];
        const result = computeEmanation(ORIGIN, "source", 10, entities);
        expect(result).toContain("a");
        expect(result).not.toContain("b");
        expect(result).not.toContain("source");
    });
});

// ── Cube ─────────────────────────────────────────────────────────────────────

describe("computeCube", () => {
    it("includes entity inside cube", () => {
        // 10ft cube = 2 world units per side; entity at (1, 1, 1)
        const entities = [entity("a", 1, 1, 1, 0)];
        expect(computeCube(ORIGIN, 10, entities)).toContain("a");
    });

    it("excludes entity outside cube", () => {
        // 10ft cube = 2 world units; entity at (3, 0, 0) is outside
        const entities = [entity("a", 3, 0, 0, 0)];
        expect(computeCube(ORIGIN, 10, entities)).not.toContain("a");
    });

    it("entity on boundary is included via bounding radius", () => {
        // cube is 2 units; entity at x=2.3 with bounding=0.5 → 2.3 - 0.5 = 1.8 which is within
        const entities = [entity("a", 2.3, 0, 0, 0.5)];
        expect(computeCube(ORIGIN, 10, entities)).toContain("a");
    });
});

// ── Cone ─────────────────────────────────────────────────────────────────────

describe("computeCone", () => {
    it("includes entity directly in front within range", () => {
        // 30ft cone = 6 units; entity at z=-2 directly ahead (north)
        const entities = [entity("a", 0, 0, -2)];
        expect(computeCone(ORIGIN, NORTH, 30, entities)).toContain("a");
    });

    it("excludes entity beyond cone range", () => {
        const entities = [entity("a", 0, 0, -100)];
        expect(computeCone(ORIGIN, NORTH, 30, entities)).not.toContain("a");
    });

    it("excludes entity behind caster", () => {
        const entities = [entity("a", 0, 0, 2)]; // behind (positive Z)
        expect(computeCone(ORIGIN, NORTH, 30, entities)).not.toContain("a");
    });

    it("excludes entity too far to the side", () => {
        // Entity at 90° to direction — outside 60° cone
        const entities = [entity("a", 2, 0, 0)];
        expect(computeCone(ORIGIN, NORTH, 30, entities)).not.toContain("a");
    });
});

// ── Line ─────────────────────────────────────────────────────────────────────

describe("computeLine", () => {
    it("includes entity along the line", () => {
        // 60ft x 5ft line going north; entity at z=-3 (directly in path)
        const entities = [entity("a", 0, 0, -3, 0)];
        expect(computeLine(ORIGIN, NORTH, 60, 5, entities)).toContain("a");
    });

    it("excludes entity too far to the side of the line", () => {
        // Entity at x=2 is 2 world units = 10ft from the line axis, outside 5ft width (half=2.5ft=0.5wu)
        const entities = [entity("a", 2, 0, -3, 0)];
        expect(computeLine(ORIGIN, NORTH, 60, 5, entities)).not.toContain("a");
    });

    it("excludes entity beyond line length", () => {
        const entities = [entity("a", 0, 0, -100, 0)];
        expect(computeLine(ORIGIN, NORTH, 60, 5, entities)).not.toContain("a");
    });
});

// ── Cylinder ─────────────────────────────────────────────────────────────────

describe("computeCylinder", () => {
    it("includes entity within radius and height", () => {
        // 10ft radius = 2wu, 20ft height = 4wu; entity at (1, 1, 0)
        const entities = [entity("a", 1, 1, 0, 0)];
        expect(computeCylinder(ORIGIN, 10, 20, entities)).toContain("a");
    });

    it("excludes entity within radius but above height", () => {
        // 20ft height = 4wu half=2wu; entity at y=5 exceeds half-height
        const entities = [entity("a", 0, 5, 0, 0)];
        expect(computeCylinder(ORIGIN, 10, 20, entities)).not.toContain("a");
    });

    it("excludes entity within height but outside radius", () => {
        const entities = [entity("a", 10, 0, 0, 0)];
        expect(computeCylinder(ORIGIN, 10, 20, entities)).not.toContain("a");
    });
});
