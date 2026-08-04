/**
 * 3D geometry helpers for AoE resolution — pure math, no D&D rules.
 *
 * Coordinate system: 1 world unit = 5 feet. All size parameters are in feet
 * and are converted internally. Terrain never blocks AoE — deliberate design
 * decision (the 3D mesh would need a ray-cast budget that isn't worth it for
 * a self-hosted game). Bounding sphere intersection is used for entity detection.
 */
import { getLogger } from "../logger";
import { distance, dot, normalise, vecLength } from "./math";
import type { Vec3 } from "./math";

/** An entity with a position and a bounding sphere radius (in world units). */
export type BoundedEntity = {
    /** Unique entity identifier. */
    id: string;
    /** Entity centre in world space. */
    position: Vec3;
    /** Bounding sphere radius in world units. */
    boundingRadius: number;
};

// ─── AoE shape functions ─────────────────────────────────────────────────────

/**
 * Sphere AoE — all entities whose bounding sphere overlaps a sphere of radiusFt
 * centered on origin. Origin is the explosion point, not a creature's position.
 */
export function computeSphere(origin: Vec3, radiusFt: number, candidates: BoundedEntity[]): string[] {
    if (radiusFt <= 0) {
        getLogger().error({ radiusFt }, "[invariant] computeSphere: radiusFt must be > 0");
        throw new Error("[invariant] computeSphere: radiusFt must be > 0");
    }
    const r = radiusFt / 5;
    return candidates.filter((e) => distance(origin, e.position) - e.boundingRadius <= r).map((e) => e.id);
}

/**
 * Emanation AoE — like sphere but anchored to a source entity that moves with it.
 * The source entity itself is always excluded.
 */
export function computeEmanation(
    sourcePosition: Vec3,
    sourceEntityId: string,
    radiusFt: number,
    candidates: BoundedEntity[],
): string[] {
    return computeSphere(
        sourcePosition,
        radiusFt,
        candidates.filter((e) => e.id !== sourceEntityId),
    );
}

/**
 * Cube AoE — axis-aligned cube of sizeFt per side, with one corner at origin.
 * Entities whose bounding sphere overlaps the box are included.
 */
export function computeCube(origin: Vec3, sizeFt: number, candidates: BoundedEntity[]): string[] {
    if (sizeFt <= 0) {
        getLogger().error({ sizeFt }, "[invariant] computeCube: sizeFt must be > 0");
        throw new Error("[invariant] computeCube: sizeFt must be > 0");
    }
    const s = sizeFt / 5;
    return candidates
        .filter((e) => {
            const r = e.boundingRadius;
            return (
                e.position.x >= origin.x - r &&
                e.position.x <= origin.x + s + r &&
                e.position.y >= origin.y - r &&
                e.position.y <= origin.y + s + r &&
                e.position.z >= origin.z - r &&
                e.position.z <= origin.z + s + r
            );
        })
        .map((e) => e.id);
}

/**
 * Cone AoE — 60° cone from origin in the given direction, lengthFt long.
 * 2024 rule: the cone width at any point equals the distance from the tip.
 */
export function computeCone(origin: Vec3, direction: Vec3, lengthFt: number, candidates: BoundedEntity[]): string[] {
    if (lengthFt <= 0) {
        getLogger().error({ lengthFt }, "[invariant] computeCone: lengthFt must be > 0");
        throw new Error("[invariant] computeCone: lengthFt must be > 0");
    }
    if (vecLength(direction) === 0) {
        getLogger().error({ direction }, "[invariant] computeCone: direction vector has zero length");
        throw new Error("[invariant] computeCone: direction vector has zero length");
    }
    const len = lengthFt / 5;
    const dirNorm = normalise(direction);
    // Half-angle of a 60° cone is 30°.
    const halfAngleCos = Math.cos(Math.PI / 6);

    return candidates
        .filter((e) => {
            const toEntity: Vec3 = {
                x: e.position.x - origin.x,
                y: e.position.y - origin.y,
                z: e.position.z - origin.z,
            };
            const dist = vecLength(toEntity);
            if (dist > len + e.boundingRadius) return false;
            const entityDot = dot(normalise(toEntity), dirNorm);
            return entityDot >= halfAngleCos;
        })
        .map((e) => e.id);
}

/**
 * Line AoE — a rectangle of lengthFt × widthFt extending from origin in direction.
 * Entities whose bounding sphere overlaps the line box are included.
 */
export function computeLine(
    origin: Vec3,
    direction: Vec3,
    lengthFt: number,
    widthFt: number,
    candidates: BoundedEntity[],
): string[] {
    if (lengthFt <= 0) {
        getLogger().error({ lengthFt }, "[invariant] computeLine: lengthFt must be > 0");
        throw new Error("[invariant] computeLine: lengthFt must be > 0");
    }
    if (widthFt <= 0) {
        getLogger().error({ widthFt }, "[invariant] computeLine: widthFt must be > 0");
        throw new Error("[invariant] computeLine: widthFt must be > 0");
    }
    if (vecLength(direction) === 0) {
        getLogger().error({ direction }, "[invariant] computeLine: direction vector has zero length");
        throw new Error("[invariant] computeLine: direction vector has zero length");
    }
    const len = lengthFt / 5;
    const wid = widthFt / 5;
    const dirNorm = normalise(direction);

    return candidates
        .filter((e) => {
            const toEntity: Vec3 = {
                x: e.position.x - origin.x,
                y: e.position.y - origin.y,
                z: e.position.z - origin.z,
            };
            const along = dot(toEntity, dirNorm);
            if (along < -e.boundingRadius || along > len + e.boundingRadius) return false;
            const proj: Vec3 = { x: dirNorm.x * along, y: dirNorm.y * along, z: dirNorm.z * along };
            const perp: Vec3 = {
                x: toEntity.x - proj.x,
                y: toEntity.y - proj.y,
                z: toEntity.z - proj.z,
            };
            return vecLength(perp) <= wid / 2 + e.boundingRadius;
        })
        .map((e) => e.id);
}

/**
 * Cylinder AoE — radiusFt wide, heightFt tall, centered on origin.
 * Horizontal and vertical containment are checked independently.
 */
export function computeCylinder(
    origin: Vec3,
    radiusFt: number,
    heightFt: number,
    candidates: BoundedEntity[],
): string[] {
    if (radiusFt <= 0) {
        getLogger().error({ radiusFt }, "[invariant] computeCylinder: radiusFt must be > 0");
        throw new Error("[invariant] computeCylinder: radiusFt must be > 0");
    }
    if (heightFt <= 0) {
        getLogger().error({ heightFt }, "[invariant] computeCylinder: heightFt must be > 0");
        throw new Error("[invariant] computeCylinder: heightFt must be > 0");
    }
    const r = radiusFt / 5;
    const h = heightFt / 5;

    return candidates
        .filter((e) => {
            const dx = e.position.x - origin.x;
            const dz = e.position.z - origin.z;
            const horizDist = Math.sqrt(dx * dx + dz * dz);
            const vertDist = Math.abs(e.position.y - origin.y);
            return horizDist <= r + e.boundingRadius && vertDist <= h / 2 + e.boundingRadius;
        })
        .map((e) => e.id);
}
