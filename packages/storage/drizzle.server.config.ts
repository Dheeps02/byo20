import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config for byo20_server (DM/host side).
 * Used by the db:generate:server and db:migrate:server scripts only — not at runtime.
 * At runtime the app connects via createServerDb() in src/postgres/client.ts.
 */
export default defineConfig({
    schema: "./src/postgres/schema/server",
    out: "./migrations/server",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_SERVER_URL ?? "postgresql://byo20:byo20@localhost:5433/byo20_server",
    },
});
