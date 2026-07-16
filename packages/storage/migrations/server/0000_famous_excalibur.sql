CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE SCHEMA "combat";
--> statement-breakpoint
CREATE SCHEMA "game";
--> statement-breakpoint
CREATE SCHEMA "items";
--> statement-breakpoint
CREATE SCHEMA "world";
--> statement-breakpoint
CREATE SCHEMA "log";
--> statement-breakpoint
CREATE SCHEMA "memory";
--> statement-breakpoint
CREATE TYPE "public"."combat_action_type" AS ENUM('attack', 'cast_spell', 'move', 'dash', 'dodge', 'disengage', 'help', 'hide', 'ready', 'use_item', 'bonus_action', 'reaction', 'grapple', 'shove', 'death_save');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('encounter_started', 'encounter_ended', 'trade_transaction', 'player_moved', 'spell_cast', 'item_looted', 'npc_dialogue', 'level_up', 'rest_taken', 'world_clock_tick', 'faction_rep_changed', 'door_unlocked', 'fast_travel', 'influence_action', 'study_action', 'search_action', 'utilize_action', 'grapple_attempt', 'shove_attempt', 'weapon_mastery_triggered', 'heroic_inspiration_used', 'heroic_inspiration_gained', 'potion_used', 'villain_agenda_fired', 'milestone_completed', 'quest_created', 'quest_completed', 'quest_failed', 'quest_abandoned', 'narration_pool_refreshed');--> statement-breakpoint
CREATE TABLE "combat"."encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "combat"."initiative_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encounter_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"initiative_roll" integer NOT NULL,
	"position" integer NOT NULL,
	"is_current_turn" boolean DEFAULT false NOT NULL,
	"surprised" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game"."campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dm_user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"phase" text DEFAULT 'exploration' NOT NULL,
	"world_clock" integer DEFAULT 0 NOT NULL,
	"movement_system" text DEFAULT 'hex' NOT NULL,
	"fog_mode" text DEFAULT 'shared' NOT NULL,
	"hp_on_levelup" text DEFAULT 'fixed' NOT NULL,
	"sync_interval_mins" integer DEFAULT 5 NOT NULL,
	"premise" text,
	"campaign_length" text NOT NULL,
	"tone" text NOT NULL,
	"world_gen_status" text DEFAULT 'pending' NOT NULL,
	"terrain_seed" text,
	"narration_mode" text DEFAULT 'balanced' NOT NULL,
	"api_provider" text NOT NULL,
	"api_key_blob" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game"."character_campaign_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"hp_current" integer NOT NULL,
	"hp_max" integer NOT NULL,
	"hit_dice_remaining" integer NOT NULL,
	"spell_slots" jsonb,
	"conditions" text[],
	"death_saves" jsonb,
	"position" jsonb,
	"is_active" boolean DEFAULT false NOT NULL,
	"exhaustion_level" integer DEFAULT 0 NOT NULL,
	"temp_hp" integer DEFAULT 0 NOT NULL,
	"heroic_inspiration" boolean DEFAULT false NOT NULL,
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game"."character_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_campaign_state_id" uuid NOT NULL,
	"class" text NOT NULL,
	"subclass" text,
	"class_level" integer NOT NULL,
	"prepared_spells" text[]
);
--> statement-breakpoint
CREATE TABLE "game"."characters" (
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
CREATE TABLE "items"."armor_stats" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"ac" integer NOT NULL,
	"armor_type" text NOT NULL,
	"stealth_disadvantage" boolean DEFAULT false NOT NULL,
	"str_requirement" integer
);
--> statement-breakpoint
CREATE TABLE "items"."consumable_stats" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"effect" jsonb NOT NULL,
	"charges_max" integer NOT NULL,
	"charges_current" integer,
	"recharge" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items"."containers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" jsonb,
	"owner_type" text NOT NULL,
	"owner_id" uuid
);
--> statement-breakpoint
CREATE TABLE "items"."items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items"."magic_item_stats" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"custom_name" text,
	"rarity" text NOT NULL,
	"attunement" boolean DEFAULT false NOT NULL,
	"attuned" boolean DEFAULT false NOT NULL,
	"bonus" integer,
	"charges_max" integer,
	"charges_current" integer,
	"recharge" text,
	"properties" jsonb
);
--> statement-breakpoint
CREATE TABLE "items"."melee_item_stats" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"damage_die" text NOT NULL,
	"damage_type" text NOT NULL,
	"properties" jsonb
);
--> statement-breakpoint
CREATE TABLE "items"."ranged_item_stats" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"damage_die" text NOT NULL,
	"damage_type" text NOT NULL,
	"range_normal" integer NOT NULL,
	"range_long" integer NOT NULL,
	"ammo_type" text
);
--> statement-breakpoint
CREATE TABLE "items"."spell_focus_stats" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"focus_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."campaign_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"fires_at_clock" integer NOT NULL,
	"fired" boolean DEFAULT false NOT NULL,
	"fired_at" timestamp with time zone,
	"world_mutations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."campaign_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"required" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"triggers_pool_refresh" boolean DEFAULT false NOT NULL,
	"order_hint" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."campaign_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_ref" uuid,
	"label" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."character_faction_reputation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_campaign_state_id" uuid NOT NULL,
	"faction_id" uuid NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"attitude" text DEFAULT 'indifferent' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."faction_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"faction_a_id" uuid NOT NULL,
	"faction_b_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."factions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goals" jsonb,
	"leader_npc_id" uuid,
	"territory" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."narration_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"content" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."npcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"faction_id" uuid,
	"location" jsonb,
	"status" text DEFAULT 'alive' NOT NULL,
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
	"treasure_type" text DEFAULT 'none' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"state" text DEFAULT 'available' NOT NULL,
	"faction_id" uuid,
	"nodes" jsonb NOT NULL,
	"current_node_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world"."world_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"hex_q" integer NOT NULL,
	"hex_r" integer NOT NULL,
	"gen_state" text DEFAULT 'ungenerated' NOT NULL,
	"zone_type" text,
	"content" jsonb,
	"generated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log"."combat_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encounter_id" uuid NOT NULL,
	"session_id" uuid,
	"round" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"action_type" "combat_action_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"summary" text,
	"embedding" vector(768),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log"."event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid,
	"event_type" "event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text,
	"embedding" vector(768),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log"."npc_dialogue_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"npc_id" uuid NOT NULL,
	"session_id" uuid,
	"speaker_type" text NOT NULL,
	"speaker_id" uuid NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log"."party_chat_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid,
	"speaker_id" uuid NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "memory"."faction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"faction_id" uuid NOT NULL,
	"event_log_id" uuid NOT NULL,
	"quest_id" uuid,
	"embedding" vector(768) NOT NULL,
	"rep_delta" integer DEFAULT 0 NOT NULL,
	"created_at_clock" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory"."npc_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"npc_id" uuid NOT NULL,
	"event_log_id" uuid NOT NULL,
	"quest_id" uuid,
	"embedding" vector(768) NOT NULL,
	"sentiment" text NOT NULL,
	"significance" boolean DEFAULT false NOT NULL,
	"created_at_clock" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "combat"."encounters" ADD CONSTRAINT "encounters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combat"."initiative_entries" ADD CONSTRAINT "initiative_entries_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "combat"."encounters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."character_campaign_state" ADD CONSTRAINT "character_campaign_state_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "game"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."character_campaign_state" ADD CONSTRAINT "character_campaign_state_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game"."character_classes" ADD CONSTRAINT "character_classes_character_campaign_state_id_character_campaign_state_id_fk" FOREIGN KEY ("character_campaign_state_id") REFERENCES "game"."character_campaign_state"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."armor_stats" ADD CONSTRAINT "armor_stats_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."consumable_stats" ADD CONSTRAINT "consumable_stats_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."containers" ADD CONSTRAINT "containers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."items" ADD CONSTRAINT "items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."magic_item_stats" ADD CONSTRAINT "magic_item_stats_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."melee_item_stats" ADD CONSTRAINT "melee_item_stats_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."ranged_item_stats" ADD CONSTRAINT "ranged_item_stats_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items"."spell_focus_stats" ADD CONSTRAINT "spell_focus_stats_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."campaign_agenda" ADD CONSTRAINT "campaign_agenda_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."campaign_milestones" ADD CONSTRAINT "campaign_milestones_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."campaign_snapshots" ADD CONSTRAINT "campaign_snapshots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."character_faction_reputation" ADD CONSTRAINT "character_faction_reputation_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "world"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."faction_relationships" ADD CONSTRAINT "faction_relationships_faction_a_id_factions_id_fk" FOREIGN KEY ("faction_a_id") REFERENCES "world"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."faction_relationships" ADD CONSTRAINT "faction_relationships_faction_b_id_factions_id_fk" FOREIGN KEY ("faction_b_id") REFERENCES "world"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."factions" ADD CONSTRAINT "factions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."factions" ADD CONSTRAINT "factions_leader_npc_id_npcs_id_fk" FOREIGN KEY ("leader_npc_id") REFERENCES "world"."npcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."narration_pool" ADD CONSTRAINT "narration_pool_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."npcs" ADD CONSTRAINT "npcs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."quests" ADD CONSTRAINT "quests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."quests" ADD CONSTRAINT "quests_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "world"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world"."world_zones" ADD CONSTRAINT "world_zones_campaign_hex_unique" UNIQUE("campaign_id","hex_q","hex_r");
