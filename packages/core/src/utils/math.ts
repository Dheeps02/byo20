/**
 * Pure 3D vector math utilities shared across geometry and engine subsystems.
 * No D&D rules, no side effects, no logging.
 *
 * Coordinate system convention: 1 world unit = 5 feet.
 */

/** A point or direction vector in 3D world space. */
export type Vec3 = {
    /** X coordinate (world units). */
    x: number;
    /** Y coordinate (world units, vertical axis). */
    y: number;
    /** Z coordinate (world units). */
    z: number;
};

/**
 * Euclidean length of a vector.
 * @param v - The vector to measure.
 * @returns The magnitude of v.
 */
export function vecLength(v: Vec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Return a unit vector in the same direction as v.
 * Returns the zero vector when v has zero length to avoid NaN propagation.
 * @param v - The vector to normalise.
 * @returns A unit vector, or {0,0,0} if v is the zero vector.
 */
export function normalise(v: Vec3): Vec3 {
    const len = vecLength(v);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Dot product of two vectors.
 * @param a - First vector.
 * @param b - Second vector.
 * @returns The scalar dot product a · b.
 */
export function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Euclidean distance between two points.
 * @param a - First point.
 * @param b - Second point.
 * @returns Distance in world units (1 unit = 5 ft).
 */
export function distance(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
