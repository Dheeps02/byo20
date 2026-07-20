import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, basename, dirname, join } from "node:path";
import { createLogger, flushAll, setGlobalLevel } from "../logger";

// Use a unique temp dir per test run to avoid cross-test pollution
const TEST_LOG_DIR = join(tmpdir(), `byo20-logger-test-${process.pid}`);

function tempLogPath(name: string): string {
    return join(TEST_LOG_DIR, `${name}.log`);
}

/**
 * Read all rotated log files for a given base path.
 * pino-roll appends a rotation number: e.g. name.log → name.1.log, name.2.log.
 * This helper collects all matching numbered variants and returns their content.
 */
function readLog(logPath: string): string {
    const dir = dirname(logPath);
    if (!existsSync(dir)) return "";
    const base = basename(logPath, extname(logPath));
    const files = readdirSync(dir)
        .filter((f) => f.startsWith(base + ".") || f === basename(logPath))
        .sort();
    if (files.length === 0) return "";
    return files.map((f) => readFileSync(join(dir, f), "utf-8")).join("");
}

afterEach(() => {
    // Clean up temp log files after each test
    if (existsSync(TEST_LOG_DIR)) {
        rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
});

describe("createLogger", () => {
    it("returns a logger instance with a level property", async () => {
        const logger = await createLogger("test", { logPath: tempLogPath("basic") });
        expect(typeof logger.level).toBe("string");
    });

    it("creates the log directory if it does not exist", async () => {
        const path = tempLogPath("dirtest");
        await createLogger("test", { logPath: path });
        expect(existsSync(TEST_LOG_DIR)).toBe(true);
    });

    it("default level is warn in non-dev mode", async () => {
        // BYO20_LOG_PRETTY is not set in test environment
        const logger = await createLogger("test", { logPath: tempLogPath("level") });
        expect(logger.level).toBe("warn");
    });
});

describe("setGlobalLevel", () => {
    it("changes level on all registered logger instances", async () => {
        const a = await createLogger("a", { logPath: tempLogPath("global-a") });
        const b = await createLogger("b", { logPath: tempLogPath("global-b") });

        setGlobalLevel("debug");

        expect(a.level).toBe("debug");
        expect(b.level).toBe("debug");

        // Reset to avoid polluting other tests
        setGlobalLevel("warn");
    });
});

describe("ring buffer — warn writes immediately", () => {
    it("warn entries appear in the log file without an error trigger", async () => {
        const path = tempLogPath("warn");
        const logger = await createLogger("test", { logPath: path });

        // Temporarily set to warn level to ensure warn is not filtered
        logger.level = "warn";
        logger.warn("this is a warning");

        await flushAll();

        const contents = readLog(path);
        expect(contents).toContain("this is a warning");
    });
});

describe("ring buffer — debug stays buffered until error", () => {
    it("debug entry does not appear in log file without an error", async () => {
        const path = tempLogPath("debug-no-flush");
        const logger = await createLogger("test", { logPath: path });

        logger.level = "debug";
        logger.debug("this should stay in buffer");

        await flushAll();

        const contents = readLog(path);
        expect(contents).not.toContain("this should stay in buffer");
    });

    it("debug entry appears in log file after an error flushes the buffer", async () => {
        const path = tempLogPath("debug-flush");
        const logger = await createLogger("test", { logPath: path });

        logger.level = "debug";
        logger.debug("buffered debug line");
        logger.error("error that triggers flush");

        await flushAll();

        const contents = readLog(path);
        expect(contents).toContain("buffered debug line");
        expect(contents).toContain("error that triggers flush");

        // Debug line should appear BEFORE the error line
        const debugIndex = contents.indexOf("buffered debug line");
        const errorIndex = contents.indexOf("error that triggers flush");
        expect(debugIndex).toBeLessThan(errorIndex);
    });
});
