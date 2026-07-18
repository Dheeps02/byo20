# 014 — Pino for Structured Logging v1.0.0

## Status
Accepted

## Context

Need structured, queryable logs for a self-hosted Electron app with a Bun subprocess. Log volume in prod needs to stay small.

## Decision

Pino for both server and client log paths. Two files: `server.log` (Bun subprocess) and `client.log` (renderer → IPC → Electron main). Prod default level `warn`. In-memory ring buffer (500 entries) flushes to disk on `error`/`fatal`. Size-based rotation (2MB, 5 files) via pino-roll. Runtime level toggle in admin panel.

## Consequences

pino and pino-roll added as dependencies. pino-pretty dev-only. Client logging requires an IPC channel (`log:error`) in the preload bridge.
