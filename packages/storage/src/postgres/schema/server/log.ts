/**
 * log.* schema — byo20_server
 *
 * Append-only audit tables. None of these are ever UPDATE'd or DELETE'd.
 * They accumulate the full real history of the campaign — even DM rollbacks
 * do not touch these tables.
 *
 * Two Postgres ENUMs live here:
 *   - event_type     (event_log.event_type)
 *   - combat_action_type (combat_log.action_type)
 *
 * These are DISTINCT vocabularies — don't conflate them.
 */
import { integer, jsonb, pgEnum, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { vector } from "../vector-type";
import { encounters } from "./combat";
import { campaigns } from "./game";

/** Drizzle schema handle for the `log` Postgres schema. */
export const log = pgSchema("log");

/** Controlled vocabulary for significant world events. New types require a migration. */
export const event_type_enum = pgEnum("event_type", [
    "encounter_started",
    "encounter_ended",
    "trade_transaction",
    "player_moved",
    "spell_cast",
    "item_looted",
    "npc_dialogue",
    "level_up",
    "rest_taken",
    "world_clock_tick",
    "faction_rep_changed",
    "door_unlocked",
    "fast_travel",
    "influence_action",
    "study_action",
    "search_action",
    "utilize_action",
    "grapple_attempt",
    "shove_attempt",
    "weapon_mastery_triggered",
    "heroic_inspiration_used",
    "heroic_inspiration_gained",
    "potion_used",
    "villain_agenda_fired",
    "milestone_completed",
    "quest_created",
    "quest_completed",
    "quest_failed",
    "quest_abandoned",
    "narration_pool_refreshed",
]);

/** Vocabulary for combat actions — separate from event_type. */
export const combat_action_type_enum = pgEnum("combat_action_type", [
    "attack",
    "cast_spell",
    "move",
    "dash",
    "dodge",
    "disengage",
    "help",
    "hide",
    "ready",
    "use_item",
    "bonus_action",
    "reaction",
    "grapple",
    "shove",
    "death_save",
]);

/** Individual play sessions / sittings. Append-only. */
export const sessions = log.table("sessions", {
    id: uuid("id").primaryKey().defaultRandom(),
    campaign_id: uuid("campaign_id")
        .notNull()
        .references(() => campaigns.id),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    summary: text("summary"), // AI-generated end-of-session summary
});

/** Every significant world event. Append-only. Has vector embedding for AI semantic recall. */
export const event_log = log.table("event_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    campaign_id: uuid("campaign_id")
        .notNull()
        .references(() => campaigns.id),
    session_id: uuid("session_id").references(() => sessions.id),
    event_type: event_type_enum("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    summary: text("summary"),
    embedding: vector("embedding", 768), // nomic-embed-text via bundled Ollama
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

/** Every combat action taken. Append-only. */
export const combat_log = log.table("combat_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    encounter_id: uuid("encounter_id")
        .notNull()
        .references(() => encounters.id),
    session_id: uuid("session_id").references(() => sessions.id),
    round: integer("round").notNull(),
    actor_id: uuid("actor_id").notNull(),
    action_type: combat_action_type_enum("action_type").notNull(),
    payload: jsonb("payload").notNull(),
    result: jsonb("result"),
    summary: text("summary"),
    embedding: vector("embedding", 768),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

/** Raw NPC dialogue history. Append-only. Group conversations only (no whispers pre-v1.0). */
export const npc_dialogue_log = log.table("npc_dialogue_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    campaign_id: uuid("campaign_id")
        .notNull()
        .references(() => campaigns.id),
    npc_id: uuid("npc_id").notNull(),
    session_id: uuid("session_id").references(() => sessions.id),
    speaker_type: text("speaker_type").notNull(), // npc | player
    speaker_id: uuid("speaker_id").notNull(),
    content: text("content").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

/** OOC party chat. Append-only. Persisted across sessions. */
export const party_chat_log = log.table("party_chat_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    campaign_id: uuid("campaign_id")
        .notNull()
        .references(() => campaigns.id),
    session_id: uuid("session_id").references(() => sessions.id),
    speaker_id: uuid("speaker_id").notNull(),
    content: text("content").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});
