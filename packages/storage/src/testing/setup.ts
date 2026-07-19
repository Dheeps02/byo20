import { rmSync } from "fs";
/**
 * Test database setup using embedded-postgres.
 *
 * Spins up a real Postgres instance in RAM for each Bun test worker process.
 * Each worker gets its own isolated DB so tests can run in parallel safely.
 *
 * Directory: /dev/shm/byo20-test-{pid}/ — RAM-backed tmpfs on Linux.
 *   - Avoids disk I/O during tests (fast)
 *   - PID-scoped so parallel workers never collide
 *   - Stale dirs from crashes are cleaned before each run
 *
 * Port: dynamically assigned by the OS (bind on 0) — no collisions possible.
 *
 * Linux only. This test suite doesn't run on macOS or Windows because
 * /dev/shm isn't available there. CI runs on Linux.
 */
import { createServer } from "net";
import type { AddressInfo } from "net";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { createLocalDb, createServerDb } from "../postgres/client";
import type { LocalDb, ServerDb } from "../postgres/client";

/** Postgres user created for the embedded test instance. */
const TEST_USER = "byo20_test";
/** Postgres password for the embedded test instance. */
const TEST_PASS = "byo20_test";

/** Derive a per-worker RAM-backed directory from the process PID. */
function testDir(): string {
    return `/dev/shm/byo20-test-${process.pid}`;
}

/** Ask the OS for a free port by binding on 0, reading back the assigned port,
 * then releasing it. Tiny TOCTOU window is acceptable in test-only context. */
async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.listen(0, "127.0.0.1", () => {
            const port = (srv.address() as AddressInfo).port;
            srv.close(() => resolve(port));
        });
        srv.on("error", reject);
    });
}

/** Symbol sentinel for withRollback — cannot be accidentally matched by an error
 * thrown from inside fn itself (unlike a string message). */
const ROLLBACK = Symbol("rollback");

/** Module-level embedded Postgres instance, shared across all tests in this worker. */
let pg: EmbeddedPostgres | null = null;
/** Cached server DB connection for this worker. */
let _serverDb: ServerDb | null = null;
/** Cached local DB connection for this worker. */
let _localDb: LocalDb | null = null;

/**
 * Start an embedded Postgres instance, create both app databases, enable pgvector,
 * run all migrations, and return the Drizzle clients.
 * Call once in beforeAll for each test worker.
 */
export async function setupTestDb(): Promise<{ serverDb: ServerDb; localDb: LocalDb }> {
    // Remove any stale directory left by a previous crash before initialising.
    // force: true makes this a no-op if the path doesn't exist.
    rmSync(testDir(), { recursive: true, force: true });

    const port = await getFreePort();

    pg = new EmbeddedPostgres({
        databaseDir: testDir(),
        user: TEST_USER,
        password: TEST_PASS,
        port,
        persistent: false,
    });

    await pg.initialise();
    await pg.start();

    // Install pgvector into template1 before creating the app databases.
    // Postgres copies template1 when creating a new DB, so any extension
    // installed here is automatically present in byo20_server and byo20_local.
    const t1 = new Client({ host: "localhost", port, user: TEST_USER, password: TEST_PASS, database: "template1" });
    await t1.connect();
    await t1.query("CREATE EXTENSION IF NOT EXISTS vector");
    await t1.end();

    const adminClient = pg.getPgClient();
    await adminClient.connect();
    await adminClient.query("CREATE DATABASE byo20_server");
    await adminClient.query("CREATE DATABASE byo20_local");
    await adminClient.end();

    const base = `postgresql://${TEST_USER}:${TEST_PASS}@localhost:${port}`;

    // createServerDb and createLocalDb auto-run Drizzle migrations on connect,
    // so the schema is fully set up by the time these calls return.
    _serverDb = await createServerDb(`${base}/byo20_server`);
    _localDb = await createLocalDb(`${base}/byo20_local`);

    return { serverDb: _serverDb, localDb: _localDb };
}

/**
 * Close all DB connections and stop the embedded Postgres instance.
 * Call in afterAll for each test worker.
 */
export async function teardownTestDb(): Promise<void> {
    if (_serverDb) await _serverDb.sql.end();
    if (_localDb) await _localDb.sql.end();
    if (pg) {
        await pg.stop(); // persistent: false means stop() deletes the data directory
    }
    pg = null;
    _serverDb = null;
    _localDb = null;
}

/**
 * Wrap a mutating test body in a transaction that always rolls back.
 * Use inside beforeEach — no manual cleanup needed between tests.
 * The rollback is forced by throwing a sentinel Symbol after fn completes.
 */
export async function withRollback<T>(
    db: ServerDb["db"] | LocalDb["db"],
    fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
    let result: T;
    try {
        await db.transaction(async (tx) => {
            result = await fn(tx);
            throw ROLLBACK;
        });
    } catch (e) {
        if (e === ROLLBACK) return result!;
        throw e;
    }
    return result!;
}
