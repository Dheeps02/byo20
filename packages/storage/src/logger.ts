import { createLogger } from "@byo20/logger";
import type { Logger } from "@byo20/logger";

let logger: Logger | null = null;

/** Called by initStorage() to set up the module logger. */
export function initPackageLogger(): void {
    logger = createLogger("storage");
}

/** Return the storage package logger. Throws if initStorage() was not called first. */
export function getLogger(): Logger {
    if (logger === null) {
        throw new Error("[storage] getLogger called before initStorage");
    }
    return logger;
}
