/**
 * Test database setup using embedded-postgres.
 *
 * Spins up a real Postgres instance in RAM for each Bun test worker process.
 * Each worker gets its own isolated DB so tests can run in parallel safely.
 *
 * Directory: /dev/shm/byo20-test-{pid}/ — RAM-backed tmpfs on Linux.
 *   - Avoids disk I/O during tests (fast)
 *   - Cleaned up naturally when the process exits
 *   - PID-scoped so parallel workers never collide
 *
 * Port: 20000 + (pid % 30000) — PID-derived, very unlikely to collide.
 *
 * Linux only. This test suite doesn't run on macOS or Windows because
 * /dev/shm isn't available there. CI runs on Linux.
 */
import EmbeddedPostgres from 'embedded-postgres'
import { createServerDb, createLocalDb } from '../postgres/client'
import type { ServerDb, LocalDb } from '../postgres/client'

const TEST_USER = 'byo20_test'
const TEST_PASS = 'byo20_test'

function testPort(): number {
  return 20000 + (process.pid % 30000)
}

function testDir(): string {
  return `/dev/shm/byo20-test-${process.pid}`
}

let pg: EmbeddedPostgres | null = null
let _serverDb: ServerDb | null = null
let _localDb: LocalDb | null = null

export async function setupTestDb(): Promise<{ serverDb: ServerDb; localDb: LocalDb }> {
  const port = testPort()

  pg = new EmbeddedPostgres({
    databaseDir: testDir(),
    user: TEST_USER,
    password: TEST_PASS,
    port,
    persistent: false,
  })

  await pg.initialise()
  await pg.start()

  // Enable pgvector and create the two app databases
  const adminClient = pg.getPgClient()
  await adminClient.connect()
  await adminClient.query('CREATE EXTENSION IF NOT EXISTS vector')
  await adminClient.query('CREATE DATABASE byo20_server')
  await adminClient.query('CREATE DATABASE byo20_local')
  await adminClient.end()

  const base = `postgresql://${TEST_USER}:${TEST_PASS}@localhost:${port}`

  // Enable pgvector in each new database (extensions are per-database in Postgres)
  for (const dbName of ['byo20_server', 'byo20_local']) {
    const dbClient = pg.getPgClient()
    // getPgClient defaults to the admin database; connect to the specific one
    Object.assign(dbClient, { database: dbName })
    await dbClient.connect()
    await dbClient.query('CREATE EXTENSION IF NOT EXISTS vector')
    await dbClient.end()
  }

  _serverDb = await createServerDb(`${base}/byo20_server`)
  _localDb = await createLocalDb(`${base}/byo20_local`)

  return { serverDb: _serverDb, localDb: _localDb }
}

export async function teardownTestDb(): Promise<void> {
  if (_serverDb) await _serverDb.sql.end()
  if (_localDb) await _localDb.sql.end()
  if (pg) {
    await pg.stop()
    await pg.dropDatabaseCluster()
  }
  pg = null
  _serverDb = null
  _localDb = null
}

// Call inside beforeEach for tests that mutate data.
// Wraps the test in a transaction that always rolls back — no cleanup needed.
export async function withRollback<T>(
  db: ServerDb['db'] | LocalDb['db'],
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  let result: T
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx)
      // Force rollback after fn completes
      throw new Error('__rollback__')
    })
  } catch (e) {
    if (e instanceof Error && e.message === '__rollback__') return result!
    throw e
  }
  return result!
}
