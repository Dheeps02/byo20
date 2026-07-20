/**
 * Domain types for sessions and campaign snapshots.
 *
 * Sessions are append-only — rows are never deleted.
 * Snapshots are a rolling window of 10 per campaign, managed by the store.
 */

/** What triggered this snapshot to be created. */
export type SnapshotTrigger =
    | "encounter_end"
    | "milestone"
    | "rest"
    | "quest_transition"
    | "session_start"
    | "session_end";

/** Maps to `log.sessions`. Append-only. */
export interface Session {
    id: string;
    campaignId: string;
    startedAt: Date;
    endedAt: Date | null;
    /** AI-generated end-of-session summary. Null until session ends. */
    summary: string | null;
}

/**
 * Maps to `world.campaign_snapshots`.
 * `state` is a JSONB dump of all mutable campaign tables at the moment of the snapshot.
 * Max 10 snapshots per campaign — oldest is evicted when the window fills.
 */
export interface Snapshot {
    id: string;
    campaignId: string;
    triggerType: SnapshotTrigger;
    /** FK to the triggering row (encounter id, milestone id, etc.). Null if no specific ref. */
    triggerRef: string | null;
    label: string;
    /** Full mutable campaign state dump — deserialized from JSONB. */
    state: unknown;
    createdAt: Date;
}
