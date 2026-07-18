ALTER TABLE "game"."campaigns" RENAME COLUMN "terrain_seed" TO "campaign_seed";
--> statement-breakpoint
ALTER TABLE "game"."campaigns" ADD COLUMN "heightmap_resolution" integer;
--> statement-breakpoint
ALTER TABLE "game"."campaigns" ADD COLUMN "world_depth" text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
ALTER TABLE "game"."campaigns" ADD COLUMN "library_access_unlocked" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "world"."world_zones" ADD COLUMN "heightmap_chunk" bytea;
--> statement-breakpoint
CREATE TABLE "world"."world_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"zone_q" integer NOT NULL,
	"zone_r" integer NOT NULL,
	"name" text NOT NULL,
	"object_type" text NOT NULL,
	"status" text DEFAULT 'intact' NOT NULL,
	"position" jsonb NOT NULL,
	"owner_type" text,
	"owner_id" uuid,
	"properties" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory"."lore_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"category" text NOT NULL,
	"source_id" uuid,
	"source_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world"."world_objects" ADD CONSTRAINT "world_objects_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "memory"."lore_entries" ADD CONSTRAINT "lore_entries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "game"."campaigns"("id") ON DELETE no action ON UPDATE no action;
