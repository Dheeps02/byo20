import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle Kit config for byo20_local (always-active local DB).
 * Used by the db:generate:local and db:migrate:local scripts only — not at runtime.
 * At runtime the app connects via createLocalDb() in src/postgres/client.ts.
 */
export default defineConfig({
  schema: './src/postgres/schema/local',
  out: './migrations/local',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_LOCAL_URL ?? 'postgresql://byo20:byo20@localhost:5433/byo20_local',
  },
})
