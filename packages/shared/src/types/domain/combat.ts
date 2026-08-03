/**
 * Domain types for combat encounters and initiative tracking.
 *
 * Schema notes:
 *   - `initiative_entries` uses `initiative_roll` (not `initiative`) and `position` for turn order.
 *   - There is no `tiebreaker`, `isActive`, or `hasActed` column — the DB tracks order
 *     via `position` (integer) and whose turn it is via `is_current_turn` (boolean).
 *   - `entity_type` is text: 'player' | 'npc' | 'ai_player'.
 *   - Active effects (conditions, light sources) live in Redis per the transport spec,
 *     not in Postgres. The `ActiveEffect` type here matches the Redis HASH shape.
 */

/** Whether the encounter is ongoing or finished. */
export type EncounterStatus = "active" | "completed";

/** Maps to `combat.encounters`. */
export interface Encounter {
    id: string;
    campaignId: string;
    status: EncounterStatus;
    round: number;
    startedAt: Date;
    endedAt: Date | null;
}

/**
 * Maps to `combat.initiative_entries`.
 * `position` is the 1-based turn order slot; `isCurrentTurn` marks the active combatant.
 * `surprised` is cleared after round 1.
 */
export interface InitiativeEntry {
    id: string;
    encounterId: string;
    entityId: string;
    /** 'player' | 'npc' | 'ai_player' */
    entityType: string;
    initiativeRoll: number;
    position: number;
    isCurrentTurn: boolean;
    surprised: boolean;
}
