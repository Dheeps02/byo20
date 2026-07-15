# Logging

## Libraries

- **Pino** — structured JSON logging for the Bun server process and Electron main process.
- **pino-pretty** — dev-only pretty-printer. Never used in prod.
- **pino-roll** — log rotation.

## Log Files

Two log files. Both land in `~/.byo20/logs/`.

| File | Written by | Who has it |
|---|---|---|
| `server.log` | Bun subprocess (engine, transport, AI, storage, world gen) | Host only |
| `client.log` | Electron renderer → IPC → Electron main | Every player, on their own machine |

Client errors never go over the network during normal play. The renderer sends log events via IPC (`log:error` channel) to Electron main, which writes them to `client.log` via Pino. No HTTP endpoint, no WS roundtrip.

## Log Levels

### server.log

| Level | Used for |
|---|---|
| `trace` | Raw WS payloads, raw SQL queries. Dev only — never enabled in prod. |
| `debug` | AI invocation params, event routing decisions, event evaluator output. |
| `info` | Session start/end, WS connect/disconnect, world gen stage progress, world clock ticks. |
| `warn` | AI retry triggered, narration tier fallback, WS reconnect attempt. |
| `error` | Retries exhausted, DB errors, AI provider unavailable, unhandled rejection. |
| `fatal` | Sidecar crash (Postgres, Redis), unrecoverable server state. |

### client.log

| Level | Used for |
|---|---|
| `debug` | Scene events, Zustand state updates, Babylon.js render events. |
| `info` | Session join/leave, IPC channel events. |
| `warn` | WS reconnect attempt, IPC timeout. |
| `error` | Render errors, IPC failure, WS connection lost, unhandled renderer exception. |

No `trace` or `fatal` on the client.

## Format

Every log entry is a single-line JSON object:

```json
{"timestamp":"2026-07-15T10:23:01.123Z","level":"info","msg":"session started","campaign_id":"abc-123","session_id":"xyz-789"}
```

Attach relevant context keys alongside the fixed fields — `npc_id`, `event_type`, `ai_tier`, `duration_ms`, etc. No fixed per-event schema beyond the base fields. Log the event, not the content — never log full LLM prompts, full WS message payloads at info+, or narration/dialogue text (that data lives in Postgres).

**Dev:** pipe through `pino-pretty` for coloured, human-readable output.  
**Prod:** raw JSON.

## Production Log Level

Default prod log level is `warn`. Normal gameplay at `info` generates too much volume for a self-hosted app.

## Ring Buffer

An in-memory circular buffer holds the last 500 `debug`/`info` entries. Nothing is written to disk from the buffer during normal operation. When an `error` or `fatal` fires, the buffer flushes its contents to the log file immediately before the error entry — providing full context around failures without persisting verbose output at all times.

## Runtime Toggle

The admin panel has a **Debug Logging** toggle. Flipping it on sets `logger.level = 'debug'` at runtime (no restart required — Pino supports runtime level changes). Used when actively reproducing a bug. Host flips it on, reproduces, flips it off. Client log level can be toggled the same way via an IPC call to the renderer.

## Log Rotation

Size-based rotation via `pino-roll`. Rotate at **2MB**, keep last **5 files**. Max ~10MB on disk per log file.

## Bug Report Flow

Admin panel **Report Bug** button:

1. Filter `server.log` and `client.log` to `warn`+ entries from the current/last session.
2. Copy filtered snippet to clipboard.
3. Open prefilled GitHub issue URL in system browser:
   ```
   https://github.com/[repo]/issues/new?title=Bug+Report&body=[system_info]
   ```
   System info pre-fill includes: OS, app version, `campaign_id`.
4. User pastes log snippet into the issue template's designated section and submits.

GitHub authentication is required to submit — safe assumption for users of a self-hosted dev tool.

**Player log sharing (v1.1):** players can send their `client.log` to the host over the existing WS connection via a "Send logs to host" button. Host receives it in the admin panel. Not in v1.
