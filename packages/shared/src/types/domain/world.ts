/**
 * Domain types for the hex grid and world objects.
 *
 * Schema notes:
 *   - `world_zones.heightmap_chunk` is BYTEA — the pg driver returns `Buffer` (Uint8Array subclass).
 *   - `world_zones.content` is JSONB; shape is the WorldZoneContent struct below.
 *   - `world_objects.position` is JSONB { x, y, z }.
 */

/** How much of the world gen pipeline has run for this zone. */
export type GenState = "ungenerated" | "partial" | "full";

/** What kind of terrain this hex contains. Null until partial gen. */
export type ZoneType = "wilderness" | "town" | "dungeon" | "coastal" | "mountain" | "forest";

/** What kind of persistent world entity this is. */
export type WorldObjectType = "building" | "structure" | "landmark" | "siege_equipment" | "vehicle";

/** Current mechanical state of a world object. */
export type WorldObjectStatus = "intact" | "damaged" | "destroyed" | "locked" | "sealed";

/** Who owns a world object, or null if unowned. */
export type WorldObjectOwnerType = "world" | "faction" | "npc";

/**
 * The generated content of a fully-generated zone.
 * Stored as JSONB in `world_zones.content`; null until full gen runs.
 */
export interface WorldZoneContent {
    locationRefs: string[];
    npcRefs: string[];
    worldObjectIds: string[];
    encounterZones: unknown[];
    questHooks: string[];
}

/**
 * Maps to `world.world_zones`.
 * Axial hex coordinates (q, r) identify a zone uniquely within a campaign.
 * `heightmapChunk` is a LZ4-compressed Float32Array stored as Buffer by the pg driver.
 * `content` is null until full world gen has run.
 */
export interface WorldZone {
    id: string;
    campaignId: string;
    hexQ: number;
    hexR: number;
    genState: GenState;
    zoneType: ZoneType | null;
    /**
     * LZ4-compressed Float32Array. The pg driver returns this as a `Buffer` (Node.js subclass
     * of Uint8Array). Typed as `Uint8Array` here to keep @byo20/shared dependency-free.
     */
    heightmapChunk: Uint8Array | null;
    content: WorldZoneContent | null;
    generatedAt: Date | null;
    updatedAt: Date;
}

/**
 * Maps to `world.world_objects`.
 * Represents any persistent named entity the AI DM might reference: buildings,
 * landmarks, siege equipment, vehicles. Pure scenery does not get a row.
 * `properties` is JSONB with object-specific mechanical state.
 */
export interface WorldObject {
    id: string;
    campaignId: string;
    zoneQ: number;
    zoneR: number;
    name: string;
    objectType: WorldObjectType;
    status: WorldObjectStatus;
    position: { x: number; y: number; z: number };
    ownerType: WorldObjectOwnerType | null;
    ownerId: string | null;
    /** JSONB — mechanical state specific to this object type. */
    properties: unknown;
    createdAt: Date;
    updatedAt: Date;
}
