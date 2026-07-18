# Error Handling

Two distinct patterns depending on whether a failure is expected or exceptional.

---

## Result Type — Expected Game Rejections

Engine layer methods that can legitimately fail as part of normal game flow return `Result<T, GameRejection>` instead of throwing. This covers player actions the rules disallow — not infrastructure failures.

**Examples:** casting a spell with no available slot, attacking outside weapon range, moving while stunned, attempting an action on a dead target.

```typescript
type Result<T, E> =
  | { ok: true;  value: T }
  | { ok: false; error: E }

type GameRejection = {
  reason: string       // human-readable, surfaces in ACTION_REJECTED WS event
  action_type: string  // mirrors the attempted action primitive
  context?: Record<string, unknown>
}
```

No external library. TypeScript narrows `Result` correctly on an `if (result.ok)` check.

All `IRulesEngine` methods that can produce a game rejection use this return type. Transport reads the result and emits `ACTION_REJECTED` to the client with the `reason` field.

---

## BYO20Error — Exceptional Failures

Thrown for anything that shouldn't happen during normal play: infrastructure down, unexpected state, unrecoverable failures.

```typescript
class BYO20Error extends Error {
  readonly code: string                          // e.g. 'BYO-4002'
  readonly context?: Record<string, unknown>     // structured data — attached to log entry
  readonly userMessage?: string                  // shown in UI if present; generic fallback otherwise
}
```

`userMessage` is optional. Storage and internal errors may only ever hit logs. AI and system errors that surface to the host use `userMessage` to provide a plain-English explanation.

Both `Result` and `BYO20Error` are defined in `@byo20/shared` — all packages import from there.

---

## Error Code Namespace

| Range | Package | Domain |
|---|---|---|
| `BYO-1xxx` | `@byo20/engine` | Rules resolution failures, invalid game state |
| `BYO-2xxx` | `@byo20/storage` | DB connection, migration failure, ruleset version mismatch |
| `BYO-3xxx` | `@byo20/transport` | WS auth failure, token invalid, tunnel failure |
| `BYO-4xxx` | `@byo20/ai` | LLM provider unavailable, output validation failure, context overflow |
| `BYO-5xxx` | `@byo20/ai` (world gen) | Terrain gen failure, placement validation failure, world gen timeout |
| `BYO-6xxx` | `apps/desktop` | Electron IPC failure, sidecar crash (Postgres/Redis), safeStorage failure |

---

## Error Code Registry

`docs/errors.json` is the source of truth for all defined error codes. Hand-authored. The docs error code page renders from this file.

**Shape:**

```json
[
  {
    "code": "BYO-4002",
    "title": "LLM Provider Unavailable",
    "description": "The configured AI provider returned an error or could not be reached after retries.",
    "steps": [
      "Check your API key is valid and has available credits.",
      "Verify your internet connection if using a cloud provider.",
      "Switch to a different provider in campaign settings.",
      "If using Ollama, ensure the local server is running."
    ]
  }
]
```

A CI lint step (post-v1) will verify that every `BYO20Error` instantiation in the codebase references a code present in `errors.json`.

---

## What Goes Where

| Scenario | Pattern |
|---|---|
| Player casts spell with no slot | `Result<T, GameRejection>` |
| Player attacks out of range | `Result<T, GameRejection>` |
| Postgres connection lost | `throw new BYO20Error('BYO-2001', ...)` |
| LLM provider 503 after retries | `throw new BYO20Error('BYO-4001', ...)` |
| Zod validation failure on LLM output | `throw new BYO20Error('BYO-4002', ...)` |
| WS token invalid | `throw new BYO20Error('BYO-3001', ...)` |
| Electron IPC timeout | `throw new BYO20Error('BYO-6001', ...)` |
