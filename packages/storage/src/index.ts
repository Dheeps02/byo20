/**
 * @byo20/storage public API
 *
 * Exports are added here as each subsystem is implemented.
 * Import order follows the natural build sequence:
 *   schema → client → queries → stores → redis
 */

// Re-export interface contracts so engine/transport/ai can import them
// from either @byo20/shared (preferred) or @byo20/storage without the
// implementation details leaking.
export type { IGameStateStore, IVectorStore } from '@byo20/shared'

// Populated in subsequent steps:
// export { createServerDb, createLocalDb } from './postgres/client'
// export { PostgresGameStateStore } from './postgres/game-state-store'
// export { PostgresVectorStore } from './postgres/vector-store'
// export { createRedisClient } from './redis/client'
