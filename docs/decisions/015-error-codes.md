# 015 — BYO20Error with Namespaced Error Codes v1.0.0

## Status
Accepted

## Context

Exceptional failures (infrastructure down, AI unavailable, etc.) need to be distinguishable, loggable with structured context, and documentable with fix steps for end users.

## Decision

`BYO20Error` extends `Error` with `code` (namespaced: `BYO-1xxx` through `BYO-6xxx`), `context` (structured data for logs), and optional `userMessage` (shown in UI). Defined in `@byo20/shared`. `docs/errors.json` is the hand-authored registry; the docs error code page renders from it.

## Consequences

All thrown errors in the codebase should be `BYO20Error` instances (not raw `new Error()`). A CI lint step to enforce registry coverage is planned post-v1.
