/**
 * Postgres client factory — byo20_server and byo20_local.
 *
 * Two separate databases, two separate connection pools.
 * Both run migrations automatically on first connection so the DB is always
 * in sync with the schema before the server accepts any game traffic.
 *
 * `checkRulesetVersion` is called from apps/server after createLocalDb.
 * It takes the expectedRulesetId from the IRulesEngine implementation so that
 * storage never imports from engine (dependency direction: storage ← engine).
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { resolve } from 'path'
import * as serverSchema from './schema/server/index'
import * as localSchema from './schema/local/index'
import { ruleset_version } from './schema/local/srd'

const SERVER_MIGRATIONS = resolve(import.meta.dir, '../../migrations/server')
const LOCAL_MIGRATIONS = resolve(import.meta.dir, '../../migrations/local')

/** Drizzle client + raw postgres.js connection for byo20_server. */
export type ServerDb = Awaited<ReturnType<typeof createServerDb>>
/** Drizzle client + raw postgres.js connection for byo20_local. */
export type LocalDb = Awaited<ReturnType<typeof createLocalDb>>

/** Connect to byo20_server, run pending migrations, and return the Drizzle client. Max 10 connections. */
export async function createServerDb(url: string) {
  const sql = postgres(url, { max: 10 })
  const db = drizzle(sql, { schema: serverSchema })
  await migrate(db, { migrationsFolder: SERVER_MIGRATIONS })
  return { db, sql }
}

/** Connect to byo20_local, run pending migrations, and return the Drizzle client. Max 5 connections. */
export async function createLocalDb(url: string) {
  const sql = postgres(url, { max: 5 })
  const db = drizzle(sql, { schema: localSchema })
  await migrate(db, { migrationsFolder: LOCAL_MIGRATIONS })
  return { db, sql }
}

/**
 * Assert that the seeded ruleset matches what the engine declares.
 * Hard-fails on mismatch — binary and DB data are out of sync, not recoverable at runtime.
 */
export async function checkRulesetVersion(
  localDb: LocalDb['db'],
  expectedRulesetId: string,
): Promise<void> {
  const rows = await localDb.select().from(ruleset_version).limit(1)
  if (rows.length === 0) {
    throw new Error('ruleset_version table is empty — run: bun run seed:srd')
  }
  const { ruleset_id } = rows[0]
  if (ruleset_id !== expectedRulesetId) {
    throw new Error(
      `Ruleset version mismatch: engine expects "${expectedRulesetId}", ` +
      `DB has "${ruleset_id}". Re-run seed:srd or update @byo20/engine.`,
    )
  }
}
