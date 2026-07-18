CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE SCHEMA "cache";
--> statement-breakpoint
CREATE SCHEMA "srd";
--> statement-breakpoint
CREATE SCHEMA "local";
--> statement-breakpoint
CREATE TABLE "cache"."character_campaign_state" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"xp" integer NOT NULL,
	"hp_current" integer NOT NULL,
	"hp_max" integer NOT NULL,
	"hit_dice_remaining" integer NOT NULL,
	"spell_slots" jsonb,
	"conditions" text[],
	"death_saves" jsonb,
	"position" jsonb,
	"is_active" boolean NOT NULL,
	"exhaustion_level" integer NOT NULL,
	"temp_hp" integer NOT NULL,
	"heroic_inspiration" boolean NOT NULL,
	"class_resources" jsonb,
	"prepared_spells" text[],
	"weapon_masteries" text[],
	"languages" text[],
	"skill_proficiencies" jsonb,
	"saving_throw_profs" text[],
	"feats_taken" text[],
	"concentrating_on" text,
	"tool_proficiencies" text[],
	"pending_levelup" jsonb,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."character_classes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_campaign_state_id" uuid NOT NULL,
	"class" text NOT NULL,
	"subclass" text,
	"class_level" integer NOT NULL,
	"prepared_spells" text[]
);
--> statement-breakpoint
CREATE TABLE "cache"."character_faction_reputation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_campaign_state_id" uuid NOT NULL,
	"faction_id" uuid NOT NULL,
	"reputation" integer NOT NULL,
	"attitude" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"background" text NOT NULL,
	"backstory" text,
	"stat_str" integer NOT NULL,
	"stat_dex" integer NOT NULL,
	"stat_con" integer NOT NULL,
	"stat_int" integer NOT NULL,
	"stat_wis" integer NOT NULL,
	"stat_cha" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."combat_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"session_id" uuid,
	"round" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"summary" text,
	"embedding" vector(768),
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."encounters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"status" text NOT NULL,
	"round" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cache"."event_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text,
	"embedding" vector(768),
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."factions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goals" jsonb,
	"leader_npc_id" uuid,
	"territory" jsonb,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."initiative_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"encounter_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"initiative_roll" integer NOT NULL,
	"position" integer NOT NULL,
	"is_current_turn" boolean NOT NULL,
	"surprised" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"item_type" text NOT NULL,
	"description" text,
	"base_value" integer,
	"unit" text,
	"owner_type" text NOT NULL,
	"owner_id" uuid,
	"location_type" text NOT NULL,
	"location_id" uuid,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."npcs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"faction_id" uuid,
	"location" jsonb,
	"status" text NOT NULL,
	"schedule" jsonb,
	"stat_str" integer NOT NULL,
	"stat_dex" integer NOT NULL,
	"stat_con" integer NOT NULL,
	"stat_int" integer NOT NULL,
	"stat_wis" integer NOT NULL,
	"stat_cha" integer NOT NULL,
	"ac" integer NOT NULL,
	"speed" integer NOT NULL,
	"cr" text NOT NULL,
	"hp_current" integer NOT NULL,
	"hp_max" integer NOT NULL,
	"proficiency_bonus" integer NOT NULL,
	"traits" jsonb,
	"actions" jsonb,
	"resistances" text[],
	"immunities" text[],
	"spells" jsonb,
	"senses" jsonb,
	"languages" jsonb,
	"legendary_resistances" integer,
	"treasure_type" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."party_chat_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid,
	"speaker_id" uuid NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."quests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"state" text NOT NULL,
	"faction_id" uuid,
	"nodes" jsonb NOT NULL,
	"current_node_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cache"."sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "srd"."backgrounds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"ability_scores" jsonb,
	"skill_profs" jsonb,
	"tool_profs" jsonb,
	"feat" text,
	"languages" text[],
	"equipment" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."classes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"hit_die" text NOT NULL,
	"primary_ability" text,
	"saving_throw_profs" jsonb,
	"armor_profs" jsonb,
	"weapon_profs" jsonb,
	"skill_choices" jsonb,
	"spell_slot_table" jsonb,
	"features_table" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."conditions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"effects" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."feats" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"prerequisite" jsonb,
	"ability_score_increase" jsonb,
	"benefits" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."loot_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"treasure_type" text NOT NULL,
	"theme" text,
	"cr_band" text NOT NULL,
	"coin_range" jsonb,
	"item_pool" jsonb,
	"item_count_range" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."magic_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rarity" text,
	"item_type" text,
	"attunement" boolean DEFAULT false,
	"charges_max" integer,
	"recharge" text,
	"properties" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."monsters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"size" text,
	"type" text,
	"alignment" text,
	"ac" integer,
	"speed" jsonb,
	"hp_average" integer,
	"hp_die" text,
	"stat_str" integer,
	"stat_dex" integer,
	"stat_con" integer,
	"stat_int" integer,
	"stat_wis" integer,
	"stat_cha" integer,
	"saving_throws" jsonb,
	"skills" jsonb,
	"damage_resistances" jsonb,
	"damage_immunities" jsonb,
	"condition_immunities" text[],
	"senses" jsonb,
	"languages" text,
	"cr" text,
	"xp" integer,
	"traits" jsonb,
	"actions" jsonb,
	"bonus_actions" jsonb,
	"reactions" jsonb,
	"legendary_actions" jsonb,
	"treasure_type" text DEFAULT 'none'
);
--> statement-breakpoint
CREATE TABLE "srd"."ruleset_version" (
	"ruleset_id" text PRIMARY KEY NOT NULL,
	"srd_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srd"."species" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"size" text,
	"speed" integer,
	"traits" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."spells" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"level" integer NOT NULL,
	"school" text,
	"casting_time" text,
	"range" text,
	"components" jsonb,
	"duration" text,
	"concentration" boolean DEFAULT false NOT NULL,
	"ritual" boolean DEFAULT false NOT NULL,
	"classes" text[],
	"area_of_effect" jsonb,
	"damage" jsonb,
	"save" text,
	"effects" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"item_type" text,
	"cost" integer,
	"weight" numeric,
	"properties" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."subclasses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"class_id" text NOT NULL,
	"level_gained" integer DEFAULT 3 NOT NULL,
	"features" jsonb
);
--> statement-breakpoint
CREATE TABLE "srd"."weapon_masteries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"applicable_weapons" jsonb,
	"effect" text
);
--> statement-breakpoint
CREATE TABLE "srd"."xp_thresholds" (
	"level" integer PRIMARY KEY NOT NULL,
	"xp_required" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local"."characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"background" text NOT NULL,
	"backstory" text,
	"stat_str" integer NOT NULL,
	"stat_dex" integer NOT NULL,
	"stat_con" integer NOT NULL,
	"stat_int" integer NOT NULL,
	"stat_wis" integer NOT NULL,
	"stat_cha" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "srd"."subclasses" ADD CONSTRAINT "subclasses_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "srd"."classes"("id") ON DELETE no action ON UPDATE no action;