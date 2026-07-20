/** Minimal ambient declaration for pino-roll v4 (no official .d.ts shipped). */
declare module "pino-roll" {
    /** The subset of SonicBoom we actually use: a writable sink with a write method. */
    export interface RollDestination {
        write(data: string | Buffer): boolean;
        end(): void;
        on(event: string, listener: (...args: unknown[]) => void): this;
        /** Synchronously flush buffered data to disk. Only valid after the 'ready' event. */
        flushSync(): void;
        /** Internal SonicBoom file descriptor — negative until the 'ready' event fires. */
        readonly fd: number;
    }

    /** Options for the pino-roll rotating file destination. */
    export interface PinoRollOptions {
        /** Absolute or relative path to the log file. */
        file: string;
        /** Maximum size before rotating. Use 'k', 'm', 'g' suffixes or a number (treated as MB). */
        size?: string | number;
        /** Maximum number of rotated files to keep. */
        limit?: { count: number };
        /** Create the log directory if it does not exist. */
        mkdir?: boolean;
        [key: string]: unknown;
    }

    /** Create a rotating file destination for Pino. Returns a SonicBoom-compatible stream. */
    export default function roll(options: PinoRollOptions): Promise<RollDestination>;
}
