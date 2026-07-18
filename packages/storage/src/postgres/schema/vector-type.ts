import { customType } from 'drizzle-orm/pg-core'

/**
 * Custom Drizzle column type for Postgres BYTEA.
 *
 * Drizzle doesn't ship a built-in bytea type. We map it to Node's Buffer — the
 * pg driver already deserializes BYTEA wire bytes to Buffer automatically.
 *
 * Usage:
 *   heightmap_chunk: bytea('heightmap_chunk')
 */
export const bytea = (name: string) =>
  customType<{ data: Buffer; driverData: Buffer }>({
    dataType() { return 'bytea' },
  })(name)

/**
 * Custom Drizzle column type for pgvector's vector(N) column.
 *
 * Drizzle doesn't ship a built-in vector type, so we define our own using
 * `customType`. This tells Drizzle three things:
 *   - `dataType`: the raw SQL type to emit in CREATE TABLE / migrations
 *   - `fromDriver`: how to deserialize the value coming out of Postgres
 *   - `toDriver`: how to serialize the value going into Postgres
 *
 * pgvector stores vectors as '[0.1,0.2,...]' strings on the wire.
 * We represent them as `number[]` in TypeScript.
 *
 * Usage:
 *   embedding: vector('embedding', 768).notNull()
 *
 * All vectors in BYO20 are 768-dimensional (nomic-embed-text via bundled Ollama).
 */
export const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(',').map(Number)
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`
    },
  })(name)
