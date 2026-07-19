/**
 * Result type for expected engine-layer game rejections.
 * Engine methods that can legitimately reject a player action return this
 * instead of throwing. Transport reads the result and emits ACTION_REJECTED.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Payload carried by a failed Result from the engine.
 * `reason` surfaces in the ACTION_REJECTED WS event.
 * `action_type` mirrors the attempted action primitive.
 */
export type GameRejection = {
    reason: string;
    action_type: string;
    context?: Record<string, unknown>;
};

/**
 * Base class for all exceptional (non-game-logic) failures.
 * Thrown for infrastructure failures — DB down, LLM unavailable, sidecar crash, etc.
 *
 * Error codes are namespaced by package and subcategory:
 *   BYO-1xxx  @byo20/engine       BYO-11xx rules resolution, BYO-12xx invalid game state
 *   BYO-2xxx  @byo20/storage      BYO-21xx database, BYO-22xx migrations, BYO-23xx snapshots
 *   BYO-3xxx  @byo20/transport    BYO-31xx WS auth, BYO-32xx tunnel, BYO-33xx invite/session
 *   BYO-4xxx  @byo20/ai           BYO-41xx LLM provider, BYO-42xx output validation, BYO-43xx context/memory
 *   BYO-5xxx  @byo20/ai (worldgen) BYO-51xx terrain, BYO-52xx placement, BYO-53xx timeouts
 *   BYO-6xxx  apps/desktop        BYO-61xx sidecars, BYO-62xx Electron IPC, BYO-63xx safeStorage
 *
 * All defined codes live in docs/errors.json.
 */
export class BYO20Error extends Error {
    readonly code: string;
    readonly context?: Record<string, unknown>;
    readonly userMessage?: string;

    constructor(code: string, message: string, options?: { context?: Record<string, unknown>; userMessage?: string }) {
        super(message);
        this.name = "BYO20Error";
        this.code = code;
        this.context = options?.context;
        this.userMessage = options?.userMessage;
    }
}