--> statement-breakpoint
ALTER TABLE "world"."world_zones" ADD CONSTRAINT "world_zones_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "log"."combat_log" ADD CONSTRAINT "combat_log_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "combat"."encounters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."combat_log" ADD CONSTRAINT "combat_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "log"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."event_log" ADD CONSTRAINT "event_log_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."event_log" ADD CONSTRAINT "event_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "log"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."npc_dialogue_log" ADD CONSTRAINT "npc_dialogue_log_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."npc_dialogue_log" ADD CONSTRAINT "npc_dialogue_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "log"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."party_chat_log" ADD CONSTRAINT "party_chat_log_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."party_chat_log" ADD CONSTRAINT "party_chat_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "log"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log"."sessions" ADD CONSTRAINT "sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."faction_events" ADD CONSTRAINT "faction_events_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "world"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."faction_events" ADD CONSTRAINT "faction_events_event_log_id_event_log_id_fk" FOREIGN KEY ("event_log_id") REFERENCES "log"."event_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."faction_events" ADD CONSTRAINT "faction_events_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "world"."quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."npc_memories" ADD CONSTRAINT "npc_memories_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "world"."npcs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."npc_memories" ADD CONSTRAINT "npc_memories_event_log_id_event_log_id_fk" FOREIGN KEY ("event_log_id") REFERENCES "log"."event_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory"."npc_memories" ADD CONSTRAINT "npc_memories_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "world"."quests"("id") ON DELETE no action ON UPDATE no action;