/**
 * Domain types for factions, reputation, and faction relationships.
 *
 * Schema note: `factions.description` has no NOT NULL constraint — typed as `string | null`.
 * `faction_a_id < faction_b_id` ordering is enforced at the application layer, not in the DB.
 */

/** How a character currently stands with a faction. */
export type FactionAttitude = "friendly" | "indifferent" | "hostile";

/** The nature of a faction-to-faction relationship. */
export type FactionRelationshipType = "ally" | "rival" | "enemy" | "neutral";

/** Maps to `world.factions`. */
export interface Faction {
    id: string;
    campaignId: string;
    name: string;
    description: string | null;
    /** Array of faction goal strings, e.g. ["control the trade routes", ...]. */
    goals: string[];
    leaderNpcId: string | null;
    /** JSONB — zones or location references the faction controls. Shape is variable. */
    territory: unknown;
    updatedAt: Date;
}

/** Maps to `world.character_faction_reputation`. Reputation ranges -100 to 100. */
export interface FactionReputation {
    id: string;
    characterCampaignStateId: string;
    factionId: string;
    reputation: number;
    attitude: FactionAttitude;
    updatedAt: Date;
}

/**
 * Maps to `world.faction_relationships`.
 * Invariant: `factionAId < factionBId` (enforced at app layer).
 */
export interface FactionRelationship {
    id: string;
    factionAId: string;
    factionBId: string;
    relationship: FactionRelationshipType;
    updatedAt: Date;
}
