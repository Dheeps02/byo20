/**
 * game.* schema — byo20_server
 *
 * Source of truth for campaign identity and all player characters.
 * Characters exist independently of campaigns — `character_campaign_state`
 * links them together when a character joins a specific campaign.
 */
import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Drizzle schema handle for the `game` Postgres schema. */
export const game = pgSchema("game");

/** The campaign world: story, DM settings, AI config, and world gen state. */
export const campaigns = game.table("campaigns", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    dm_user_id: text("dm_user_id").notNull(),
    status: text("status").notNull().default("active"), // active | paused | ended
    phase: text("phase").notNull().default("exploration"), // exploration | combat | rest
    world_clock: integer("world_clock").notNull().default(0), // in-game minutes elapsed
    movement_system: text("movement_system").notNull().default("hex"), // free | square | hex
    fog_mode: text("fog_mode").notNull().default("shared"), // shared | per_player
    hp_on_levelup: text("hp_on_levelup").notNull().default("fixed"), // roll | fixed
    sync_interval_mins: integer("sync_interval_mins").notNull().default(5),
    premise: text("premise"), // null if not provided by DM
    campaign_length: text("campaign_length").notNull(), // short | medium | long
    tone: text("tone").notNull(), // gritty | high_fantasy | dark | comedic
    world_gen_status: text("world_gen_status").notNull().default("pending"), // pending | generating | complete
    campaign_seed: text("campaign_seed"),
    heightmap_resolution: integer("heightmap_resolution"),
    world_depth: text("world_depth").notNull().default("standard"), // standard | epic — set once at campaign creation
    library_access_unlocked: boolean("library_access_unlocked").notNull().default(false), // Epic only — flipped true by qualifying quest
    narration_mode: text("narration_mode").notNull().default("balanced"), // economy | balanced | quality
    api_provider: text("api_provider").notNull(), // anthropic | openai | google | ollama
    api_key_blob: text("api_key_blob"), // null for ollama; safeStorage-encrypted
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Character identity — portable across campaigns.
 * Note: created_at added here (not in spec for game.characters but present in local.characters — likely spec oversight).
 */
export const characters = game.table("characters", {
    id: uuid("id").primaryKey().defaultRandom(),
    owner_user_id: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    species: text("species").notNull(), // TEXT not enum — supports homebrew
    background: text("background").notNull(),
    backstory: text("backstory"),
    stat_str: integer("stat_str").notNull(),
    stat_dex: integer("stat_dex").notNull(),
    stat_con: integer("stat_con").notNull(),
    stat_int: integer("stat_int").notNull(),
    stat_wis: integer("stat_wis").notNull(),
    stat_cha: integer("stat_cha").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * How a character exists within one specific campaign.
 * A character can be in multiple campaigns — one row per campaign membership.
 */
export const character_campaign_state = game.table("character_campaign_state", {
    id: uuid("id").primaryKey().defaultRandom(),
    character_id: uuid("character_id")
        .notNull()
        .references(() => characters.id),
    campaign_id: uuid("campaign_id")
        .notNull()
        .references(() => campaigns.id),
    level: integer("level").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    hp_current: integer("hp_current").notNull(),
    hp_max: integer("hp_max").notNull(),
    hit_dice_remaining: integer("hit_dice_remaining").notNull(),
    spell_slots: jsonb("spell_slots"), // null for non-spellcasters
    conditions: text("conditions").array(), // e.g. ['poisoned', 'prone']
    death_saves: jsonb("death_saves"), // { success: 0, failure: 0 }
    position: jsonb("position"), // { x, y, z }
    is_active: boolean("is_active").notNull().default(false),
    exhaustion_level: integer("exhaustion_level").notNull().default(0),
    temp_hp: integer("temp_hp").notNull().default(0),
    heroic_inspiration: boolean("heroic_inspiration").notNull().default(false),
    class_resources: jsonb("class_resources"), // rage uses, bardic inspiration, etc.
    prepared_spells: text("prepared_spells").array(), // null for non-spellcasters
    weapon_masteries: text("weapon_masteries").array(), // null for non-martial unless Weapon Master feat
    languages: text("languages").array(),
    skill_proficiencies: jsonb("skill_proficiencies"), // { "athletics": "proficient" }
    saving_throw_profs: text("saving_throw_profs").array(),
    feats_taken: text("feats_taken").array(),
    concentrating_on: text("concentrating_on"), // spell ID, null if not concentrating
    tool_proficiencies: text("tool_proficiencies").array(),
    pending_levelup: jsonb("pending_levelup"), // null if no pending level-up choices
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per class the character has levels in. A Fighter 3 / Wizard 2 = two rows. */
export const character_classes = game.table("character_classes", {
    id: uuid("id").primaryKey().defaultRandom(),
    character_campaign_state_id: uuid("character_campaign_state_id")
        .notNull()
        .references(() => character_campaign_state.id),
    class: text("class").notNull(), // TEXT not enum — supports homebrew
    subclass: text("subclass"), // null until level 3
    class_level: integer("class_level").notNull(),
    prepared_spells: text("prepared_spells").array(), // per-class; null for non-spellcasters
});
