---
paths:
  - "packages/transport/**"
---

# Transport Rules

## Spec First
Read `docs/spec/transport-layer.md` before touching this package.
Message taxonomy, routing rules, and auth flow are all specced there.

## What This Package Owns
- WebSocket server setup and connection lifecycle
- Token validation and invite code auth
- In-memory connection map (`Map<player_id, WebSocket>`)
- `send()` routing function
- Message routing rules (who gets what)

## What It Does Not Own
- Game logic (engine)
- LLM calls (ai)
- DB writes (storage)
- Message content — transport moves messages, never generates them

## Message Format
Every message uses the standard JSON envelope:
```ts
{ type, id, timestamp, to, payload }
```
All message types are defined in `@byo20/shared`. Never define new message types here.

## Routing
Server always decides routing. `to` field values: `"all"`, `"dm"`, `player_id`, or array.
Players never address each other directly.

## Auth
Two token types: host (permanent) and player (per campaign).
Tokens stored in Postgres, validated on every connection and reconnect.
DM can revoke any player token at any time.

## Reconnect
60-second grace period on disconnect.
Always send full `STATE_SNAPSHOT` on reconnect — no event replay, no diffs.
