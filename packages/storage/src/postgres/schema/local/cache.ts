/**
 * cache.* schema — byo20_local
 *
 * Read-only mirror of the player's slice of byo20_server data.
 * Written by the sync process, never written back to the server.
 * Column shapes are shared helpers to avoid duplicating definitions across
 * two separate Drizzle table instances (server vs. cache).
 *
 * Rather than importing server table definitions (which would cross the
 * byo20_server / byo20_local boundary), we define column shape objects once
 * here and use them for both `cache` schema tables and server-side tables
 * via re-export. Column objects are plain JS objects — Drizzle uses them
 * as spreads inside table() calls.
 */
import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { vector } from "../vector-type";

/** Drizzle schema handle for the `cache` Postgres schema. */
export const cache = pgSchema("cache");

// ---------------------------------------------------------------------------
// Shared column shape helpers — defined once, spread into each table.
// These helpers are spread into cache.* tables only — server schema files
// do NOT import from here. Server-to-cache column sync is a manual contract:
// when a server table changes, update the matching helper here, or cache
// reads will silently diverge.
// ---------------------------------------------------------------------------

/** Shared column shape for character identity rows (game.characters and cache.characters). */
export const characterColumns = {
    id: uuid("id").primaryKey(),
    owner_user_id: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    species: text("species").notNull(),
    background: text("background").notNull(),
    backstory: text("backstory"),
    stat_str: integer("stat_str").notNull(),
    stat_dex: integer("stat_dex").notNull(),
    stat_con: integer("stat_con").notNull(),
    stat_int: integer("stat_int").notNull(),
    stat_wis: integer("stat_wis").notNull(),
    stat_cha: integer("stat_cha").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
};

/** Shared column shape for character campaign state rows. */
export const characterCampaignStateColumns = {
    id: uuid("id").primaryKey(),
    character_id: uuid("character_id").notNull(),
    campaign_id: uuid("campaign_id").notNull(),
    level: integer("level").notNull(),
    xp: integer("xp").notNull(),
    hp_current: integer("hp_current").notNull(),
    hp_max: integer("hp_max").notNull(),
    hit_dice_remaining: integer("hit_dice_remaining").notNull(),
    spell_slots: jsonb("spell_slots"),
    conditions: text("conditions").array(),
    death_saves: jsonb("death_saves"),
    position: jsonb("position"),
    is_active: boolean("is_active").notNull(),
    exhaustion_level: integer("exhaustion_level").notNull(),
    temp_hp: integer("temp_hp").notNull(),
    heroic_inspiration: boolean("heroic_inspiration").notNull(),
    class_resources: jsonb("class_resources"),
    prepared_spells: text("prepared_spells").array(),
    weapon_masteries: text("weapon_masteries").array(),
    languages: text("languages").array(),
    skill_proficiencies: jsonb("skill_proficiencies"),
    saving_throw_profs: text("saving_throw_profs").array(),
    feats_taken: text("feats_taken").array(),
    concentrating_on: text("concentrating_on"),
    tool_proficiencies: text("tool_proficiencies").array(),
    pending_levelup: jsonb("pending_levelup"),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
};

/** Shared column shape for character class rows. */
export const characterClassColumns = {
    id: uuid("id").primaryKey(),
    character_campaign_state_id: uuid("character_campaign_state_id").notNull(),
    class: text("class").notNull(),
    subclass: text("subclass"),
    class_level: integer("class_level").notNull(),
    prepared_spells: text("prepared_spells").array(),
};

/** Shared column shape for item rows. */
export const itemColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    item_id: text("item_id").notNull(),
    item_type: text("item_type").notNull(),
    description: text("description"),
    base_value: integer("base_value"),
    unit: text("unit"),
    owner_type: text("owner_type").notNull(),
    owner_id: uuid("owner_id"),
    location_type: text("location_type").notNull(),
    location_id: uuid("location_id"),
    quantity: integer("quantity").notNull(),
};

/** Shared column shape for encounter rows. */
export const encounterColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    status: text("status").notNull(),
    round: integer("round").notNull(),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
};

/** Shared column shape for initiative entry rows. */
export const initiativeEntryColumns = {
    id: uuid("id").primaryKey(),
    encounter_id: uuid("encounter_id").notNull(),
    entity_id: uuid("entity_id").notNull(),
    entity_type: text("entity_type").notNull(),
    initiative_roll: integer("initiative_roll").notNull(),
    position: integer("position").notNull(),
    is_current_turn: boolean("is_current_turn").notNull(),
    surprised: boolean("surprised").notNull(),
};

/** Shared column shape for event log rows. Uses TEXT for event_type — avoids enum dep on byo20_local. */
export const eventLogColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    session_id: uuid("session_id"),
    event_type: text("event_type").notNull(), // cache uses TEXT — no enum dependency on byo20_local
    payload: jsonb("payload").notNull(),
    summary: text("summary"),
    embedding: vector("embedding", 768),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
};

