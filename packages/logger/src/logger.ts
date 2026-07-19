import { homedir } from "os";
import path from "path";
import { Writable } from "stream";
import { mkdir } from "fs/promises";
/**
 * Logging factory for @byo20 packages.
 *
 * Wraps Pino with a ring-buffer strategy: debug/info entries are held in memory
 * and only flushed to disk when an error or fatal fires. This keeps the log file
 * clean at prod log levels while still providing full context around failures.
 *
 * Two output modes:
 *  - Production (NODE_ENV=production or BYO20_LOG_PRETTY unset): raw JSON to file only.
 *  - Development (BYO20_LOG_PRETTY set + not production): pino-pretty on stdout + JSON to file.
 */
/// <reference path="./pino-roll.d.ts" />
import pino, { type Logger, type Level } from "pino";
import roll from "pino-roll";

/** All logger instances created by createLogger, used by setGlobalLevel. */
const loggerRegistry = new Set<Logger>();

/** Maximum debug/info entries buffered in memory per logger instance. */
const RING_BUFFER_SIZE = 500;

/** Pino internal numeric level for warn. */
const PINO_WARN = 40;

/** Default server log path: ~/.byo20/logs/server.log */
const DEFAULT_LOG_PATH = path.join(homedir(), ".byo20", "logs", "server.log");

/**
 * Return true if the level value (numeric or string) is below warn severity.
 * Handles both Pino's internal numeric format and the string format emitted after
 * the formatters.level override.
 */
function isDebugOrInfo(level: number | string): boolean {
    return typeof level === "number" ? level < PINO_WARN : ["trace", "debug", "info"].includes(level);
}

/** Return true if the level is exactly warn. */
function isWarn(level: number | string): boolean {
    return typeof level === "number" ? level === PINO_WARN : level === "warn";
}

/** Return true if the level is error or fatal — triggers a buffer flush. */
function isFlushTrigger(level: number | string): boolean {
    return typeof level === "number" ? level > PINO_WARN : level === "error" || level === "fatal";
}

/**
 * Custom Writable stream that implements the ring-buffer logging strategy.
 *
 * Receives serialised Pino JSON lines and routes them according to severity:
 *  - trace/debug/info → circular buffer only (never written to file).
 *  - warn             → circular buffer + written to file immediately.
 *  - error/fatal      → buffer flushed to file in order, then entry written; buffer cleared.
 */
class RingBufferStream extends Writable {
    private readonly buffer: string[] = [];
    /** The underlying rotating file writer (pino-roll SonicBoom or compatible). */
    private readonly file: { write: (data: string | Buffer) => unknown };

    constructor(file: { write: (data: string | Buffer) => unknown }) {
        super();
        this.file = file;
    }

    /** Called by the Writable machinery for each Pino log line. */
    _write(chunk: Buffer, _enc: BufferEncoding, done: (err?: Error | null) => void): void {
        const line = chunk.toString();
        let level: number | string = 0;

        try {
            const entry = JSON.parse(line) as Record<string, unknown>;
            const l = entry["level"];
            if (typeof l === "number" || typeof l === "string") level = l;
        } catch {
            // Malformed JSON (shouldn't happen from Pino) — write through.
            this.file.write(line);
            done();
            return;
        }

        if (isDebugOrInfo(level)) {
            this.addToBuffer(line);
        } else if (isWarn(level)) {
            this.addToBuffer(line);
            this.file.write(line);
        } else if (isFlushTrigger(level)) {
            this.flushBuffer();
            this.file.write(line);
        } else {
            // Unknown level — write through without buffering.
            this.file.write(line);
        }

        done();
    }

    /** Push one line onto the circular buffer, evicting the oldest if at capacity. */
    private addToBuffer(line: string): void {
        if (this.buffer.length >= RING_BUFFER_SIZE) this.buffer.shift();
        this.buffer.push(line);
    }

    /** Write all buffered entries to the file in insertion order, then clear the buffer. */
    private flushBuffer(): void {
        for (const entry of this.buffer) this.file.write(entry);
        this.buffer.length = 0;
    }
}

/** Options accepted by createLogger. */
export interface CreateLoggerOptions {
    /** Absolute path to the log file. Defaults to ~/.byo20/logs/server.log. */
    logPath?: string;
}

/**
 * Create a named Pino logger backed by a ring buffer and a rotating log file.
 *
 * The `name` parameter is written as the `module` field on every log entry.
 * The log directory is created if it does not exist.
 *
 * Every created instance is registered in a module-level Set so setGlobalLevel
 * can change all levels simultaneously.
 *
 * @param name    Identifier for this subsystem, written as `module` in log entries.
 * @param options Optional overrides (e.g. a custom log file path).
 */
export async function createLogger(name: string, options: CreateLoggerOptions = {}): Promise<Logger> {
    const logPath = options.logPath ?? DEFAULT_LOG_PATH;
    await mkdir(path.dirname(logPath), { recursive: true });

    // pino-roll returns a SonicBoom-compatible writable stream with 2 MB rotation.
    // size: 2 means 2 MB — pino-roll treats bare numbers as megabytes.
    const fileWriter = await roll({
        file: logPath,
        size: 2,
        limit: { count: 5 },
    });

    const ringBuffer = new RingBufferStream(fileWriter);

    const isDev = process.env.NODE_ENV !== "production" && Boolean(process.env.BYO20_LOG_PRETTY);

    let destination: Writable;

    if (isDev) {
        // Dynamic import keeps pino-pretty out of the production bundle.
        const { default: pinoPretty } = await import("pino-pretty");
        const prettyStream = pinoPretty({ colorize: true, sync: true });
        // multistream fans each entry to both streams (stdout pretty + file ring buffer).
        destination = pino.multistream([
            { stream: prettyStream as unknown as NodeJS.WritableStream },
            { stream: ringBuffer as unknown as NodeJS.WritableStream },
        ]) as unknown as Writable;
    } else {
        destination = ringBuffer;
    }

    const logger = pino(
        {
            // base: { module: name } replaces the default pid/hostname base fields
            // with just the module name, matching the desired log entry shape.
            base: { module: name },
            // Emit "timestamp" instead of Pino's default "time" key.
            timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
            formatters: {
                // Convert Pino's internal numeric level to a human-readable string.
                level(label: string) {
                    return { level: label };
                },
            },
            // In dev, start at debug so ring buffer can capture context. In prod, warn
            // means debug/info calls are no-ops until the admin panel lowers the level.
            level: isDev ? "debug" : "warn",
        },
        destination,
    );

    loggerRegistry.add(logger);
    return logger;
}

/**
 * Set the log level on every logger instance created by createLogger.
 *
 * Called by the admin panel Debug Logging toggle. Pino supports runtime level
 * changes with no restart required.
 */
export function setGlobalLevel(level: string): void {
    for (const instance of loggerRegistry) {
        instance.level = level as Level;
    }
}
