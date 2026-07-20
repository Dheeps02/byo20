import { createLogger } from "@byo20/logger";
import type { Logger } from "@byo20/logger";

let logger: Logger | null = null;

/** Called by initEngine() to set up the module logger. */
export function initPackageLogger(): void {
    logger = createLogger("engine");
}

/** Return the engine package logger. Throws if initEngine() was not called first. */
export function getLogger(): Logger {
    if (logger === null) {
        throw new Error("[engine] getLogger called before initEngine");
    }
    return logger;
}
