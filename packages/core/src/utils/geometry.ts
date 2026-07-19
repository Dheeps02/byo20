/**
 * 3D geometry helpers for AoE resolution — pure math, no D&D rules.
 *
 * Coordinate system: 1 world unit = 5 feet. All size parameters are in feet
 * and are converted internally. Terrain never blocks AoE — deliberate design
 * decision (the 3D mesh would need a ray-cast budget that isn't worth it for
 * a self-hosted game). Bounding sphere intersection is used for entity detection.
 */

/** A point in 3D world space. */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/** An entity with a position and a bounding sphere radius (in world units). */
export interface BoundedEntity {
    id: string;
    position: Vec3;
    boundingRadius: number;
}

// ─── Internal vector math ────────────────────────────────────────────────────

function vecLength(v: Vec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalise(v: Vec3): Vec3 {
    const len = vecLength(v);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function distance(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── AoE shape functions ─────────────────────────────────────────────────────

/**
 * Sphere AoE — all entities whose bounding sphere overlaps a sphere of radiusFt
 * centered on origin. Origin is the explosion point, not a creature's position.
 */
export function computeSphere(origin: Vec3, radiusFt: number, candidates: BoundedEntity[]): string[] {
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
