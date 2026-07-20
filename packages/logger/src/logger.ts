/// <reference path="./pino-roll.d.ts" />
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
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
import pino, { type Level, type Logger } from "pino";
import roll from "pino-roll";


/** Maximum debug/info entries buffered in memory per logger instance. */
const RING_BUFFER_SIZE = 500;

/** Pino internal numeric level for warn. */
const PINO_WARN = 40;

/** Default server log path: ~/.byo20/logs/server.log */
const DEFAULT_LOG_PATH = path.join(homedir(), ".byo20", "logs", "server.log");

/** Module-level root logger, set by initLogger. */
let rootLogger: Logger | null = null;

/** The file writer held by the root logger, used by flushAll. */
let fileWriter: { write: (data: string | Buffer) => unknown; end: () => void } | null = null;

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
            const l = entry.level;
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
    flushBuffer(): void {
        for (const entry of this.buffer) this.file.write(entry);
        this.buffer.length = 0;
    }
}

/** Module-level reference to the ring buffer, used by flushAll. */
let ringBufferStream: RingBufferStream | null = null;

/** Options accepted by initLogger. */
export interface InitLoggerOptions {
    /** Absolute path to the log file. */
    logPath: string;
    /** Initial log level. Defaults to 'warn' in prod, 'debug' in dev. */
    level?: string;
}

/**
 * Initialise the root logger. Must be called once at server startup before
 * any package calls createLogger. Calling it a second time is a no-op.
 */
export async function initLogger(options: InitLoggerOptions): Promise<void> {
    if (rootLogger !== null) {
        rootLogger.warn("[logger] initLogger called more than once — ignoring");
        return;
    }

    const { logPath } = options;
    await mkdir(path.dirname(logPath), { recursive: true });

    // pino-roll returns a SonicBoom-compatible writable stream with 2 MB rotation.
    // size: 2 means 2 MB — pino-roll treats bare numbers as megabytes.
    fileWriter = await roll({
        file: logPath,
        size: 2,
        limit: { count: 5 },
    });

    ringBufferStream = new RingBufferStream(fileWriter);

    const isDev = process.env.NODE_ENV !== "production" && Boolean(process.env.BYO20_LOG_PRETTY);

    let destination: Writable;

    if (isDev) {
        // Dynamic import keeps pino-pretty out of the production bundle.
        const { default: pinoPretty } = await import("pino-pretty");
        const prettyStream = pinoPretty({ colorize: true, sync: true });
        // multistream fans each entry to both streams (stdout pretty + file ring buffer).
        destination = pino.multistream([
            { stream: prettyStream as unknown as NodeJS.WritableStream },
            { stream: ringBufferStream as unknown as NodeJS.WritableStream },
        ]) as unknown as Writable;
    } else {
        destination = ringBufferStream;
    }

    const defaultLevel = options.level ?? (isDev ? "debug" : "warn");

    rootLogger = pino(
        {
            // base: null removes the default pid/hostname base fields entirely;
            // child loggers will add their own module field via child({ module: name }).
            base: null,
            timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
            formatters: {
                level(label: string) {
                    return { level: label };
                },
            },
            level: defaultLevel,
        },
        destination,
    );
}

/**
 * Return a child logger bound to `name` as the `module` field.
 *
 * Sync — must be called after initLogger. In test environments (NODE_ENV === 'test')
 * a stdout-only fallback is returned if initLogger was not called.
 */
export function createLogger(name: string): Logger {
    if (rootLogger === null) {
        if (process.env.NODE_ENV === "test") {
            // Silent fallback for tests that don't call initLogger.
            return pino({ level: "silent" });
        }
        throw new Error("[logger] createLogger called before initLogger");
    }
    return rootLogger.child({ module: name });
}

/**
 * Set the log level on the root logger. All child loggers inherit the change
 * automatically — no registry needed.
 */
export function setGlobalLevel(level: string): void {
    if (rootLogger !== null) {
        rootLogger.level = level as Level;
    }
}

/**
 * Flush buffered ring-buffer entries to the file writer without closing the stream.
 * Safe to call at any crash point — further log writes remain possible afterward.
 */
export function flushAll(): void {
    if (ringBufferStream !== null) {
        ringBufferStream.flushBuffer();
    }
}

/**
 * Flush the ring buffer then permanently close the underlying file stream.
 * Call only at final graceful shutdown — any log writes after this are silently dropped.
 */
export function closeLogger(): void {
    if (ringBufferStream !== null) {
        ringBufferStream.flushBuffer();
    }
    if (fileWriter !== null) {
        fileWriter.end();
    }
}

/**
 * Flush all registered file writers to disk.
 *
 * Waits for each SonicBoom destination to reach its 'ready' state before calling
 * flushSync(). Intended for test teardown and graceful shutdown.
 */
export async function flushAll(): Promise<void> {
    const flush = (fw: RollDestination) =>
        new Promise<void>((resolve) => {
            const doFlush = () => {
                try {
                    fw.flushSync();
                } catch {
                    /* stream may be closed — ignore */
                }
                resolve();
            };
            if (fw.fd >= 0) doFlush();
            else fw.on("ready", doFlush);
        });
    await Promise.all([...fileWriterRegistry].map(flush));
}
