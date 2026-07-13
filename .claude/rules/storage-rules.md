---
paths:
  - "packages/storage/**"
---

# Storage Rules

## Two Databases
- `byo20_local` — always active on every machine (srd.*, local.*, cache.*)
- `byo20_server` — only active when hosting (game.*, world.*, combat.*, log.*, memory.*)

## Schema Source of Truth
Read `docs/spec/storage-layer.md` before touching any schema.
Every table, column, and constraint is specced there. Don't invent columns.

## Drizzle Conventions
- Schema definitions in `src/postgres/schema/` — one file per schema group
- Typed query functions in `src/postgres/queries/` — one file per domain
- Never write raw SQL outside of migrations
- Column names: `snake_case`
- All tables have `created_at TIMESTAMPTZ` unless explicitly noted otherwise

## Migrations
- Numbered sequentially: `0001_initial.sql`, `0002_add_quests.sql`
- Always append-only — never modify an existing migration
- Run `drizzle-kit generate` to produce migrations from schema changes
- Test migrations against a clean DB before committing

## Append-Only Tables
These tables are NEVER updated or deleted from, only inserted:
`event_log`, `combat_log`, `npc_dialogue_log`, `sessions`, `party_chat_log`

## Redis
- Session-only data: combat state, active effects, current turn resources
- Rebuilt from Postgres on server restart
- Never persist anything to Redis that isn't also recoverable from Postgres

## SRD Seeds
- Data files in `seeds/srd/` as JSON
- Seeder script runs once on first launch
- SRD data is never mutated during gameplay — read-only after seeding
