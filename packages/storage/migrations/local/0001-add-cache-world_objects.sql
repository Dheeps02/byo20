CREATE TABLE "cache"."world_objects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"zone_q" integer NOT NULL,
	"zone_r" integer NOT NULL,
	"name" text NOT NULL,
	"object_type" text NOT NULL,
	"status" text NOT NULL,
	"position" jsonb NOT NULL,
	"owner_type" text,
	"owner_id" uuid,
	"properties" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