/** Shared column shape for NPC rows. */
export const npcColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    name: text("name").notNull(),
    faction_id: uuid("faction_id"),
    location: jsonb("location"),
    status: text("status").notNull(),
    schedule: jsonb("schedule"),
    stat_str: integer("stat_str").notNull(),
    stat_dex: integer("stat_dex").notNull(),
    stat_con: integer("stat_con").notNull(),
    stat_int: integer("stat_int").notNull(),
    stat_wis: integer("stat_wis").notNull(),
    stat_cha: integer("stat_cha").notNull(),
    ac: integer("ac").notNull(),
    speed: integer("speed").notNull(),
    cr: text("cr").notNull(),
    hp_current: integer("hp_current").notNull(),
    hp_max: integer("hp_max").notNull(),
    proficiency_bonus: integer("proficiency_bonus").notNull(),
    traits: jsonb("traits"),
    actions: jsonb("actions"),
    resistances: text("resistances").array(),
    immunities: text("immunities").array(),
    spells: jsonb("spells"),
    senses: jsonb("senses"),
    languages: jsonb("languages"),
    legendary_resistances: integer("legendary_resistances"),
    treasure_type: text("treasure_type").notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
};

/** Shared column shape for faction rows. */
export const factionColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    goals: jsonb("goals"),
    leader_npc_id: uuid("leader_npc_id"),
    territory: jsonb("territory"),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
};

/** Shared column shape for character faction reputation rows. */
export const factionReputationColumns = {
    id: uuid("id").primaryKey(),
    character_campaign_state_id: uuid("character_campaign_state_id").notNull(),
    faction_id: uuid("faction_id").notNull(),
    reputation: integer("reputation").notNull(),
    attitude: text("attitude").notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
};

/** Shared column shape for quest rows. */
export const questColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    title: text("title").notNull(),
    source_type: text("source_type").notNull(),
    state: text("state").notNull(),
    faction_id: uuid("faction_id"),
    nodes: jsonb("nodes").notNull(),
    current_node_id: text("current_node_id").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
};

/** Shared column shape for session rows. */
export const sessionColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    started_at: timestamp("started_at", { withTimezone: true }).notNull(),
    ended_at: timestamp("ended_at", { withTimezone: true }),
    summary: text("summary"),
};

/** Shared column shape for combat log rows. Uses TEXT for action_type — avoids enum dep on byo20_local. */
export const combatLogColumns = {
    id: uuid("id").primaryKey(),
    encounter_id: uuid("encounter_id").notNull(),
    session_id: uuid("session_id"),
    round: integer("round").notNull(),
    actor_id: uuid("actor_id").notNull(),
    action_type: text("action_type").notNull(), // TEXT in cache — no enum dep
    payload: jsonb("payload").notNull(),
    result: jsonb("result"),
    summary: text("summary"),
    embedding: vector("embedding", 768),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
};

/** Shared column shape for party chat log rows. */
export const partyChatLogColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    session_id: uuid("session_id"),
    speaker_id: uuid("speaker_id").notNull(),
    content: text("content").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
};

/** Shared column shape for world object rows. */
export const worldObjectColumns = {
    id: uuid("id").primaryKey(),
    campaign_id: uuid("campaign_id").notNull(),
    zone_q: integer("zone_q").notNull(),
    zone_r: integer("zone_r").notNull(),
    name: text("name").notNull(),
    object_type: text("object_type").notNull(),
    status: text("status").notNull(),
    position: jsonb("position").notNull(),
    owner_type: text("owner_type"),
    owner_id: uuid("owner_id"),
    properties: jsonb("properties"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
};

// ---------------------------------------------------------------------------
// cache.* tables — one per mirrored server table.
// Each spreads its shared column helper so structure stays in sync with server.
// ---------------------------------------------------------------------------

/** Cached mirror of game.characters. */
export const cache_characters = cache.table("characters", characterColumns);
/** Cached mirror of game.character_campaign_state. */
export const cache_character_campaign_state = cache.table("character_campaign_state", characterCampaignStateColumns);
/** Cached mirror of game.character_classes. */
export const cache_character_classes = cache.table("character_classes", characterClassColumns);
/** Cached mirror of items.items. */
export const cache_items = cache.table("items", itemColumns);
/** Cached mirror of combat.encounters. */
export const cache_encounters = cache.table("encounters", encounterColumns);
/** Cached mirror of combat.initiative_entries. */
export const cache_initiative_entries = cache.table("initiative_entries", initiativeEntryColumns);
/** Cached mirror of log.event_log. */
export const cache_event_log = cache.table("event_log", eventLogColumns);
/** Cached mirror of world.npcs. */
export const cache_npcs = cache.table("npcs", npcColumns);
/** Cached mirror of world.factions. */
export const cache_factions = cache.table("factions", factionColumns);
/** Cached mirror of world.character_faction_reputation. */
export const cache_character_faction_reputation = cache.table("character_faction_reputation", factionReputationColumns);
/** Cached mirror of world.quests. */
export const cache_quests = cache.table("quests", questColumns);
/** Cached mirror of log.sessions. */
export const cache_sessions = cache.table("sessions", sessionColumns);
/** Cached mirror of log.combat_log. */
export const cache_combat_log = cache.table("combat_log", combatLogColumns);
/** Cached mirror of log.party_chat_log. */
export const cache_party_chat_log = cache.table("party_chat_log", partyChatLogColumns);
/** Cached mirror of world.world_objects — objects in zones the party has visited. */
export const cache_world_objects = cache.table("world_objects", worldObjectColumns);
