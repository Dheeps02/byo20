/**
 * Domain types for append-only log tables.
 *
 * These tables are never UPDATE'd or DELETE'd — they are the permanent campaign
 * history. Even DM rollbacks leave log rows intact (see future-work.md for the
 * rolled_back_at tracking proposal).
 *
 * Schema notes:
 *   - `combat_log` references `encounter_id` (not campaign_id directly).
 *   - `combat_log.action_type` is a Postgres ENUM — mapped here as `CombatActionType`.
 *   - `npc_dialogue_log` has `speaker_type` + `speaker_id` (not just npc_id + content).
 *   - `event_log.summary` and `event_log.embedding` are nullable in the schema.
 *   - `combat_log.result`, `combat_log.summary`, and `combat_log.embedding` are nullable.
 */

/** Vocabulary for significant world events — must match the DB `event_type` enum exactly. */
export type EventType =
    | "encounter_started"
    | "encounter_ended"
    | "trade_transaction"
    | "player_moved"
    | "spell_cast"
    | "item_looted"
    | "npc_dialogue"
    | "level_up"
    | "rest_taken"
    | "world_clock_tick"
    | "faction_rep_changed"
    | "door_unlocked"
    | "fast_travel"
    | "influence_action"
    | "study_action"
    | "search_action"
    | "utilize_action"
    | "grapple_attempt"
    | "shove_attempt"
    | "weapon_mastery_triggered"
    | "heroic_inspiration_used"
    | "heroic_inspiration_gained"
    | "potion_used"
    | "villain_agenda_fired"
    | "milestone_completed"
    | "quest_created"
    | "quest_completed"
    | "quest_failed"
    | "quest_abandoned"
    | "narration_pool_refreshed";

/** Vocabulary for combat actions — separate enum from EventType. */
export type CombatActionType =
    | "attack"
    | "cast_spell"
    | "move"
    | "dash"
    | "dodge"
    | "disengage"
    | "help"
    | "hide"
    | "ready"
    | "use_item"
    | "bonus_action"
    | "reaction"
    | "grapple"
    | "shove"
    | "death_save";

/** Maps to `log.event_log`. Append-only. `embedding` is null until the AI layer runs. */
export interface EventLogEntry {
    id: string;
    campaignId: string;
    sessionId: string | null;
    eventType: EventType;
    payload: unknown;
    summary: string | null;
    /** 768-dim embedding. Null until the AI layer generates it. */
    embedding: number[] | null;
    timestamp: Date;
}

/**
 * Maps to `log.combat_log`. Append-only.
 * References `encounter_id` — campaign is accessed via the encounter.
 * `actionType` maps the `combat_action_type` DB enum.
 */
export interface CombatLogEntry {
    id: string;
    encounterId: string;
    sessionId: string | null;
    round: number;
    actorId: string;
    actionType: CombatActionType;
    payload: unknown;
    result: unknown | null;
    summary: string | null;
    embedding: number[] | null;
    timestamp: Date;
}

/**
 * Maps to `log.npc_dialogue_log`. Append-only.
 * `speakerType` is 'npc' | 'player'; `speakerId` identifies the actual speaker.
 */
export interface NPCDialogueEntry {
    id: string;
    campaignId: string;
    npcId: string;
    sessionId: string | null;
    speakerType: string;
    speakerId: string;
    content: string;
    timestamp: Date;
}

/** Maps to `log.party_chat_log`. Append-only OOC chat. */
export interface PartyChatEntry {
    id: string;
    campaignId: string;
    sessionId: string | null;
    speakerId: string;
    content: string;
    timestamp: Date;
}
